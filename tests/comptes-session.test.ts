import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookiesDeTest } from "./aide-cookies";
import { poserLesMethodes, supprimerTousLesComptes } from "./aide-comptes";
import { ROLE_ADMIN, ROLE_PAR_DEFAUT, ROLES } from "../src/config/acces";
import { query, queryOne } from "../src/lib/db/client";
import { entrerEnDemoAction, seDeconnecterAction } from "../src/briques/comptes/actions";
import { demoProposee, entrerEnDemo, UTILISATEURS_DEMO } from "../src/briques/comptes/demo";
import { admettre, origineDuCompte, roleEffectif, type ContexteEntree } from "../src/briques/comptes/entree";
import { listerComptes } from "../src/briques/comptes/administration";
import { refuserUneEntreeOuverteQuiAdministre } from "../src/briques/comptes/methodes";
import {
  empreinte,
  nomDuCookie,
  nouveauJeton,
  secretDeSession,
  signer,
  verifierSignature,
} from "../src/briques/comptes/jeton";
import { cheminDeRetour } from "../src/briques/comptes/retour";
import { DUREE_SESSION_JOURS, fermerSession, lireSessionDe, ouvrirSession } from "../src/briques/comptes/session";
import { DUREE_VALIDITE_MINUTES } from "../src/briques/comptes/code-email";
import { DUREE_VALIDITE_LIEN_MINUTES } from "../src/briques/comptes/lien-email";
import { DUREE_PARCOURS_MINUTES } from "../src/briques/comptes/parcours";
import { traitementsComptes } from "../src/briques/comptes/confidentialite";

/*
 * La session de la brique comptes. Les pièges repris d'un
 * projet précédent y sont verrouillés un par un : signature vérifiée
 * avant tout usage du jeton, secret vide ou trop court refusé, rôle relu en
 * base à chaque requête, compte désactivé plutôt que supprimé, chemin de
 * retour filtré.
 *
 * tests/setup.ts remplace la lecture de la session des requêtes simulées
 * (lireSession) pour les tests des modules ; ici, la session se lit par
 * lireSessionDe, sur une vraie base locale.
 */

const revalider = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: revalider }));

// redirect() et notFound() lèvent une erreur dont le digest porte leur nature.
const UNE_REDIRECTION = (vers: string) => ({ digest: expect.stringContaining(`;${vers};`) });

// Les écritures base64url qui décodent vers les mêmes octets que la signature.
function autresEcritures(signature: string): string[] {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const octets = Buffer.from(signature, "base64url");
  return [...alphabet]
    .map((dernier) => signature.slice(0, -1) + dernier)
    .filter((variante) => variante !== signature && Buffer.from(variante, "base64url").equals(octets));
}

const SANS_ENTREE: ContexteEntree = { entree: { adresses: {}, domaines: [] }, premierAdmin: undefined, demo: false };

async function cookieDeSession(): Promise<string | undefined> {
  return cookiesDeTest.get(nomDuCookie());
}

beforeEach(supprimerTousLesComptes);
afterEach(() => {
  vi.unstubAllEnvs();
  revalider.mockClear();
});

