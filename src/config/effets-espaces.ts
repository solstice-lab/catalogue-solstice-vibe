import type { EffetsDeDepart } from "@/briques/espaces/departs";

/*
 * Ce que chaque module de l'appli fait quand un membre quitte un espace, en
 * est retiré, ou que son compte est désactivé ou effacé (brique espaces,
 * src/briques/espaces/departs.ts) : le pendant de src/config/effets-comptes.ts
 * pour les adhésions. Chaque module de l'appli décrit son effet chez lui, ce
 * fichier les rassemble, une entrée par module ; l'assembleur le livre et le
 * retire avec la brique espaces.
 *
 * Un module qui garde des données par membre (l'ordre des tours, les tours
 * futurs, les échanges en attente de tours-de-coloc) s'ajoute ici, au lieu de
 * sauter les adhésions terminées à chaque lecture :
 *
 *   import { DEPART_TACHES } from "@/lib/taches/effets-espaces";
 *   export const EFFETS_DEPARTS: EffetsDeDepart[] = [DEPART_TACHES];
 *
 * Les effets se jouent dans l'ordre de cette liste, dans la transaction du
 * geste, sous le verrou de l'espace : un effet qui lève annule le geste. Ils
 * écrivent par l'exécuteur reçu, jamais par query()
 * (tests/espaces-departs.test.ts le verrouille).
 */

export const EFFETS_DEPARTS: EffetsDeDepart[] = [];
