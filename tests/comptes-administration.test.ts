import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookiesDeTest } from "./aide-cookies";
import { supprimerTousLesComptes } from "./aide-comptes";
import { ROLE_ADMIN, ROLE_PAR_DEFAUT, ROLES } from "../src/config/acces";
import { query, queryOne, transaction } from "../src/lib/db/client";
import { mailsCaptures, viderMailsCaptures } from "../src/briques/mails/envoi";
import {
  changerRole,
  desactiver,
  fermerDomaine,
  inviter,
  listerComptes,
  listerDomaines,
  ouvrirDomaine,
  reactiver,
  type CompteAdministre,
  type Trace,
} from "../src/briques/comptes/administration";
import { SOURCES_COMPTES } from "../src/briques/comptes/donnees-personnelles";
import { admettre, DOMAINE_DEMO, type ContexteEntree } from "../src/briques/comptes/entree";
import { nomDuCookie } from "../src/briques/comptes/jeton";
import { lireSessionDe, ouvrirSession } from "../src/briques/comptes/session";

/*
 * L'administration des comptes dans l'appli, niveau 3 de la
 * brique comptes. Les pièges repris d'un projet précédent y sont
 * verrouillés un par un : le dernier admin actif protégé à deux portes, même
 * contre deux requêtes simultanées ; un compte désactivé, jamais supprimé ;
 * un rôle changé qui agit à la requête suivante. S'y ajoute le passage du
 * niveau 2 au niveau 3, qui ne doit ni retirer ni rendre un accès.
 *
 * Les accès se lisent par lireSessionDe, la vraie lecture d'une requête :
 * tests/setup.ts remplace lireSession, connexionRecente et trouverUtilisateur
 * pour les modules.
 */

const envoi = vi.hoisted(() => ({ enPanne: false }));
vi.mock("../src/briques/mails/envoi", async (original) => {
  const vrai = await original<typeof import("../src/briques/mails/envoi")>();
  return {
    ...vrai,
    envoyerMail: async (mail: Parameters<typeof vrai.envoyerMail>[0]) => {
      if (envoi.enPanne) throw new Error("fournisseur en panne");
      return vrai.envoyerMail(mail);
    },
  };
});

// Attend que n requêtes de la base de test soient arrêtées sur un verrou :
// l'ordre des écritures simultanées se règle ainsi sans rien simuler.
async function attendreDesVerrous(n: number): Promise<void> {
  for (let essai = 0; essai < 500; essai++) {
    const ligne = await queryOne<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'"
    );
    if ((ligne?.n ?? 0) >= n) return;
    await new Promise((resoudre) => setTimeout(resoudre, 10));
  }
  throw new Error(`jamais ${n} requêtes en attente d'un verrou`);
}

// Les règles de la brique se vérifient sans les effets que les autres unités
// déclarent au registre (le journal exigerait un compte à l'auteur) : ces
// effets, et leur transaction, ont leur fichier, tests/comptes-effets.test.ts.
vi.mock("../src/config/effets-comptes", () => ({ EFFETS_COMPTES: [] }));
const AUTEUR = { email: "auteur@client.example" };

const SANS_ENTREE: ContexteEntree = { entree: { adresses: {}, domaines: [] }, premierAdmin: undefined, demo: false };
const PREVENIR = { nomDeLAppli: "Appli de test", adresseDeConnexion: "https://appli.example/connexion" };
const AUTRE_ROLE = ROLES.find((role) => role !== ROLE_ADMIN) ?? ROLE_PAR_DEFAUT;

async function viderLesComptes(): Promise<void> {
  await supprimerTousLesComptes();
  await query("DELETE FROM domaines_admis");
}

// Un compte tel qu'une connexion du niveau 2 l'a laissé : rien n'y est géré
// par l'appli.
async function compteDuNiveau2(email: string, role: string, actif = true): Promise<number> {
  const ligne = await queryOne<{ id: number }>(
    "INSERT INTO utilisateurs (email, role, actif) VALUES ($1, $2, $3) RETURNING id",
    [email, role, actif]
  );
  return ligne!.id;
}

