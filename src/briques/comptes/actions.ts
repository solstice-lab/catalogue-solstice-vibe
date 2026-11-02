"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { METHODES } from "@/config/comptes";
import { adresseDuVisiteur } from "@/lib/adresse-ip";
import { adresseValide, connecterParCode, demanderUnCode, ESSAIS_MAX, type ResultatConnexion } from "./code-email";
import { entrerEnDemo } from "./demo";
import { normaliser } from "./entree";
import { cheminDeRetour } from "./retour";
import { fermerSession } from "./session";

/*
 * Les actions de la brique, sans garde : elles décident de qui l'on est,
 * aucun rôle ne peut les précéder. Chacune vérifie ce qu'elle reçoit.
 */

// Depuis /connexion, le formulaire porte « retour » : on y renvoie, filtré.
// Depuis le bandeau, on reste sur la page, qui se recharge avec le rôle joué.
export async function entrerEnDemoAction(donnees: FormData): Promise<void> {
  if (!(await entrerEnDemo(String(donnees.get("role") ?? "")))) return;
  revalidatePath("/", "layout");
  if (donnees.has("retour")) redirect(cheminDeRetour(String(donnees.get("retour"))));
}

export async function seDeconnecterAction(): Promise<void> {
  await fermerSession();
  redirect("/connexion");
}

/*
 * La connexion par code, en deux étapes sur le même écran. Aucun
 * message ne dit si l'adresse a un compte : ce serait offrir la liste des
 * personnes admises à qui la demande.
 */
export type EtatCode = {
  // L'adresse à laquelle un code vient d'être demandé : l'écran passe au code.
  email?: string;
  // L'instant de la dernière demande, pour bloquer « Renvoyer » une minute.
  envoyeLe?: number;
  erreur?: string;
};

const PAS_PROPOSEE = "Cette façon de se connecter n'est pas proposée par l'appli.";

export async function demanderCodeAction(etat: EtatCode, donnees: FormData): Promise<EtatCode> {
  // Une action se poste sans passer par l'écran.
  if (!METHODES.includes("code-email")) return { erreur: PAS_PROPOSEE };
  const email = normaliser(String(donnees.get("email") ?? ""));
  if (!adresseValide(email)) return { erreur: "Adresse e-mail invalide." };
  const resultat = await demanderUnCode(email, adresseDuVisiteur(await headers()), (tache) => after(tache));
  // Limite atteinte : l'état précédent est gardé. Sur un renvoi, on reste à
  // l'étape du code, et celui déjà reçu reste valable.
  if (resultat === "limite") return { ...etat, erreur: "Trop de demandes de code. Réessayez dans quelques minutes." };
  return { email, envoyeLe: Date.now() };
}

const REFUS: Record<Exclude<ResultatConnexion, "connecte">, string> = {
  incorrect: "Code incorrect.",
  epuise: `Code invalidé après ${ESSAIS_MAX} essais. Demandez-en un nouveau.`,
  expire: "Ce code a expiré ou a déjà servi. Demandez-en un nouveau.",
  acces: "Cette adresse n'a pas accès à l'appli. Contacter l'équipe technique.",
  limite: "Trop d'essais depuis votre connexion. Réessayez dans une heure.",
};

export async function verifierCodeAction(etat: EtatCode, donnees: FormData): Promise<EtatCode> {
  if (!METHODES.includes("code-email")) return { erreur: PAS_PROPOSEE };
  const email = normaliser(String(donnees.get("email") ?? ""));
  const resultat = await connecterParCode(email, String(donnees.get("code") ?? ""), adresseDuVisiteur(await headers()));
  if (resultat !== "connecte") return { ...etat, email, erreur: REFUS[resultat] };
  revalidatePath("/", "layout");
  // Le retour est refiltré ici : le champ caché se réécrit dans le navigateur.
  redirect(cheminDeRetour(String(donnees.get("retour") ?? "")));
}
