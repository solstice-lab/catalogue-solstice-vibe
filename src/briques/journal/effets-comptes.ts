import type { Effet, EffetsDeCompte } from "@/briques/comptes/effets";
import { journaliser } from "./journal";

/*
 * Ce que le journal d'audit fait quand un compte est désactivé, réactivé ou
 * effacé : il trace le geste, au nom de qui l'a fait, dans la transaction du
 * geste. Le registre des effets de comptes (src/config/effets-comptes.ts) le
 * rassemble avec ceux des autres unités, et l'assembleur retire cette entrée
 * avec la brique.
 *
 * Ces trois gestes se traçaient par la trace que passaient les actions de
 * /comptes et de /donnees-personnelles : le journal passe désormais par le
 * même registre que les modules, et un geste se trace même si l'appli le
 * déclenche d'ailleurs.
 */

const tracerLeGeste: Effet = (tx, { auteur, geste }) => journaliser(tx, auteur, geste);

export const EFFETS_JOURNAL: EffetsDeCompte = {
  unite: "journal",
  desactivation: tracerLeGeste,
  reactivation: tracerLeGeste,
  effacement: tracerLeGeste,
};