describe("jeton de session", () => {
  it("refuse un secret vide ou de moins de 32 caractères, en nommant la variable sans jamais citer sa valeur : un HMAC à clé vide se forge (projet précédent)", () => {
    for (const secret of ["", "court", "x".repeat(31)]) {
      vi.stubEnv("AUTH_SECRET", secret);
      expect(() => secretDeSession()).toThrow(/AUTH_SECRET/);
      try {
        secretDeSession();
      } catch (erreur) {
        if (secret) expect(String(erreur)).not.toContain(secret);
      }
    }
    vi.stubEnv("AUTH_SECRET", "x".repeat(32));
    expect(secretDeSession()).toHaveLength(32);
  });

  it("tire un jeton de 256 bits, jamais deux fois le même", () => {
    const jeton = nouveauJeton();
    expect(Buffer.from(jeton, "base64url")).toHaveLength(32);
    expect(nouveauJeton()).not.toBe(jeton);
  });

  it("ne rend le jeton qu'à une signature exacte : forgée, tronquée, rallongée, d'un autre secret ou sans point, elle ne donne rien", () => {
    const jeton = nouveauJeton();
    const signe = signer(jeton);
    expect(verifierSignature(signe)).toBe(jeton);
    const [, signature] = signe.split(".");
    for (const fautif of [
      undefined,
      "",
      jeton,
      `${jeton}.`,
      `${jeton}.${signature.slice(0, -1)}`,
      `${jeton}.${signature}A`,
      `${jeton}.${signature}.${signature}`,
      `${nouveauJeton()}.${signature}`,
      `${jeton}.${"A".repeat(signature.length)}`,
      signer(jeton, "y".repeat(40)),
      // Le dernier caractère porte deux bits que le décodage ignore : les
      // trois autres écritures de la même signature sont refusées.
      ...autresEcritures(signature).map((variante) => `${jeton}.${variante}`),
    ]) {
      expect(verifierSignature(fautif), String(fautif)).toBeNull();
    }
  });

  it("vérifie la signature avant de lire le secret quand il n'y a pas de cookie : une requête sans session ne dépend pas de la configuration", () => {
    vi.stubEnv("AUTH_SECRET", "");
    expect(verifierSignature(undefined)).toBeNull();
    expect(() => verifierSignature("a.b")).toThrow(/AUTH_SECRET/);
  });

  it("ne garde en base que l'empreinte du jeton, jamais le jeton : une fuite de la base ne donne aucune session", async () => {
    const utilisateur = await admettre("personne@client.example", {
      ...SANS_ENTREE,
      entree: { adresses: { "personne@client.example": ROLE_PAR_DEFAUT }, domaines: [] },
    });
    expect(utilisateur).not.toBeNull();
    await ouvrirSession(utilisateur!);
    const jeton = verifierSignature(await cookieDeSession());
    expect(jeton).not.toBeNull();
    const lignes = await query<{ empreinte: string }>("SELECT empreinte FROM sessions");
    expect(lignes.map((ligne) => ligne.empreinte)).toEqual([empreinte(jeton!)]);
    expect(JSON.stringify(lignes)).not.toContain(jeton);
  });
});

