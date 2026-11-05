import type { MethodeDeConnexion } from "../src/briques/comptes/methodes";
import { METHODES } from "../src/config/comptes";
import { query } from "../src/lib/db/client";

/*
 * Supprime tous les comptes, pour les tests qui partent d'une base sans
 * personne. Ce qui désigne un compte par une clé étrangère en ON DELETE
 * RESTRICT part ici, juste avant lui, et non seulement dans le fichier qui l'a
 * écrit : un nettoyage qui comptait sur celui d'un autre fichier échouait dès
 * que cet autre plantait avant le sien, et chaque fichier qui vide les comptes
 * tombait avec lui.
 */
export async function supprimerTousLesComptes(): Promise<void> {
  await query("DELETE FROM sessions");
  // Brique journal : chaque ligne désigne son auteur par son compte, la table
  // se vide donc en entier. Une seule ligne laissée par un test du journal
  // planté avant son nettoyage faisait échouer tous les tests des fichiers de
  // comptes.
  await query("DELETE FROM journal_audit");
  // Brique espaces : une adhésion désigne son compte, et la base refuse de
  // supprimer un compte qui en a. Les espaces partent avec elles.
  await query("DELETE FROM espaces_adhesions");
  await query("DELETE FROM espaces_invitations");
  await query("DELETE FROM espaces");
  // Fin de la brique espaces.
  await query("DELETE FROM utilisateurs");
}

/*
 * Pose les méthodes de connexion que suppose un test, ou revient à celles de
 * src/config/comptes.ts (null). Une appli retire « demo » de METHODES avant sa
 * mise en ligne : à l'essai réel sur Render, le 2026-11-05, ce geste a fait
 * tomber les tests de la démo, qui lisaient la configuration de l'appli, et la
 * CI rouge bloquait le job deployer.
 *
 * Le tableau se modifie sur place : c'est celui que lisent les modules de la
 * brique, à chaque appel. tests/setup.ts les a déjà chargés, si bien qu'un
 * vi.mock de la configuration arriverait trop tard ; et vi.resetModules suivi
 * de vi.doMock (tests/en-tetes-securite.test.ts) rechargerait aussi la session,
 * hors des remplacements de tests/setup.ts. Un METHODES gelé un jour ferait
 * lever splice au premier test qui pose ses méthodes : il le dirait.
 */
const METHODES_DE_L_APPLI = [...METHODES];
export function poserLesMethodes(liste: readonly MethodeDeConnexion[] | null): void {
  (METHODES as MethodeDeConnexion[]).splice(0, METHODES.length, ...(liste ?? METHODES_DE_L_APPLI));
}
