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