describe("session en base", () => {
  const CONTEXTE: ContexteEntree = {
    ...SANS_ENTREE,
    entree: { adresses: { "membre@client.example": ROLE_PAR_DEFAUT }, domaines: [] },
  };

  async function connecter(email: string, contexte = CONTEXTE): Promise<string> {
    const utilisateur = await admettre(email, contexte);
    if (!utilisateur) throw new Error(`${email} refusé`);
    await ouvrirSession(utilisateur);
    return (await cookieDeSession())!;
  }

  it("rend la personne d'une session ouverte, avec son rôle", async () => {
    const cookie = await connecter("membre@client.example");
    expect(await lireSessionDe(cookie, CONTEXTE)).toEqual({ email: "membre@client.example", role: ROLE_PAR_DEFAUT });
  });

  it("ne rend personne pour un cookie forgé, même porteur d'une empreinte qui existe en base", async () => {
    await connecter("membre@client.example");
    const [{ empreinte: enBase }] = await query<{ empreinte: string }>("SELECT empreinte FROM sessions");
    expect(await lireSessionDe(`${enBase}.faux`, CONTEXTE)).toBeNull();
    expect(await lireSessionDe(signer(nouveauJeton()), CONTEXTE)).toBeNull();
  });

  it("ne rend personne pour une session expirée", async () => {
    const cookie = await connecter("membre@client.example");
    await query("UPDATE sessions SET expire_le = now() - interval '1 second'");
    expect(await lireSessionDe(cookie, CONTEXTE)).toBeNull();
  });

  it("relit le rôle en base à chaque requête : retirer un droit agit tout de suite (projet précédent)", async () => {
    const domaine: ContexteEntree = { ...SANS_ENTREE, entree: { adresses: {}, domaines: ["client.example"] } };
    const cookie = await connecter("quelqu-un@client.example", domaine);
    expect((await lireSessionDe(cookie, domaine))?.role).toBe(ROLE_PAR_DEFAUT);
    await query("UPDATE utilisateurs SET role = $1", [ROLE_ADMIN]);
    expect((await lireSessionDe(cookie, domaine))?.role).toBe(ROLE_ADMIN);
  });

  it("ne rend personne pour un compte désactivé, sans le supprimer, et ne l'admet plus à la connexion", async () => {
    const cookie = await connecter("membre@client.example");
    await query("UPDATE utilisateurs SET actif = false");
    expect(await lireSessionDe(cookie, CONTEXTE)).toBeNull();
    expect(await admettre("membre@client.example", CONTEXTE)).toBeNull();
    expect(await queryOne("SELECT 1 FROM utilisateurs WHERE email = 'membre@client.example'")).not.toBeNull();
  });

  it("ne rend plus personne quand l'adresse sort de la configuration : la session ouverte ne survit pas à son retrait", async () => {
    const cookie = await connecter("membre@client.example");
    expect(await lireSessionDe(cookie, SANS_ENTREE)).toBeNull();
  });

  it("ferme la session déjà portée par le navigateur quand elle en ouvre une autre : un cookie posé avant la connexion ne survit pas (fixation de session)", async () => {
    const avant = await connecter("membre@client.example");
    await connecter("membre@client.example");
    expect(await lireSessionDe(avant, CONTEXTE)).toBeNull();
    expect(await query("SELECT 1 FROM sessions")).toHaveLength(1);
  });

  it("ferme la session en base et le cookie à la déconnexion : le même cookie ne rouvre rien", async () => {
    const cookie = await connecter("membre@client.example");
    await fermerSession();
    expect(await cookieDeSession()).toBeUndefined();
    expect(await query("SELECT 1 FROM sessions")).toEqual([]);
    expect(await lireSessionDe(cookie, CONTEXTE)).toBeNull();
  });

  it("retrouve une personne par son adresse aux mêmes conditions qu'une session : actif et encore admis (le décideur de la brique validation)", async () => {
    // tests/setup.ts la remplace pour les modules : ici, la vraie.
    const { trouverUtilisateur } = await vi.importActual<typeof import("../src/briques/comptes/session")>(
      "../src/briques/comptes/session"
    );
    await connecter("membre@client.example");
    expect(await trouverUtilisateur("MEMBRE@client.example ", CONTEXTE)).toEqual({
      email: "membre@client.example",
      role: ROLE_PAR_DEFAUT,
    });
    await query("UPDATE utilisateurs SET actif = false");
    expect(await trouverUtilisateur("membre@client.example", CONTEXTE)).toBeNull();
    expect(await trouverUtilisateur("inconnue@client.example", CONTEXTE)).toBeNull();
  });

  it("refuse d'ouvrir une session sans secret valable, avant d'écrire quoi que ce soit", async () => {
    const utilisateur = await admettre("membre@client.example", CONTEXTE);
    vi.stubEnv("AUTH_SECRET", "court");
    await expect(ouvrirSession(utilisateur!)).rejects.toThrow(/AUTH_SECRET/);
    expect(await query("SELECT 1 FROM sessions")).toEqual([]);
    expect(await cookieDeSession()).toBeUndefined();
  });
});

