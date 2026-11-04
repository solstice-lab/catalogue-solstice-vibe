import type { Pool } from "pg";

/*
 * Migrations de schéma — la SEULE façon de faire évoluer une base déployée.
 *
 * Sémantique héritée d'un projet précédent, qui a survécu à tous ses
 * incidents : chaque étape est IDEMPOTENTE (ADD COLUMN IF NOT EXISTS, DROP
 * CONSTRAINT IF EXISTS puis ADD, backfill qui ne matche que les lignes à
 * rattraper…) et le tableau entier est rejoué à CHAQUE démarrage, dans l'ordre. Pas de table de suivi
 * type schema_migrations : c'est un état de plus qui peut mentir, alors que
 * l'idempotence n'a pas cet angle mort.
 *
 * Seule la FORME diffère de ce projet : des étapes nommées dans un tableau,
 * plutôt qu'une fonction unique qui enfle (668 lignes là-bas). Chaque étape
 * commente son POURQUOI et cite le cas qui l'a motivée.
 *
 * Règles :
 * - Un CREATE TABLE fusionné dans schema.sql ne se retouche plus : la
 *   colonne suivante naît ici (incident du 2026-09-04).
 * - Un index sur une colonne ajoutée ici se crée AUSSI ici, jamais dans
 *   schema.sql — sur une base ancienne, schema.sql tourne AVANT ces étapes,
 *   la colonne n'existe pas encore quand il s'exécute.
 * - On n'insère qu'À LA FIN du tableau, on ne réordonne jamais : une base
 *   déployée a déjà rejoué les étapes existantes dans cet ordre.
 */

type Migration = {
  nom: string;
  appliquer: (pool: Pool) => Promise<void>;
};

