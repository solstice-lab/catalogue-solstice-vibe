import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { query, queryOne } from "../src/lib/db/client";
import { ESPACES } from "../src/config/espaces";
import {
  creerEspace,
  lireMembres,
  nommerGestionnaire,
  quitter,
  regenererCode,
  rejoindre,
  retirerGestionnaire,
  retirerMembre,
} from "../src/briques/espaces/espaces";
import { adhesionDe, adhesionsDe, compte, personne, repartirDeZero } from "./aide-espaces";

/*
 * Les gestes de la brique espaces, par ses fonctions, comme les appellent les
 * server actions de /espace après leur garde. Le cas d'origine : l'essai
 * tours-de-coloc (2026-11-03), où cinq tickets réécrivaient ces gestes.
 */

const ALICE = "alice@coloc.example";
const BRUNO = "bruno@coloc.example";
const CHLOE = "chloe@coloc.example";

beforeEach(async () => {
  await repartirDeZero();
  for (const email of [ALICE, BRUNO, CHLOE]) await compte(email);
});

// Un espace créé par Alice, que Bruno puis Chloé rejoignent si demandé.
async function espace(...autres: string[]): Promise<{ id: number; code: string }> {
  const cree = await creerEspace(personne(ALICE), { nom: "Coloc des Lilas", prenom: "Alice" });
  if ("erreur" in cree) throw new Error(cree.erreur);
  for (const email of autres) {
    const issue = await rejoindre(personne(email), { code: cree.espace.code, prenom: email.split("@")[0] });
    if ("erreur" in issue) throw new Error(issue.erreur);
  }
  return cree.espace;
}

const reussis = (issues: unknown[]) =>
  issues.filter((issue) => !(issue && typeof issue === "object" && "erreur" in issue)).length;

describe("créer et rejoindre un espace", () => {
  it("créer fait de la personne la gestionnaire, sous le prénom qu'elle porte dans l'espace, jamais son adresse", async () => {
    const { id } = await espace();
    const membres = await lireMembres(id);
    expect(membres).toEqual([expect.objectContaining({ prenom: "Alice", role: "gestionnaire" })]);
    expect(JSON.stringify(membres)).not.toContain("@");
  });

  it("rejoindre par le code, lu sans casse, espaces ni tiret, fait entrer comme membre", async () => {
    const { id, code } = await espace();
    const saisi = ` ${code.slice(0, 4).toLowerCase()}-${code.slice(4).toLowerCase()} `;
    const issue = await rejoindre(personne(BRUNO), { code: saisi, prenom: "Bruno" });
    expect(issue).toEqual({ espace: expect.objectContaining({ id }), deja: false });
    expect((await lireMembres(id)).map(({ prenom, role }) => [prenom, role])).toEqual([
      ["Alice", "gestionnaire"],
      ["Bruno", "membre"],
    ]);
  });

  it("rejoindre deux fois le même espace ne crée qu'une adhésion, même par deux demandes simultanées (une page périmée soumise deux fois créait un doublon)", async () => {
    const { id, code } = await espace();
    const issues = await Promise.all([
      rejoindre(personne(BRUNO), { code, prenom: "Bruno" }),
      rejoindre(personne(BRUNO), { code, prenom: "Bruno" }),
    ]);
    expect(reussis(issues)).toBe(2);
    expect((await adhesionsDe(id)).filter((adhesion) => adhesion.prenom === "Bruno")).toHaveLength(1);
  });

  it("un seul espace par compte : rejoindre ou créer un second espace est refusé, y compris deux demandes simultanées (règle tenue sous verrou)", async () => {
    const premier = await espace();
    const second = await creerEspace(personne(BRUNO), { nom: "Coloc des Roses", prenom: "Bruno" });
    if ("erreur" in second) throw new Error(second.erreur);
    const issues = await Promise.all([
      rejoindre(personne(CHLOE), { code: premier.code, prenom: "Chloé" }),
      rejoindre(personne(CHLOE), { code: second.espace.code, prenom: "Chloé" }),
    ]);
    expect(reussis(issues)).toBe(1);
    expect(await creerEspace(personne(ALICE), { nom: "Une autre", prenom: "Alice" })).toEqual({
      erreur: expect.stringContaining("Quittez"),
    });
  });

  it("avec plusieurs espaces par compte, rejoindre et créer un second espace passent", async () => {
    ESPACES.plusieursParCompte = true;
    const premier = await espace();
    const second = await creerEspace(personne(BRUNO), { nom: "Coloc des Roses", prenom: "Bruno" });
    if ("erreur" in second) throw new Error(second.erreur);
    expect(await rejoindre(personne(ALICE), { code: second.espace.code, prenom: "Alice" })).not.toHaveProperty(
      "erreur"
    );
    expect(await creerEspace(personne(ALICE), { nom: "Troisième", prenom: "Alice" })).not.toHaveProperty("erreur");
    expect(await lireMembres(premier.id)).toHaveLength(1);
  });

  it("refuse un nom ou un prénom qui ressemble à un lien, sans rien créer", async () => {
    expect(await creerEspace(personne(ALICE), { nom: "promo.example/gagner", prenom: "Alice" })).toHaveProperty(
      "erreur"
    );
    expect(await query("SELECT 1 FROM espaces")).toHaveLength(0);
  });
});