describe("qui peut entrer", () => {
  it("admet une adresse listée avec son rôle, en minuscules, et la configuration fait foi à chaque requête", async () => {
    const contexte: ContexteEntree = {
      ...SANS_ENTREE,
      entree: { adresses: { "Chef@Client.example": ROLE_ADMIN }, domaines: [] },
    };
    expect(await admettre("  CHEF@client.EXAMPLE ", contexte)).toMatchObject({
      email: "chef@client.example",
      role: ROLE_ADMIN,
    });
    // Un rôle changé à la main en base ne l'emporte pas sur la configuration.
    expect(roleEffectif("chef@client.example", ROLE_PAR_DEFAUT, contexte)).toBe(ROLE_ADMIN);
  });

  it("donne ROLE_PAR_DEFAUT à une personne entrée par son domaine, jamais l'administration, et garde ensuite le rôle de la base", async () => {
    const contexte: ContexteEntree = { ...SANS_ENTREE, entree: { adresses: {}, domaines: ["client.example"] } };
    expect(await admettre("nouvelle@client.example", contexte)).toMatchObject({ role: ROLE_PAR_DEFAUT });
    expect(roleEffectif("nouvelle@client.example", ROLE_ADMIN, contexte)).toBe(ROLE_ADMIN);
    // Un sous-domaine ou un domaine qui ne fait que finir pareil n'entre pas.
    expect(await admettre("x@faux-client.example", contexte)).toBeNull();
    expect(await admettre("x@sous.client.example", contexte)).toBeNull();
  });

  it("ne déclare jamais l'administration comme rôle par défaut quand la configuration a plusieurs rôles", () => {
    if (ROLES.length > 1) expect(ROLE_PAR_DEFAUT).not.toBe(ROLE_ADMIN);
  });

  it("refuse toute adresse que la configuration ne nomme pas", async () => {
    expect(await admettre("inconnue@ailleurs.example", SANS_ENTREE)).toBeNull();
    expect(roleEffectif("inconnue@ailleurs.example", ROLE_ADMIN, SANS_ENTREE)).toBeNull();
    expect(await query("SELECT 1 FROM utilisateurs")).toEqual([]);
  });

  it("fait du premier admin (COMPTES_PREMIER_ADMIN) un administrateur tant qu'aucun compte actif ne l'est, et plus ensuite", async () => {
    const contexte: ContexteEntree = { ...SANS_ENTREE, premierAdmin: "Premiere@client.example" };
    expect(await admettre("premiere@client.example", contexte)).toMatchObject({ role: ROLE_ADMIN });
    // Une seconde adresse donnée par la variable, un admin existant : refusée.
    expect(
      await admettre("seconde@client.example", { ...contexte, premierAdmin: "seconde@client.example" })
    ).toBeNull();
    // La première garde son rôle aux connexions suivantes.
    expect(await admettre("premiere@client.example", contexte)).toMatchObject({ role: ROLE_ADMIN });
  });

  it("ne refait pas un admin par la variable une fois un admin passé, même désactivé : elle vaut pour le premier démarrage, pas pour toujours", async () => {
    await admettre("premiere@client.example", { ...SANS_ENTREE, premierAdmin: "premiere@client.example" });
    await query("UPDATE utilisateurs SET actif = false");
    expect(
      await admettre("relève@client.example", { ...SANS_ENTREE, premierAdmin: "relève@client.example" })
    ).toBeNull();
  });

  // Un outil public : une appli avait réécrit l'admission dans son dépôt pour
  // laisser entrer tout le monde, et une deuxième en avait besoin. L'entrée
  // ouverte ne donne jamais que le rôle par défaut.
  describe("entrée ouverte à toute adresse", () => {
    const OUVERTE: ContexteEntree = { ...SANS_ENTREE, entree: { adresses: {}, domaines: [], ouverte: true } };

    it("refuse de démarrer avec un seul rôle, où ROLE_PAR_DEFAUT administre : n'importe quelle adresse aurait toutes les actions", () => {
      expect(() => refuserUneEntreeOuverteQuiAdministre(OUVERTE.entree, "admin", "admin")).toThrow(
        /exige deux rôles au moins/
      );
      expect(() => refuserUneEntreeOuverteQuiAdministre(OUVERTE.entree, "membre", "admin")).not.toThrow();
      expect(() => refuserUneEntreeOuverteQuiAdministre(SANS_ENTREE.entree, "admin", "admin")).not.toThrow();
      // La configuration du catalogue passe : deux rôles, entrée fermée.
      expect(() => refuserUneEntreeOuverteQuiAdministre()).not.toThrow();
    });

    it("admet toute adresse bien formée avec ROLE_PAR_DEFAUT, et une adresse sans domaine n'entre pas", async () => {
      expect(await admettre("  Inconnue@Ailleurs.example ", OUVERTE)).toMatchObject({
        email: "inconnue@ailleurs.example",
        role: ROLE_PAR_DEFAUT,
      });
      expect(origineDuCompte("inconnue@ailleurs.example", OUVERTE)).toBe("ouverte");
      for (const mal of ["sans-arobase", "vide@", "a@b@c.example", "x@sans-point"]) {
        expect(await admettre(mal, OUVERTE), mal).toBeNull();
      }
    });

    it("ne fait jamais revenir un compte de démo sans la démo (en production)", async () => {
      const demo = UTILISATEURS_DEMO[ROLE_ADMIN].email;
      expect(origineDuCompte(demo, OUVERTE)).toBe("aucune");
      expect(await admettre(demo, OUVERTE)).toBeNull();
      // Avec la démo, le compte de démo garde son rôle joué.
      expect(await admettre(demo, { ...OUVERTE, demo: true })).toMatchObject({ role: ROLE_ADMIN });
    });

    it("laisse la priorité à un compte géré par l'appli, avec son rôle en base", () => {
      const gere = { gereParLAppli: true, domaineOuvert: false };
      expect(origineDuCompte("geree@ailleurs.example", OUVERTE, gere)).toBe("appli");
      expect(roleEffectif("geree@ailleurs.example", ROLE_ADMIN, OUVERTE, gere)).toBe(ROLE_ADMIN);
    });

    it("se montre « ouverte » dans la liste des comptes de l'écran /comptes", async () => {
      await admettre("inscrite@ailleurs.example", OUVERTE);
      const [compte] = await listerComptes(OUVERTE);
      expect(compte).toMatchObject({ email: "inscrite@ailleurs.example", origine: "ouverte", role: ROLE_PAR_DEFAUT });
    });

    it("ne rend jamais le rôle gardé en base : un ancien admin retiré de la configuration revient en ROLE_PAR_DEFAUT", async () => {
      expect(roleEffectif("ancien@client.example", ROLE_ADMIN, OUVERTE)).toBe(ROLE_PAR_DEFAUT);
      await query("INSERT INTO utilisateurs (email, role) VALUES ('ancien@client.example', $1)", [ROLE_ADMIN]);
      expect(await admettre("ancien@client.example", OUVERTE)).toMatchObject({ role: ROLE_PAR_DEFAUT });
    });

    it("laisse la priorité à une adresse listée, avec son rôle", async () => {
      const contexte: ContexteEntree = {
        ...OUVERTE,
        entree: { adresses: { "chef@client.example": ROLE_ADMIN }, domaines: [], ouverte: true },
      };
      expect(await admettre("chef@client.example", contexte)).toMatchObject({ role: ROLE_ADMIN });
      expect(origineDuCompte("chef@client.example", contexte)).toBe("configuration");
    });

    it("laisse la priorité au premier admin, qui garde ensuite son rôle", async () => {
      const contexte: ContexteEntree = { ...OUVERTE, premierAdmin: "premiere@client.example" };
      expect(await admettre("premiere@client.example", contexte)).toMatchObject({ role: ROLE_ADMIN });
      expect(roleEffectif("premiere@client.example", ROLE_ADMIN, contexte)).toBe(ROLE_ADMIN);
    });

    it("refuse toujours un compte désactivé", async () => {
      await admettre("partie@ailleurs.example", OUVERTE);
      await query("UPDATE utilisateurs SET actif = false WHERE email = 'partie@ailleurs.example'");
      expect(await admettre("partie@ailleurs.example", OUVERTE)).toBeNull();
    });
  });

  it("ne compte pas les comptes de démo parmi les administrateurs : le premier admin réel entre quand même", async () => {
    await admettre(UTILISATEURS_DEMO[ROLE_ADMIN].email, { ...SANS_ENTREE, demo: true });
    expect(
      await admettre("premiere@client.example", { ...SANS_ENTREE, premierAdmin: "premiere@client.example" })
    ).toMatchObject({
      role: ROLE_ADMIN,
    });
  });
});

