import { describe, expect, it } from "vitest";
import type { Branchement } from "../src/briques/import-lot/branchement";
import { colonnesObligatoiresAbsentes, validerLignes } from "../src/briques/import-lot/validation";
import type { LigneBrute } from "../src/briques/import-lot/types";

// Branchement de test : un contrat avec sa référence (clé), un fournisseur,
// une date de fin facultative, un montant, un total lu tel quel.
function branchement(surcharge: Partial<Branchement> = {}): Branchement {
  return {
    id: "test-contrats",
    champs: [
      { champ: "reference", entetes: ["Référence"], type: "texte", obligatoire: true },
      { champ: "fournisseur", entetes: ["Fournisseur"], type: "texte" },
      { champ: "date_fin", entetes: ["Date de fin"], type: "date" },
      { champ: "montant", entetes: ["Montant"], type: "nombre" },
      { champ: "total", entetes: ["Total"], type: "nombre" },
      { champ: "part_a", entetes: ["Part A"], type: "nombre" },
      { champ: "part_b", entetes: ["Part B"], type: "nombre" },
    ],
    cle: ["reference"],
    formatDate: "jour_mois",
    mode: "mise_a_jour",
    ecrire: async () => "cree",
    ...surcharge,
  };
}

function ligne(numero: number, cellules: Record<string, unknown>): LigneBrute {
  return { numero, cellules };
}

const CHAMPS_RENVOI: Branchement["champs"] = [
  { champ: "reference", entetes: ["Référence"], type: "texte", obligatoire: true },
  { champ: "renvoi_de", entetes: ["Renvoi de"], type: "texte" },
];

