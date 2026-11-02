import { describe, expect, it } from "vitest";
import { champsModifies, libelleAction } from "../src/briques/journal/evenements";

// Le calcul pur de la brique journal. La table et la transaction sont
// dans journal.test.ts.
describe("champs modifiés", () => {
  it("ne nomme que les champs dont la valeur change, jamais leur valeur (aucune donnée personnelle recopiée au journal)", () => {
    const avant = { reference: "D-1", client: "Durand", montant_centimes: 100, notes: null };
    const apres = { reference: "D-1", client: "Martin", montant_centimes: 100, notes: "à rappeler" };
    expect(champsModifies(avant, apres)).toEqual(["client", "notes"]);
  });

  it("ne compare que les champs du formulaire : une colonne absente de l'après (l'id) n'est pas un changement", () => {
    expect(champsModifies({ id: 4, reference: "D-1" }, { reference: "D-1" })).toEqual([]);
  });

  it("voit un passage de vide à rempli et l'inverse, mais pas 0 contre « 0 » relu de la base comme du texte", () => {
    expect(champsModifies({ echeance: null }, { echeance: "2026-10-23" })).toEqual(["echeance"]);
    expect(champsModifies({ echeance: "2026-10-23" }, { echeance: null })).toEqual(["echeance"]);
    expect(champsModifies({ montant: "0" }, { montant: 0 })).toEqual([]);
  });
});

describe("libellé d'une action", () => {
  it("dit chaque action connue en clair", () => {
    expect(libelleAction("creation")).toBe("Création");
    expect(libelleAction("modification")).toBe("Modification");
    expect(libelleAction("suppression")).toBe("Suppression");
  });

  it("dit une action inconnue telle quelle, jamais comme une action connue (une base plus récente que le code)", () => {
    expect(libelleAction("archivage")).toBe("Action inconnue : « archivage »");
  });
});
