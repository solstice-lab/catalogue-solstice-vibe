"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exiger } from "@/briques/comptes/roles";
import { choisirEspace, monEspace } from "@/briques/espaces/acces";
import type { Refus, RetourEspace } from "@/briques/espaces/domaine";
import {
  creerEspace,
  nommerGestionnaire,
  quitter,
  regenererCode,
  rejoindre,
  retirerGestionnaire,
  retirerMembre,
} from "@/briques/espaces/espaces";
import { inviterParEmail } from "@/briques/espaces/invitations";
import { ESPACES } from "@/config/espaces";
import { ENTIER_MAX } from "@/lib/db/bornes";
import { NOM_APP } from "@/lib/navigation";
import { urlPublique } from "@/lib/referencement";

/*
 * Server actions de /espace (brique espaces). Chacune commence par son garde :
 * une action se poste sans passer par l'écran. Les règles, dont le dernier
 * gestionnaire protégé sous verrou, sont dans briques/espaces/espaces.ts.
 *
 * L'espace d'un geste n'est jamais lu dans ce que poste le client : c'est celui
 * de la personne connectée (monEspace), relu en base. Le membre visé, lui,
 * vient de l'écran : la brique vérifie qu'il est de cet espace. Une valeur qui
 * n'a pas le bon type devient une chaîne vide ou un id nul, que les règles
 * refusent.
 */

const texte = (valeur: unknown) => (typeof valeur === "string" ? valeur : "");
// Au-delà du plus grand INTEGER, la base lèverait (page d'erreur) au lieu de
// répondre « introuvable ».
const entier = (valeur: unknown) =>
  Number.isInteger(valeur) && Math.abs(valeur as number) <= ENTIER_MAX ? (valeur as number) : 0;

const SANS_ESPACE: Refus = { erreur: `Vous ne faites plus partie ${ESPACES.vocabulaire.du}.` };

function retour(issue: Refus | undefined, message?: string): RetourEspace {
  revalidatePath("/espace");
  return issue ?? (message ? { message } : {});
}

export async function creerAction(nom: unknown, prenom: unknown): Promise<RetourEspace> {
  const personne = await exiger("espaces.participer");
  const issue = await creerEspace(personne, { nom: texte(nom), prenom: texte(prenom) });
  if ("erreur" in issue) return issue;
  if (ESPACES.plusieursParCompte) await choisirEspace(personne, issue.espace.id);
  redirect("/espace");
}

export async function rejoindreAction(code: unknown, prenom: unknown): Promise<RetourEspace> {
  const personne = await exiger("espaces.participer");
  const issue = await rejoindre(personne, { code: texte(code), prenom: texte(prenom) });
  if ("erreur" in issue) return issue;
  if (ESPACES.plusieursParCompte) await choisirEspace(personne, issue.espace.id);
  redirect("/espace");
}

export async function quitterAction(): Promise<RetourEspace> {
  const personne = await exiger("espaces.participer");
  const courant = await monEspace();
  if (!courant) return SANS_ESPACE;
  const issue = await quitter(personne, courant.espace.id);
  if (issue) return issue;
  redirect("/espace/rejoindre");
}

export async function retirerAction(adhesionId: unknown): Promise<RetourEspace> {
  const personne = await exiger("espaces.participer");
  const courant = await monEspace();
  if (!courant) return SANS_ESPACE;
  return retour(await retirerMembre(personne, courant.espace.id, entier(adhesionId)));
}

export async function nommerAction(adhesionId: unknown): Promise<RetourEspace> {
  const personne = await exiger("espaces.participer");
  const courant = await monEspace();
  if (!courant) return SANS_ESPACE;
  return retour(await nommerGestionnaire(personne, courant.espace.id, entier(adhesionId)));
}

export async function retirerGestionnaireAction(adhesionId: unknown): Promise<RetourEspace> {
  const personne = await exiger("espaces.participer");
  const courant = await monEspace();
  if (!courant) return SANS_ESPACE;
  return retour(await retirerGestionnaire(personne, courant.espace.id, entier(adhesionId)));
}

export async function regenererAction(): Promise<RetourEspace> {
  const personne = await exiger("espaces.participer");
  const courant = await monEspace();
  if (!courant) return SANS_ESPACE;
  const issue = await regenererCode(personne, courant.espace.id);
  return "erreur" in issue ? issue : retour(undefined, "Nouveau code créé : l'ancien ne marche plus.");
}

export async function inviterAction(adresse: unknown): Promise<RetourEspace> {
  const personne = await exiger("espaces.participer");
  const courant = await monEspace();
  if (!courant) return SANS_ESPACE;
  // Sans adresse publique (en local, sur une recette), le mail part sans lien.
  return inviterParEmail(personne, courant.espace.id, texte(adresse), { nomDeLAppli: NOM_APP, site: urlPublique() });
}

export async function choisirAction(espaceId: unknown): Promise<RetourEspace> {
  const personne = await exiger("espaces.participer");
  return retour(await choisirEspace(personne, entier(espaceId)));
}
