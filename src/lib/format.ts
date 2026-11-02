/**
 * Formatage unique des valeurs affichées. Tout montant, toute date, tout
 * pourcentage de l'app passe par ici : quand chaque module re-décide son
 * format, deux écrans voisins finissent par afficher « 12 500 € » et
 * « 12,500.00 € » (vécu sur un projet précédent). La langue, la devise et le fuseau se
 * règlent UNE fois, à la mise en route du projet client.
 */

export const LOCALE = "fr-FR"; // langue de travail du client (ex. "en-US")
export const DEVISE = "EUR"; // devise du client (ex. "USD")
export const FUSEAU = "Europe/Paris"; // fuseau du client (ex. "America/Martinique")

/**
 * Le jour en cours chez le client, en « aaaa-mm-jj ». Jamais celui du
 * serveur : l'hébergeur tourne en UTC, et à 23 h 30 UTC Paris est déjà le
 * lendemain — une échéance se serait comptée avec un jour de retard.
 */
export function aujourdhui(maintenant: Date = new Date()): string {
  // en-CA écrit les dates en « aaaa-mm-jj » : pas de réassemblage à la main.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSEAU,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(maintenant);
}

export function montant(valeur: number, decimales = 0): string {
  return valeur.toLocaleString(LOCALE, {
    style: "currency",
    currency: DEVISE,
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

export function nombre(valeur: number, decimales = 0): string {
  return valeur.toLocaleString(LOCALE, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

/** `part` est un ratio : 0,124 → « 12,4 % ». */
export function pourcentage(part: number, decimales = 1): string {
  return part.toLocaleString(LOCALE, {
    style: "percent",
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

/**
 * Montant stocké en centimes (convention de la base) : décimales seulement
 * s'il y a des centimes, « — » s'il est inconnu (un « 0 € » passerait pour
 * une valeur saisie).
 */
export function montantCentimes(centimes: number | null): string {
  if (centimes === null) return "—";
  return montant(centimes / 100, centimes % 100 === 0 ? 0 : 2);
}

// Une date métier « aaaa-mm-jj » se lit comme un jour LOCAL : new Date() la
// prendrait pour minuit UTC, et la date de fin d'un contrat s'affichait la
// veille dans un fuseau négatif (et différait entre rendu serveur et client).
function enDate(valeur: Date | string): Date {
  const jour = typeof valeur === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur) : null;
  if (jour) return new Date(Number(jour[1]), Number(jour[2]) - 1, Number(jour[3]));
  return new Date(valeur);
}

/** Accepte une Date ou une chaîne ISO (« 2026-09-09 »). */
export function date(valeur: Date | string): string {
  return enDate(valeur).toLocaleDateString(LOCALE);
}

/**
 * Le format de date d'une cellule de tableur, calqué sur celui de l'écran
 * (`date()`) pour l'ordre jour, mois, année : « dd/mm/yyyy » en fr-FR, « mm/dd/yyyy » en
 * en-US (le tableur ajoute le zéro de tête que l'écran omet en en-US). Une
 * cellule de date garde ainsi l'aspect que l'écran montrait, mais reste une vraie date
 * que le tableur sait trier et calculer (relevé en recette : l'export en texte
 * « aaaa-mm-jj » ne se triait pas comme des dates).
 */
export function formatDateTableur(locale: string = LOCALE): string {
  return new Intl.DateTimeFormat(locale)
    .formatToParts(new Date(2026, 0, 2))
    .map((partie) => {
      if (partie.type === "day") return "dd";
      if (partie.type === "month") return "mm";
      if (partie.type === "year") return "yyyy";
      // Un séparateur simple passe tel quel ; sinon entre guillemets, pour que
      // le tableur ne le lise pas comme un code de format.
      return /^[/.\- ]+$/.test(partie.value) ? partie.value : `"${partie.value}"`;
    })
    .join("");
}

/** « 2026-10 » → « octobre 2026 » : le titre d'un calendrier mensuel. */
export function moisAnnee(mois: string): string {
  return enDate(`${mois}-01`).toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
}

/** « 2026-10-05 » → « lun. » : l'en-tête d'une colonne de calendrier. */
export function jourSemaineCourt(valeur: Date | string): string {
  return enDate(valeur).toLocaleDateString(LOCALE, { weekday: "short" });
}

/**
 * Un instant (horodatage), au jour et à l'heure du client : « 15/10/2026 00:30 ».
 * Toujours dans FUSEAU, jamais celui du serveur, comme `aujourdhui()` : une
 * ligne du journal écrite à 22 h 30 UTC se lit le lendemain à Paris.
 */
export function dateHeure(valeur: Date | string): string {
  const instant = new Date(valeur);
  const jour = instant.toLocaleDateString(LOCALE, {
    timeZone: FUSEAU,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const heure = instant.toLocaleTimeString(LOCALE, { timeZone: FUSEAU, hour: "2-digit", minute: "2-digit" });
  return `${jour} ${heure}`;
}

export function dateLongue(valeur: Date | string): string {
  return enDate(valeur).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
