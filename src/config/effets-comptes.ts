import type { EffetsDeCompte } from "@/briques/comptes/effets";
import { EFFETS_ESPACES } from "@/briques/espaces/effets-comptes";
import { EFFETS_JOURNAL } from "@/briques/journal/effets-comptes";

/*
 * Ce que chaque unité de l'appli fait quand un compte est désactivé, réactivé
 * ou effacé (brique comptes, src/briques/comptes/effets.ts) : le pendant de
 * src/config/donnees-personnelles.ts pour les sources de l'export. Chaque
 * unité décrit ses effets chez elle, ce fichier les rassemble, une entrée par
 * unité, que l'assembleur retire avec elle.
 *
 * Un module qui doit réagir (terminer une appartenance, nommer un autre
 * gestionnaire, anonymiser un prénom) s'ajoute ici, sans retoucher
 * src/app/comptes/actions.ts ni la brique comptes : l'appli tours-de-coloc a
 * dû le faire faute de registre (2026-11-03).
 *
 * Les effets se jouent dans l'ordre de cette liste, dans la transaction du
 * geste : un effet qui lève annule le geste. Ils écrivent par l'exécuteur
 * reçu, jamais par query() (tests/comptes-effets.test.ts le verrouille).
 */

export const EFFETS_COMPTES: EffetsDeCompte[] = [
  // Brique espaces : terminer les adhésions, nommer un autre gestionnaire,
  // remplacer le prénom à l'effacement.
  EFFETS_ESPACES,
  // Le journal en dernier : il trace le geste une fois que les effets des
  // modules sont passés.
  EFFETS_JOURNAL,
];
