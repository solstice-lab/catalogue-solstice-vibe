// Import d'exemple : des dossiers depuis un export CSV (colonnes attendues :
// Référence, Client, Montant, Statut, Échéance, Notes — seule Référence est
// obligatoire). C'est le MODÈLE à copier pour chaque import réel : en copier
// le squelette, jamais le contourner.
//
// Le protocole (voir scripts/lib/cli.ts pour les règles complètes) :
//   npx tsx --env-file=.env.local scripts/exemple-import.ts --fichier="export.csv"                (dry-run)
//   npx tsx --env-file=.env.local scripts/exemple-import.ts --fichier="export.csv" --confirmer    (écrit)
//   ... --vider --confirmer   (vide la table AVANT, pour rejouer l'import de zéro)
//
// Contre la prod : --env-file=.env.prod, lancé À LA MAIN après relecture du
// dry-run — jamais par un agent.
//
// Additif et idempotent : un dossier existant (même référence) n'est jamais
// écrasé — ses champs vides se complètent, ses champs pleins se gardent, les
// valeurs CSV en conflit partent dans le rapport. Relancer l'import sur une
// base déjà importée ne change rien.

import fs from "node:fs";
import { query, queryOne } from "../src/lib/db/client";
import {
  estStatutDossier,
  eurosSaisisVersCentimes,
  LIBELLES_STATUT_DOSSIER,
  STATUTS_DOSSIER,
  type StatutDossier,
} from "../src/lib/dossiers-domaine";
import {
  afficherRapport,
  argumentTexte,
  drapeauPresent,
  modeEcriture,
  nouveauRapport,
  parserCsv,
  valeurRetenue,
} from "./lib/cli";

// « Gagné » (libellé) comme « gagne » (clé) sont acceptés : les exports
// manuels portent l'un ou l'autre selon l'outil d'origine.
function statutDepuisCsv(valeur: string): StatutDossier | null {
  const brut = valeur.trim();
  if (brut === "") return "en_cours";
  if (estStatutDossier(brut)) return brut;
  const parLibelle = STATUTS_DOSSIER.find(
    (statut) => LIBELLES_STATUT_DOSSIER[statut].toLowerCase() === brut.toLowerCase()
  );
  return parLibelle ?? null;
}

// Dates FR (« 02/10/2026 ») et ISO (« 2026-10-02 ») acceptées, stockage ISO.
function dateDepuisCsv(valeur: string): string | null | undefined {
  const brut = valeur.trim();
  if (brut === "") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(brut)) return brut;
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(brut);
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  return undefined; // illisible
}

async function principal() {
  const chemin = argumentTexte("fichier");
  if (!chemin) {
    console.error(
      'Usage : npx tsx --env-file=<env> scripts/exemple-import.ts --fichier="export.csv" [--confirmer] [--vider]'
    );
    process.exit(1);
  }
  const ecriture = modeEcriture();
  const rapport = nouveauRapport();

  const [entete, ...lignes] = parserCsv(fs.readFileSync(chemin, "utf-8"));
  const colonne = (nom: string) => entete.findIndex((titre) => titre.trim().toLowerCase() === nom.toLowerCase());
  const iReference = colonne("Référence");
  const iClient = colonne("Client");
  const iMontant = colonne("Montant");
  const iStatut = colonne("Statut");
  const iEcheance = colonne("Échéance");
  const iNotes = colonne("Notes");
  if (iReference === -1) {
    console.error("Colonne « Référence » introuvable dans l'en-tête du CSV.");
    process.exit(1);
  }

  if (drapeauPresent("vider")) {
    if (ecriture) {
      await query(`DELETE FROM dossiers`);
      console.log("Table dossiers vidée (--vider).");
    } else {
      console.log("--vider demandé : la table serait vidée avant l'import (dry-run).");
    }
  }

  for (const [index, ligne] of lignes.entries()) {
    const numeroLigne = index + 2; // 1-indexé + en-tête
    const reference = (ligne[iReference] ?? "").trim();
    if (!reference) {
      rapport.illisibles.push({ ligne: numeroLigne, raison: "référence vide" });
      continue;
    }
    const statut = statutDepuisCsv(ligne[iStatut] ?? "");
    if (statut === null) {
      rapport.illisibles.push({ ligne: numeroLigne, raison: `statut inconnu « ${ligne[iStatut]} »` });
      continue;
    }
    const echeance = dateDepuisCsv(ligne[iEcheance] ?? "");
    if (echeance === undefined) {
      rapport.illisibles.push({ ligne: numeroLigne, raison: `échéance illisible « ${ligne[iEcheance]} »` });
      continue;
    }
    const montantCsv = (ligne[iMontant] ?? "").trim();
    const montantCentimes = montantCsv === "" ? null : eurosSaisisVersCentimes(montantCsv.replace(/[€$]/g, ""));
    if (montantCsv !== "" && montantCentimes === null) {
      rapport.illisibles.push({ ligne: numeroLigne, raison: `montant illisible « ${montantCsv} »` });
      continue;
    }
    const client = (ligne[iClient] ?? "").trim();
    const notes = (ligne[iNotes] ?? "").trim();

    const existant = await queryOne<{
      id: number;
      client: string;
      montant_centimes: number;
      echeance: string | null;
      notes: string | null;
    }>(`SELECT id, client, montant_centimes, echeance::text, notes FROM dossiers WHERE reference = $1`, [reference]);

    if (!existant) {
      if (!client) {
        rapport.illisibles.push({ ligne: numeroLigne, raison: "client vide sur un dossier à créer" });
        continue;
      }
      if (ecriture) {
        await query(
          `INSERT INTO dossiers (reference, client, montant_centimes, statut, echeance, notes)
             VALUES ($1, $2, $3, $4, $5, $6)`,
          [reference, client, montantCentimes ?? 0, statut, echeance, notes || null]
        );
      }
      rapport.crees.push(reference);
      continue;
    }

    // Dossier déjà en base : complétion additive, champ par champ. Le statut
    // et le montant existants ne se touchent JAMAIS (une valeur métier déjà
    // saisie fait foi) ; client, échéance et notes se complètent s'ils sont
    // vides, les conflits partent au rapport.
    const fusionClient = valeurRetenue(existant.client, client);
    const fusionEcheance = valeurRetenue(existant.echeance, echeance);
    const fusionNotes = valeurRetenue(existant.notes, notes);
    for (const [champ, fusion] of [
      ["client", fusionClient],
      ["échéance", fusionEcheance],
      ["notes", fusionNotes],
    ] as const) {
      if (fusion.ecartee) rapport.ecartes.push({ cle: reference, champ, valeur: fusion.ecartee });
    }
    const aCompleter =
      fusionClient.valeur !== existant.client ||
      fusionEcheance.valeur !== existant.echeance ||
      fusionNotes.valeur !== existant.notes;
    if (aCompleter) {
      if (ecriture) {
        await query(`UPDATE dossiers SET client = $2, echeance = $3, notes = $4 WHERE id = $1`, [
          existant.id,
          fusionClient.valeur,
          fusionEcheance.valeur,
          fusionNotes.valeur,
        ]);
      }
      rapport.completes.push(reference);
    } else {
      rapport.inchanges++;
    }
  }

  afficherRapport(rapport, ecriture);
  process.exit(0);
}

principal().catch((erreur) => {
  console.error(erreur);
  process.exit(1);
});
