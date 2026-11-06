import { beforeEach, describe, expect, it } from "vitest";
import { ESPACES } from "../src/config/espaces";
import { entreeDeLEspace } from "../src/briques/espaces/accueil";
import { creerEspace } from "../src/briques/espaces/espaces";
import { jouerLaPersonne } from "./aide-session";
import { compte, personne, repartirDeZero } from "./aide-espaces";

/*
 * L'entrée de l'accueil d'une appli à espaces. Cas d'origine : le 2026-11-05,
 * l'essai tours-de-coloc montrait un onglet « Ma coloc » à côté d'un accueil
 * vide ; une personne sans coloc ne savait pas qu'il fallait commencer par en
 * créer une ou en rejoindre une.
 */

const ALICE = "alice@coloc.example";
const BRUNO = "bruno@coloc.example";

beforeEach(async () => {
  await repartirDeZero();
  await compte(ALICE);
  await compte(BRUNO);
});

describe("l'entrée de l'accueil", () => {
  it("mène à « Créer ou rejoindre » quand la personne n'a pas d'espace", async () => {
    jouerLaPersonne(personne(BRUNO));
    expect(await entreeDeLEspace()).toEqual({ libelle: "Créer ou rejoindre", href: "/espace/rejoindre" });
  });

  it("mène à son espace quand elle en a un, sous le nom que le vocabulaire de l'appli lui donne", async () => {
    const issue = await creerEspace(personne(ALICE), { nom: "Coloc des Lilas", prenom: "Alice" });
    if ("erreur" in issue) throw new Error(issue.erreur);
    jouerLaPersonne(personne(ALICE));
    expect(await entreeDeLEspace()).toEqual({ libelle: "Mon espace", href: "/espace" });

    const dOrigine = ESPACES.vocabulaire.mon;
    ESPACES.vocabulaire.mon = "ma coloc";
    try {
      expect((await entreeDeLEspace()).libelle).toBe("Ma coloc");
    } finally {
      ESPACES.vocabulaire.mon = dOrigine;
    }
  });

  it("ne donne pas l'espace d'une autre personne à qui n'en a pas", async () => {
    await creerEspace(personne(ALICE), { nom: "Coloc des Lilas", prenom: "Alice" });
    jouerLaPersonne(personne(BRUNO));
    expect((await entreeDeLEspace()).href).toBe("/espace/rejoindre");
  });
});
