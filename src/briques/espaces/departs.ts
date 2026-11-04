import { EFFETS_DEPARTS } from "@/config/effets-espaces";
import type { ExecuteurSql } from "@/lib/db/client";
import type { MotifDepart } from "./domaine";

/*
 * Ce que les modules de l'appli font quand une adhésion se termine : un membre
 * quitte l'espace, un gestionnaire le retire, son compte est désactivé ou
 * effacé. Chaque module le déclare chez lui et src/config/effets-espaces.ts
 * les rassemble, comme src/config/effets-comptes.ts pour les effets d'un
 * compte.
 *
 * Sans ce registre, quitter et retirer un membre ne prévenaient personne :
 * dans tours-de-coloc (2026-11-03), l'ordre des tours, les tours futurs et
 * les échanges en attente devaient sauter les adhésions terminées à la
 * lecture, et un module qui l'oubliait gardait un ancien membre sans que rien
 * ne le signale.
 *
 * Les effets se jouent dans la transaction du geste, sous le verrou de
 * l'espace, après la fin de l'adhésion (et la nomination d'un successeur à la
 * désactivation ou à l'effacement), dans l'ordre du registre : un effet qui
 * lève annule le geste et les effets déjà joués. Ils passent par l'exécuteur
 * reçu, jamais par query() ni transaction(), pour les raisons des effets de
 * comptes (src/briques/comptes/effets.ts) ; tests/espaces-departs.test.ts le
 * verrouille. Rien d'autre qu'une écriture en base : l'aperçu d'un
 * effacement (brique rgpd) joue les effets puis les annule.
 *
 * Écarté : un événement ou une file traitée hors de la transaction. Le module
 * verrait encore l'ancien membre entre le départ et le traitement, et un
 * traitement en échec laisserait le départ fait sans son effet.
 */

// Le motif en base (MotifDepart), sauf l'effacement : la base garde
// « compte-desactive » pour un compte effacé, le module apprend lequel des deux.
export type MotifDuDepart = MotifDepart | "compte-efface";

export type DepartDEspace = {
  espaceId: number;
  // Le compte qui part : à l'effacement, son adresse est déjà anonymisée.
  utilisateurId: number;
  // L'adhésion terminée : un module qui garde ses données par adhésion
  // (l'ordre des tours) la retrouve par elle.
  adhesionId: number;
  motif: MotifDuDepart;
};

export type EffetDeDepart = (tx: ExecuteurSql, depart: DepartDEspace) => Promise<void>;

// Une entrée par module de l'appli ; le registre part avec la brique.
export type EffetsDeDepart = { unite: string; depart: EffetDeDepart };

export async function jouerLesEffetsDuDepart(tx: ExecuteurSql, depart: DepartDEspace): Promise<void> {
  for (const effets of EFFETS_DEPARTS) await effets.depart(tx, depart);
}
