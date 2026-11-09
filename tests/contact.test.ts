import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "../src/lib/db/client";
import { mailsCaptures, viderMailsCaptures } from "@/briques/mails/envoi";
import { traiterMessageContact } from "../src/briques/contact/contact";
import { CHAMPS } from "../src/briques/contact/champs";
import { DELAI_MINIMAL_MS, FENETRE_S, LIMITE_PAR_IP, PLAFOND_GLOBAL } from "../src/briques/contact/filtres";
import { TRAITEMENTS_CONTACT } from "../src/briques/contact/confidentialite";

/*
 * Brique contact. Le formulaire est public : chaque test joue un
 * visiteur anonyme, la seule frontière simulée est l'envoi (capture de la
 * brique mails, d'office en test). La limite par adresse IP se vérifie sur la
 * vraie base locale, concurrence comprise.
 */

// Un fournisseur qui refuse l'envoi : la capture de la brique mails réussit
// toujours, ce test-ci a besoin de l'échec. « hors test » : un envoi réussi
// quand le test joue la production, où la brique mails ne capture plus.
const fournisseur = vi.hoisted(() => ({ enPanne: false, horsTest: [] as unknown[] }));
vi.mock("@/briques/mails/envoi", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/briques/mails/envoi")>();
  return {
    ...original,
    envoyerMail: async (mail: Parameters<typeof original.envoyerMail>[0]) => {
      if (fournisseur.enPanne) throw new original.ErreurEnvoi("le fournisseur a refusé l'envoi.");
      if (process.env.NODE_ENV === "production") {
        fournisseur.horsTest.push(mail);
        return { id: null };
      }
      return original.envoyerMail(mail);
    },
  };
});

const SUCCES = { envoye: true };

// Une soumission telle que le navigateur la poste : affichée il y a dix
// secondes, champ piège vide.
function saisie(valeurs: Partial<Record<keyof typeof CHAMPS, string>> = {}): FormData {
  const donnees = new FormData();
  const tout = {
    nom: "Camille Exemple",
    adresse: "camille@exemple.fr",
    message: "Bonjour,\nje voudrais un devis.",
    piege: "",
    afficheLe: String(Date.now() - 10_000),
    ...valeurs,
  };
  for (const [cle, valeur] of Object.entries(tout)) donnees.set(CHAMPS[cle as keyof typeof CHAMPS], valeur);
  return donnees;
}

// Le proxy de l'hébergeur pose l'adresse réelle dans l'en-tête configuré
// (IP_EN_TETE_CLIENT) ; le visiteur peut écrire n'importe quel autre en-tête.
const depuis = (ip: string, forgee?: string) =>
  new Headers({ "cf-connecting-ip": ip, ...(forgee ? { "x-forwarded-for": forgee, "x-real-ip": forgee } : {}) });

beforeEach(async () => {
  viderMailsCaptures();
  vi.stubEnv("CONTACT_DESTINATAIRE", "accueil@client.example");
  vi.stubEnv("IP_EN_TETE_CLIENT", "cf-connecting-ip");
  await query(`DELETE FROM contact_envois`);
});