describe("chemin de retour après connexion", () => {
  it("garde un chemin de l'appli, avec sa requête, sans son ancre", () => {
    expect(cheminDeRetour("/une-page?statut=actif#haut")).toBe("/une-page?statut=actif");
    expect(cheminDeRetour("/")).toBe("/");
  });

  it("renvoie à l'accueil tout ce qui sortirait de l'appli ou porte des caractères de contrôle (projet précédent)", () => {
    for (const hostile of [
      undefined,
      null,
      "",
      "contrats",
      "https://ailleurs.example/",
      "//ailleurs.example",
      "/\\ailleurs.example",
      "\\\\ailleurs.example",
      "/%2F%2Failleurs.example",
      "/%2f/ailleurs.example",
      "/%5Cailleurs.example",
      "/une-page\n/x",
      "/une-page\t",
      "/con\u0000trats",
      "/une-page%0d%0aSet-Cookie:x",
      "javascript:alert(1)",
      "/%E0%A4%A",
      // Résolus par l'URL, « . » et « .. » rendaient « //ailleurs.example ».
      "/.//ailleurs.example",
      "/x/..//ailleurs.example",
      "/%2e//ailleurs.example",
    ]) {
      expect(cheminDeRetour(hostile), String(hostile)).toBe("/");
    }
  });
});

