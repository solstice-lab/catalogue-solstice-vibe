import type { CelluleMois } from "@/ui";

/*
 * Brique calendrier : les règles, en calcul PUR. Ni base, ni horloge : le jour
 * courant arrive en paramètre (aujourdhui() de src/lib/format.ts, dans le
 * fuseau du client), ce qui rend chaque cas testable à la date près.
 *
 * Un mois s'écrit « aaaa-mm », un jour « aaaa-mm-jj », sans heure.
 */

export type Evenement = {
  // Le lien mène à UNE fiche : il identifie l'événement dans la vue.
  lien: string;
  libelle: string;
  detail: string | null;
  date: string;
};

const MOIS = /^(\d{4})-(0[1-9]|1[0-2])$/;

// Garde-fou contre une adresse retouchée à la main, pas une règle métier.
const ANNEE_MIN = 1900;
const ANNEE_MAX = 2100;

/*
 * Le mois demandé par l'adresse (`?mois=2026-10`), ou le mois courant. Une
 * adresse retouchée à la main (« 2026-13 », « abc », paramètre répété) ne
 * doit jamais produire une page d'erreur : elle ouvre le mois courant.
 */
export function lireMois(valeur: string | string[] | undefined, aujourdhui: string): string {
  const trouve = typeof valeur === "string" ? MOIS.exec(valeur) : null;
  if (trouve && Number(trouve[1]) >= ANNEE_MIN && Number(trouve[1]) <= ANNEE_MAX) return valeur as string;
  return aujourdhui.slice(0, 7);
}

function decouper(mois: string): { annee: number; mois: number } {
  const [annee, numero] = mois.split("-").map(Number);
  return { annee, mois: numero };
}

// Calcul en UTC sur des jours sans heure : aucun passage à l'heure d'été ou
// d'hiver ne décale un jour (même principe que la brique échéances).
function jourUtc(dateIso: string): number {
  const [annee, mois, jour] = dateIso.split("-").map(Number);
  return Date.UTC(annee, mois - 1, jour);
}

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

function enIso(jourEnMs: number): string {
  return new Date(jourEnMs).toISOString().slice(0, 10);
}

// Les liens de navigation ne sortent jamais des années que lireMois accepte :
// au-delà, le mois reste le même au lieu de retomber sans explication sur le
// mois courant.
function sansSortirDesBornes(voisin: string, mois: string): string {
  const { annee } = decouper(voisin);
  return annee >= ANNEE_MIN && annee <= ANNEE_MAX ? voisin : mois;
}

export function moisPrecedent(mois: string): string {
  const { annee, mois: numero } = decouper(mois);
  return sansSortirDesBornes(enIso(Date.UTC(annee, numero - 2, 1)).slice(0, 7), mois);
}

export function moisSuivant(mois: string): string {
  const { annee, mois: numero } = decouper(mois);
  return sansSortirDesBornes(enIso(Date.UTC(annee, numero, 1)).slice(0, 7), mois);
}

// Premier et dernier jour du mois : la requête lit entre ces deux bornes,
// comprises.
export function bornesDuMois(mois: string): { debut: string; fin: string } {
  const { annee, mois: numero } = decouper(mois);
  return { debut: `${mois}-01`, fin: enIso(Date.UTC(annee, numero, 0)) };
}

// Rang du jour dans la semaine, lundi = 0 : la semaine commence un lundi.
function rangDansLaSemaine(jourEnMs: number): number {
  return (new Date(jourEnMs).getUTCDay() + 6) % 7;
}

/*
 * Les semaines pleines qui couvrent le mois, du lundi au dimanche : les jours
 * des mois voisins complètent la première et la dernière semaine. Ils ne
 * portent aucun événement : chaque événement se lit dans son propre mois, et
 * l'afficher deux fois laisserait croire à deux interventions.
 */
export function construireSemaines(
  mois: string,
  evenements: Evenement[],
  aujourdhui: string
): CelluleMois<Evenement>[][] {
  const { debut, fin } = bornesDuMois(mois);
  const premier = jourUtc(debut) - rangDansLaSemaine(jourUtc(debut)) * MS_PAR_JOUR;
  const dernier = jourUtc(fin) + (6 - rangDansLaSemaine(jourUtc(fin))) * MS_PAR_JOUR;

  const parJour = new Map<string, Evenement[]>();
  for (const evenement of evenements) {
    const dujour = parJour.get(evenement.date);
    if (dujour) dujour.push(evenement);
    else parJour.set(evenement.date, [evenement]);
  }

  const semaines: CelluleMois<Evenement>[][] = [];
  for (let jour = premier; jour <= dernier; jour += MS_PAR_JOUR) {
    const date = enIso(jour);
    const dansLeMois = date >= debut && date <= fin;
    const cellule: CelluleMois<Evenement> = {
      date,
      dansLeMois,
      aujourdhui: date === aujourdhui,
      elements: dansLeMois ? (parJour.get(date) ?? []).toSorted((a, b) => a.libelle.localeCompare(b.libelle)) : [],
    };
    if (rangDansLaSemaine(jour) === 0) semaines.push([cellule]);
    else semaines[semaines.length - 1].push(cellule);
  }
  return semaines;
}
