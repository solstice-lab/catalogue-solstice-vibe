import { query, type ExecuteurSql, type transaction } from "@/lib/db/client";
import { peut, utilisateurCourant } from "@/briques/comptes/roles";
import { estActionJournalisee, type ActionJournalisee } from "./evenements";

/*
 * Le journal d'audit : qui a fait quoi, quand. Serveur seulement.
 *
 * Une ligne s'écrit DANS LA TRANSACTION de l'écriture qu'elle trace : une
 * écriture qui échoue ne laisse pas de trace fausse, une trace qui échoue
 * annule l'écriture. L'auteur est la personne de la session (relue en base à
 * chaque requête par la brique comptes), lue par auteurCourant() avant la
 * transaction : la server action l'a déjà exigée en première ligne, et sans
 * elle rien ne s'écrit. Les actions de /comptes passent directement celle que
 * leur rend exiger.
 *
 * Aucune fonction ne modifie ni n'efface une ligne : la base refuse l'UPDATE,
 * et un test-verrou interdit au code de l'appli le DELETE, réservé à la purge
 * de la brique RGPD.
 */

export type Transaction = Parameters<Parameters<typeof transaction>[0]>[0];

export class ErreurJournal extends Error {
  constructor(message: string) {
    super(`Brique journal : ${message}`);
    this.name = "ErreurJournal";
  }
}

export type Evenement = {
  action: ActionJournalisee;
  // Le nom de l'entité, en identifiant simple : le nom de sa table, par
  // convention (« dossiers »). Les gestes de /comptes, sans fiche, disent
  // « compte » et « domaine ».
  entite: string;
  entiteId: string | number;
  // La référence métier au moment du geste : une fiche supprimée reste
  // identifiable. Jamais un nom ni une adresse : un compte se dit par son
  // numéro (« compte n°12 »).
  libelle: string;
  // Les noms des champs changés (champsModifies), pour une modification.
  champs?: readonly string[];
};

// Qui écrit : la personne de la session, par auteurCourant() ou par le retour
// d'exiger.
export type Auteur = { email: string };

export type LigneJournal = {
  id: string;
  // L'instant en ISO 8601 UTC : une chaîne, pas un objet Date, pour passer
  // tel quel au composant client du tableau ; dateHeure() l'affiche.
  le: string;
  auteur: string;
  action: string;
  entite: string;
  entite_id: string;
  libelle: string;
  champs: string[];
};

// Ce que montre l'écran /journal, et l'historique d'une fiche : le Tableau
// trie et filtre dans le navigateur, il ne reçoit pas toute la table.
export const LIMITE_ECRAN = 1000;
export const LIMITE_FICHE = 100;

const IDENTIFIANT = /^[a-z_][a-z0-9_]*$/;

// La personne de la session, lue AVANT d'ouvrir la transaction : la lecture de
// session prend sa propre connexion au pool, et la prendre pendant que la
// transaction en tient une (et un verrou FOR UPDATE) ferait s'attendre les
// écritures entre elles quand le pool est plein. Sans
// personne, rien ne s'écrit : la fonction lève avant toute écriture.
export async function auteurCourant(): Promise<Auteur> {
  const auteur = await utilisateurCourant();
  if (!auteur) {
    throw new ErreurJournal("aucune personne connectée, l'écriture est annulée : rien ne s'écrit sans auteur.");
  }
  return { email: auteur.email };
}

// tx : l'exécuteur de la transaction de l'écriture, celui que donne
// transaction() ou celui que reçoit un effet du registre des effets de comptes
// (src/config/effets-comptes.ts), qui n'a que query.
export async function journaliser(tx: ExecuteurSql, auteur: Auteur, evenement: Evenement): Promise<void> {
  if (!estActionJournalisee(evenement.action)) {
    throw new ErreurJournal(`action inconnue « ${String(evenement.action)} ».`);
  }
  if (!IDENTIFIANT.test(evenement.entite)) {
    throw new ErreurJournal(`entité « ${evenement.entite} » : attendu un identifiant simple ([a-z_][a-z0-9_]*).`);
  }
  const champs = evenement.champs ?? [];
  // Un formulaire enregistré tel quel n'a rien changé : pas de ligne.
  if (evenement.action === "modification" && champs.length === 0) return;

  // L'auteur se désigne par son compte, pas par son adresse : anonymiser un
  // compte (brique RGPD) anonymise le journal sans le réécrire. La
  // recherche passe par `tx`, la connexion de la transaction.
  const [ligne] = await tx.query<{ id: string }>(
    `INSERT INTO journal_audit (utilisateur_id, action, entite, entite_id, libelle, champs)
     SELECT id, $2, $3, $4, $5, $6::text[] FROM utilisateurs WHERE email = $1
     RETURNING id`,
    [auteur.email, evenement.action, evenement.entite, String(evenement.entiteId), evenement.libelle, champs]
  );
  if (!ligne) {
    throw new ErreurJournal("la personne connectée n'a pas de compte en base, l'écriture est annulée.");
  }
}

export async function lireJournal({
  entite,
  entiteId,
  limite = LIMITE_ECRAN,
}: { entite?: string; entiteId?: string | number; limite?: number } = {}): Promise<LigneJournal[]> {
  return query<LigneJournal>(
    `SELECT j.id::text AS id,
            to_char(j.le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS le,
            u.email AS auteur, j.action, j.entite, j.entite_id, j.libelle, j.champs
       FROM journal_audit j
       JOIN utilisateurs u ON u.id = j.utilisateur_id
      WHERE ($1::text IS NULL OR j.entite = $1)
        AND ($2::text IS NULL OR j.entite_id = $2)
      ORDER BY j.le DESC, j.id DESC
      LIMIT $3`,
    [entite ?? null, entiteId === undefined ? null : String(entiteId), limite]
  );
}

// L'historique d'une fiche, pour qui a journal.consulter, `null` pour les
// autres : la fiche n'affiche alors rien, pas même un titre.
export async function historiqueSiPermis(entite: string, entiteId: string | number): Promise<LigneJournal[] | null> {
  if (!peut(await utilisateurCourant(), "journal.consulter")) return null;
  return lireJournal({ entite, entiteId, limite: LIMITE_FICHE });
}
