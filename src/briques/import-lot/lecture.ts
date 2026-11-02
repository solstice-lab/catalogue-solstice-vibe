import ExcelJS from "exceljs";
import { cleDeRapprochement } from "@/lib/cle-rapprochement";
import { parserCsv } from "@/lib/import-fusion";
import { reconnaitreFormat, type FormatFichier } from "./format";
import type { LigneBrute } from "./types";

// Seul fichier de la brique qui importe exceljs : changer de bibliothèque
// (ou ajouter la lecture du .xls) ne touche que lui.

/** Le fichier ne peut pas être lu : le message s'affiche tel quel à la personne. */
export class ErreurFichier extends Error {}

export type Lecture = {
  format: "xlsx" | "csv";
  entetes: string[];
  lignes: LigneBrute[];
};

// Plafonds de la brique : exceljs décompresse tout le classeur en mémoire, et
// ce process est partagé par toute l'appli. Un fichier plus gros se découpe.
export const OCTETS_MAX = 10 * 1024 * 1024;
export const LIGNES_MAX = 50_000;

export async function lireFichier(octets: Uint8Array): Promise<Lecture> {
  if (octets.length > OCTETS_MAX) {
    throw new ErreurFichier(`Ce fichier dépasse ${OCTETS_MAX / 1024 / 1024} Mo : le découper en plusieurs fichiers.`);
  }
  const format: FormatFichier = reconnaitreFormat(octets);
  if (format === "xlsx") return lireXlsx(octets);
  if (format === "csv") return lireCsv(octets);
  if (format === "xls") {
    // Une appli livrée a dû combiner deux bibliothèques pour ce format :
    // la v1 le refuse en le disant, plutôt que d'en lire une partie.
    throw new ErreurFichier(
      "Ce fichier est au format .xls (ancien Excel, ou classeur protégé par un mot de passe), pas lu pour l'instant : l'enregistrer au format .xlsx, sans mot de passe, puis le renvoyer."
    );
  }
  throw new ErreurFichier("Format de fichier non reconnu : envoyer un classeur .xlsx ou un CSV encodé en UTF-8.");
}

async function lireXlsx(octets: Uint8Array): Promise<Lecture> {
  const classeur = new ExcelJS.Workbook();
  try {
    await classeur.xlsx.load(Buffer.from(octets) as unknown as ExcelJS.Buffer);
  } catch {
    throw new ErreurFichier("Ce fichier .xlsx est corrompu ou tronqué : le réenregistrer dans Excel puis le renvoyer.");
  }
  const feuille = classeur.worksheets[0];
  if (!feuille) throw new ErreurFichier("Ce classeur ne contient aucune feuille.");
  if (feuille.rowCount > LIGNES_MAX) throw trop_de_lignes();

  const lignes: LigneBrute[] = [];
  let entetes: string[] | null = null;
  // Clés des colonnes : un en-tête vide laisse la colonne de côté.
  const colonnes: { rang: number; entete: string }[] = [];

  feuille.eachRow({ includeEmpty: false }, (ligne) => {
    if (entetes === null) {
      ligne.eachCell({ includeEmpty: false }, (cellule, rang) => {
        const entete = String(valeurDeCellule(cellule.value, cellule.address) ?? "").trim();
        if (entete !== "") colonnes.push({ rang, entete });
      });
      if (colonnes.length === 0) return; // ligne de cellules vides : pas encore l'en-tête
      entetes = colonnes.map((colonne) => colonne.entete);
      refuserEntetesEnDouble(entetes);
      return;
    }
    const cellules: Record<string, unknown> = {};
    for (const { rang, entete } of colonnes) {
      const cellule = ligne.getCell(rang);
      cellules[entete] = valeurDeCellule(cellule.value, cellule.address);
    }
    // Numéro de ligne du tableur : une ligne écartée se retrouve dans Excel.
    lignes.push({ numero: ligne.number, cellules });
  });

  if (entetes === null) throw new ErreurFichier("La première feuille est vide : aucune ligne d'en-têtes trouvée.");
  return { format: "xlsx", entetes, lignes };
}

