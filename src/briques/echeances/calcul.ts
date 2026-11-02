/*
 * Brique échéances : les règles, en calcul PUR. Ni base, ni horloge : le
 * jour courant arrive en paramètre (aujourdhui() de src/lib/format.ts, dans
 * le fuseau du client), ce qui rend chaque borne testable à la date près.
 * Importable par les composants client comme par le serveur.
 *
 * Toutes les dates sont des jours « aaaa-mm-jj », sans heure.
 */

export type StatutEcheance = "echu_recemment" | "en_alerte" | "a_venir";

// Les deux statuts que montre la vue « À venir ». Au-delà, l'échéance
// lointaine (a_venir) ou ancienne reste visible dans la liste de l'entité.
export type StatutVisible = Exclude<StatutEcheance, "a_venir">;

export type Echeance = {
  // Le lien mène à UNE fiche : il identifie l'échéance dans la vue.
  lien: string;
  libelle: string;
  detail: string | null;
  date: string;
  joursRestants: number;
  statut: StatutVisible;
};

// Calcul en UTC sur des jours sans heure : aucun passage à l'heure d'été ou
// d'hiver ne décale le compte d'un jour.
function jourUtc(dateIso: string): number {
  const [annee, mois, jour] = dateIso.split("-").map(Number);
  return Date.UTC(annee, mois - 1, jour);
}

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

export function joursRestants(date: string, aujourdhui: string): number {
  return Math.round((jourUtc(date) - jourUtc(aujourdhui)) / MS_PAR_JOUR);
}

export function ajouterJours(dateIso: string, jours: number): string {
  return new Date(jourUtc(dateIso) + jours * MS_PAR_JOUR).toISOString().slice(0, 10);
}

/*
 * En alerte : la fin tombe dans les `delai` prochains jours, J+delai compris
 * (« dans les 30 prochains jours », cas test de l'appli contrats). Échu récemment : la fin est
 * passée depuis MOINS de `delai` jours, donc J−(delai−1) au plus loin — lu au
 * pied de la lettre et validé au cadrage de la vue « À venir ». null : échu depuis
 * plus longtemps, hors de la vue — sauf avec `retardSansLimite`,
 * où un retard n'est jamais null.
 */
export function statutEcheance(
  date: string,
  aujourdhui: string,
  delai: number,
  retardSansLimite = false
): StatutEcheance | null {
  const jours = joursRestants(date, aujourdhui);
  // Sans limite (maintenance en retard) : un retard ne sort jamais.
  if (jours < 0) return retardSansLimite || jours > -delai ? "echu_recemment" : null;
  return jours <= delai ? "en_alerte" : "a_venir";
}

// Statut et écart d'une échéance que la vue montre, null sinon : la seule
// définition de ce qui est « visible », pour la lecture comme pour le compte.
export function echeanceVisible(
  date: string,
  aujourdhui: string,
  delai: number,
  retardSansLimite = false
): { statut: StatutVisible; joursRestants: number } | null {
  const statut = statutEcheance(date, aujourdhui, delai, retardSansLimite);
  if (statut === null || statut === "a_venir") return null;
  return { statut, joursRestants: joursRestants(date, aujourdhui) };
}

// Les bornes de la vue, déduites des mêmes règles : la requête filtre en
// base sur cet intervalle, et statutEcheance() reste la seule définition.
// Avec `retardSansLimite`, la requête n'utilise que `fin` : `debut` ne borne rien.
export function bornesDeLaVue(aujourdhui: string, delai: number): { debut: string; fin: string } {
  return { debut: ajouterJours(aujourdhui, -(delai - 1)), fin: ajouterJours(aujourdhui, delai) };
}

export function libelleJours(jours: number): string {
  if (jours === 0) return "Aujourd'hui";
  if (jours === 1) return "Demain";
  if (jours === -1) return "Hier";
  return jours > 1 ? `Dans ${jours} jours` : `Il y a ${-jours} jours`;
}

// Locale : afficher un statut passe par libelleStatut, qui connaît le retard
// sans limite.
const LIBELLES_STATUT: Record<StatutVisible, string> = {
  echu_recemment: "Échue récemment",
  en_alerte: "En alerte",
};

// « Échue récemment » serait faux pour un retard de 35 jours : sans limite,
// le même statut se dit « En retard ».
export function libelleStatut(statut: StatutVisible, retardSansLimite = false): string {
  if (statut === "echu_recemment" && retardSansLimite) return "En retard";
  return LIBELLES_STATUT[statut];
}
