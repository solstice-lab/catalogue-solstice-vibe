import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryOne } from "../src/lib/db/client";
import { ESPACES } from "../src/config/espaces";
import { mailsCaptures, viderMailsCaptures } from "../src/briques/mails/envoi";
import { afficherCode } from "../src/briques/espaces/code";
import { creerEspace, rejoindre } from "../src/briques/espaces/espaces";
import { inviterParEmail } from "../src/briques/espaces/invitations";
import { compte, personne, repartirDeZero } from "./aide-espaces";

/*
 * L'invitation par e-mail de la brique espaces. Une appli à entrée ouverte
 * laisse n'importe qui créer un compte puis un espace : sans plafond, elle
 * deviendrait un relais d'envoi vers n'importe quelle adresse (ticket de la
 * brique). Les plafonds se comptent en base, jamais en mémoire (cicatrice d'un projet précédent :
 * une limite tenue en mémoire ne valait qu'avec un seul processus).
 */

const etat = vi.hoisted(() => ({ envoiEnEchec: false }));

// L'envoi réel reste celui de la brique mails (capturé en test) ; un test peut
// le faire échouer.
vi.mock("../src/briques/mails/envoi", async (original) => {
  const vrai = await original<typeof import("../src/briques/mails/envoi")>();
  return {
    ...vrai,
    envoyerMail: async (...args: Parameters<typeof vrai.envoyerMail>) => {
      if (etat.envoiEnEchec) throw new vrai.ErreurEnvoi("le prestataire ne répond pas.");
      return vrai.envoyerMail(...args);
    },
  };
});

const ALICE = "alice@coloc.example";
const BRUNO = "bruno@coloc.example";
const SITE = { nomDeLAppli: "Tours de coloc", site: new URL("https://coloc.example") };

beforeEach(async () => {
  etat.envoiEnEchec = false;
  viderMailsCaptures();
  await repartirDeZero();
  await compte(ALICE);
  await compte(BRUNO);
});

async function espaceDe(email: string, nom = "Coloc des Lilas"): Promise<{ id: number; code: string }> {
  const issue = await creerEspace(personne(email), { nom, prenom: email === ALICE ? "Alice" : "Bruno" });
  if ("erreur" in issue) throw new Error(issue.erreur);
  return issue.espace;
}

const invitations = async () =>
  (await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM espaces_invitations"))!.n;

describe("l'invitation par e-mail", () => {
  it("part par la brique mails à la seule adresse saisie, avec le prénom de l'espace, le code et le lien, jamais l'adresse de qui invite", async () => {
    const { id, code } = await espaceDe(ALICE);
    expect(await inviterParEmail(personne(ALICE), id, " Zoe@Exemple.FR ", SITE)).toEqual({
      message: expect.stringContaining("zoe@exemple.fr"),
    });
    const [mail] = mailsCaptures();
    expect(mail.a).toBe("zoe@exemple.fr");
    expect(mail.texte).toContain("Alice");
    expect(mail.texte).toContain("Coloc des Lilas");
    expect(mail.texte).toContain(afficherCode(code));
    expect(mail.texte).toContain(`https://coloc.example/espace/rejoindre?code=${afficherCode(code)}`);
    expect(mail.texte + mail.objet).not.toContain(ALICE);
    // Aucun texte saisi dans l'objet : un nom d'espace n'y fait pas de publicité.
    expect(mail.objet).not.toContain("Lilas");
  });

  it("est réservée aux gestionnaires de l'espace", async () => {
    const { id, code } = await espaceDe(ALICE);
    await rejoindre(personne(BRUNO), { code, prenom: "Bruno" });
    expect(await inviterParEmail(personne(BRUNO), id, "zoe@exemple.fr", SITE)).toEqual({
      erreur: expect.stringMatching(/gestionnaire/i),
    });
    expect(mailsCaptures()).toHaveLength(0);
  });

  it("refuse une adresse illisible ou multiple sans rien compter ni envoyer", async () => {
    const { id } = await espaceDe(ALICE);
    for (const adresse of ["", "zoe", "zoe@exemple.fr, yves@exemple.fr", "zoe@exemple.fr\nBcc: x@y.z"]) {
      expect(await inviterParEmail(personne(ALICE), id, adresse, SITE), adresse).toHaveProperty("erreur");
    }
    expect(await invitations()).toBe(0);
    expect(mailsCaptures()).toHaveLength(0);
  });

  it("est plafonnée par espace sur 24 heures, comptée en base avant l'envoi (une entrée ouverte ne devient pas un relais d'envoi)", async () => {
    ESPACES.plafonds.invitationsParEspaceParJour = 2;
    const { id } = await espaceDe(ALICE);
    for (const adresse of ["a@exemple.fr", "b@exemple.fr"]) {
      expect(await inviterParEmail(personne(ALICE), id, adresse, SITE)).not.toHaveProperty("erreur");
    }
    expect(await inviterParEmail(personne(ALICE), id, "c@exemple.fr", SITE)).toEqual({
      erreur: expect.stringContaining("24 heures"),
    });
    expect(mailsCaptures()).toHaveLength(2);
  });

  it("est plafonnée pour toute l'appli, tous espaces confondus : créer d'autres espaces ne contourne pas le plafond", async () => {
    ESPACES.plafonds.invitationsParJour = 2;
    const lilas = await espaceDe(ALICE);
    const roses = await espaceDe(BRUNO, "Coloc des Roses");
    await inviterParEmail(personne(ALICE), lilas.id, "a@exemple.fr", SITE);
    await inviterParEmail(personne(BRUNO), roses.id, "b@exemple.fr", SITE);
    expect(await inviterParEmail(personne(BRUNO), roses.id, "c@exemple.fr", SITE)).toHaveProperty("erreur");
    expect(mailsCaptures()).toHaveLength(2);
  });

  it("deux invitations simultanées à une place du plafond : une seule part (comptage sous verrou)", async () => {
    ESPACES.plafonds.invitationsParEspaceParJour = 1;
    const { id } = await espaceDe(ALICE);
    const issues = await Promise.all([
      inviterParEmail(personne(ALICE), id, "a@exemple.fr", SITE),
      inviterParEmail(personne(ALICE), id, "b@exemple.fr", SITE),
    ]);
    expect(issues.filter((issue) => "erreur" in issue)).toHaveLength(1);
    expect(mailsCaptures()).toHaveLength(1);
  });

  it("reste comptée quand l'envoi échoue : des échecs répétés ne contournent pas le plafond", async () => {
    ESPACES.plafonds.invitationsParEspaceParJour = 1;
    const { id } = await espaceDe(ALICE);
    etat.envoiEnEchec = true;
    expect(await inviterParEmail(personne(ALICE), id, "a@exemple.fr", SITE)).toEqual({
      erreur: expect.stringContaining("pas parti"),
    });
    etat.envoiEnEchec = false;
    expect(await inviterParEmail(personne(ALICE), id, "a@exemple.fr", SITE)).toHaveProperty("erreur");
    expect(await invitations()).toBe(1);
  });

  it("part sans lien quand l'appli n'a pas d'adresse publique (en local, sur une recette)", async () => {
    const { id, code } = await espaceDe(ALICE);
    await inviterParEmail(personne(ALICE), id, "zoe@exemple.fr", { ...SITE, site: null });
    const [mail] = mailsCaptures();
    expect(mail.texte).toContain(afficherCode(code));
    expect(mail.texte).not.toContain("http");
  });
});
