import { beforeEach, describe, expect, it } from "vitest";
import { transaction } from "../src/lib/db/client";
import { EFFETS_COMPTES } from "../src/config/effets-comptes";
import { anonymiserLeCompte, desactiver, reactiver } from "../src/briques/comptes/administration";
import type { ContexteEntree } from "../src/briques/comptes/entree";
import { SOURCES_ESPACES } from "../src/briques/espaces/donnees-personnelles";
import { EFFETS_ESPACES } from "../src/briques/espaces/effets-comptes";
import {
  creerEspace,
  lireMembres,
  nommerGestionnaire,
  quitter,
  rejoindre,
  retirerGestionnaire,
} from "../src/briques/espaces/espaces";
import { adhesionDe, adhesionsDe, compte, personne, repartirDeZero } from "./aide-espaces";

/*
 * Ce que la brique espaces fait quand un compte est désactivé, réactivé ou
 * effacé : son entrée du registre des effets de comptes
 * (src/config/effets-comptes.ts), jouée par les gestes de la brique comptes
 * dans leur transaction. Dans tours-de-coloc, terminer une appartenance à la
 * désactivation obligeait à retoucher src/app/comptes/actions.ts (2026-11-03).
 *
 * Que ces effets n'écrivent que par la transaction du geste, c'est le verrou
 * de tests/comptes-effets.test.ts, qui joue tout le registre.
 *
 * Aussi : la source « Espaces » de l'export et de l'effacement des données
 * d'une personne (brique rgpd).
 */

const SANS_ENTREE: ContexteEntree = { entree: { adresses: {}, domaines: [] }, premierAdmin: undefined, demo: false };
const ADMIN = { email: "admin@client.example" };
const ALICE = "alice@coloc.example";
const BRUNO = "bruno@coloc.example";
const CHLOE = "chloe@coloc.example";

let ids: Record<string, number>;

beforeEach(async () => {
  await repartirDeZero();
  ids = {};
  for (const email of [ALICE, BRUNO, CHLOE]) ids[email] = await compte(email);
  // L'auteur des gestes a son compte : avec la brique journal, la trace du
  // geste le retrouve en base.
  await compte(ADMIN.email, "admin");
});

// Alice crée l'espace, puis Bruno et Chloé, dans cet ordre, le rejoignent.
async function espace(...autres: string[]): Promise<{ id: number; code: string }> {
  const cree = await creerEspace(personne(ALICE), { nom: "Coloc des Lilas", prenom: "Alice" });
  if ("erreur" in cree) throw new Error(cree.erreur);
  for (const email of autres) {
    await rejoindre(personne(email), { code: cree.espace.code, prenom: email.split("@")[0] });
  }
  return cree.espace;
}

const roles = async (id: number) =>
  Object.fromEntries((await lireMembres(id)).map((membre) => [membre.prenom, membre.role]));

