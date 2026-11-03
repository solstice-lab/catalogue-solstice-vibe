import { query, queryOne } from "../src/lib/db/client";
import { ESPACES } from "../src/config/espaces";
import { supprimerTousLesComptes } from "./aide-comptes";

/*
 * Ce que partagent les tests de la brique espaces : des comptes en base (la
 * brique retrouve un compte par l'adresse de la personne), et les réglages de
 * l'appli remis à leur valeur avant chaque test, qui peut les changer.
 */

const REGLAGES_D_ORIGINE = structuredClone(ESPACES);

export async function repartirDeZero(): Promise<void> {
  await supprimerTousLesComptes();
  ESPACES.plusieursParCompte = REGLAGES_D_ORIGINE.plusieursParCompte;
  Object.assign(ESPACES.plafonds, REGLAGES_D_ORIGINE.plafonds);
}

// Un compte actif, géré par l'appli : son rôle en base fait foi.
export async function compte(email: string, role = "membre"): Promise<number> {
  const ligne = await queryOne<{ id: number }>(
    "INSERT INTO utilisateurs (email, role, actif, gere_par_l_appli) VALUES ($1, $2, true, true) RETURNING id",
    [email, role]
  );
  return ligne!.id;
}

export const personne = (email: string) => ({ email, role: "membre" });

// Les adhésions d'un espace, en cours ou terminées, dans l'ordre d'arrivée.
export function adhesionsDe(espaceId: number) {
  return query<{
    id: number;
    utilisateur_id: number;
    prenom: string;
    role: string;
    depart_le: Date | null;
    motif_depart: string | null;
  }>(
    `SELECT id, utilisateur_id, prenom, role, depart_le, motif_depart
       FROM espaces_adhesions WHERE espace_id = $1 ORDER BY arrivee_le, id`,
    [espaceId]
  );
}

// L'adhésion en cours d'une adresse dans un espace.
export async function adhesionDe(espaceId: number, email: string): Promise<number> {
  const ligne = await queryOne<{ id: number }>(
    `SELECT a.id FROM espaces_adhesions a JOIN utilisateurs u ON u.id = a.utilisateur_id
      WHERE a.espace_id = $1 AND u.email = $2 AND a.depart_le IS NULL`,
    [espaceId, email]
  );
  if (!ligne) throw new Error(`${email} n'est pas membre de l'espace ${espaceId}`);
  return ligne.id;
}