async function inviterOuEchouer(email: string, role: string): Promise<number> {
  const issue = await inviter(email, role, null);
  if ("erreur" in issue) throw new Error(issue.erreur);
  return issue.compte.id;
}

// Le cookie d'une session ouverte sur le compte, sans passer par admettre :
// la requête suivante relit ce que la base et la configuration disent alors.
async function sessionDe(id: number): Promise<string> {
  await ouvrirSession({ id });
  const cookie = cookiesDeTest.get(nomDuCookie())!;
  cookiesDeTest.clear();
  return cookie;
}

async function compte(email: string, contexte = SANS_ENTREE): Promise<CompteAdministre> {
  const trouve = (await listerComptes(contexte)).find((ligne) => ligne.email === email);
  if (!trouve) throw new Error(`${email} absent de la liste`);
  return trouve;
}

async function adminsActifs(): Promise<number> {
  const ligne = await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM utilisateurs WHERE actif AND role = $1", [
    ROLE_ADMIN,
  ]);
  return ligne?.n ?? 0;
}

beforeEach(async () => {
  await viderLesComptes();
  viderMailsCaptures();
  envoi.enPanne = false;
});
afterEach(() => {
  cookiesDeTest.clear();
});
// Un domaine ouvert ici ferait entrer, dans les fichiers suivants, des
// adresses que leurs tests attendent refusées.
afterAll(viderLesComptes);

describe("le dernier admin actif, protégé à deux portes (projet précédent)", () => {
  it("ne se désactive pas : la fonction serveur refuse, quel que soit l'écran", async () => {
    const id = await inviterOuEchouer("chef@client.example", ROLE_ADMIN);
    expect(await desactiver(id, AUTEUR, SANS_ENTREE)).toEqual({
      erreur: expect.stringMatching(/dernier compte administrateur actif/),
    });
    expect((await compte("chef@client.example")).statut).toBe("actif");
  });

  it("ne se rétrograde pas : la fonction serveur refuse, quel que soit l'écran", async () => {
    const id = await inviterOuEchouer("chef@client.example", ROLE_ADMIN);
    expect(await changerRole(id, AUTRE_ROLE, SANS_ENTREE)).toEqual({
      erreur: expect.stringMatching(/dernier compte administrateur actif/),
    });
    expect((await compte("chef@client.example")).role).toBe(ROLE_ADMIN);
  });

  it("est marqué protégé pour l'écran, qui ne lui propose ni désactivation ni autre rôle ; plus dès qu'un second admin existe", async () => {
    await inviterOuEchouer("chef@client.example", ROLE_ADMIN);
    await inviterOuEchouer("membre@client.example", AUTRE_ROLE);
    expect((await compte("chef@client.example")).protege).toBe(true);
    expect((await compte("membre@client.example")).protege).toBe(false);
    await inviterOuEchouer("seconde@client.example", ROLE_ADMIN);
    expect((await compte("chef@client.example")).protege).toBe(false);
  });

  it("ne compte pas un admin de démo, qui n'administre rien de réel, ni un admin désactivé", async () => {
    const demo: ContexteEntree = { ...SANS_ENTREE, demo: true };
    await admettre(`${ROLE_ADMIN}@${DOMAINE_DEMO}`, demo);
    await compteDuNiveau2("ancien@client.example", ROLE_ADMIN, false);
    const id = await inviterOuEchouer("chef@client.example", ROLE_ADMIN);
    expect((await compte("chef@client.example", demo)).protege).toBe(true);
    expect(await desactiver(id, AUTEUR, demo)).toHaveProperty("erreur");
  });

  it("compte un admin listé dans la configuration, et le protège lui aussi quand il est le dernier", async () => {
    const config: ContexteEntree = {
      ...SANS_ENTREE,
      entree: { adresses: { "chef@client.example": ROLE_ADMIN }, domaines: [] },
    };
    const chef = await compteDuNiveau2("chef@client.example", ROLE_ADMIN);
    const seconde = await inviterOuEchouer("seconde@client.example", ROLE_ADMIN);
    expect(await desactiver(seconde, AUTEUR, config)).toBeUndefined();
    expect((await compte("chef@client.example", config)).protege).toBe(true);
    expect(await desactiver(chef, AUTEUR, config)).toHaveProperty("erreur");
  });

  it("laisse passer une seule de deux rétrogradations croisées simultanées : il reste toujours un admin (requêtes concurrentes)", async () => {
    for (let essai = 0; essai < 10; essai++) {
      await viderLesComptes();
      const a = await inviterOuEchouer("a@client.example", ROLE_ADMIN);
      const b = await inviterOuEchouer("b@client.example", ROLE_ADMIN);
      const issues = await Promise.all([
        changerRole(a, AUTRE_ROLE, SANS_ENTREE),
        changerRole(b, AUTRE_ROLE, SANS_ENTREE),
      ]);
      expect(
        issues.filter((issue) => issue !== undefined),
        `essai ${essai}`
      ).toHaveLength(1);
      expect(await adminsActifs(), `essai ${essai}`).toBe(1);
    }
  });

  it("laisse passer une seule de deux désactivations croisées simultanées : il reste toujours un admin actif (requêtes concurrentes)", async () => {
    for (let essai = 0; essai < 10; essai++) {
      await viderLesComptes();
      const a = await inviterOuEchouer("a@client.example", ROLE_ADMIN);
      const b = await inviterOuEchouer("b@client.example", ROLE_ADMIN);
      const issues = await Promise.all([desactiver(a, AUTEUR, SANS_ENTREE), desactiver(b, AUTEUR, SANS_ENTREE)]);
      expect(
        issues.filter((issue) => issue !== undefined),
        `essai ${essai}`
      ).toHaveLength(1);
      expect(await adminsActifs(), `essai ${essai}`).toBe(1);
    }
  });
});