describe("le code d'invitation", () => {
  it("un code qui n'ouvre aucun espace est refusé, et les codes faux sont plafonnés par compte, comptés en base (un compte ne parcourt pas les codes ; une limite tenue en mémoire ne valait qu'avec un seul processus)", async () => {
    const { code } = await espace();
    ESPACES.plafonds.codesFauxParHeure = 3;
    const faux = code === "ABCDEFGH" ? "HGFEDCBA" : "ABCDEFGH";
    for (let essai = 0; essai < 3; essai++) {
      expect(await rejoindre(personne(BRUNO), { code: faux, prenom: "Bruno" })).toEqual({
        erreur: expect.stringContaining("Aucun"),
      });
    }
    // Au plafond, même le bon code est refusé : sinon le plafond ne dirait
    // rien au compte qui parcourt les codes.
    expect(await rejoindre(personne(BRUNO), { code, prenom: "Bruno" })).toEqual({
      erreur: expect.stringContaining("Trop de codes"),
    });
    expect(await queryOne("SELECT count(*)::int AS n FROM espaces_essais_code")).toEqual({ n: 3 });
    // Le plafond est celui du compte : un autre compte entre.
    expect(await rejoindre(personne(CHLOE), { code, prenom: "Chloé" })).not.toHaveProperty("erreur");
  });

  it("un code régénéré ferme l'ancien, et seul un gestionnaire le régénère", async () => {
    const { id, code } = await espace(BRUNO);
    expect(await regenererCode(personne(BRUNO), id)).toEqual({ erreur: expect.stringMatching(/gestionnaire/i) });
    const nouveau = await regenererCode(personne(ALICE), id);
    if ("erreur" in nouveau) throw new Error(nouveau.erreur);
    expect(nouveau.code).not.toBe(code);
    expect(await rejoindre(personne(CHLOE), { code, prenom: "Chloé" })).toHaveProperty("erreur");
    expect(await rejoindre(personne(CHLOE), { code: nouveau.code, prenom: "Chloé" })).not.toHaveProperty("erreur");
  });
});

describe("le dernier gestionnaire", () => {
  it("ne retire pas son propre rôle, ne quitte pas l'espace et n'en est pas retiré tant qu'il reste des membres (ticket ; le dernier admin de la brique comptes, protégé de même)", async () => {
    const { id } = await espace(BRUNO);
    const alice = await adhesionDe(id, ALICE);
    expect(await retirerGestionnaire(personne(ALICE), id, alice)).toEqual({
      erreur: expect.stringContaining("nommez d'abord"),
    });
    expect(await quitter(personne(ALICE), id)).toEqual({ erreur: expect.stringContaining("nommez d'abord") });
    expect((await lireMembres(id)).find((membre) => membre.prenom === "Alice")?.role).toBe("gestionnaire");
  });

  it("deux gestionnaires qui se rétrogradent l'un l'autre au même instant : il en reste un (lecture et écriture sous le verrou de l'espace)", async () => {
    const { id } = await espace(BRUNO, CHLOE);
    const bruno = await adhesionDe(id, BRUNO);
    const alice = await adhesionDe(id, ALICE);
    await nommerGestionnaire(personne(ALICE), id, bruno);
    const issues = await Promise.all([
      retirerGestionnaire(personne(ALICE), id, bruno),
      retirerGestionnaire(personne(BRUNO), id, alice),
    ]);
    expect(reussis(issues)).toBe(1);
    expect((await lireMembres(id)).filter((membre) => membre.role === "gestionnaire")).toHaveLength(1);
  });

  it("deux gestionnaires qui se retirent l'un l'autre au même instant : il en reste un", async () => {
    const { id } = await espace(BRUNO, CHLOE);
    const bruno = await adhesionDe(id, BRUNO);
    const alice = await adhesionDe(id, ALICE);
    await nommerGestionnaire(personne(ALICE), id, bruno);
    const issues = await Promise.all([
      retirerMembre(personne(ALICE), id, bruno),
      retirerMembre(personne(BRUNO), id, alice),
    ]);
    expect(reussis(issues)).toBe(1);
    expect((await lireMembres(id)).filter((membre) => membre.role === "gestionnaire")).toHaveLength(1);
  });

  it("seul dans son espace, il le quitte ; l'espace reste, et la prochaine personne qui le rejoint en devient gestionnaire (ticket)", async () => {
    const { id, code } = await espace();
    expect(await quitter(personne(ALICE), id)).toBeUndefined();
    expect(await lireMembres(id)).toEqual([]);
    expect(await queryOne("SELECT id FROM espaces WHERE id = $1", [id])).toBeDefined();
    await rejoindre(personne(BRUNO), { code, prenom: "Bruno" });
    expect(await lireMembres(id)).toEqual([expect.objectContaining({ prenom: "Bruno", role: "gestionnaire" })]);
  });
});

