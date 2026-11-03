import type { DroitsDe } from "@/briques/comptes/roles";
import { ACTIONS_RGPD } from "@/briques/rgpd/actions";
import { ACTIONS_GESTION_COMPTES } from "@/briques/gestion-comptes/domaine";
import { ACTIONS_DOSSIERS } from "@/lib/dossiers-domaine";
import { ACTIONS_JOURNAL } from "@/briques/journal/evenements";

/*
 * Qui a le droit de faire quoi dans cette appli : le fichier que
 * le projet remplit, comme src/ui/theme/tokens.css pour le thème. Le mécanisme
 * (exiger, peut) vit dans src/briques/comptes/roles.ts et ne nomme aucun module ; chaque
 * module déclare ses actions dans son fichier de domaine, sans parler de rôles.
 *
 * Refus par défaut : une personne absente, ou dont le rôle n'est pas dans
 * ROLES, ne passe aucune action. Le rôle est relu à chaque requête.
 *
 * Avec un seul rôle (connexion seule), ROLES le nomme, ROLE_PAR_DEFAUT reste
 * "membre", et DROITS tient en une ligne qui donne toutes les actions à ce rôle :
 *
 *   export const ROLES = ["membre"] as const;
 *   export const DROITS = Object.fromEntries(ACTIONS.map((action) => [action, ROLES])) as Droits;
 *
 * Le `as` y remplace `satisfies` sans rien perdre : la ligne parcourt ACTIONS,
 * aucune action ne peut y manquer, et tests/roles.test.ts vérifie de toute
 * façon que chaque action a un rôle déclaré.
 *
 * La blueprint dit alors que toute personne connectée a droit aux actions
 * sensibles (décider, importer, supprimer, avec la brique gestion-comptes
 * administrer les comptes, et avec la brique rgpd exporter ou effacer les
 * données de n'importe quelle adresse, donnees.exporter et donnees.effacer).
 */

// Toutes les actions de l'appli, une ligne par module ou par brique.
export const ACTIONS = [
  // Une ligne par unité : l'assembleur retire celle d'une brique absente, et
  // ce commentaire garde la liste sur plusieurs lignes quand elle tiendrait
  // sur une seule (Prettier la repliait, et les lignes devenaient introuvables).
  ...ACTIONS_DOSSIERS,
  ...ACTIONS_RGPD,
  ...ACTIONS_JOURNAL,
  ...ACTIONS_GESTION_COMPTES,
] as const;
export type Action = (typeof ACTIONS)[number];

export const ROLES = ["membre", "admin"] as const;
export type Role = (typeof ROLES)[number];

// Le rôle d'une personne entrée sans rôle attribué (par son domaine ou par
// l'entrée ouverte, voir src/config/comptes.ts) : jamais un rôle
// d'administration.
export const ROLE_PAR_DEFAUT: Role = "membre";

// Le rôle que reçoit le premier admin (COMPTES_PREMIER_ADMIN), tant qu'aucun
// compte actif ne l'a. Avec un seul rôle, c'est ce rôle-là.
export const ROLE_ADMIN: Role = "admin";

export type Droits = DroitsDe<Action, Role>;

// `satisfies` : le typecheck échoue si une action déclarée n'a pas de rôle,
// si une liste est vide, ou si une entrée nomme une action ou un rôle inconnu.
export const DROITS = {
  "dossiers.acceder": ["membre", "admin"],
  // Chacun télécharge ses propres données ; l'admin, celles de n'importe
  // quelle adresse, pour répondre à une demande.
  "mes-donnees.exporter": ["membre", "admin"],
  "donnees.exporter": ["admin"],
  // Un effacement ne se rattrape pas : l'admin seul, après avoir vérifié que
  // la demande vient de la personne.
  "donnees.effacer": ["admin"],
  // Le journal dit qui a fait quoi : il se lit par l'admin (brique journal).
  "journal.consulter": ["admin"],
  // L'écran /comptes (brique gestion-comptes) : ROLE_ADMIN au moins, le
  // rôle que la brique comptes protège du « dernier admin désactivé ».
  "comptes.administrer": ["admin"],
} satisfies Droits;