describe("désactiver, réactiver : on désactive un compte, on ne le supprime pas (projet précédent)", () => {
  it("garde la ligne en base, et la personne est dehors à la requête suivante", async () => {
    await inviterOuEchouer("chef@client.example", ROLE_ADMIN);
    const id = await inviterOuEchouer("membre@client.example", AUTRE_ROLE);
    const cookie = await sessionDe(id);
    expect(await lireSessionDe(cookie, SANS_ENTREE)).not.toBeNull();
    expect(await desactiver(id, AUTEUR, SANS_ENTREE)).toBeUndefined();
    expect(await lireSessionDe(cookie, SANS_ENTREE)).toBeNull();
    expect((await compte("membre@client.example")).statut).toBe("desactive");
    expect(await admettre("membre@client.example", SANS_ENTREE)).toBeNull();
  });

  it("ne fait pas revivre l'ancien cookie à la réactivation : les sessions du compte se ferment avec lui (poste partagé, cookie volé)", async () => {
    await inviterOuEchouer("chef@client.example", ROLE_ADMIN);
    const id = await inviterOuEchouer("membre@client.example", AUTRE_ROLE);
    const cookie = await sessionDe(id);
    await desactiver(id, AUTEUR, SANS_ENTREE);
    expect(await query("SELECT 1 FROM sessions WHERE utilisateur_id = $1", [id])).toEqual([]);
    expect(await reactiver(id, AUTEUR)).toBeUndefined();
    expect(await lireSessionDe(cookie, SANS_ENTREE)).toBeNull();
    expect((await admettre("membre@client.example", SANS_ENTREE))?.role).toBe(AUTRE_ROLE);
  });

  it("montre « sans accès » un compte réactivé que plus rien n'admet (adresse retirée de la configuration)", async () => {
    const id = await compteDuNiveau2("partie@client.example", AUTRE_ROLE, false);
    expect(await reactiver(id, AUTEUR)).toBeUndefined();
    expect((await compte("partie@client.example")).statut).toBe("sans-acces");
  });

  it("n'ouvre pas de session à une connexion qui croise la désactivation : une réactivation la ferait revivre (relevé en relecture)", async () => {
    await inviterOuEchouer("chef@client.example", ROLE_ADMIN);
    const id = await inviterOuEchouer("membre@client.example", AUTRE_ROLE);
    let connexion: Promise<unknown> = Promise.resolve();
    // Une transaction fait ce que fait desactiver, sans encore valider : la
    // connexion, lancée entre-temps, a vu le compte actif.
    await transaction(async (client) => {
      await client.query("UPDATE utilisateurs SET actif = false WHERE id = $1", [id]);
      await client.query("DELETE FROM sessions WHERE utilisateur_id = $1", [id]);
      connexion = ouvrirSession({ id });
      await attendreDesVerrous(1);
    });
    await connexion;
    expect(await query("SELECT 1 FROM sessions WHERE utilisateur_id = $1", [id])).toEqual([]);
    expect(cookiesDeTest.get(nomDuCookie())).toBeUndefined();
  });

  it("n'administre pas un compte de démo : il n'existe nulle part, et la démo le recrée à la demande", async () => {
    const demo: ContexteEntree = { ...SANS_ENTREE, demo: true };
    const compteDemo = await admettre(`${AUTRE_ROLE}@${DOMAINE_DEMO}`, demo);
    expect(await desactiver(compteDemo!.id, AUTEUR, demo)).toEqual({ erreur: expect.stringMatching(/démo/) });
    expect(await reactiver(compteDemo!.id, AUTEUR)).toEqual({ erreur: expect.stringMatching(/démo/) });
    expect(await changerRole(compteDemo!.id, ROLE_ADMIN, demo)).toEqual({ erreur: expect.stringMatching(/démo/) });
  });

  it("refuse un compte introuvable", async () => {
    expect(await desactiver(999_999, AUTEUR, SANS_ENTREE)).toEqual({ erreur: expect.stringMatching(/introuvable/) });
    expect(await reactiver(999_999, AUTEUR)).toEqual({ erreur: expect.stringMatching(/introuvable/) });
    expect(await changerRole(999_999, ROLE_ADMIN, SANS_ENTREE)).toEqual({
      erreur: expect.stringMatching(/introuvable/),
    });
  });

  it("verrou : aucun fichier de src/ ne supprime une ligne de utilisateurs ni de domaines_admis", () => {
    const fautifs: string[] = [];
    const parcourir = (dossier: string) => {
      for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
        const chemin = path.join(dossier, entree.name);
        if (entree.isDirectory()) parcourir(chemin);
        else if (
          /\.(ts|tsx|sql)$/.test(entree.name) &&
          /DELETE\s+FROM\s+(utilisateurs|domaines_admis)\b/i.test(fs.readFileSync(chemin, "utf-8"))
        ) {
          fautifs.push(path.relative(process.cwd(), chemin));
        }
      }
    };
    parcourir(path.join(process.cwd(), "src"));
    expect(fautifs).toEqual([]);
  });
});

