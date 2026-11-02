/*
 * Ce que la brique déploiement établit pour la politique de confidentialité
 * (src/lib/confidentialite.ts) : le lieu où l'hébergeur traite les
 * données. render.yaml place le service et la base dans la région de
 * Francfort ; tests/deploiement.test.ts vérifie que ce texte le dit toujours.
 *
 * Le nom de l'hébergeur, lui, reste dans les mentions légales
 * (src/lib/mentions-legales.ts) : une seule source pour les deux pages.
 */

export const LIEUX_DEPLOIEMENT = {
  hebergeur: "Union européenne, Allemagne (région de Francfort)",
};
