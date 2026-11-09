"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  creerDossier,
  modifierDossier,
  referenceDejaPrise,
  supprimerDossiers,
  type ChampsDossier,
} from "@/lib/db/dossiers";
import { ENTIER_MAX } from "@/lib/db/bornes";
import { estRefusDeLaBase } from "@/lib/db/client";
import { estDateIso } from "@/lib/date-iso";
import {
  centimesVersEurosSaisie,
  estIdDossier,
  estStatutDossier,
  eurosSaisisVersCentimes,
  LONGUEUR_MAX_DOSSIER,
} from "@/lib/dossiers-domaine";
import { exiger } from "@/briques/comptes/roles";
import { cheminDossier } from "@/lib/slug";

/*
 * Server actions du module dossiers. Chacune commence par le garde d'accès
 * (briques/comptes/roles.ts) : une action se poste sans passer par l'écran, le garde de
 * la page ne la protège pas.
 *
 * Les BORNES font partie du patron : tout ce que la base refuserait en levant
 * (INTEGER, DATE, unicité) est refusé ici par un message de formulaire, jamais
 * laissé à la base (audit du 2026-11-09 : la page d'erreur au lieu d'un message).
 */

export type EtatFormulaireDossier = { erreur?: string };

const MESSAGE_INTROUVABLE = "Dossier introuvable — il a peut-être été supprimé entre-temps.";

// La validation est la même à la création et à la modification — c'est elle
// (avec le formulaire partagé) qui garantit la parité fiche/formulaire.
function validerChamps(formData: FormData): { champs: ChampsDossier } | { erreur: string } {
  const reference = String(formData.get("reference") ?? "").trim();
  const client = String(formData.get("client") ?? "").trim();
  const montantSaisi = String(formData.get("montant") ?? "").trim();
  const statut = String(formData.get("statut") ?? "");
  const echeance = String(formData.get("echeance") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!reference) return { erreur: "La référence est obligatoire." };
  if (reference.length > LONGUEUR_MAX_DOSSIER.reference) {
    return { erreur: `La référence ne peut pas dépasser ${LONGUEUR_MAX_DOSSIER.reference} caractères.` };
  }
  if (!client) return { erreur: "Le client est obligatoire." };
  if (client.length > LONGUEUR_MAX_DOSSIER.client) {
    return { erreur: `Le client ne peut pas dépasser ${LONGUEUR_MAX_DOSSIER.client} caractères.` };
  }
  const montant_centimes = montantSaisi === "" ? 0 : eurosSaisisVersCentimes(montantSaisi);
  if (montant_centimes === null) {
    return { erreur: `Montant illisible : « ${montantSaisi} » (attendu : 12 500 ou 12 500,50).` };
  }
  // Un dossier est un montant à gagner : un montant négatif (avoir) serait une autre
  // notion. La borne haute est celle de la colonne INTEGER.
  if (montant_centimes < 0) return { erreur: "Le montant ne peut pas être négatif." };
  if (montant_centimes > ENTIER_MAX) {
    return { erreur: `Montant trop élevé (maximum : ${centimesVersEurosSaisie(ENTIER_MAX)} €).` };
  }
  if (!estStatutDossier(statut)) return { erreur: "Statut inconnu." };
  // estDateIso, pas la seule forme : « 2026-06-31 » passe le motif puis fait lever la base.
  if (echeance !== "" && !estDateIso(echeance)) {
    return { erreur: "Échéance illisible (attendu : une date existante, aaaa-mm-jj)." };
  }
  if (notes.length > LONGUEUR_MAX_DOSSIER.notes) {
    return { erreur: `Les notes ne peuvent pas dépasser ${LONGUEUR_MAX_DOSSIER.notes} caractères.` };
  }

  return {
    champs: {
      reference,
      client,
      montant_centimes,
      statut,
      echeance: echeance === "" ? null : echeance,
      notes: notes === "" ? null : notes,
    },
  };
}

// Le pré-contrôle (referenceDejaPrise) donne le message vite, mais il ne ferme pas la
// course : deux créations simultanées le passent toutes les deux, et la seconde écriture
// lève la violation d'unicité. C'est la contrainte de la base qui tranche, traduite ici.
const referenceExisteDeja = (reference: string) => ({ erreur: `La référence « ${reference} » existe déjà.` });
const estDoublonDeReference = (erreur: unknown) => estRefusDeLaBase(erreur, ["23505"], "dossiers_reference_key");

export async function creerDossierAction(
  _etat: EtatFormulaireDossier,
  formData: FormData
): Promise<EtatFormulaireDossier> {
  await exiger("dossiers.acceder");
  const resultat = validerChamps(formData);
  if ("erreur" in resultat) return resultat;
  if (await referenceDejaPrise(resultat.champs.reference)) return referenceExisteDeja(resultat.champs.reference);
  let dossier;
  try {
    dossier = await creerDossier(resultat.champs);
  } catch (erreur) {
    if (estDoublonDeReference(erreur)) return referenceExisteDeja(resultat.champs.reference);
    throw erreur;
  }
  revalidatePath("/dossiers");
  redirect(cheminDossier(dossier));
}

export async function modifierDossierAction(
  id: number,
  _etat: EtatFormulaireDossier,
  formData: FormData
): Promise<EtatFormulaireDossier> {
  await exiger("dossiers.acceder");
  // Un id posté à la main hors de l'INTEGER ferait lever la base : introuvable, comme un id absent.
  if (!estIdDossier(id)) return { erreur: MESSAGE_INTROUVABLE };
  const resultat = validerChamps(formData);
  if ("erreur" in resultat) return resultat;
  if (await referenceDejaPrise(resultat.champs.reference, id)) return referenceExisteDeja(resultat.champs.reference);
  let dossier;
  try {
    dossier = await modifierDossier(id, resultat.champs);
  } catch (erreur) {
    if (estDoublonDeReference(erreur)) return referenceExisteDeja(resultat.champs.reference);
    throw erreur;
  }
  if (!dossier) return { erreur: MESSAGE_INTROUVABLE };
  revalidatePath("/dossiers");
  redirect(cheminDossier(dossier));
}

// Suppression individuelle (action annexe de la FICHE).
export async function supprimerDossierAction(id: number): Promise<void> {
  await exiger("dossiers.acceder");
  await supprimerDossiers([id].filter(estIdDossier));
  revalidatePath("/dossiers");
  redirect("/dossiers");
}

// Suppression en lot (geste de masse : il appartient à la LISTE, pas à la
// fiche — voir la règle de répartition dans le CLAUDE.md). Un id hors plage ne
// désigne aucun dossier : on l'écarte, les autres partent.
export async function supprimerDossiersAction(ids: number[]): Promise<void> {
  await exiger("dossiers.acceder");
  await supprimerDossiers(Array.isArray(ids) ? ids.filter(estIdDossier) : []);
  revalidatePath("/dossiers");
}