describe("changer un rôle", () => {
  it("agit à la requête suivante : le rôle se relit en base, la session ouverte n'a rien à refaire (projet précédent)", async () => {
    await inviterOuEchouer("chef@client.example", ROLE_ADMIN);
    const id = await inviterOuEchouer("membre@client.example", AUTRE_ROLE);
    const cookie = await sessionDe(id);
    expect((await lireSessionDe(cookie, SANS_ENTREE))?.role).toBe(AUTRE_ROLE);
    expect(await changerRole(id, ROLE_ADMIN, SANS_ENTREE)).toBeUndefined();
    expect((await lireSessionDe(cookie, SANS_ENTREE))?.role).toBe(ROLE_ADMIN);
  });

  it("n'est pas défait par une connexion simultanée qui avait lu l'ancien rôle (relevé en relecture)", async () => {
    await inviterOuEchouer("chef@client.example", ROLE_ADMIN);
    const id = await inviterOuEchouer("seconde@client.example", ROLE_ADMIN);
    let changement: Promise<unknown> = Promise.resolve();
    let connexion: Promise<unknown> = Promise.resolve();
    // Une transaction retient la ligne : la rétrogradation s'y arrête la
    // première, puis la connexion, qui a déjà lu « admin ». Libérées, elles
    // passent dans cet ordre.
    await transaction(async (client) => {
      await client.query("SELECT 1 FROM utilisateurs WHERE id = $1 FOR UPDATE", [id]);
      changement = changerRole(id, AUTRE_ROLE, SANS_ENTREE);
      await attendreDesVerrous(1);
      connexion = admettre("seconde@client.example", SANS_ENTREE);
      await attendreDesVerrous(2);
    });
    expect(await changement).toBeUndefined();
    await connexion;
    expect(await queryOne("SELECT role FROM utilisateurs WHERE id = $1", [id])).toEqual({ role: AUTRE_ROLE });
  });

  it("refuse un rôle que la configuration ne déclare pas : il ne passerait aucune action", async () => {
    const id = await inviterOuEchouer("chef@client.example", ROLE_ADMIN);
    expect(await changerRole(id, "superadmin", SANS_ENTREE)).toEqual({ erreur: expect.stringMatching(/rôle/i) });
  });

  it("reprend une adresse listée dans la configuration : l'appli la gère ensuite, la configuration ne s'applique plus à elle", async () => {
    const config: ContexteEntree = {
      ...SANS_ENTREE,
      entree: { adresses: { "listee@client.example": AUTRE_ROLE }, domaines: [] },
    };
    await inviterOuEchouer("chef@client.example", ROLE_ADMIN);
    const id = await compteDuNiveau2("listee@client.example", AUTRE_ROLE);
    expect((await compte("listee@client.example", config)).origine).toBe("configuration");
    expect(await changerRole(id, ROLE_ADMIN, config)).toBeUndefined();
    const cookie = await sessionDe(id);
    expect((await lireSessionDe(cookie, config))?.role).toBe(ROLE_ADMIN);
    // Retirée ensuite de la configuration, elle entre encore : c'est l'appli qui la gère.
    expect((await lireSessionDe(cookie, SANS_ENTREE))?.role).toBe(ROLE_ADMIN);
    expect((await compte("listee@client.example", config)).origine).toBe("appli");
  });
});