describe("méthode démo", () => {
  beforeEach(() => {
    poserLesMethodes(["code-email", "demo"]);
  });
  afterEach(() => {
    poserLesMethodes(null);
  });

  it("refuse de démarrer quand NODE_ENV=production : n'importe qui y joue l'admin", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => demoProposee()).toThrow(/démo.*production/);
    await expect(entrerEnDemo(ROLE_ADMIN)).rejects.toThrow(/démo.*production/);
    expect(await query("SELECT 1 FROM sessions")).toEqual([]);
  });

  it("hors production, ouvre une vraie session pour le rôle joué, sur une adresse fictive en .example", async () => {
    expect(demoProposee()).toBe(true);
    expect(await entrerEnDemo(ROLE_ADMIN)).toBe(true);
    const personne = await lireSessionDe(await cookieDeSession());
    expect(personne).toEqual({ email: UTILISATEURS_DEMO[ROLE_ADMIN].email, role: ROLE_ADMIN });
    expect(personne?.email).toMatch(/\.example$/);
  });

  it("ne fait de personne un utilisateur pour une valeur postée à la main qui n'est pas un rôle", async () => {
    expect(await entrerEnDemo("superadmin")).toBe(false);
    expect(await query("SELECT 1 FROM utilisateurs")).toEqual([]);
  });

  it("depuis /connexion, renvoie au chemin demandé, filtré ; depuis le bandeau, reste sur la page", async () => {
    const depuisLaConnexion = new FormData();
    depuisLaConnexion.set("role", ROLE_ADMIN);
    depuisLaConnexion.set("retour", "//ailleurs.example");
    await expect(entrerEnDemoAction(depuisLaConnexion)).rejects.toMatchObject(UNE_REDIRECTION("/"));

    const depuisLeBandeau = new FormData();
    depuisLeBandeau.set("role", ROLES[0]);
    await expect(entrerEnDemoAction(depuisLeBandeau)).resolves.toBeUndefined();
    expect(revalider).toHaveBeenCalledWith("/", "layout");
    expect((await lireSessionDe(await cookieDeSession()))?.role).toBe(ROLES[0]);
  });

  it("change de rôle sans laisser derrière lui la session précédente", async () => {
    await entrerEnDemo(ROLES[0]);
    await entrerEnDemo(ROLE_ADMIN);
    expect(await query("SELECT 1 FROM sessions")).toHaveLength(1);
  });

  it("la déconnexion ferme la session et renvoie à /connexion", async () => {
    await entrerEnDemo(ROLE_ADMIN);
    await expect(seDeconnecterAction()).rejects.toMatchObject(UNE_REDIRECTION("/connexion"));
    expect(await query("SELECT 1 FROM sessions")).toEqual([]);
  });
});

describe("tables des comptes", () => {
  it("refusent une adresse qui n'est pas en minuscules : l'unicité de l'adresse ne doit pas dépendre de la casse", async () => {
    await expect(
      query("INSERT INTO utilisateurs (email, role) VALUES ('Chef@client.example', 'admin')")
    ).rejects.toThrow();
  });

  it("refusent une adresse entourée d'espaces", async () => {
    await expect(
      query("INSERT INTO utilisateurs (email, role) VALUES (' chef@client.example', 'admin')")
    ).rejects.toThrow();
  });

  it("refusent de supprimer un compte qui a des sessions : on désactive un compte, on ne le supprime pas", async () => {
    const regles = await query<{ conname: string; confdeltype: string }>(
      "SELECT conname, confdeltype FROM pg_constraint WHERE conrelid = 'sessions'::regclass AND contype = 'f'"
    );
    expect(regles).toEqual([{ conname: "sessions_utilisateur_fk", confdeltype: "r" }]);
  });

  it("indexent les sessions par compte : la purge des sessions expirées d'un compte les lit à chaque connexion", async () => {
    const index = await query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'sessions_utilisateur_id_idx'"
    );
    expect(index).toHaveLength(1);
    expect(index[0].indexdef).toContain("(utilisateur_id)");
  });
});

