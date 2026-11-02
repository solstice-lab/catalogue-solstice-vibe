-- Schéma INITIAL de la base — l'état de départ d'une base neuve, rien d'autre.
--
-- Règle absolue (incident du 2026-09-04, application entière à terre) :
-- un CREATE TABLE déjà fusionné sur main NE SE RETOUCHE PLUS, même si « le
-- module n'est pas encore livré » — chaque fusion déploie, la table existe
-- donc déjà en prod et CREATE TABLE IF NOT EXISTS ne la corrigera jamais.
-- Toute évolution (colonne, index sur colonne ajoutée après coup, contrainte)
-- passe par une étape de src/lib/db/migrations.ts.
--
-- Ce fichier est rejoué à chaque démarrage (CREATE TABLE IF NOT EXISTS) : il
-- doit rester idempotent et ne jamais référencer une colonne créée par une
-- migration.

-- Module d'exemple « dossiers » : le modèle canonique d'un module métier
-- (liste + fiche en lecture seule + /nouveau + /modifier). À remplacer par
-- les vraies tables du projet client — après avoir lu le patron.
CREATE TABLE IF NOT EXISTS dossiers (
  id SERIAL PRIMARY KEY,
  -- Référence métier, unique : c'est elle qui identifie le dossier pour les
  -- humains et pour les imports (clé d'upsert), jamais l'id technique.
  reference TEXT NOT NULL UNIQUE,
  client TEXT NOT NULL,
  -- Montants TOUJOURS en centimes entiers : les flottants perdent des
  -- centimes en s'additionnant, et un montant faux se voit trop tard.
  montant_centimes INTEGER NOT NULL DEFAULT 0,
  statut TEXT NOT NULL DEFAULT 'en_cours'
    CHECK (statut IN ('en_cours', 'gagne', 'perdu')),
  echeance DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