describe("validation des lignes d'un fichier", () => {
  it("une colonne qui contient déjà le total est lue telle quelle, jamais recalculée (une appli livrée)", () => {
    const resultat = validerLignes(
      [ligne(2, { Référence: "C1", Total: 100, "Part A": 30, "Part B": 20 })],
      branchement()
    );
    expect(resultat.lignes[0].valeurs.total).toBe(100);
  });

  it("une ligne mal typée est écartée avec son numéro et son motif, jamais perdue en silence (une appli livrée, un projet précédent)", () => {
    const resultat = validerLignes(
      [ligne(2, { Référence: "C1", Montant: "douze" }), ligne(3, { Référence: "C2", Montant: "12,5" })],
      branchement()
    );
    expect(resultat.ecartees).toEqual([{ numero: 2, motif: "Montant : « douze » n'est pas un nombre" }]);
    expect(resultat.lignes.map((l) => l.numero)).toEqual([3]);
    expect(resultat.lignes[0].valeurs.montant).toBe(12.5);
  });

  it("un nombre ambigu entre virgule décimale et séparateur de milliers est refusé, jamais deviné (« 1,234 »)", () => {
    const resultat = validerLignes(
      [
        ligne(2, { Référence: "C1", Montant: "1,234" }),
        ligne(3, { Référence: "C2", Montant: "1 234,5" }),
        ligne(4, { Référence: "C3", Montant: "1234" }),
      ],
      branchement()
    );
    expect(resultat.ecartees.map((e) => e.numero)).toEqual([2]);
    expect(resultat.lignes.map((l) => l.valeurs.montant)).toEqual([1234.5, 1234]);
  });

  it("une ligne sans champ obligatoire est écartée avec son numéro", () => {
    const resultat = validerLignes([ligne(7, { Fournisseur: "Atelier Morvan" })], branchement());
    expect(resultat.ecartees).toEqual([{ numero: 7, motif: "Référence : valeur obligatoire absente" }]);
    expect(resultat.lignes).toEqual([]);
  });

  it("une ligne entièrement vide est ignorée sans bruit : une fin de tableur n'est pas une erreur", () => {
    const b = branchement({ champs: [{ champ: "reference", entetes: ["Référence"], type: "texte" }], cle: undefined });
    const resultat = validerLignes([ligne(2, { Référence: "C1" }), ligne(3, {}), ligne(4, { Référence: "  " })], b);
    expect(resultat.lignes.map((l) => l.numero)).toEqual([2]);
    expect(resultat.ecartees).toEqual([]);
  });

  it("une cellule de date vide devient absente, la ligne n'est pas rejetée (projet précédent)", () => {
    const resultat = validerLignes([ligne(2, { Référence: "C1", "Date de fin": "" })], branchement());
    expect(resultat.ecartees).toEqual([]);
    expect(resultat.lignes[0].valeurs.date_fin).toBeNull();
  });

  it("une date illisible écarte la ligne, une date lisible s'écrit aaaa-mm-jj selon le format configuré", () => {
    const resultat = validerLignes(
      [
        ligne(2, { Référence: "C1", "Date de fin": "05/06/2026" }),
        ligne(3, { Référence: "C2", "Date de fin": "demain" }),
      ],
      branchement()
    );
    expect(resultat.lignes[0].valeurs.date_fin).toBe("2026-06-05");
    expect(resultat.ecartees).toEqual([{ numero: 3, motif: "Date de fin : « demain » n'est pas une date" }]);
  });

  it("un identifiant à zéros de tête reste du texte (projet précédent : le tableur perd les zéros, la brique ne les ajoute ni ne les retire)", () => {
    const resultat = validerLignes([ligne(2, { Référence: "00123" }), ligne(3, { Référence: 456 })], branchement());
    expect(resultat.lignes.map((l) => l.valeurs.reference)).toEqual(["00123", "456"]);
  });

  it("plusieurs en-têtes pour un même champ : la première valeur non vide l'emporte, une colonne vide n'écrase rien (une appli livrée)", () => {
    const b = branchement({
      champs: [{ champ: "reference", entetes: ["Référence", "Ref"], type: "texte", obligatoire: true }],
    });
    const resultat = validerLignes(
      [ligne(2, { Référence: "", Ref: "C9" }), ligne(3, { Référence: "C1", Ref: "C2" })],
      b
    );
    expect(resultat.lignes.map((l) => l.valeurs.reference)).toEqual(["C9", "C1"]);
  });

  it("deux clés que la normalisation rapproche sont fusionnées avant l'écriture, avec leurs conflits au rapport (« AB13 » et « AB 13 » avaient fait perdre un lot)", () => {
    const resultat = validerLignes(
      [
        ligne(2, { Référence: "AB13", Fournisseur: "Atelier Morvan", Montant: 100 }),
        ligne(3, { Référence: "ab 13", Fournisseur: "Atelier Morvan SAS", "Date de fin": "01/02/2027" }),
      ],
      branchement()
    );
    expect(resultat.lignes).toHaveLength(1);
    expect(resultat.lignes[0].numeros).toEqual([2, 3]);
    // Le plein se garde, le vide se remplit, le conflit part au rapport.
    expect(resultat.lignes[0].valeurs).toMatchObject({
      reference: "AB13",
      fournisseur: "Atelier Morvan",
      montant: 100,
      date_fin: "2027-02-01",
    });
    expect(resultat.fusions).toEqual([
      {
        cle: "ab13",
        numeros: [2, 3],
        conflits: [{ champ: "fournisseur", retenue: "Atelier Morvan", ecartee: "Atelier Morvan SAS" }],
      },
    ]);
  });

  it("sans clé de dédoublonnage, deux lignes identiques sont deux lignes (projet précédent : deux demi-journées légitimes)", () => {
    const b = branchement({ cle: undefined });
    const resultat = validerLignes([ligne(2, { Référence: "C1" }), ligne(3, { Référence: "C1" })], b);
    expect(resultat.lignes).toHaveLength(2);
    expect(resultat.fusions).toEqual([]);
  });

  it("une ligne dont la clé est vide est écartée : sans clé on ne sait pas si c'est un doublon", () => {
    const b = branchement({
      champs: [
        { champ: "reference", entetes: ["Référence"], type: "texte" },
        { champ: "fournisseur", entetes: ["Fournisseur"], type: "texte" },
      ],
    });
    const resultat = validerLignes([ligne(2, { Fournisseur: "Atelier Morvan" })], b);
    expect(resultat.ecartees).toEqual([{ numero: 2, motif: "Référence : la clé de dédoublonnage est vide" }]);
  });

  it("une ligne qui renvoie à une autre du même lot s'insère après elle (projet précédent : le renvoi inséré avant son original violait la clé étrangère)", () => {
    const b = branchement({ champs: CHAMPS_RENVOI, renvoi: { champ: "renvoi_de", cible: "reference" } });
    const resultat = validerLignes(
      [
        ligne(2, { Référence: "C3", "Renvoi de": "C1" }),
        ligne(3, { Référence: "C1" }),
        ligne(4, { Référence: "C2", "Renvoi de": "C3" }),
      ],
      b
    );
    expect(resultat.lignes.map((l) => l.valeurs.reference)).toEqual(["C1", "C3", "C2"]);
  });

  it("un renvoi circulaire est écarté avec ses numéros, jamais inséré à moitié", () => {
    const b = branchement({ champs: CHAMPS_RENVOI, renvoi: { champ: "renvoi_de", cible: "reference" } });
    const resultat = validerLignes(
      [
        ligne(2, { Référence: "A", "Renvoi de": "B" }),
        ligne(3, { Référence: "B", "Renvoi de": "A" }),
        ligne(4, { Référence: "C" }),
      ],
      b
    );
    expect(resultat.lignes.map((l) => l.valeurs.reference)).toEqual(["C"]);
    expect(resultat.ecartees.map((e) => e.numero)).toEqual([2, 3]);
  });

  it("une colonne obligatoire absente du fichier est signalée une fois, au lieu d'écarter chaque ligne", () => {
    expect(colonnesObligatoiresAbsentes(["Fournisseur", "Montant"], branchement())).toEqual(["Référence"]);
    expect(colonnesObligatoiresAbsentes(["référence "], branchement())).toEqual([]);
  });

  it("une colonne de clé absente se signale comme une colonne obligatoire, une seule fois", () => {
    const b = branchement({
      champs: [
        { champ: "reference", entetes: ["Référence"], type: "texte" },
        { champ: "fournisseur", entetes: ["Fournisseur"], type: "texte" },
      ],
    });
    expect(colonnesObligatoiresAbsentes(["Fournisseur"], b)).toEqual(["Référence"]);
  });

  it("un renvoi circulaire entre lignes fusionnées cite tous les numéros du fichier, aucune ligne ne disparaît sans le sien", () => {
    const b = branchement({ champs: CHAMPS_RENVOI, renvoi: { champ: "renvoi_de", cible: "reference" } });
    const resultat = validerLignes(
      [
        ligne(3, { Référence: "A", "Renvoi de": "B" }),
        ligne(5, { Référence: "B", "Renvoi de": "A" }),
        ligne(9, { Référence: "a" }),
      ],
      b
    );
    expect(resultat.lignes).toEqual([]);
    expect(resultat.ecartees.map((e) => e.numero)).toEqual([3, 5, 9]);
  });

  it("un renvoi en chaîne de plusieurs milliers de lignes s'ordonne sans quadratique (une chaîne inversée en émettait une par passe)", () => {
    const b = branchement({ champs: CHAMPS_RENVOI, renvoi: { champ: "renvoi_de", cible: "reference" } });
    const n = 20_000;
    const brutes = Array.from({ length: n }, (_, i) =>
      ligne(n - i + 1, { Référence: `L${n - 1 - i}`, "Renvoi de": n - 1 - i === 0 ? null : `L${n - 2 - i}` })
    );
    const debut = Date.now();
    const resultat = validerLignes(brutes, b);
    expect(resultat.lignes.map((l) => l.valeurs.reference).slice(0, 3)).toEqual(["L0", "L1", "L2"]);
    expect(resultat.lignes).toHaveLength(n);
    expect(Date.now() - debut).toBeLessThan(5000);
  });
});
