import { query, queryOne, transaction } from "./client";
import { estIdentifiantNumerique, slugDossier } from "@/lib/slug";
import { estIdDossier, type Dossier, type StatutDossier } from "@/lib/dossiers-domaine";
// Brique journal : chaque écriture des dossiers se trace dans sa transaction.
import { champsModifies } from "@/briques/journal/evenements";
import { auteurCourant, journaliser } from "@/briques/journal/journal";
// Fin de la brique journal.

/*
 * Accès aux données du module d'exemple « dossiers ». Tout passe par
 * query()/queryOne()/transaction() de client.ts — jamais pg directement.
 *
 * Les dates sortent en ::text : pg renverrait des objets Date, qui ne
 * traversent pas proprement la frontière server -> client components et
 * varient avec le fuseau du serveur. Une date métier est une chaîne
 * « aaaa-mm-jj », point.
 */

const COLONNES = `id, reference, client, montant_centimes, statut, echeance::text, notes`;

export async function listerDossiers(): Promise<Dossier[]> {
  return query<Dossier>(`SELECT ${COLONNES} FROM dossiers ORDER BY reference DESC`);
}

// L'identifiant d'URL peut être un slug (cas normal) ou un id numérique
// (redirections internes des server actions). Le slug n'étant pas stocké
// (voir lib/slug.ts), on le recalcule sur les fiches candidates — à l'échelle
// d'un module métier (centaines de lignes), le balayage est sans enjeu ; un
// module à fort volume ajouterait une colonne slug indexée via une migration.
export async function lireDossierParIdentifiant(identifiant: string): Promise<Dossier | undefined> {
  if (estIdentifiantNumerique(identifiant)) {
    // Hors de l'INTEGER de la base (« /dossiers/99999999999 »), elle lèverait : un 404, pas la page d'erreur.
    const id = Number(identifiant);
    if (!estIdDossier(id)) return undefined;
    return queryOne<Dossier>(`SELECT ${COLONNES} FROM dossiers WHERE id = $1`, [id]);
  }
  const dossiers = await query<Dossier>(`SELECT ${COLONNES} FROM dossiers ORDER BY id`);
  return dossiers.find((dossier) => slugDossier(dossier) === identifiant);
}

export type ChampsDossier = {
  reference: string;
  client: string;
  montant_centimes: number;
  statut: StatutDossier;
  echeance: string | null;
  notes: string | null;
};

export async function referenceDejaPrise(reference: string, saufId?: number): Promise<boolean> {
  const existant = await queryOne<{ id: number }>(
    `SELECT id FROM dossiers WHERE reference = $1 AND ($2::int IS NULL OR id <> $2)`,
    [reference, saufId ?? null]
  );
  return Boolean(existant);
}

const INSERTION = `INSERT INTO dossiers (reference, client, montant_centimes, statut, echeance, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLONNES}`;

const MISE_A_JOUR = `UPDATE dossiers
        SET reference = $2, client = $3, montant_centimes = $4, statut = $5, echeance = $6, notes = $7
      WHERE id = $1
      RETURNING ${COLONNES}`;

const SUPPRESSION = `DELETE FROM dossiers WHERE id = ANY($1::int[]) RETURNING id, reference`;

function parametres(champs: ChampsDossier): unknown[] {
  return [champs.reference, champs.client, champs.montant_centimes, champs.statut, champs.echeance, champs.notes];
}

export async function creerDossier(champs: ChampsDossier): Promise<Dossier> {
  // Brique journal : la création se trace dans la transaction de l'écriture.
  const auteur = await auteurCourant();
  return transaction(async (tx) => {
    const [dossier] = await tx.query<Dossier>(INSERTION, parametres(champs));
    await journaliser(tx, auteur, {
      action: "creation",
      entite: "dossiers",
      entiteId: dossier.id,
      libelle: dossier.reference,
    });
    return dossier;
  });
  // Fin de la brique journal.
}

export async function modifierDossier(id: number, champs: ChampsDossier): Promise<Dossier | undefined> {
  // Brique journal : l'état d'avant, verrouillé jusqu'à la fin de la
  // transaction, dit quels champs changent ; rien ne s'écrit s'il n'y en a pas.
  const auteur = await auteurCourant();
  return transaction(async (tx) => {
    const avant = await tx.queryOne<Dossier>(`SELECT ${COLONNES} FROM dossiers WHERE id = $1 FOR UPDATE`, [id]);
    const [dossier] = await tx.query<Dossier>(MISE_A_JOUR, [id, ...parametres(champs)]);
    if (avant && dossier) {
      await journaliser(tx, auteur, {
        action: "modification",
        entite: "dossiers",
        entiteId: id,
        libelle: dossier.reference,
        champs: champsModifies(avant, champs),
      });
    }
    return dossier;
  });
  // Fin de la brique journal.
}

export async function supprimerDossiers(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  // Brique journal : une ligne par dossier supprimé, sa référence comprise
  // (une suppression en lot n'est pas une ligne pour tout le lot).
  const auteur = await auteurCourant();
  await transaction(async (tx) => {
    for (const dossier of await tx.query<{ id: number; reference: string }>(SUPPRESSION, [ids])) {
      await journaliser(tx, auteur, {
        action: "suppression",
        entite: "dossiers",
        entiteId: dossier.id,
        libelle: dossier.reference,
      });
    }
  });
  // Fin de la brique journal.
}
