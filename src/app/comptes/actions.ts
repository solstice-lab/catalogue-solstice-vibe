"use server";

import { revalidatePath } from "next/cache";
import {
  changerRole,
  desactiver,
  fermerDomaine,
  inviter,
  ouvrirDomaine,
  reactiver,
  type Refus,
} from "@/briques/comptes/administration";
import { exiger, exigerConnexionRecente } from "@/briques/comptes/roles";
// Brique journal : chaque geste se trace dans la transaction de son effet.
import { contexteDeLAppli } from "@/briques/comptes/entree";
import { journaliser, type Auteur, type Evenement, type Transaction } from "@/briques/journal/journal";
// Fin de la brique journal.
import type { RetourAdministration } from "@/briques/gestion-comptes/domaine";
import { ENTIER_MAX } from "@/lib/db/bornes";
import { NOM_APP } from "@/lib/navigation";
import { urlPublique } from "@/lib/referencement";

/*
 * Server actions de /comptes. Chacune commence par son garde :
 * une action se poste sans passer par l'écran. Les règles, dont la seconde
 * porte du dernier admin, sont dans briques/comptes/administration.ts. Les
 * valeurs viennent du client : une valeur qui n'a pas le bon type devient
 * une chaîne vide ou un id nul, que les règles refusent.
 */

const texte = (valeur: unknown) => (typeof valeur === "string" ? valeur : "");
// Au-delà du plus grand INTEGER, la base lèverait (page d'erreur) au lieu de
// répondre « introuvable ».
const entier = (valeur: unknown) =>
  Number.isInteger(valeur) && Math.abs(valeur as number) <= ENTIER_MAX ? (valeur as number) : 0;

// Brique journal : la personne que le garde a rendue est l'auteur de la trace.
// Comptes ne peut pas importer le journal, qui l'exige : la trace lui est passée
// pour inviter, changer un rôle, ouvrir et fermer un domaine. Désactiver et
// réactiver passent l'auteur au registre des effets de comptes.
const tracer = (personne: Auteur) => (tx: Transaction, geste: Evenement) => journaliser(tx, personne, geste);
// Fin de la brique journal.

function retour(issue: Refus | undefined): RetourAdministration {
  revalidatePath("/comptes");
  return issue ?? {};
}

// Une invitation donne un rôle, admin compris : comme un changement de rôle,
// elle demande une connexion récente, sans quoi un cookie volé invitait sa
// propre adresse en admin (audit du 2026-11-09).
export async function inviterAction(email: unknown, role: unknown, prevenir: unknown): Promise<RetourAdministration> {
  const personne = await exiger("comptes.administrer");
  const refus = await exigerConnexionRecente("/comptes");
  if (refus) return refus;
  // Sans adresse publique (en local, sur une recette), le mail part sans lien.
  const site = urlPublique();
  const issue = await inviter(
    texte(email),
    texte(role),
    prevenir === true
      ? { nomDeLAppli: NOM_APP, adresseDeConnexion: site ? new URL("/connexion", site).href : null }
      : null,
    tracer(personne)
  );
  revalidatePath("/comptes");
  if ("erreur" in issue) return issue;
  const { email: adresse } = issue.compte;
  if (issue.mail === "parti")
    return { message: `Le compte de ${adresse} est créé, et un mail d'information est parti.` };
  if (issue.mail === "en-echec")
    return { message: `Le compte de ${adresse} est créé, mais le mail n'est pas parti : prévenez la personne.` };
  return { message: `Le compte de ${adresse} est créé : prévenez la personne, elle se connecte avec cette adresse.` };
}

// Un rôle donne des droits : le changer demande une connexion récente, qu'un
// cookie volé n'a pas (audit du 2026-11-09).
export async function changerRoleAction(id: unknown, role: unknown): Promise<RetourAdministration> {
  const personne = await exiger("comptes.administrer");
  const refus = await exigerConnexionRecente("/comptes");
  if (refus) return refus;
  return retour(await changerRole(entier(id), texte(role), contexteDeLAppli(), tracer(personne)));
}

// Ce qu'une désactivation ou une réactivation entraîne ailleurs (l'appartenance
// à un groupe, le journal d'audit si l'appli l'a) se déclare dans
// src/config/effets-comptes.ts, pas ici : la personne rendue par le garde en
// est l'auteur.
export async function desactiverAction(id: unknown): Promise<RetourAdministration> {
  const personne = await exiger("comptes.administrer");
  return retour(await desactiver(entier(id), personne));
}

export async function reactiverAction(id: unknown): Promise<RetourAdministration> {
  const personne = await exiger("comptes.administrer");
  return retour(await reactiver(entier(id), personne));
}

export async function ouvrirDomaineAction(domaine: unknown): Promise<RetourAdministration> {
  const personne = await exiger("comptes.administrer");
  return retour(await ouvrirDomaine(texte(domaine), contexteDeLAppli(), tracer(personne)));
}

export async function fermerDomaineAction(domaine: unknown): Promise<RetourAdministration> {
  const personne = await exiger("comptes.administrer");
  return retour(await fermerDomaine(texte(domaine), contexteDeLAppli(), tracer(personne)));
}