afterEach(() => {
  fournisseur.enPanne = false;
  fournisseur.horsTest.length = 0;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("brique contact : le message part par la brique mails", () => {
  it("envoie un seul mail à l'adresse de la configuration, avec l'adresse du visiteur en réponse", async () => {
    expect(await traiterMessageContact(saisie(), depuis("203.0.113.1"))).toEqual(SUCCES);
    const mails = mailsCaptures();
    expect(mails).toHaveLength(1);
    expect(mails[0].a).toBe("accueil@client.example");
    expect(mails[0].repondreA).toBe("camille@exemple.fr");
    expect(mails[0].texte).toContain("Camille Exemple");
    expect(mails[0].texte).toContain("je voudrais un devis.");
  });

  it("n'insère jamais le nom saisi dans l'objet (un saut de ligne dans l'objet est la porte d'un en-tête injecté)", async () => {
    await traiterMessageContact(saisie({ nom: "Camille Exemple" }), depuis("203.0.113.1"));
    expect(mailsCaptures()[0].objet).not.toContain("Camille");
  });

  it("échappe chaque valeur saisie dans le HTML du mail (cicatrice : HTML de mail non échappé)", async () => {
    const attaque = '<script>alert("x")</script>';
    await traiterMessageContact(
      saisie({ nom: `Camille ${attaque}`, message: `Bonjour ${attaque}` }),
      depuis("203.0.113.1")
    );
    const { html } = mailsCaptures()[0];
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("garde les lignes du message : chacune devient un paragraphe du mail (le gabarit ne rend pas les sauts de ligne)", async () => {
    await traiterMessageContact(saisie({ message: "Première ligne\nDeuxième ligne" }), depuis("203.0.113.1"));
    const { html } = mailsCaptures()[0];
    expect(html).toMatch(/Première ligne<\/p>[\s\S]*<p[^>]*>Deuxième ligne/);
  });

  it("refuse de démarrer sans destinataire configuré, en nommant la variable (un message envoyé nulle part passerait pour reçu)", async () => {
    vi.stubEnv("CONTACT_DESTINATAIRE", "");
    await expect(traiterMessageContact(saisie(), depuis("203.0.113.1"))).rejects.toThrow(/CONTACT_DESTINATAIRE/);
    expect(mailsCaptures()).toEqual([]);
  });

  it("dit au visiteur que son message n'est pas parti quand l'envoi échoue, sans le contenu dans le journal", async () => {
    fournisseur.enPanne = true;
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    const etat = await traiterMessageContact(saisie({ message: "Contenu confidentiel" }), depuis("203.0.113.1"));
    expect(etat.envoye).toBeUndefined();
    expect(etat.erreur).toMatch(/pas parti/);
    expect(etat.valeurs?.message).toBe("Contenu confidentiel");
    expect(journal).toHaveBeenCalled();
    expect(JSON.stringify(journal.mock.calls)).not.toContain("Contenu confidentiel");
  });

  it("ne compte pas un envoi raté dans la limite : un fournisseur en panne ne bloque pas le visiteur qui réessaie", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fournisseur.enPanne = true;
    for (let rang = 0; rang < LIMITE_PAR_IP + 2; rang++) await traiterMessageContact(saisie(), depuis("203.0.113.1"));
    fournisseur.enPanne = false;
    expect(await traiterMessageContact(saisie(), depuis("203.0.113.1"))).toEqual(SUCCES);
    const lignes = await query<{ n: number }>(`SELECT count(*)::int AS n FROM contact_envois`);
    expect(lignes[0].n).toBe(1);
  });
});

describe("brique contact : saisie invalide, une vraie réponse (ce n'est pas un filtre anti-spam)", () => {
  it.each([
    ["un nom vide", { nom: "  " }],
    ["un nom sur plusieurs lignes", { nom: "Camille\nBcc: autre@exemple.fr" }],
    ["un nom trop long", { nom: "x".repeat(201) }],
    ["une adresse invalide", { adresse: "camille" }],
    ["deux adresses", { adresse: "camille@exemple.fr, autre@exemple.fr" }],
    ["un message vide", { message: "\n  \n" }],
    ["un message trop long", { message: "x".repeat(5001) }],
  ])("refuse %s, rend la saisie au formulaire et n'envoie rien", async (_cas, valeurs) => {
    const etat = await traiterMessageContact(saisie(valeurs), depuis("203.0.113.1"));
    expect(etat.erreur).toBeTruthy();
    expect(etat.envoye).toBeUndefined();
    expect(etat.valeurs).toBeDefined();
    expect(mailsCaptures()).toEqual([]);
  });
});

describe("brique contact : filtres anti-spam, même réponse qu'un envoi réussi", () => {
  it("répond comme un succès sans rien envoyer quand le champ piège est rempli (un robot remplit tous les champs)", async () => {
    expect(await traiterMessageContact(saisie({ piege: "https://spam.example" }), depuis("203.0.113.1"))).toEqual(
      SUCCES
    );
    expect(mailsCaptures()).toEqual([]);
  });

  it("répond comme un succès sans rien envoyer quand le formulaire est posté plus vite que le délai minimal", async () => {
    const tropTot = String(Date.now() - DELAI_MINIMAL_MS + 500);
    expect(await traiterMessageContact(saisie({ afficheLe: tropTot }), depuis("203.0.113.1"))).toEqual(SUCCES);
    expect(mailsCaptures()).toEqual([]);
  });

  it.each([
    ["absente", ""],
    ["illisible", "hier"],
    ["dans le futur", String(Date.now() + 60_000)],
  ])("traite une heure d'affichage %s comme un robot", async (_cas, afficheLe) => {
    expect(await traiterMessageContact(saisie({ afficheLe }), depuis("203.0.113.1"))).toEqual(SUCCES);
    expect(mailsCaptures()).toEqual([]);
  });

  it("répond de même au robot, que son message soit valide ou non (la réponse ne trahit pas le filtre)", async () => {
    expect(
      await traiterMessageContact(saisie({ piege: "x", adresse: "pas-une-adresse" }), depuis("203.0.113.1"))
    ).toEqual(SUCCES);
  });
});

describe("brique contact : limite d'envois en base, par adresse IP et au total", () => {
  it(`n'envoie plus rien au-delà de ${LIMITE_PAR_IP} messages par heure depuis une même adresse, et le dit au visiteur`, async () => {
    for (let rang = 0; rang < LIMITE_PAR_IP; rang++) {
      expect(await traiterMessageContact(saisie(), depuis("203.0.113.1"))).toEqual(SUCCES);
    }
    const etat = await traiterMessageContact(saisie(), depuis("203.0.113.1"));
    expect(etat.erreur).toMatch(/Réessayez dans une heure/);
    expect(etat.valeurs).toBeDefined();
    expect(mailsCaptures()).toHaveLength(LIMITE_PAR_IP);
    // Une autre adresse n'est pas bloquée.
    expect(await traiterMessageContact(saisie(), depuis("203.0.113.2"))).toEqual(SUCCES);
  });

  it("ne laisse pas passer deux soumissions simultanées au-delà de la limite (lecture puis écriture sous verrou)", async () => {
    const resultats = await Promise.all(
      Array.from({ length: LIMITE_PAR_IP + 4 }, () => traiterMessageContact(saisie(), depuis("203.0.113.1")))
    );
    expect(resultats.filter((etat) => etat.envoye)).toHaveLength(LIMITE_PAR_IP);
    expect(mailsCaptures()).toHaveLength(LIMITE_PAR_IP);
  });

  it(`n'envoie plus rien au-delà de ${PLAFOND_GLOBAL} messages par heure toutes adresses confondues (un robot qui change d'adresse épuiserait le quota d'envoi)`, async () => {
    await query(`INSERT INTO contact_envois (empreinte) SELECT 'autre-' || n FROM generate_series(1, $1::int) AS n`, [
      PLAFOND_GLOBAL,
    ]);
    const etat = await traiterMessageContact(saisie(), depuis("203.0.113.9"));
    expect(etat.erreur).toMatch(/Réessayez dans une heure/);
    expect(mailsCaptures()).toEqual([]);
  });

  // Audit du 2026-11-09 : quelques adresses, ou une production sans adresse
  // lisible, saturaient le plafond sans que rien ne le dise ; les visiteurs
  // lisaient « Réessayez dans une heure » et le client ne recevait plus rien.
  it("le dit au journal une fois, quand le message qui atteint le plafond global passe, sans nom, adresse, IP ni message : de quoi relever PLAFOND_GLOBAL si ce sont de vrais visiteurs", async () => {
    const avertissement = vi.spyOn(console, "warn").mockImplementation(() => {});
    await query(`INSERT INTO contact_envois (empreinte) SELECT 'autre-' || n FROM generate_series(1, $1::int) AS n`, [
      PLAFOND_GLOBAL - 2,
    ]);
    expect(await traiterMessageContact(saisie(), depuis("203.0.113.1"))).toEqual(SUCCES);
    expect(avertissement).not.toHaveBeenCalled();
    expect(await traiterMessageContact(saisie(), depuis("203.0.113.2"))).toEqual(SUCCES);
    for (let rang = 0; rang < 3; rang++) await traiterMessageContact(saisie(), depuis(`203.0.113.${10 + rang}`));
    expect(avertissement).toHaveBeenCalledTimes(1);
    const message = avertissement.mock.calls[0].map(String).join(" ");
    expect(message).toMatch(new RegExp(`Brique contact : .*plafond.*${PLAFOND_GLOBAL}.*PLAFOND_GLOBAL`));
    for (const donnee of ["203.0.113", "Camille", "camille@exemple.fr", "devis"]) expect(message).not.toContain(donnee);
  });

  it("ne compte que les envois de l'heure écoulée, et efface les traces plus anciennes", async () => {
    await query(
      `INSERT INTO contact_envois (empreinte, recu_le) SELECT 'ancienne-' || n, now() - interval '2 hours' FROM generate_series(1, $1::int) AS n`,
      [PLAFOND_GLOBAL]
    );
    expect(await traiterMessageContact(saisie(), depuis("203.0.113.1"))).toEqual(SUCCES);
    const restantes = await query<{ n: number }>(`SELECT count(*)::int AS n FROM contact_envois`);
    expect(restantes[0].n).toBe(1);
  });

  it("ne compte pas les soumissions filtrées comme robot : un robot sur l'adresse d'un visiteur ne le bloque pas", async () => {
    for (let rang = 0; rang < LIMITE_PAR_IP + 2; rang++) {
      await traiterMessageContact(saisie({ piege: "x" }), depuis("203.0.113.1"));
    }
    expect(await traiterMessageContact(saisie(), depuis("203.0.113.1"))).toEqual(SUCCES);
  });

  it("ne garde jamais l'adresse IP en clair en base, seulement son empreinte", async () => {
    await traiterMessageContact(saisie(), depuis("203.0.113.77"));
    const lignes = await query<{ empreinte: string }>(`SELECT empreinte FROM contact_envois`);
    expect(lignes).toHaveLength(1);
    expect(lignes[0].empreinte).not.toContain("203.0.113.77");
    expect(lignes[0].empreinte).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ne se laisse pas contourner par un en-tête forgé (X-Forwarded-For, X-Real-IP) : deux visiteurs qui forgent la même adresse gardent chacun leur limite", async () => {
    for (let rang = 0; rang < LIMITE_PAR_IP; rang++) {
      await traiterMessageContact(saisie(), depuis("203.0.113.1", "198.51.100.1"));
    }
    expect(await traiterMessageContact(saisie(), depuis("203.0.113.2", "198.51.100.1"))).toEqual(SUCCES);
    // Et un même visiteur qui change d'adresse forgée reste limité.
    const etat = await traiterMessageContact(saisie(), depuis("203.0.113.1", "198.51.100.99"));
    expect(etat.erreur).toMatch(/Réessayez dans une heure/);
  });
});

describe("brique contact : en production sans en-tête d'adresse configuré", () => {
  it("n'applique pas la limite par adresse (un compte commun bloquerait tous les visiteurs), mais garde le plafond global", async () => {
    vi.stubEnv("IP_EN_TETE_CLIENT", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let rang = 0; rang < LIMITE_PAR_IP + 2; rang++) {
      expect(await traiterMessageContact(saisie(), depuis("203.0.113.1"))).toEqual(SUCCES);
    }
    expect(fournisseur.horsTest).toHaveLength(LIMITE_PAR_IP + 2);
    await query(`INSERT INTO contact_envois (empreinte) SELECT 'autre-' || n FROM generate_series(1, $1::int) AS n`, [
      PLAFOND_GLOBAL,
    ]);
    const etat = await traiterMessageContact(saisie(), depuis("203.0.113.1"));
    expect(etat.erreur).toMatch(/Réessayez dans une heure/);
  });

  it("rend aussi la place d'un envoi raté sans adresse : les échecs ne remplissent pas le plafond global", async () => {
    vi.stubEnv("IP_EN_TETE_CLIENT", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    fournisseur.enPanne = true;
    for (let rang = 0; rang < 3; rang++) await traiterMessageContact(saisie(), depuis("203.0.113.1"));
    const lignes = await query<{ n: number }>(`SELECT count(*)::int AS n FROM contact_envois`);
    expect(lignes[0].n).toBe(0);
  });
});

describe("migrations de la brique contact", () => {
  it("livrent la table des traces de la limite, sans colonne pour l'adresse en clair ni pour le message", async () => {
    const colonnes = await query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'contact_envois' ORDER BY column_name`
    );
    expect(colonnes.map((c) => c.column_name)).toEqual(["empreinte", "recu_le"]);
  });
});

// La politique de confidentialité décrit la brique en toutes lettres :
// sa description ne peut pas importer filtres.ts, qui lit la base.
describe("description du traitement de la brique contact (politique de confidentialité)", () => {
  it("dit la vraie durée de conservation de l'empreinte de l'adresse IP", () => {
    expect(FENETRE_S).toBe(3_600);
    expect(JSON.stringify(TRAITEMENTS_CONTACT)).toContain("effacée au premier message reçu après une heure");
  });
});
