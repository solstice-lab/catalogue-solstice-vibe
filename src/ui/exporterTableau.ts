/*
 * Exports du Tableau — .xlsx (exceljs) et PNG (html-to-image). Code repris
 * des exports d'un projet précédent, où les deux gestes ont été redemandés
 * tableau après tableau.
 *
 * Les deux bibliothèques se chargent en import dynamique : elles ne pèsent
 * sur personne avant le premier clic.
 *
 * L'export dit ce que l'écran montre : lignes filtrées, triées, déplis
 * compris — c'est le Tableau qui fournit ses lignes visibles. Les couleurs
 * du classeur se lisent dans les tokens au moment du clic : un export chez
 * un client thématisé porte sa charte, pas celle de Solstice.
 */

import { estDateIso } from "@/lib/date-iso";
import { formatDateTableur } from "@/lib/format";

export type ColonneExport = {
  cle: string;
  titre: string;
  chiffres?: boolean;
  /**
   * « date » : la valeur « aaaa-mm-jj » devient une vraie date du tableur, au
   * format de l'écran. Sans cette déclaration elle sortirait en texte, que le
   * tableur trie et calcule comme du texte (relevé en recette).
   */
  format?: "date";
};

export type LigneExport = {
  valeurs: Record<string, unknown>;
  /** Retrait hiérarchique, 0 pour un tableau plat. */
  profondeur: number;
};

/**
 * Ce que le Tableau remet à l'export : les colonnes (avec leur format) et, par
 * ligne visible, la valeur écrite de chaque colonne — `exporter` quand la
 * colonne en a un, la valeur brute sinon. Séparé du composant pour se tester.
 */
export function preparerExport<Ligne extends Record<string, unknown>>(
  colonnes: {
    cle: string;
    titre: string;
    chiffres?: boolean;
    format?: "date";
    exporter?: (ligne: Ligne) => string | null;
  }[],
  noeuds: { ligne: Ligne; profondeur: number }[]
): { colonnes: ColonneExport[]; lignes: LigneExport[] } {
  return {
    colonnes: colonnes.map(({ cle, titre, chiffres, format }) => ({
      cle,
      titre,
      chiffres,
      format,
    })),
    lignes: noeuds.map((noeud) => ({
      valeurs: Object.fromEntries(
        colonnes.map((colonne) => [
          colonne.cle,
          colonne.exporter ? colonne.exporter(noeud.ligne) : noeud.ligne[colonne.cle],
        ])
      ),
      profondeur: noeud.profondeur,
    })),
  };
}

// Les champs de filtre, la barre d'actions en lot et la colonne de cases à
// cocher de la sélection sont des contrôles d'écran : rien à faire sur une
// image destinée à un mail ou un deck (relevé en recette : les cases apparaissaient
// sur le PNG d'une liste). La classe exclure-export-png reste disponible
// pour les consommateurs.
export const CLASSES_HORS_PNG = ["sl-tableau-filtre", "sl-tableau-lot", "sl-tableau-case", "exclure-export-png"];

/** Lit un token couleur hex et le convertit en ARGB exceljs. */
function couleurToken(nom: string, repliHex: string): string {
  const brute = getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(brute)?.[1] ?? repliHex;
  return `FF${hex.toUpperCase()}`;
}

// Un token tel que le navigateur le calcule : écrit en hsl() ou par
// color-mix(), il arrive en rgb() ou en color(srgb …), que le canvas de
// html-to-image sait peindre, et non plus en texte brut qu'il ignore. Le fond PNG ne prenait que l'hexadécimal et retombait sinon sur un
// blanc en dur, que le thème du client n'avait pas.
function couleurCalculee(nom: string): string {
  const sonde = document.createElement("span");
  // En fond et non en couleur de texte : un token absent donne un fond
  // transparent, pas la couleur du texte héritée du parent.
  sonde.style.backgroundColor = `var(${nom})`;
  document.body.append(sonde);
  const couleur = getComputedStyle(sonde).backgroundColor;
  sonde.remove();
  return couleur;
}

function telecharger(url: string, nomFichier: string) {
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nomFichier;
  lien.click();
}

/*
 * Séparé de exporterXlsx pour se tester sans navigateur : le classeur se
 * construit ici, le téléchargement et la lecture des tokens restent dans
 * exporterXlsx.
 */