export const MIGRATIONS: Migration[] = [
  {
    // Modèle d'étape : le champ notes n'était pas dans la première version de
    // la table dossiers — il naît donc ici, pas dans schema.sql. Une base
    // neuve le reçoit aussi : schema.sql puis migrations tournent dans cet
    // ordre sur toutes les bases, neuves comprises.
    nom: "dossiers : champ notes (texte libre de la fiche)",
    async appliquer(pool) {
      await pool.query(`ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS notes TEXT;`);
    },
  },
  {
    // File de la brique validation. La table naît ici, comme
    // toute table hors du socle : une étape ne dépend pas de l'ordre
    // dans lequel schema.sql et les migrations tournent.
    //
    // La clé (type, cle) est tenue par les propositions EN ATTENTE ET
    // REFUSÉES, pas par les acceptées : un refus ne libère pas la clé, sinon
    // le rescan de la source ressuscite la proposition (vécu sur un projet précédent) ; une
    // acceptée a produit son effet. L'unicité est garantie par cet index
    // partiel, pas seulement par l'appli : deux rescans simultanés passent
    // tous les deux une vérification préalable. L'index naît dans la MÊME
    // étape que la table (incident du 2026-09-04).
    //
    // La liste des statuts de la contrainte est celle de STATUTS dans
    // src/briques/validation/cycle.ts : tests/validation.test.ts les
    // compare (projet précédent : le code écrivait un verdict que la base refusait).
    // Ajouter un statut = une nouvelle étape qui remplace la contrainte, ET
    // le code, dans le même commit.
    nom: "propositions : file de la brique validation, clé tenue par les propositions en attente ou refusées",
    async appliquer(pool) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS propositions (
          id SERIAL PRIMARY KEY,
          type TEXT NOT NULL,
          cle TEXT NOT NULL,
          groupe TEXT,
          contenu JSONB NOT NULL,
          statut TEXT NOT NULL DEFAULT 'en_attente',
          cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
          decide_le TIMESTAMPTZ,
          decide_par TEXT,
          CONSTRAINT propositions_statut_check CHECK (statut IN ('en_attente', 'acceptee', 'refusee'))
        );
      `);
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS propositions_cle_ouverte_unique
          ON propositions (type, cle)
          WHERE statut IN ('en_attente', 'refusee');
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS propositions_groupe_idx ON propositions (groupe);`);
    },
  },
  {
    // Brique import-lot : un fichier importé devient un lot en
    // attente, que la personne confirme ou ignore. Les lignes du lot ne
    // touchent aucune table métier avant la confirmation.
    //
    // Les lignes ne portent QUE le lot : la suppression d'un lot emporte ses
    // lignes et rien d'autre. Une appli livrée avait un lien lot-publication
    // indirect, et supprimer un lot « Doublon » effaçait les publications
    // d'un autre lot.
    //
    // Les tables sont neuves : leurs index naissent dans la même étape.
    nom: "import_lots et import_lot_lignes : lots d'import à valider (brique import-lot)",
    async appliquer(pool) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS import_lots (
          id SERIAL PRIMARY KEY,
          branchement TEXT NOT NULL,
          nom_fichier TEXT NOT NULL,
          statut TEXT NOT NULL DEFAULT 'en_attente'
            CONSTRAINT import_lots_statut_valide CHECK (statut IN ('en_attente', 'confirme', 'ignore')),
          -- Lignes écartées (numéro, motif) et fusions : ce que la personne doit voir.
          ecartees JSONB NOT NULL DEFAULT '[]'::jsonb,
          fusions JSONB NOT NULL DEFAULT '[]'::jsonb,
          -- Compte rendu de la confirmation (créées, mises à jour, inchangées).
          rapport JSONB,
          cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
          confirme_le TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS import_lots_branchement_idx ON import_lots (branchement, id DESC);
        CREATE TABLE IF NOT EXISTS import_lot_lignes (
          id SERIAL PRIMARY KEY,
          lot_id INTEGER NOT NULL
            CONSTRAINT import_lot_lignes_lot_fk REFERENCES import_lots (id) ON DELETE CASCADE,
          -- Rang d'écriture : une ligne qui renvoie à une autre s'écrit après
          -- elle, et l'ordre des id d'un INSERT ... SELECT n'est pas garanti.
          ordre INTEGER NOT NULL,
          numero INTEGER NOT NULL,
          numeros INTEGER[] NOT NULL,
          valeurs JSONB NOT NULL,
          -- Choix de la personne avant confirmation, jamais une valeur par défaut.
          decisions JSONB NOT NULL DEFAULT '{}'::jsonb
        );
        CREATE INDEX IF NOT EXISTS import_lot_lignes_lot_idx ON import_lot_lignes (lot_id, ordre);
      `);
    },
  },
  {
    // Brique comptes : les comptes et leurs sessions. Rien n'y
    // est semé, ni compte de démo ni premier admin : un compte naît à sa
    // première connexion (src/briques/comptes/entree.ts).
    //
    // L'adresse est rangée en minuscules, et la contrainte le garantit :
    // l'unicité ne doit pas dépendre de la casse saisie. On désactive un
    // compte (actif), on ne le supprime pas : aucune suppression en cascade
    // vers les sessions.
    //
    // La session ne garde que l'empreinte (SHA-256) du jeton du cookie : une
    // fuite de la base ne donne aucune session. Le rôle n'y est pas : il se
    // relit sur le compte à chaque requête. Les index naissent dans la MÊME
    // étape que leurs tables (incident du 2026-09-04).
    nom: "utilisateurs, sessions : comptes et sessions de la brique comptes",
    async appliquer(pool) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS utilisateurs (
          id SERIAL PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL,
          actif BOOLEAN NOT NULL DEFAULT true,
          cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
          derniere_connexion TIMESTAMPTZ,
          CONSTRAINT utilisateurs_email_minuscules_check CHECK (email = lower(btrim(email)))
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          empreinte TEXT PRIMARY KEY,
          utilisateur_id INTEGER NOT NULL,
          cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
          expire_le TIMESTAMPTZ NOT NULL,
          CONSTRAINT sessions_utilisateur_fk FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs (id) ON DELETE RESTRICT
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS sessions_utilisateur_id_idx ON sessions (utilisateur_id);`);
    },
  },
  {
    // Brique contact : les traces de la limite d'envois du
    // formulaire public. Ni le message ni l'adresse IP en clair : le message
    // part par e-mail, l'adresse est remplacée par son empreinte sha256 sans
    // sel. C'est une pseudonymisation, pas une anonymisation : une adresse
    // IPv4 se retrouve en les essayant toutes (données personnelles, à
    // reprendre par la brique RGPD). Sans adresse lisible (src/lib/
    // adresse-ip.ts), la ligne porte « sans-adresse » : elle compte dans le
    // plafond global, jamais dans une limite par adresse. Les lignes de plus d'une heure sont
    // effacées à la soumission SUIVANTE (briques/contact/filtres.ts) : sans
    // nouveau message, elles restent, au plus une cinquantaine (le plafond
    // global).
    //
    // Pas d'index : le plafond global d'envois borne la table à quelques
    // dizaines de lignes, qu'un parcours complet lit plus vite qu'un index.
    // Pas de clé primaire non plus : aucune ligne n'est jamais désignée seule.
    nom: "contact_envois : traces de la limite d'envois du formulaire de contact (brique contact)",
    async appliquer(pool) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS contact_envois (
          empreinte TEXT NOT NULL,
          recu_le TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
    },
  },
  {
    // Brique comptes : les demandes de code de connexion par
    // e-mail, qui servent à la fois au code en cours et aux limites de
    // demandes (par adresse, par IP), et les saisies fausses de code par IP
    // (codes_connexion_essais), qui bornent qui invaliderait ou sonderait les
    // codes des autres.
    //
    // Que des empreintes, toutes à clé (HMAC par AUTH_SECRET) : celle du code
    // (une fuite de la base ne connecte personne), celle de l'adresse (les
    // adresses saisies sans compte appartiennent à des personnes qui
    // n'utilisent pas l'appli) et celle de l'IP (sans clé, les adresses IPv4
    // se retrouvent toutes en quelques secondes). L'IP est nulle quand elle ne
    // se lit pas de façon sûre en production (src/lib/adresse-ip.ts). Aucune
    // clé vers utilisateurs : une adresse inconnue a sa ligne, elle aussi,
    // pour que la réponse et les limites ne trahissent pas qui a un compte.
    // Les lignes de plus d'une heure sont effacées à chaque demande.
    //
    // Index dans la MÊME étape que la table (incident du 2026-09-04) : les
    // limites se comptent par adresse et par IP sur l'heure écoulée, et la
    // purge lit les lignes par date.
    nom: "codes_connexion : codes de connexion par e-mail et limites de demandes (brique comptes)",
    async appliquer(pool) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS codes_connexion (
          id SERIAL PRIMARY KEY,
          adresse_empreinte TEXT NOT NULL,
          ip_empreinte TEXT,
          code_empreinte TEXT NOT NULL,
          essais INTEGER NOT NULL DEFAULT 0,
          consomme BOOLEAN NOT NULL DEFAULT false,
          cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
          expire_le TIMESTAMPTZ NOT NULL
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS codes_connexion_adresse_idx ON codes_connexion (adresse_empreinte, cree_le);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS codes_connexion_ip_idx ON codes_connexion (ip_empreinte, cree_le);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS codes_connexion_cree_le_idx ON codes_connexion (cree_le);`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS codes_connexion_essais (
          ip_empreinte TEXT NOT NULL,
          cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS codes_connexion_essais_ip_idx ON codes_connexion_essais (ip_empreinte, cree_le);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS codes_connexion_essais_cree_le_idx ON codes_connexion_essais (cree_le);`);
    },
  },
  {
    // Brique journal : qui a fait quoi, quand. Après l'étape de
    // la brique comptes : l'auteur est un compte de utilisateurs, désigné par
    // son id et jamais par son adresse, pour qu'anonymiser un compte (brique
    // RGPD) anonymise le journal sans le réécrire. Aucune valeur de
    // champ : seulement les noms des champs changés (données personnelles).
    // Conservation : 12 mois recommandés, à valider par le client ; la purge
    // est le script de la brique RGPD (scripts/purger-donnees.ts). ON DELETE
    // RESTRICT n'emporte rien : un compte qui a laissé une trace ne se supprime
    // plus (la brique comptes désactive, elle ne supprime pas) ; une purge qui
    // supprimerait un compte efface d'abord ses lignes du journal.
    //
    // La base refuse tout UPDATE (trigger) : une ligne du journal ne change
    // jamais. Elle garde le DELETE pour la purge de la brique RGPD, interdit au code de
    // l'appli par tests/journal-isolement.test.ts.
    //
    // Index, dans la même étape que la table (incident du 2026-09-04) :
    // l'historique d'une fiche, la liste récente et la purge par ancienneté,
    // et l'auteur (clé étrangère, export des données d'une personne).
    nom: "journal_audit : journal d'audit de la brique journal, sans UPDATE possible, avec ses index",
    async appliquer(pool) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS journal_audit (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          le TIMESTAMPTZ NOT NULL DEFAULT now(),
          utilisateur_id INTEGER NOT NULL,
          action TEXT NOT NULL,
          entite TEXT NOT NULL,
          entite_id TEXT NOT NULL,
          libelle TEXT NOT NULL,
          champs TEXT[] NOT NULL DEFAULT '{}',
          CONSTRAINT journal_audit_utilisateur_fk FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs (id) ON DELETE RESTRICT,
          CONSTRAINT journal_audit_action_check CHECK (action IN ('creation', 'modification', 'suppression')),
          CONSTRAINT journal_audit_entite_check CHECK (entite ~ '^[a-z_][a-z0-9_]*$')
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS journal_audit_entite_idx ON journal_audit (entite, entite_id, le DESC);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS journal_audit_le_idx ON journal_audit (le);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS journal_audit_utilisateur_id_idx ON journal_audit (utilisateur_id);`);
      await pool.query(`
        CREATE OR REPLACE FUNCTION journal_audit_refuser_modification() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'Le journal d''audit ne se modifie pas (brique journal, #144).';
        END;
        $$;
      `);
      // CREATE OR REPLACE TRIGGER (Postgres 14 et plus) : une seule instruction,
      // rejouable, sans fenêtre où la table resterait sans trigger.
      await pool.query(`
        CREATE OR REPLACE TRIGGER journal_audit_sans_modification
          BEFORE UPDATE ON journal_audit
          FOR EACH ROW EXECUTE FUNCTION journal_audit_refuser_modification();
      `);
    },
  },
  {
    // Brique comptes : l'administration des comptes dans l'appli,
    // niveau 3 des droits. Un compte qu'un admin a invité, ou dont il a fixé
    // le rôle à l'écran, est « géré par l'appli » : il entre tant qu'il est
    // actif, avec son rôle en base, quoi que dise la configuration. Les autres
    // restent aux règles du niveau 2 (src/briques/comptes/entree.ts).
    //
    // Faux par défaut, et rien n'est rattrapé : le jour où une appli passe au
    // niveau 3, aucun compte ne change d'accès. Un « true » rattrapé aurait
    // rendu à un admin rétrogradé dans la configuration le rôle « admin »
    // resté en base depuis sa dernière connexion.
    //
    // Les domaines ouverts depuis l'écran, en minuscules comme les adresses.
    // Un domaine se ferme (actif), il ne se supprime pas, comme un compte.
    // Aucune ligne semée. Pas d'index de plus : la clé primaire suffit.
    nom: "utilisateurs.gere_par_l_appli, domaines_admis : administration des comptes dans l'appli (brique comptes)",
    async appliquer(pool) {
      await pool.query(`ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS gere_par_l_appli BOOLEAN NOT NULL DEFAULT false;`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS domaines_admis (
          domaine TEXT PRIMARY KEY,
          actif BOOLEAN NOT NULL DEFAULT true,
          cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT domaines_admis_minuscules_check CHECK (domaine = lower(btrim(domaine)))
        );
      `);
    },
  },
  {
    // Brique notifications : le journal des envois, une ligne par mail réel ou
    // d'essai, réussi ou non. Un projet précédent n'en gardait aucune trace :
    // un rappel parti ou non ne se vérifiait pas.
    //
    // jour : le jour du client (fuseau de src/lib/format.ts) où l'envoi est
    // parti. envoye_le, à l'horloge de Postgres, sert la purge au-delà de la
    // durée de conservation ; destinataire, en minuscules comme l'export de la
    // brique rgpd le cherche, sert cet export.
    //
    // notifications_lancements : un envoi réel par jour et par source, tranché
    // par la clé primaire. Lire le journal ne suffisait pas : deux appels
    // simultanés (la tâche planifiée et une relance à la main) passaient tous
    // les deux avant la première ligne écrite. Sans donnée personnelle.
    // Aucune ligne semée.
    nom: "notifications_envois, notifications_lancements : journal et jours d'envoi de la brique notifications",
    async appliquer(pool) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS notifications_envois (
          id BIGSERIAL PRIMARY KEY,
          envoye_le TIMESTAMPTZ NOT NULL DEFAULT now(),
          jour DATE NOT NULL,
          source TEXT NOT NULL,
          mode TEXT NOT NULL,
          destinataire TEXT,
          objet TEXT NOT NULL,
          resultat TEXT NOT NULL,
          erreur TEXT,
          CONSTRAINT notifications_envois_mode_check CHECK (mode IN ('reel', 'essai')),
          CONSTRAINT notifications_envois_resultat_check CHECK (resultat IN ('envoye', 'echec', 'sans-destinataire')),
          CONSTRAINT notifications_envois_destinataire_check CHECK (destinataire = lower(btrim(destinataire)))
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS notifications_lancements (
          source TEXT NOT NULL,
          jour DATE NOT NULL,
          lance_le TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (source, jour)
        );
      `);
      await pool.query(
        `CREATE INDEX IF NOT EXISTS notifications_lancements_lance_le_idx ON notifications_lancements (lance_le);`
      );
      await pool.query(`CREATE INDEX IF NOT EXISTS notifications_envois_envoye_le_idx ON notifications_envois (envoye_le);`);
      await pool.query(
        `CREATE INDEX IF NOT EXISTS notifications_envois_destinataire_idx ON notifications_envois (destinataire);`
      );
    },
  },
  {
    // Brique espaces : des groupes de personnes (une coloc, une association)
    // qu'on rejoint par un code. Né de l'essai tours-de-coloc (2026-11-03),
    // où cinq tickets réécrivaient ces tables.
    //
    // Le code n'a que des caractères sans ambiguïté (ni 0, O, 1, I ni L) : la
    // contrainte refuse tout autre code que la brique écrirait. Un espace ne
    // se supprime pas : vide, il revient à la prochaine personne qui le rejoint.
    //
    // Une adhésion terminée reste (départ et motif) : la clé étrangère refuse
    // de supprimer un espace ou un compte qui en a, et rien ne part en cascade.
    // Une seule adhésion en cours par compte et par espace : deux demandes
    // simultanées pour rejoindre n'en créent qu'une. « Un seul espace par
    // compte » est un réglage de l'appli, tenu sous verrou par la brique, pas
    // un index.
    //
    // espaces_invitations compte les invitations envoyées pour les plafonds,
    // sans l'adresse invitée. espaces_essais_code compte les codes faux d'un
    // compte, effacés au-delà d'une heure ; ce ne sont que des compteurs, ils
    // partent avec le compte. Aucune ligne semée.
    nom: "espaces, espaces_adhesions, espaces_invitations, espaces_essais_code : groupes de personnes (brique espaces)",
    async appliquer(pool) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS espaces (
          id SERIAL PRIMARY KEY,
          nom TEXT NOT NULL,
          code TEXT NOT NULL,
          cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT espaces_code_unique UNIQUE (code),
          CONSTRAINT espaces_code_check CHECK (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'),
          CONSTRAINT espaces_nom_check CHECK (length(btrim(nom)) BETWEEN 1 AND 80)
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS espaces_adhesions (
          id SERIAL PRIMARY KEY,
          espace_id INTEGER NOT NULL REFERENCES espaces (id) ON DELETE RESTRICT,
          utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs (id) ON DELETE RESTRICT,
          prenom TEXT NOT NULL,
          role TEXT NOT NULL,
          arrivee_le TIMESTAMPTZ NOT NULL DEFAULT now(),
          depart_le TIMESTAMPTZ,
          motif_depart TEXT,
          CONSTRAINT espaces_adhesions_role_check CHECK (role IN ('gestionnaire', 'membre')),
          CONSTRAINT espaces_adhesions_motif_check CHECK (motif_depart IN ('parti', 'retire', 'compte-desactive')),
          CONSTRAINT espaces_adhesions_depart_check CHECK ((depart_le IS NULL) = (motif_depart IS NULL))
        );
      `);
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS espaces_adhesions_en_cours_idx
          ON espaces_adhesions (espace_id, utilisateur_id) WHERE depart_le IS NULL;
      `);
      await pool.query(
        `CREATE INDEX IF NOT EXISTS espaces_adhesions_utilisateur_idx ON espaces_adhesions (utilisateur_id);`
      );
      await pool.query(`
        CREATE TABLE IF NOT EXISTS espaces_invitations (
          id BIGSERIAL PRIMARY KEY,
          espace_id INTEGER NOT NULL REFERENCES espaces (id) ON DELETE RESTRICT,
          envoyee_le TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await pool.query(
        `CREATE INDEX IF NOT EXISTS espaces_invitations_espace_idx ON espaces_invitations (espace_id, envoyee_le);`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS espaces_invitations_envoyee_le_idx ON espaces_invitations (envoyee_le);`
      );
      await pool.query(`
        CREATE TABLE IF NOT EXISTS espaces_essais_code (
          id BIGSERIAL PRIMARY KEY,
          utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs (id) ON DELETE CASCADE,
          essaye_le TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await pool.query(
        `CREATE INDEX IF NOT EXISTS espaces_essais_code_utilisateur_idx ON espaces_essais_code (utilisateur_id, essaye_le);`
      );
    },
  },
  {
    // Brique journal, action « export » : l'export des données d'une
    // personne par l'admin (brique rgpd), que le journal trace désormais.
    // Le CREATE TABLE de journal_audit est sur main : la contrainte se
    // remplace ici. Seulement si elle n'admet pas encore « export » : la
    // remplacer relit toute la table, ce qu'un redémarrage n'a pas à refaire.
    nom: "journal_audit : action export (export des données d'une personne par l'admin)",
    async appliquer(pool) {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
             WHERE conname = 'journal_audit_action_check'
               AND conrelid = 'journal_audit'::regclass
               AND pg_get_constraintdef(oid) LIKE '%''export''%'
          ) THEN
            ALTER TABLE journal_audit DROP CONSTRAINT IF EXISTS journal_audit_action_check;
            ALTER TABLE journal_audit ADD CONSTRAINT journal_audit_action_check
              CHECK (action IN ('creation', 'modification', 'suppression', 'export'));
          END IF;
        END
        $$;
      `);
    },
  },
];

export async function appliquerMigrations(pool: Pool): Promise<void> {
  for (const migration of MIGRATIONS) {
    try {
      await migration.appliquer(pool);
    } catch (erreur) {
      // Le nom de l'étape en clair dans l'erreur : quand une migration plante
      // au démarrage, c'est TOUTE l'application qui est à terre (incident du
      // 2026-09-04) — chaque seconde de diagnostic compte.
      throw new Error(`Migration « ${migration.nom} » en échec : ${erreur instanceof Error ? erreur.message : String(erreur)}`, {
        cause: erreur,
      });
    }
  }
}
