/*
 * La brique espaces : des groupes de personnes (une coloc, une association)
 * qu'on crée ou rejoint par un code. Ce fichier déclare l'action que ses pages
 * et server actions exigent, et les types qu'écrans et gestes partagent.
 * Importable côté client.
 *
 * Une seule action d'appli : participer (créer, rejoindre, voir son espace,
 * le quitter). Les gestes de gestionnaire ne sont pas des droits d'appli : la
 * brique les vérifie sur l'adhésion, puisqu'on est gestionnaire d'un espace,
 * pas de l'appli.
 */
export const ACTIONS_ESPACES = ["espaces.participer"] as const;

export type RoleEspace = "gestionnaire" | "membre";

export type MotifDepart = "parti" | "retire" | "compte-desactive";

export type Espace = { id: number; nom: string; code: string };

// Une adhésion en cours, telle que l'écran la montre : jamais l'adresse.
// arriveeLe en chaîne ISO : le Tableau compare des chaînes.
export type Adhesion = { id: number; prenom: string; role: RoleEspace; arriveeLe: string };

export type Refus = { erreur: string };

// Ce que rend une server action de /espace : un refus à afficher, ou un
// message à dire une fois le geste fait.
export type RetourEspace = { erreur?: string; message?: string };
