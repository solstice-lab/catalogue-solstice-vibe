"use server";

import { exiger } from "@/briques/comptes/roles";
import { apercevoirEffacement, effacerDonnees, type BilanEffacement } from "@/briques/rgpd/effacement";
import { adresseLisible, normaliserAdresse } from "@/briques/rgpd/export";
// Brique journal : l'anonymisation d'un compte se trace dans la transaction de l'effacement.
import { journaliser, type Auteur, type Evenement, type Transaction } from "@/briques/journal/journal";
// Fin de la brique journal.
import { transaction } from "@/lib/db/client";

/*
 * Server actions de l'effacement des données d'une personne, sur
 * /donnees-personnelles. Chacune commence par son garde : une action se poste
 * sans passer par l'écran. Les règles (dernier admin, ses propres données)
 * sont dans la brique rgpd et dans chaque source ; ici, la lecture des valeurs
 * venues du client et la confirmation.
 */

export type RetourEffacement = { bilan: BilanEffacement } | { erreur: string };

const ILLISIBLE = { erreur: "Adresse e-mail illisible : attendu nom@domaine.ext." };

const adresseDe = (valeur: unknown) => normaliserAdresse(typeof valeur === "string" ? valeur : "");

// Brique journal : la personne que le garde a rendue est l'auteur de la trace.
const tracer = (personne: Auteur) => (tx: Transaction, geste: Evenement) => journaliser(tx, personne, geste);
// Fin de la brique journal.

export async function apercevoirEffacementAction(adresse: unknown): Promise<RetourEffacement> {
  const personne = await exiger("donnees.effacer");
  const cible = adresseDe(adresse);
  if (!adresseLisible(cible)) return ILLISIBLE;
  const issue = await apercevoirEffacement(cible, { transaction, demandeur: personne.email });
  return "erreur" in issue ? issue : { bilan: issue };
}

// L'adresse retapée dans la Modale doit être celle de l'aperçu : un geste qui
// ne se rattrape pas ne part pas sur une adresse lue de travers.
export async function effacerAction(adresse: unknown, confirmation: unknown): Promise<RetourEffacement> {
  const personne = await exiger("donnees.effacer");
  const cible = adresseDe(adresse);
  if (!adresseLisible(cible)) return ILLISIBLE;
  if (adresseDe(confirmation) !== cible) {
    return { erreur: "L'adresse retapée n'est pas celle de l'aperçu : rien n'a été effacé." };
  }
  const issue = await effacerDonnees(cible, {
    transaction,
    demandeur: personne.email,
    // Brique journal.
    trace: tracer(personne),
  });
  return "erreur" in issue ? issue : { bilan: issue };
}
