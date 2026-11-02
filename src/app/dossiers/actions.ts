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
import { estStatutDossier, eurosSaisisVersCentimes } from "@/lib/dossiers-domaine";
import { exiger } from "@/briques/comptes/roles";
import { cheminDossier } from "@/lib/slug";

/*
 * Server actions du module dossiers. Chacune commence par le garde d'accès
 * (briques/comptes/roles.ts) : une action se poste sans passer par l'écran, le garde de
 * la page ne la protège pas.
 */

export type EtatFormulaireDossier = { erreur?: string };

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
  if (!client) return { erreur: "Le client est obligatoire." };
  const montant_centimes = montantSaisi === "" ? 0 : eurosSaisisVersCentimes(montantSaisi);
  if (montant_centimes === null) {
    return { erreur: `Montant illisible : « ${montantSaisi} » (attendu : 12 500 ou 12 500,50).` };
  }
  if (!estStatutDossier(statut)) return { erreur: "Statut inconnu." };
  if (echeance !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(echeance)) {
    return { erreur: "Échéance illisible (attendu : aaaa-mm-jj)." };
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

export async function creerDossierAction(
  _etat: EtatFormulaireDossier,
  formData: FormData
): Promise<EtatFormulaireDossier> {
  await exiger("dossiers.acceder");
  const resultat = validerChamps(formData);
  if ("erreur" in resultat) return resultat;
  if (await referenceDejaPrise(resultat.champs.reference)) {
    return { erreur: `La référence « ${resultat.champs.reference} » existe déjà.` };
  }
  const dossier = await creerDossier(resultat.champs);
  revalidatePath("/dossiers");
  redirect(cheminDossier(dossier));
}

export async function modifierDossierAction(
  id: number,
  _etat: EtatFormulaireDossier,
  formData: FormData
): Promise<EtatFormulaireDossier> {
  await exiger("dossiers.acceder");
  const resultat = validerChamps(formData);
  if ("erreur" in resultat) return resultat;
  if (await referenceDejaPrise(resultat.champs.reference, id)) {
    return { erreur: `La référence « ${resultat.champs.reference} » existe déjà.` };
  }
  const dossier = await modifierDossier(id, resultat.champs);
  if (!dossier) return { erreur: "Dossier introuvable — il a peut-être été supprimé entre-temps." };
  revalidatePath("/dossiers");
  redirect(cheminDossier(dossier));
}

// Suppression individuelle (action annexe de la FICHE).
export async function supprimerDossierAction(id: number): Promise<void> {
  await exiger("dossiers.acceder");
  await supprimerDossiers([id]);
  revalidatePath("/dossiers");
  redirect("/dossiers");
}

// Suppression en lot (geste de masse : il appartient à la LISTE, pas à la
// fiche — voir la règle de répartition dans le CLAUDE.md).
export async function supprimerDossiersAction(ids: number[]): Promise<void> {
  await exiger("dossiers.acceder");
  await supprimerDossiers(ids);
  revalidatePath("/dossiers");
}