// La politique de confidentialité décrit la brique en toutes lettres :
// sa description ne peut pas importer session.ts ni code-email.ts, qui lisent
// la base. Ces cas tiennent l'accord quand une durée change.
describe("description des traitements de la brique comptes (politique de confidentialité)", () => {
  const texte = (traitements: ReturnType<typeof traitementsComptes>) => JSON.stringify(traitements);

  it("dit la vraie durée du cookie de session et la vraie validité du code", () => {
    expect(texte(traitementsComptes(["code-email"]))).toContain(`déposé pour ${DUREE_SESSION_JOURS} jours`);
    expect(texte(traitementsComptes(["code-email"]))).toContain(`vaut ${DUREE_VALIDITE_MINUTES} minutes`);
  });

  it("ne décrit la connexion par code que si la méthode est proposée", () => {
    expect(traitementsComptes(["code-email", "demo"]).map((t) => t.cle)).toEqual(["comptes", "connexion-code"]);
    expect(traitementsComptes(["demo"]).map((t) => t.cle)).toEqual(["comptes"]);
  });

  it("ne décrit la connexion avec Google que si la méthode est proposée", () => {
    expect(traitementsComptes(["code-email", "google"]).map((t) => t.cle)).toEqual([
      "comptes",
      "connexion-code",
      "connexion-google",
    ]);
    expect(traitementsComptes(["code-email", "demo"]).map((t) => t.cle)).not.toContain("connexion-google");
  });

  it("dit la vraie durée du cookie de parcours de Google", () => {
    expect(texte(traitementsComptes(["google"]))).toContain(`déposé pour ${DUREE_PARCOURS_MINUTES} minutes`);
  });

  it("ne décrit la connexion avec Microsoft que si la méthode est proposée", () => {
    expect(traitementsComptes(["code-email", "google", "microsoft"]).map((t) => t.cle)).toEqual([
      "comptes",
      "connexion-code",
      "connexion-google",
      "connexion-microsoft",
    ]);
    expect(traitementsComptes(["code-email", "google"]).map((t) => t.cle)).not.toContain("connexion-microsoft");
  });

  it("dit la vraie durée du cookie de parcours de Microsoft", () => {
    expect(texte(traitementsComptes(["microsoft"]))).toContain(`déposé pour ${DUREE_PARCOURS_MINUTES} minutes`);
  });

  it("ne décrit la connexion par lien que si la méthode est proposée, avec la vraie validité du lien", () => {
    expect(traitementsComptes(["lien-email"]).map((t) => t.cle)).toEqual(["comptes", "connexion-lien"]);
    expect(traitementsComptes(["code-email"]).map((t) => t.cle)).not.toContain("connexion-lien");
    expect(texte(traitementsComptes(["lien-email"]))).toContain(`vaut ${DUREE_VALIDITE_LIEN_MINUTES} minutes`);
  });

  it("déclare une seule fois la conservation des demandes, que le lien partage avec le code : la purge et le registre ne les comptent pas deux fois", () => {
    const cles = (methodes: string[]) =>
      traitementsComptes(methodes).flatMap((traitement) => traitement.conservation.map((c) => c.cle));
    for (const methodes of [
      ["code-email"],
      ["lien-email"],
      ["code-email", "lien-email"],
      ["lien-email", "code-email"],
    ]) {
      const declarees = cles(methodes);
      expect(
        declarees.filter((cle) => cle === "codes-connexion"),
        methodes.join(", ")
      ).toHaveLength(1);
      expect(
        declarees.filter((cle) => cle === "codes-connexion-essais"),
        methodes.join(", ")
      ).toHaveLength(1);
    }
  });
});
