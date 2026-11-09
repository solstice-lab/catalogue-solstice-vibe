/*
 * La brique gestion-comptes : l'écran /comptes, où un admin
 * gère les comptes sans toucher à la configuration. Les règles (dernier admin
 * protégé, désactivation, domaines) vivent dans la brique comptes
 * (administration.ts) : ce fichier ne déclare que l'action que la page et ses
 * server actions exigent. Qui y a droit se dit dans src/config/acces.ts.
 */
export const ACTIONS_GESTION_COMPTES = ["comptes.administrer"] as const;

// Ce que chaque server action de /comptes rend à l'écran : un refus à afficher
// dans la modale, ou un message à dire une fois le geste fait. `reconnexion`
// accompagne le refus d'un geste qui demande une connexion récente
// (exigerConnexionRecente de la brique comptes) : l'écran où ramène le bouton
// « Se reconnecter ».
export type RetourAdministration = { erreur?: string; message?: string; reconnexion?: string };
