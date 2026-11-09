import ExcelJS from "exceljs";
import JSZip from "jszip";
import { cleDeRapprochement } from "@/lib/cle-rapprochement";
import { parserCsv } from "@/lib/import-fusion";
import { reconnaitreFormat, type FormatFichier } from "./format";
import type { LigneBrute } from "./types";

// Seul fichier de la brique qui importe exceljs et jszip : changer de
// bibliothèque (ou ajouter la lecture du .xls) ne touche que lui.

/** Le fichier ne peut pas être lu : le message s'affiche tel quel à la personne. */
export class ErreurFichier extends Error {}

export type Lecture = {
  format: "xlsx" | "csv";
  entetes: string[];
  lignes: LigneBrute[];
};

// Plafonds de la brique : exceljs décompresse tout le classeur en mémoire, et
// ce process est partagé par toute l'appli. Un fichier plus gros se découpe.
//
// OCTETS_MAX porte sur le fichier ENVOYÉ, donc compressé : seul, il ne protège
// de rien, un .xlsx de quelques Mo pouvant contenir des Go de XML répétitif
// (audit du 2026-11-09). OCTETS_DECOMPRESSES_MAX borne ce que l'archive devient
// une fois décompressée, toutes entrées et toutes feuilles comprises (exceljs
// charge aussi celles que la brique ne lit pas). Mesuré le 2026-11-09 : un
// classeur de LIGNES_MAX lignes de 20 colonnes pèse 5 Mo envoyés et 55 Mo
// décompressés ; 100 Mo laisse passer tout fichier légitime sous le plafond
// d'envoi et coupe la bombe avant exceljs. exceljs gardant environ 20 octets de
// tas par octet de XML (mesuré : +1 Go pour le classeur ci-dessus), la borne
// plafonne le pic à 2 Go environ au lieu de ne rien plafonner : la baisser si
// l'hébergeur offre moins de mémoire.
export const OCTETS_MAX = 10 * 1024 * 1024;
export const OCTETS_DECOMPRESSES_MAX = 100 * 1024 * 1024;
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

// internalStream est documentée par jszip mais absente de ses typings.
type FluxJszip = {
  on(evenement: "data", gestionnaire: (morceau: Uint8Array) => void): FluxJszip;
  on(evenement: "error", gestionnaire: (erreur: Error) => void): FluxJszip;
  on(evenement: "end", gestionnaire: () => void): FluxJszip;
  pause(): FluxJszip;
  resume(): FluxJszip;
};

// Compte les octets RÉELLEMENT produits par la décompression de chaque entrée,
// et s'arrête dès la borne. La taille annoncée par le répertoire central ne
// sert à rien ici : un fichier hostile la falsifie, et jszip ne la compare au
// flux qu'une fois l'entrée décompressée en entier, trop tard. L'archive n'est
// décompressée qu'une fois la borne respectée, donc deux fois en tout (ici
// puis par exceljs) : le prix de ne pas toucher à la lecture elle-même.
async function refuserBombeDeDecompression(octets: Uint8Array): Promise<void> {
  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(octets);
  } catch {
    throw fichier_corrompu();
  }
  let total = 0;
  for (const entree of Object.values(archive.files)) {
    if (entree.dir) continue;
    await new Promise<void>((resoudre, rejeter) => {
      const flux = (entree as unknown as { internalStream(type: "uint8array"): FluxJszip }).internalStream(
        "uint8array"
      );
      flux.on("data", (morceau) => {
        total += morceau.length;
        if (total <= OCTETS_DECOMPRESSES_MAX) return;
        // pause() arrête la décompression au morceau suivant : sans elle le
        // flux irait au bout de l'entrée, ce que la borne doit justement éviter.
        flux.pause();
        rejeter(
          new ErreurFichier(
            `Ce fichier occupe plus de ${OCTETS_DECOMPRESSES_MAX / 1024 / 1024} Mo une fois décompressé : le découper en plusieurs fichiers, ou en retirer les feuilles et les images inutiles.`
          )
        );
      });
      flux.on("error", () => rejeter(fichier_corrompu()));
      flux.on("end", resoudre);
      flux.resume();
    });
  }
}

async function lireXlsx(octets: Uint8Array): Promise<Lecture> {
  await refuserBombeDeDecompression(octets);
  const classeur = new ExcelJS.Workbook();
  try {
    await classeur.xlsx.load(Buffer.from(octets) as unknown as ExcelJS.Buffer);
  } catch {
    throw fichier_corrompu();
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

function fichier_corrompu(): ErreurFichier {
  return new ErreurFichier("Ce fichier .xlsx est corrompu ou tronqué : le réenregistrer dans Excel puis le renvoyer.");
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
