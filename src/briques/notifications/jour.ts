/*
 * Le jour d'envoi, en calcul pur : ni horloge ni fuseau. « Aujourd'hui » se
 * calcule ailleurs, dans le fuseau du client (aujourdhui() de
 * src/lib/format.ts), et s'injecte ici. Un projet précédent décidait du jour
 * dans la route, avec l'horloge du serveur : rien ne se testait sans attendre
 * le bon jour.
 */

// Dans l'ordre de getUTCDay : dimanche vaut 0.
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;

export type JourSemaine = (typeof JOURS)[number];

/**
 * Le jour de la semaine d'une date « aaaa-mm-jj ». Lue en UTC : une date
 * métier est un jour du calendrier, et new Date("2026-10-26") lu en heure
 * locale serait encore dimanche dans un fuseau négatif.
 */
export function jourDeLaSemaine(date: string): JourSemaine {
  const parties = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const [annee, mois, jour] = parties ? parties.slice(1).map(Number) : [NaN, NaN, NaN];
  const instant = new Date(Date.UTC(annee, mois - 1, jour));
  // Un 30 février passerait le motif et deviendrait le 2 mars.
  if (!parties || instant.getUTCMonth() !== mois - 1 || instant.getUTCDate() !== jour) {
    throw new Error(`Brique notifications : « ${date} » n'est pas une date « aaaa-mm-jj » du calendrier.`);
  }
  return JOURS[instant.getUTCDay()];
}

/** Vrai si `aujourdhui` (« aaaa-mm-jj ») tombe un des `jours` d'envoi. Sans calendrier des jours fériés. */
export function estJourDEnvoi(aujourdhui: string, jours: readonly JourSemaine[]): boolean {
  return jours.includes(jourDeLaSemaine(aujourdhui));
}
