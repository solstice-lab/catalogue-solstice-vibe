// Les actions de la brique rgpd, sans rôle : qui y a droit se dit dans
// src/config/acces.ts (DROITS).
//   mes-donnees.exporter : télécharger ses propres données ;
//   donnees.exporter : télécharger les données de n'importe quelle adresse,
//   pour répondre à une demande (compte désactivé, personne sans compte) ;
//   donnees.effacer : effacer ou anonymiser les données de n'importe quelle
//   adresse, sur sa demande. Pas de « mes-donnees.effacer » : le geste ne se
//   rattrape pas, et un compte volé suffirait à tout effacer.
export const ACTIONS_RGPD = ["mes-donnees.exporter", "donnees.exporter", "donnees.effacer"] as const;