// exceljs rend selon la cellule un nombre, un texte, une Date, ou un objet
// (formule, lien, texte enrichi, erreur) : on garde la VALEUR, comme le
// tableur l'affiche.
function valeurDeCellule(valeur: ExcelJS.CellValue, adresse: string): unknown {
  if (valeur === null || valeur === undefined) return null;
  if (typeof valeur !== "object" || valeur instanceof Date) return valeur;
  if ("formula" in valeur || "sharedFormula" in valeur) {
    const { result } = valeur as { result?: ExcelJS.CellValue };
    // Un classeur produit par un script n'a pas de résultat en cache : lue
    // comme vide, la cellule ferait disparaître la donnée sans un mot.
    if (result === undefined) {
      throw new ErreurFichier(
        `La cellule ${adresse} contient une formule sans résultat enregistré : ouvrir le fichier dans Excel, l'enregistrer, puis le renvoyer.`
      );
    }
    return valeurDeCellule(result, adresse);
  }
  if ("richText" in valeur) return valeur.richText.map((morceau) => morceau.text).join("");
  if ("text" in valeur) return String(valeur.text);
  // Erreur de formule (#N/A…) ou objet inconnu : une valeur absente, pas un
  // « [object Object] » qui passerait pour du texte.
  return null;
}

function lireCsv(octets: Uint8Array): Lecture {
  // Décodage strict sur TOUT le fichier : reconnaitreFormat ne regarde que le
  // début, et un CSV Windows-1252 dont les accents arrivent plus loin serait
  // lu avec des « � » à la place des lettres, sans erreur.
  let contenu: string;
  try {
    contenu = new TextDecoder("utf-8", { fatal: true }).decode(octets).replace(/^﻿/, "");
  } catch {
    throw new ErreurFichier(
      "Ce CSV n'est pas encodé en UTF-8 : l'enregistrer au format « CSV UTF-8 » (ou en .xlsx) puis le renvoyer."
    );
  }
  const separateur = separateurDe(contenu);
  // Numéros : rang de l'enregistrement non vide, l'en-tête étant le 1. Une
  // ligne blanche au milieu du fichier décale donc les numéros suivants (le
  // parseur partagé écarte les lignes vides) : le dire à la personne si cela
  // arrive en pratique.
  const enregistrements = parserCsv(contenu, separateur, true);
  if (enregistrements.length > LIGNES_MAX) throw trop_de_lignes();
  const rangEntetes = enregistrements.findIndex((valeurs) => valeurs.some((valeur) => valeur.trim() !== ""));
  if (rangEntetes < 0) throw new ErreurFichier("Ce fichier est vide : aucune ligne d'en-têtes trouvée.");
  const entetes = enregistrements[rangEntetes].map((entete) => entete.trim());
  refuserEntetesEnDouble(entetes);
  const lignes = enregistrements.slice(rangEntetes + 1).map((valeurs, i) => ({
    numero: rangEntetes + i + 2,
    // Tout reste du texte, jamais converti : « 00123 » garde ses zéros.
    cellules: Object.fromEntries(
      entetes.flatMap((entete, rang) => (entete === "" ? [] : [[entete, valeurs[rang] ?? ""]]))
    ),
  }));
  return { format: "csv", entetes: entetes.filter((entete) => entete !== ""), lignes };
}

function trop_de_lignes(): ErreurFichier {
  return new ErreurFichier(`Ce fichier dépasse ${LIGNES_MAX} lignes : le découper en plusieurs fichiers.`);
}

// Deux colonnes de même titre s'écraseraient dans les cellules d'une ligne :
// la seconde effacerait la première sans rien dire.
function refuserEntetesEnDouble(entetes: string[]): void {
  const vus = new Set<string>();
  for (const entete of entetes) {
    if (entete === "") continue;
    const cle = cleDeRapprochement(entete);
    if (vus.has(cle))
      throw new ErreurFichier(`Deux colonnes portent le même titre : « ${entete} ». Renommer l'une des deux.`);
    vus.add(cle);
  }
}

// Un Excel français enregistre en CSV avec des points-virgules ; l'anglais
// avec des virgules. On compte sur la première ligne, hors guillemets.
function separateurDe(contenu: string): string {
  const premiere = (contenu.split(/\r?\n/, 1)[0] ?? "").replace(/"[^"]*"/g, "");
  const points = (premiere.match(/;/g) ?? []).length;
  const virgules = (premiere.match(/,/g) ?? []).length;
  const tabulations = (premiere.match(/\t/g) ?? []).length;
  if (tabulations > points && tabulations > virgules) return "\t";
  return points > virgules ? ";" : ",";
}