describe("retirer un membre, nommer un gestionnaire", () => {
  it("sont réservés aux gestionnaires de cet espace : ni un membre, ni le gestionnaire d'un autre espace", async () => {
    ESPACES.plusieursParCompte = true;
    const { id } = await espace(BRUNO, CHLOE);
    const chloe = await adhesionDe(id, CHLOE);
    expect(await retirerMembre(personne(BRUNO), id, chloe)).toEqual({
      erreur: expect.stringMatching(/gestionnaire/i),
    });
    expect(await nommerGestionnaire(personne(BRUNO), id, chloe)).toHaveProperty("erreur");
    const autre = await creerEspace(personne(CHLOE), { nom: "Coloc des Roses", prenom: "Chloé" });
    if ("erreur" in autre) throw new Error(autre.erreur);
    expect(await retirerMembre(personne(CHLOE), autre.espace.id, await adhesionDe(id, BRUNO))).toHaveProperty("erreur");
    expect(await lireMembres(id)).toHaveLength(3);
  });

  it("un membre retiré n'est plus membre ; son adhésion reste, terminée, avec son motif", async () => {
    const { id } = await espace(BRUNO);
    expect(await retirerMembre(personne(ALICE), id, await adhesionDe(id, BRUNO))).toBeUndefined();
    expect(await lireMembres(id)).toHaveLength(1);
    const [, bruno] = await adhesionsDe(id);
    expect(bruno).toEqual(expect.objectContaining({ prenom: "bruno", motif_depart: "retire" }));
    expect(bruno.depart_le).toBeInstanceOf(Date);
  });

  it("une personne partie puis revenue a une nouvelle adhésion, l'ancienne reste (une adhésion terminée ne se supprime pas)", async () => {
    const { id, code } = await espace(BRUNO);
    await quitter(personne(BRUNO), id);
    await rejoindre(personne(BRUNO), { code, prenom: "Bruno" });
    const bruno = (await adhesionsDe(id)).filter((adhesion) => adhesion.prenom.toLowerCase() === "bruno");
    expect(bruno.map((adhesion) => adhesion.motif_depart)).toEqual(["parti", null]);
  });

  it("la base refuse de supprimer un espace qui a des adhésions, et aucun fichier de la brique ne supprime une adhésion (une suppression en cascade emportait des documents liés)", async () => {
    const { id } = await espace(BRUNO);
    await expect(query("DELETE FROM espaces WHERE id = $1", [id])).rejects.toThrow();
    const dossier = path.join(process.cwd(), "src", "briques", "espaces");
    const sources = fs.readdirSync(dossier).filter((nom) => /\.tsx?$/.test(nom));
    expect(sources.length).toBeGreaterThan(0);
    for (const nom of sources) {
      expect(fs.readFileSync(path.join(dossier, nom), "utf-8"), nom).not.toMatch(/DELETE\s+FROM\s+espaces_adhesions/i);
    }
  });
});

describe("les contraintes de la base", () => {
  it("refusent un code hors de l'alphabet, une adhésion terminée sans motif, un rôle ou un motif inconnus (tout ce que le code peut écrire, la base l'admet, et rien d'autre)", async () => {
    const { id } = await espace();
    const [alice] = await adhesionsDe(id);
    for (const code of ["abcdefgh", "ABCDEFG0", "ABCDEFGO", "ABCDEFG1", "ABCDEFGI", "ABCDEFGL", "ABCDEFG"]) {
      await expect(query("UPDATE espaces SET code = $2 WHERE id = $1", [id, code]), code).rejects.toThrow(
        /espaces_code_check/
      );
    }
    await expect(query("UPDATE espaces_adhesions SET depart_le = now() WHERE id = $1", [alice.id])).rejects.toThrow(
      /espaces_adhesions_depart_check/
    );
    await expect(query("UPDATE espaces_adhesions SET role = 'admin' WHERE id = $1", [alice.id])).rejects.toThrow(
      /espaces_adhesions_role_check/
    );
    await expect(
      query("UPDATE espaces_adhesions SET depart_le = now(), motif_depart = 'efface' WHERE id = $1", [alice.id])
    ).rejects.toThrow(/espaces_adhesions_motif_check/);
  });
});
