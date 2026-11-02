import { describe, expect, it } from "vitest";
import { libelleStatut, STATUTS, statutDeGroupe } from "../src/briques/validation/cycle";

// Le cycle seul, sans base : les règles de statut de la brique validation.
// Celles qui touchent la file en base sont dans validation.test.ts.

describe("brique validation : le statut d'un groupe de propositions", () => {
  it("« en attente » prime : un groupe où il reste une proposition à décider ne s'affiche jamais décidé (import-lot)", () => {
    expect(statutDeGroupe(["acceptee", "refusee", "en_attente"])).toBe("en_attente");
    expect(statutDeGroupe(["refusee", "en_attente"])).toBe("en_attente");
    expect(statutDeGroupe(["acceptee", "en_attente"])).toBe("en_attente");
  });

  it("un groupe entièrement refusé finit « refusee », jamais « acceptee » (un lot entièrement ignoré s'affichait « Confirmé »)", () => {
    expect(statutDeGroupe(["refusee"])).toBe("refusee");
    expect(statutDeGroupe(["refusee", "refusee", "refusee"])).toBe("refusee");
  });

  it("un groupe entièrement accepté finit « acceptee »", () => {
    expect(statutDeGroupe(["acceptee", "acceptee"])).toBe("acceptee");
  });

  it("un groupe mêlant acceptées et refusées, sans rien en attente, finit « partielle »", () => {
    expect(statutDeGroupe(["acceptee", "refusee"])).toBe("partielle");
  });

  it("un groupe vide n'a pas de statut : le dire plutôt que l'afficher décidé", () => {
    expect(() => statutDeGroupe([])).toThrow();
  });

  it("un statut inconnu dans le groupe se dit « inconnu », même s'il reste une proposition en attente (projet précédent)", () => {
    expect(statutDeGroupe(["acceptee", "connu"])).toBe("inconnu");
    expect(statutDeGroupe(["en_attente", "connu"])).toBe("inconnu");
  });
});

describe("brique validation : le libellé d'un statut", () => {
  it("un statut inconnu s'affiche comme tel, avec sa valeur, jamais comme un état sain (projet précédent)", () => {
    const inconnu = libelleStatut("connu");
    expect(inconnu.ton).toBe("inconnu");
    expect(inconnu.libelle).toContain("inconnu");
    expect(inconnu.libelle).toContain("connu");
    // Aucun des libellés d'un statut connu ne peut lui servir de masque.
    for (const statut of STATUTS) {
      expect(inconnu.libelle).not.toBe(libelleStatut(statut).libelle);
    }
  });

  it("une valeur absente ou vide est un statut inconnu, pas « en attente » par défaut (une appli livrée)", () => {
    expect(libelleStatut("").ton).toBe("inconnu");
    expect(libelleStatut(null).ton).toBe("inconnu");
    expect(libelleStatut(undefined).ton).toBe("inconnu");
  });

  it("chaque statut connu a un libellé et un ton propres", () => {
    const libelles = STATUTS.map((statut) => libelleStatut(statut).libelle);
    expect(new Set(libelles).size).toBe(STATUTS.length);
    expect(libelleStatut("acceptee").ton).toBe("positif");
    expect(libelleStatut("refusee").ton).toBe("negatif");
    expect(libelleStatut("en_attente").ton).toBe("attente");
  });
});
