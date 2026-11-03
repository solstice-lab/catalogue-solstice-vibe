import { EFFETS_COMPTES } from "@/config/effets-comptes";
import type { ExecuteurSql } from "@/lib/db/client";
import type { Geste } from "./administration";

/*
 * Ce que les autres unités de l'appli font quand un compte est désactivé,
 * réactivé ou effacé : terminer une appartenance, nommer un autre
 * gestionnaire, anonymiser un prénom, tracer le geste au journal. Chaque unité
 * le déclare chez elle et src/config/effets-comptes.ts les rassemble, comme
 * src/config/donnees-personnelles.ts rassemble les sources de la brique rgpd.
 *
 * Sans ce registre, la seule prise était la trace que les actions de /comptes
 * passent à desactiver : l'appli tours-de-coloc a dû retoucher
 * src/app/comptes/actions.ts, un fichier de la brique gestion-comptes, et
 * trois de ses tickets y ajoutaient chacun leur effet (2026-11-03).
 *
 * Les effets se jouent dans la transaction du geste, sous son verrou, après
 * son écriture, dans l'ordre du registre : un effet qui lève annule le geste
 * et les effets déjà joués. Ils passent par l'exécuteur reçu, jamais par
 * query() ni transaction() : une écriture faite par le pool resterait quand le
 * geste est annulé, et une lecture par le pool, pendant que la transaction
 * tient sa connexion et son verrou, fait s'attendre les écritures quand le
 * pool est plein. tests/comptes-effets.test.ts le verrouille. Rien d'autre
 * qu'une écriture en base : l'aperçu d'un effacement (brique rgpd) joue les
 * effets puis les annule, un mail envoyé par un effet partirait quand même.
 */

export type EvenementDeCompte = "desactivation" | "reactivation" | "effacement";

// Qui fait le geste : la personne que le garde a rendue à l'action, ou l'admin
// qui efface. Un effet qui trace ce qu'il fait le désigne comme auteur.
export type AuteurDuGeste = { email: string };

export type CompteTouche = {
  // Le numéro du compte : à l'effacement, son adresse est déjà anonymisée.
  id: number;
  auteur: AuteurDuGeste;
  // Le geste, dans la forme d'un événement du journal d'audit : « compte n°12 »
  // et les colonnes changées.
  geste: Geste;
};

export type Effet = (tx: ExecuteurSql, compte: CompteTouche) => Promise<void>;

// Une entrée par unité, que l'assembleur retire avec elle. Un événement sans
// effet n'a pas sa clé.
export type EffetsDeCompte = { unite: string } & Partial<Record<EvenementDeCompte, Effet>>;

export async function jouerLesEffets(
  tx: ExecuteurSql,
  evenement: EvenementDeCompte,
  compte: CompteTouche
): Promise<void> {
  for (const effets of EFFETS_COMPTES) await effets[evenement]?.(tx, compte);
}