export async function construireClasseur({
  titre,
  colonnes,
  lignes,
  structure,
  surStructure,
}: {
  titre?: string;
  colonnes: ColonneExport[];
  lignes: LigneExport[];
  structure: string;
  surStructure: string;
}) {
  const { default: ExcelJS } = await import("exceljs");
  const classeur = new ExcelJS.Workbook();
  const ligneEntete = titre ? 2 : 1;
  const feuille = classeur.addWorksheet("Données", {
    views: [{ state: "frozen", ySplit: ligneEntete }],
  });

  // Largeur : le contenu réel plutôt qu'une constante, bornée pour qu'une
  // cellule bavarde ne fasse pas une colonne d'un kilomètre.
  feuille.columns = colonnes.map((colonne) => ({
    width: Math.min(
      50,
      Math.max(
        12,
        colonne.titre.length + 2,
        ...lignes.map((ligne) => String(ligne.valeurs[colonne.cle] ?? "").length + 2)
      )
    ),
  }));

  if (titre) {
    feuille.mergeCells(1, 1, 1, colonnes.length);
    const cellule = feuille.getCell(1, 1);
    cellule.value = titre;
    cellule.font = { bold: true, color: { argb: surStructure }, size: 13 };
    cellule.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: structure },
    };
    cellule.alignment = { vertical: "middle" };
    feuille.getRow(1).height = 22;
  }

  const entete = feuille.getRow(ligneEntete);
  colonnes.forEach((colonne, index) => {
    const cellule = entete.getCell(index + 1);
    cellule.value = colonne.titre;
    cellule.font = { bold: true, color: { argb: surStructure } };
    cellule.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: structure },
    };
    cellule.alignment = {
      vertical: "middle",
      horizontal: colonne.chiffres || colonne.format === "date" ? "right" : "left",
    };
  });
  entete.height = 18;
  feuille.autoFilter = {
    from: { row: ligneEntete, column: 1 },
    to: { row: ligneEntete, column: colonnes.length },
  };

  lignes.forEach((ligne, index) => {
    const rangee = feuille.getRow(ligneEntete + 1 + index);
    colonnes.forEach((colonne, indexColonne) => {
      const cellule = rangee.getCell(indexColonne + 1);
      const valeur = ligne.valeurs[colonne.cle];
      if (colonne.chiffres && typeof valeur === "number") {
        cellule.value = valeur;
        cellule.alignment = { horizontal: "right" };
      } else if (valeur === null || valeur === undefined || valeur === "") {
        // Une cellule sans valeur reste vide : une chaîne vide compte pour une
        // cellule non vide dans le tableur (relevé en recette). Sur la première
        // colonne d'un arbre, le retrait se garde par l'alignement.
        if (indexColonne === 0 && ligne.profondeur > 0) {
          cellule.alignment = { horizontal: "left", indent: ligne.profondeur };
        }
      } else if (colonne.format === "date" && typeof valeur === "string" && estDateIso(valeur)) {
        // Minuit UTC (la forme « aaaa-mm-jj » seule se lit en UTC) : exceljs
        // convertit en numéro de série sans fuseau, la date ne glisse donc pas
        // d'un jour selon le poste.
        cellule.value = new Date(`${valeur}T00:00:00Z`);
        cellule.numFmt = formatDateTableur();
        cellule.alignment =
          indexColonne === 0 && ligne.profondeur > 0
            ? { horizontal: "left", indent: ligne.profondeur }
            : { horizontal: "right" };
      } else {
        // Le retrait hiérarchique se rend en espaces sur la première
        // colonne : le classeur garde la lecture en arbre du tableau.
        const texte = String(valeur ?? "");
        cellule.value = indexColonne === 0 && ligne.profondeur > 0 ? "    ".repeat(ligne.profondeur) + texte : texte;
      }
    });
  });

  return classeur;
}

export async function exporterXlsx({
  nomFichier,
  titre,
  colonnes,
  lignes,
}: {
  nomFichier: string;
  titre?: string;
  colonnes: ColonneExport[];
  lignes: LigneExport[];
}): Promise<void> {
  const classeur = await construireClasseur({
    titre,
    colonnes,
    lignes,
    structure: couleurToken("--couleur-structure", "162447"),
    surStructure: couleurToken("--texte-sur-structure", "FFFFFF"),
  });
  const tampon = await classeur.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([tampon], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
  );
  telecharger(url, nomFichier);
  URL.revokeObjectURL(url);
}

/**
 * Filtre de l'image : écarte les contrôles d'écran. Reçoit aussi des nœuds de
 * texte, sans classList.
 */
export function exclureDeLImagePng(element: { classList?: { contains(nom: string): boolean } }): boolean {
  return !CLASSES_HORS_PNG.some((nom) => element.classList?.contains(nom));
}

export async function exporterPng({ noeud, nomFichier }: { noeud: HTMLElement; nomFichier: string }): Promise<void> {
  const { toPng } = await import("html-to-image");
  // pixelRatio 2 : l'image se recolle dans un mail ou un deck sans flou.
  const url = await toPng(noeud, {
    backgroundColor: couleurCalculee("--surface"),
    pixelRatio: 2,
    filter: (element) => exclureDeLImagePng(element as Element),
  });
  telecharger(url, nomFichier);
}