describe("passage du niveau 2 au niveau 3 : aucun accès perdu, aucun accès rendu", () => {
  it("laisse chaque compte d'avant entrer exactement comme au niveau 2 : listé avec le rôle de la configuration, domaine avec son rôle en base, inconnu refusé", async () => {
    const niveau2: ContexteEntree = {
      ...SANS_ENTREE,
      entree: { adresses: { "listee@client.example": ROLE_ADMIN }, domaines: ["client.example"] },
    };
    const listee = await sessionDe(await compteDuNiveau2("listee@client.example", AUTRE_ROLE));
    const parDomaine = await sessionDe(await compteDuNiveau2("domaine@client.example", AUTRE_ROLE));
    const inconnue = await sessionDe(await compteDuNiveau2("inconnue@ailleurs.example", ROLE_ADMIN));
    expect((await lireSessionDe(listee, niveau2))?.role).toBe(ROLE_ADMIN);
    expect((await lireSessionDe(parDomaine, niveau2))?.role).toBe(AUTRE_ROLE);
    expect(await lireSessionDe(inconnue, niveau2)).toBeNull();
  });

  it("ne rend pas un rôle périmé : un admin rétrogradé dans la configuration depuis sa dernière connexion, resté admin en base, reste rétrogradé", async () => {
    const config: ContexteEntree = {
      ...SANS_ENTREE,
      entree: { adresses: { "ancien-chef@client.example": AUTRE_ROLE }, domaines: [] },
    };
    const id = await compteDuNiveau2("ancien-chef@client.example", ROLE_ADMIN);
    expect((await lireSessionDe(await sessionDe(id), config))?.role).toBe(AUTRE_ROLE);
    const ligne = await compte("ancien-chef@client.example", config);
    expect(ligne.role).toBe(AUTRE_ROLE);
    expect(ligne.protege).toBe(false);
  });
});

