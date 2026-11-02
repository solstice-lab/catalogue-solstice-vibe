import type { FormatDate } from "./branchement";

export type LectureDate =
  | { etat: "date"; valeur: string } // « aaaa-mm-jj »
  | { etat: "absente" }
  | { etat: "illisible" };

// Les numéros de série d'un tableur (jours depuis le 30/12/1899) ne se
// distinguent d'un petit nombre que par leur ordre de grandeur : en dessous
// de 20 000 (1954) un « 2026 » est une année, pas une date. Une date
// antérieure à 1954 dans un fichier d'import est assez improbable pour
// préférer refuser que deviner.
const SERIE_MIN = 20_000;
const SERIE_MAX = 80_000;
const MS_PAR_JOUR = 86_400_000;
const ORIGINE_SERIE = Date.UTC(1899, 11, 30);

const MOTIF_JOUR_MOIS_ANNEE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/;
// L'ISO d'un export JSON ou d'une base porte souvent l'heure, les
// millisecondes et un « Z » : seul le jour compte ici.
const MOTIF_ISO = /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[ T]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

// Jamais de deviner : « 05/06/2026 » se lit selon le réglage du branchement
// (un import réel lu jour/mois par erreur dans une appli livrée). Une date
// impossible dans ce sens (« 05/13/2026 » en jour/mois) est refusée, pas
// relue dans l'autre.
export function lireDate(valeur: unknown, format: FormatDate): LectureDate {
  if (valeur === null || valeur === undefined) return { etat: "absente" };

  if (valeur instanceof Date) {
    if (Number.isNaN(valeur.getTime())) return { etat: "illisible" };
    // Composantes UTC : un tableur donne minuit UTC, et le fuseau du serveur
    // reculerait la date d'un jour.
    return date(valeur.getUTCFullYear(), valeur.getUTCMonth() + 1, valeur.getUTCDate());
  }

  if (typeof valeur === "number") return depuisSerie(valeur);

  if (typeof valeur !== "string") return { etat: "illisible" };
  const texte = valeur.trim();
  if (texte === "") return { etat: "absente" };

  if (/^\d+(\.\d+)?$/.test(texte)) return depuisSerie(Number(texte));

  const iso = MOTIF_ISO.exec(texte);
  if (iso) return date(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const morceaux = MOTIF_JOUR_MOIS_ANNEE.exec(texte);
  if (!morceaux) return { etat: "illisible" };
  const premier = Number(morceaux[1]);
  const second = Number(morceaux[2]);
  const annee = Number(morceaux[3]);
  return format === "jour_mois" ? date(annee, second, premier) : date(annee, premier, second);
}

function depuisSerie(serie: number): LectureDate {
  if (!Number.isFinite(serie) || serie < SERIE_MIN || serie > SERIE_MAX) return { etat: "illisible" };
  const instant = new Date(ORIGINE_SERIE + Math.floor(serie) * MS_PAR_JOUR);
  return date(instant.getUTCFullYear(), instant.getUTCMonth() + 1, instant.getUTCDate());
}

// Construit et RELIT la date : « 31/02 » ferait « 3 mars » sans cette relecture.
function date(annee: number, mois: number, jour: number): LectureDate {
  const instant = new Date(Date.UTC(annee, mois - 1, jour));
  if (instant.getUTCFullYear() !== annee || instant.getUTCMonth() !== mois - 1 || instant.getUTCDate() !== jour) {
    return { etat: "illisible" };
  }
  const mm = String(mois).padStart(2, "0");
  const jj = String(jour).padStart(2, "0");
  return { etat: "date", valeur: `${String(annee).padStart(4, "0")}-${mm}-${jj}` };
}