describe("les effets d'un compte sur ses espaces", () => {
  it("sont déclarés au registre des effets de comptes, avant le journal qui trace le geste", () => {
    const unites = EFFETS_COMPTES.map((effets) => effets.unite);
    expect(unites).toContain(EFFETS_ESPACES.unite);
    if (unites.includes("journal")) {
      expect(unites.indexOf(EFFETS_ESPACES.unite)).toBeLessThan(unites.indexOf("journal"));
    }
  });

  it("désactiver termine l'adhésion et nomme le membre le plus ancien quand c'était le dernier gestionnaire (ticket ; tours-de-coloc)", async () => {
    const { id } = await espace(BRUNO, CHLOE);
    expect(await desactiver(ids[ALICE], ADMIN, SANS_ENTREE)).toBeUndefined();
    expect(await roles(id)).toEqual({ bruno: "gestionnaire", chloe: "membre" });
    const [alice] = await adhesionsDe(id);
    expect(alice.motif_depart).toBe("compte-desactive");
  });

  it("désactiver un gestionnaire qui n'est pas le dernier ne nomme personne", async () => {
    const { id } = await espace(BRUNO, CHLOE);
    await desactiver(ids[CHLOE], ADMIN, SANS_ENTREE);
    expect(await roles(id)).toEqual({ Alice: "gestionnaire", bruno: "membre" });
  });

  it("désactiver le seul membre laisse l'espace vide, repris par la prochaine personne qui le rejoint", async () => {
    const { id, code } = await espace();
    await desactiver(ids[ALICE], ADMIN, SANS_ENTREE);
    expect(await lireMembres(id)).toEqual([]);
    await rejoindre(personne(BRUNO), { code, prenom: "Bruno" });
    expect(await roles(id)).toEqual({ Bruno: "gestionnaire" });
  });

  it("réactiver ne rend pas l'adhésion : une adhésion terminée ne revit pas, la personne rejoint de nouveau par le code", async () => {
    const { id } = await espace(BRUNO);
    await desactiver(ids[BRUNO], ADMIN, SANS_ENTREE);
    await reactiver(ids[BRUNO], ADMIN);
    expect(await roles(id)).toEqual({ Alice: "gestionnaire" });
  });

  it("rejoindre pendant qu'une désactivation du compte est en cours attend sa fin, et n'ouvre pas d'adhésion sur un compte désactivé (relevé à la relecture : l'effet ne voyait pas l'adhésion à venir)", async () => {
    const { id, code } = await espace();
    let pendant: ReturnType<typeof rejoindre> | undefined;
    // La désactivation, tenue ouverte le temps que rejoindre parte et bute sur
    // la ligne du compte.
    await transaction(async (tx) => {
      await tx.query("UPDATE utilisateurs SET actif = false WHERE id = $1", [ids[BRUNO]]);
      pendant = rejoindre(personne(BRUNO), { code, prenom: "Bruno" });
      await new Promise((fin) => setTimeout(fin, 300));
    });
    expect(await pendant).toEqual({ erreur: expect.stringContaining("désactivé") });
    expect(await roles(id)).toEqual({ Alice: "gestionnaire" });
  });

  it("effacer termine l'adhésion, nomme un successeur, et remplace le prénom par « Ancien membre », adhésions terminées comprises (ticket)", async () => {
    const { id, code } = await espace(BRUNO);
    // Alice part en laissant Bruno gestionnaire, revient, et reprend seule le
    // rôle : elle a une adhésion terminée et une en cours, de dernière gestionnaire.
    await nommerGestionnaire(personne(ALICE), id, await adhesionDe(id, BRUNO));
    await quitter(personne(ALICE), id);
    await rejoindre(personne(ALICE), { code, prenom: "Alice" });
    await nommerGestionnaire(personne(BRUNO), id, await adhesionDe(id, ALICE));
    await retirerGestionnaire(personne(BRUNO), id, await adhesionDe(id, BRUNO));
    expect(await roles(id)).toEqual({ Alice: "gestionnaire", bruno: "membre" });

    expect(await transaction((tx) => anonymiserLeCompte(tx, ALICE, ADMIN, SANS_ENTREE))).toMatchObject({
      id: ids[ALICE],
    });
    const deAlice = (await adhesionsDe(id)).filter((adhesion) => adhesion.utilisateur_id === ids[ALICE]);
    expect(deAlice.map((adhesion) => adhesion.prenom)).toEqual(["Ancien membre", "Ancien membre"]);
    expect(deAlice.every((adhesion) => adhesion.depart_le !== null)).toBe(true);
    expect(await roles(id)).toEqual({ bruno: "gestionnaire" });
  });
});

describe("la source « Espaces » de l'export et de l'effacement des données d'une personne", () => {
  const source = (cle: string) => SOURCES_ESPACES.find((candidate) => candidate.cle === cle)!;

  it("sort les adhésions de l'adresse, avec l'espace, sans les autres membres ni le code", async () => {
    await espace(BRUNO);
    const lignes = await source("espaces").lire(BRUNO);
    expect(lignes).toEqual([expect.objectContaining({ espace: "Coloc des Lilas", prenom: "bruno", role: "membre" })]);
    expect(JSON.stringify(lignes)).not.toContain("Alice");
    expect(Object.keys(lignes[0])).not.toContain("code");
  });

  it("sort les codes faux saisis par le compte, et les efface", async () => {
    await espace();
    // Un code bien formé qui n'ouvre aucun espace : tomber sur le code tiré
    // pour l'espace d'Alice a une chance sur 31 puissance 8.
    expect(await rejoindre(personne(BRUNO), { code: "AAAA2222", prenom: "Bruno" })).toHaveProperty("erreur");
    const essais = source("codes-espaces");
    expect((await essais.lire(BRUNO)).length).toBeGreaterThan(0);
    const effaces = await transaction((tx) => essais.effacer(tx, BRUNO));
    expect(effaces.lignes).toBeGreaterThan(0);
    expect(await essais.lire(BRUNO)).toEqual([]);
  });

  it("à l'effacement, compte les adhésions sans les réécrire : l'anonymisation du compte, qui suit, joue l'effet d'effacement", async () => {
    await espace(BRUNO);
    const issue = await transaction((tx) => source("espaces").effacer(tx, BRUNO));
    expect(issue).toEqual({ lignes: 1 });
    expect(await source("espaces").lire(BRUNO)).toEqual([expect.objectContaining({ prenom: "bruno" })]);
  });
});