describe("inviter une adresse", () => {
  it("crée un compte admis avec le rôle choisi, géré par l'appli : la personne entre par n'importe quelle méthode", async () => {
    const issue = await inviter("  Nouvelle@Client.example ", AUTRE_ROLE, null);
    expect(issue).toMatchObject({
      compte: { email: "nouvelle@client.example", role: AUTRE_ROLE },
      mail: "non-demande",
    });
    const ligne = await compte("nouvelle@client.example");
    expect(ligne).toMatchObject({ origine: "appli", statut: "actif", derniereConnexion: null });
    expect((await admettre("nouvelle@client.example", SANS_ENTREE))?.role).toBe(AUTRE_ROLE);
    expect(mailsCaptures()).toEqual([]);
  });

  it("prévient la personne par un mail d'information, sans lien de connexion ni code : l'identité se vérifie toujours à la connexion", async () => {
    expect(await inviter("nouvelle@client.example", AUTRE_ROLE, PREVENIR)).toMatchObject({ mail: "parti" });
    const [mail] = mailsCaptures();
    expect(mail.a).toBe("nouvelle@client.example");
    expect(mail.objet).toContain("Appli de test");
    expect(mail.texte).toContain("https://appli.example/connexion");
    expect(mail.texte).not.toMatch(/\b\d{6}\b|jeton|token/i);
  });

  it("écrit le mail sans lien quand l'adresse publique manque", async () => {
    await inviter("nouvelle@client.example", AUTRE_ROLE, { ...PREVENIR, adresseDeConnexion: null });
    expect(mailsCaptures()[0].texte).not.toMatch(/https?:/);
  });

  it("garde le compte créé quand le mail ne part pas, et le dit pour que l'admin prévienne la personne", async () => {
    envoi.enPanne = true;
    expect(await inviter("nouvelle@client.example", AUTRE_ROLE, PREVENIR)).toMatchObject({ mail: "en-echec" });
    expect((await compte("nouvelle@client.example")).statut).toBe("actif");
  });

  it("refuse une adresse qui a déjà un compte, en renvoyant à sa ligne, sans rien changer", async () => {
    const id = await compteDuNiveau2("existe@client.example", AUTRE_ROLE, false);
    expect(await inviter("Existe@client.example", ROLE_ADMIN, PREVENIR)).toEqual({
      erreur: expect.stringMatching(/existe/),
    });
    expect(await queryOne("SELECT role, actif, gere_par_l_appli FROM utilisateurs WHERE id = $1", [id])).toEqual({
      role: AUTRE_ROLE,
      actif: false,
      gere_par_l_appli: false,
    });
    expect(mailsCaptures()).toEqual([]);
  });

  it("refuse une adresse de démo, une forme invalide ou un rôle non déclaré", async () => {
    for (const email of [
      `x@${DOMAINE_DEMO}`,
      "pas-une-adresse",
      "a@b",
      "@client.example",
      "x@.example",
      "x y@client.example",
      "x@client..example",
    ]) {
      expect(await inviter(email, AUTRE_ROLE, null), email).toHaveProperty("erreur");
    }
    expect(await inviter("x@client.example", "superadmin", null)).toHaveProperty("erreur");
    expect(await query("SELECT 1 FROM utilisateurs")).toEqual([]);
  });
});

