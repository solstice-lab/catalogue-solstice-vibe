// Plus grand INTEGER de PostgreSQL : un id lu dans une URL ou posté à la main
// au-delà, ou un montant en centimes qui le dépasse, ferait lever la base
// (« out of range »), donc la page d'erreur au lieu d'un 404 ou d'un message
// de formulaire.
//
// Dans son propre fichier, sans `pg`, et non dans client.ts : des composants
// client l'importent aussi (le domaine d'un module métier, la présentation
// de la brique import-lot), et client.ts tirerait `pg` dans le navigateur.
// Deux copies en étaient nées, une troisième sans cette raison.
export const ENTIER_MAX = 2_147_483_647;
