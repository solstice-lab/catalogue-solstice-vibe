import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  CLASSES_HORS_PNG,
  construireClasseur,
  exclureDeLImagePng,
  preparerExport,
  type ColonneExport,
  type LigneExport,
} from "../src/ui/exporterTableau";
import { formatDateTableur } from "../src/lib/format";

// Le fichier est relu par exceljs, comme l'a fait la recette : c'est le
// type de la cellule qui compte, pas ce qu'on voit à l'écran.
const plates = (valeurs: Record<string, unknown>[]): LigneExport[] =>
  valeurs.map((ligne) => ({ valeurs: ligne, profondeur: 0 }));

async function relire(colonnes: ColonneExport[], lignes: LigneExport[]) {
  const classeur = await construireClasseur({
    titre: "Essai",
    colonnes,
    lignes,
    structure: "FF162447",
    surStructure: "FFFFFFFF",
  });
  const relu = new ExcelJS.Workbook();
  await relu.xlsx.load(await classeur.xlsx.writeBuffer());
  return relu.getWorksheet("Données")!;
}

const COLONNES: ColonneExport[] = [
  { cle: "reference", titre: "Référence" },
  { cle: "commande", titre: "Commande", format: "date" },
  { cle: "reception", titre: "Réception", format: "date" },
  { cle: "notes", titre: "Notes" },
];

describe("export .xlsx du Tableau", () => {
  it("écrit une colonne de date en vraie date Excel, au jour dit et au format de l'écran (recette : les dates sortaient en texte, ISNUMBER donnait FALSE)", async () => {
    const feuille = await relire(
      COLONNES,
      plates([{ reference: "CMD-1", commande: "2026-10-20", reception: "2026-01-05" }])
    );
    const cellule = feuille.getCell(3, 2);
    expect(cellule.value).toBeInstanceOf(Date);
    // Minuit UTC : exceljs écrit le numéro de série sans fuseau, la date ne
    // doit pas glisser d'un jour selon le poste.
    expect((cellule.value as Date).toISOString()).toBe("2026-10-20T00:00:00.000Z");
    expect(cellule.numFmt).toBe(formatDateTableur());
    expect((feuille.getCell(3, 3).value as Date).toISOString()).toBe("2026-01-05T00:00:00.000Z");
  });

  it("laisse vide une cellule sans valeur au lieu d'y écrire une chaîne vide (recette : 24 livraisons prévues et 37 réceptions comptées comme non vides)", async () => {
    const feuille = await relire(
      COLONNES,
      plates([{ reference: "CMD-2", commande: "2026-10-20", reception: null, notes: "" }])
    );
    expect(feuille.getCell(3, 3).value).toBeNull();
    expect(feuille.getCell(3, 4).value).toBeNull();
  });

  it("garde en texte une date de colonne de date qui n'en est pas une, plutôt que de la perdre", async () => {
    const feuille = await relire(COLONNES, plates([{ reference: "CMD-3", commande: "à confirmer" }]));
    expect(feuille.getCell(3, 2).value).toBe("à confirmer");
  });

  it("écrit la valeur d'`exporter` à la place de la valeur brute, par le chemin du Tableau (recette : « acceptee » dans l'Excel, « Acceptée » à l'écran)", async () => {
    const { colonnes, lignes } = preparerExport(
      [
        {
          cle: "statut",
          titre: "Statut",
          exporter: (l: { statut: string }) => (l.statut === "acceptee" ? "Acceptée" : null),
        },
        { cle: "jour", titre: "Jour", format: "date" },
      ],
      [{ ligne: { statut: "acceptee", jour: "2026-11-03" }, profondeur: 0 }]
    );
    const feuille = await relire(colonnes, lignes);
    expect(feuille.getCell(3, 1).value).toBe("Acceptée");
    expect((feuille.getCell(3, 2).value as Date).toISOString()).toBe("2026-11-03T00:00:00.000Z");
  });

  it("garde le retrait d'un arbre sur une première colonne de date ou vide, que les espaces ne portent pas", async () => {
    const feuille = await relire(COLONNES, [{ valeurs: { reference: "", commande: "2026-10-20" }, profondeur: 2 }]);
    expect(feuille.getCell(3, 1).alignment?.indent).toBe(2);
    const arbre = await relire(
      [{ cle: "jour", titre: "Jour", format: "date" }],
      [{ valeurs: { jour: "2026-10-20" }, profondeur: 1 }]
    );
    expect(arbre.getCell(3, 1).alignment?.indent).toBe(1);
  });
});

describe("export PNG du Tableau", () => {
  const element = (...classes: string[]) => ({ classList: { contains: (nom: string) => classes.includes(nom) } });

  it("écarte la colonne de cases à cocher de la sélection, comme les champs de filtre (recette : cases visibles sur le PNG des fournisseurs)", () => {
    expect(CLASSES_HORS_PNG.length).toBeGreaterThan(0);
    for (const classe of CLASSES_HORS_PNG) {
      expect(exclureDeLImagePng(element(classe))).toBe(false);
    }
  });

  it("garde le reste du tableau", () => {
    expect(exclureDeLImagePng(element("une-autre-classe"))).toBe(true);
    expect(exclureDeLImagePng(element())).toBe(true);
    // Un nœud de texte n'a pas de classList : html-to-image le soumet aussi au filtre.
    expect(exclureDeLImagePng({})).toBe(true);
  });
});