describe("ouvrir et fermer un domaine", () => {
  it("fait entrer toute adresse du domaine ouvert avec ROLE_PAR_DEFAUT, jamais l'administration, sans ses sous-domaines", async () => {
    expect(await ouvrirDomaine(" Client.example ", SANS_ENTREE)).toBeUndefined();
    expect((await admettre("quelqu-un@client.example", SANS_ENTREE))?.role).toBe(ROLE_PAR_DEFAUT);
    expect(await admettre("quelqu-un@equipe.client.example", SANS_ENTREE)).toBeNull();
    expect(await listerDomaines(SANS_ENTREE)).toEqual([
      expect.objectContaining({ domaine: "client.example", origine: "appli", ouvert: true }),
    ]);
  });

  it("refuse les messageries publiques : ouvrir gmail.com ouvrirait l'appli à tout le monde", async () => {
    for (const domaine of [
      "gmail.com",
      "Outlook.com",
      "hotmail.fr",
      "yahoo.co.uk",
      "icloud.com",
      "orange.fr",
      "free.fr",
      "laposte.net",
      "proton.me",
      "gmx.de",
    ]) {
      expect(await ouvrirDomaine(domaine, SANS_ENTREE), domaine).toEqual({
        erreur: expect.stringMatching(/messagerie publique/),
      });
    }
    expect(await query("SELECT 1 FROM domaines_admis")).toEqual([]);
  });

  it("refuse une forme invalide et le domaine de démo", async () => {
    for (const domaine of [
      "client",
      "x@client.example",
      "@client.example",
      "client..example",
      ".client.example",
      "client example.fr",
      DOMAINE_DEMO,
    ]) {
      expect(await ouvrirDomaine(domaine, SANS_ENTREE), domaine).toHaveProperty("erreur");
    }
  });

  it("à la fermeture, retire l'accès aux comptes entrés par le domaine, sauf à ceux que l'appli gère ; et le dit avant", async () => {
    await inviterOuEchouer("chef@ailleurs.example", ROLE_ADMIN);
    await ouvrirDomaine("client.example", SANS_ENTREE);
    const venu = await admettre("venu@client.example", SANS_ENTREE);
    const garde = await admettre("garde@client.example", SANS_ENTREE);
    await changerRole(garde!.id, ROLE_PAR_DEFAUT, SANS_ENTREE);
    const cookieVenu = await sessionDe(venu!.id);
    const cookieGarde = await sessionDe(garde!.id);
    expect(await listerDomaines(SANS_ENTREE)).toEqual([
      expect.objectContaining({ comptesActifs: 2, comptesQuiPerdraientLAcces: 1 }),
    ]);

    expect(await fermerDomaine("client.example", SANS_ENTREE)).toBeUndefined();
    expect(await lireSessionDe(cookieVenu, SANS_ENTREE)).toBeNull();
    expect((await lireSessionDe(cookieGarde, SANS_ENTREE))?.email).toBe("garde@client.example");
    expect(await admettre("nouveau@client.example", SANS_ENTREE)).toBeNull();
    expect(await listerDomaines(SANS_ENTREE)).toEqual([
      expect.objectContaining({ domaine: "client.example", ouvert: false }),
    ]);

    // Rouvert, il fait de nouveau entrer.
    expect(await ouvrirDomaine("client.example", SANS_ENTREE)).toBeUndefined();
    expect(await lireSessionDe(cookieVenu, SANS_ENTREE)).not.toBeNull();
  });

  it("ne ferme pas d'ici un domaine de la configuration, et le montre comme tel", async () => {
    const config: ContexteEntree = { ...SANS_ENTREE, entree: { adresses: {}, domaines: ["config.example"] } };
    expect(await listerDomaines(config)).toEqual([
      expect.objectContaining({ domaine: "config.example", origine: "configuration", ouvert: true }),
    ]);
    expect(await fermerDomaine("config.example", config)).toEqual({ erreur: expect.stringMatching(/configuration/) });
    expect(await ouvrirDomaine("config.example", config)).toEqual({ erreur: expect.stringMatching(/configuration/) });
  });

  it("ne rend pas, en ouvrant un domaine, un rôle d'administration resté en base : le compte entre avec ROLE_PAR_DEFAUT (relevé en relecture)", async () => {
    // Un ancien admin listé dans la configuration, puis retiré : sa ligne dit
    // encore « admin », et personne ne l'a choisi à l'écran.
    const ancien = await sessionDe(await compteDuNiveau2("ancien-chef@client.example", ROLE_ADMIN));
    expect(await lireSessionDe(ancien, SANS_ENTREE)).toBeNull();
    await ouvrirDomaine("client.example", SANS_ENTREE);
    expect((await lireSessionDe(ancien, SANS_ENTREE))?.role).toBe(ROLE_PAR_DEFAUT);
    expect((await admettre("ancien-chef@client.example", SANS_ENTREE))?.role).toBe(ROLE_PAR_DEFAUT);
    expect((await compte("ancien-chef@client.example")).role).toBe(ROLE_PAR_DEFAUT);
  });

  it("refuse de fermer un domaine qui n'est pas ouvert", async () => {
    expect(await fermerDomaine("jamais.example", SANS_ENTREE)).toHaveProperty("erreur");
  });
});

describe("tables de l'administration", () => {
  it("laissent un compte neuf hors de l'appli : la colonne gere_par_l_appli vaut faux par défaut, et rien n'est rattrapé", async () => {
    await query("INSERT INTO utilisateurs (email, role) VALUES ('neuf@client.example', $1)", [AUTRE_ROLE]);
    expect(await queryOne("SELECT gere_par_l_appli FROM utilisateurs WHERE email = 'neuf@client.example'")).toEqual({
      gere_par_l_appli: false,
    });
  });

  it("refusent un domaine qui n'est pas en minuscules ou entouré d'espaces : l'entrée ne doit pas dépendre de la casse saisie", async () => {
    await expect(query("INSERT INTO domaines_admis (domaine) VALUES ('Client.example')")).rejects.toThrow(
      /domaines_admis_minuscules_check/
    );
    await expect(query("INSERT INTO domaines_admis (domaine) VALUES (' client.example')")).rejects.toThrow(
      /domaines_admis_minuscules_check/
    );
  });
});

// Désactiver et réactiver ne prennent pas de trace : le journal les trace par
// le registre des effets de comptes (tests/comptes-effets.test.ts).
describe("la trace d'un geste (le point d'accroche du journal d'audit)", () => {
  it("s'écrit dans la transaction du geste : une trace qui échoue annule le geste, un geste refusé ne l'appelle pas", async () => {
    const chef = await inviterOuEchouer("chef@client.example", ROLE_ADMIN);
    const gestes: unknown[] = [];
    const noter: Trace = async (tx, geste) => {
      // La trace voit l'effet : elle lit par la connexion de la transaction.
      gestes.push({
        ...geste,
        role: (await tx.queryOne("SELECT role FROM utilisateurs WHERE id = $1", [geste.entiteId]))?.role,
      });
    };
    const echouer: Trace = async () => {
      throw new Error("trace en échec");
    };

    expect(await changerRole(chef, AUTRE_ROLE, SANS_ENTREE, noter)).toHaveProperty("erreur");
    expect(gestes).toEqual([]);

    const cible = await inviterOuEchouer("cible@client.example", AUTRE_ROLE);
    await expect(changerRole(cible, ROLE_ADMIN, SANS_ENTREE, echouer)).rejects.toThrow("trace en échec");
    await expect(inviter("autre@client.example", AUTRE_ROLE, PREVENIR, echouer)).rejects.toThrow("trace en échec");
    expect(await query("SELECT email, role FROM utilisateurs ORDER BY id")).toEqual([
      { email: "chef@client.example", role: ROLE_ADMIN },
      { email: "cible@client.example", role: AUTRE_ROLE },
    ]);
    expect(mailsCaptures()).toEqual([]);

    expect(await changerRole(cible, ROLE_ADMIN, SANS_ENTREE, noter)).toBeUndefined();
    expect(gestes).toEqual([
      {
        action: "modification",
        entite: "compte",
        entiteId: cible,
        libelle: `compte n°${cible}`,
        champs: ["role"],
        role: ROLE_ADMIN,
      },
    ]);
  });
});

describe("export des données d'une personne", () => {
  it("dit si un admin a fixé le rôle dans l'appli : c'est ce qui décide de son accès, quoi que dise la configuration", async () => {
    await inviterOuEchouer("invitee@client.example", AUTRE_ROLE);
    const [compteExporte] = SOURCES_COMPTES.filter((source) => source.cle === "compte");
    expect(await compteExporte.lire("invitee@client.example")).toEqual([
      expect.objectContaining({ role: AUTRE_ROLE, gere_par_l_appli: true }),
    ]);
  });
});
