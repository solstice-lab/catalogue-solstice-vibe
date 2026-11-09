"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { METHODES } from "@/config/comptes";
import { adresseDuVisiteur } from "@/lib/adresse-ip";
import { adresseValide, connecterParCode, demanderUnCode, ESSAIS_MAX, type ResultatConnexion } from "./code-email";
import { entrerEnDemo } from "./demo";
import { normaliser } from "./entree";
import { adresseDesLiens, CHEMIN_LIEN, connecterParLien, demanderUnLien } from "./lien-email";
import { cheminDeRetour } from "./retour";
import { exigerConnexionRecente, utilisateurCourant } from "./roles";
import { fermerLesAutresSessions, fermerSession } from "./session";

/*
 * Les actions de la brique, sans garde : elles décident de qui l'on est,
 * aucun rôle ne peut les précéder. Chacune vérifie ce qu'elle reçoit.
 */

/*
 * « Fermer mes autres sessions » : la personne connectée ferme ses sessions
 * des autres navigateurs et appareils (un poste partagé, un téléphone perdu,
 * un cookie volé). Aucun rôle ne la garde, chacun gère les siennes : la
 * brique ne déclare aucune action dans src/config/acces.ts, d'où la personne
 * connectée exigée ici comme exiger() le ferait (un 404 sans elle). La
 * connexion récente aussi : sinon, un cookie volé fermerait la session de la
 * personne à qui il a été volé. « retour » est l'écran qui la propose.
 */
export type EtatAutresSessions = { message?: string; erreur?: string; reconnexion?: string };

export async function fermerMesAutresSessionsAction(
  _etat: EtatAutresSessions,
  donnees: FormData
): Promise<EtatAutresSessions> {
  if (!(await utilisateurCourant())) notFound();
  const retour = cheminDeRetour(String(donnees.get("retour") ?? ""));
  const refus = await exigerConnexionRecente(retour);
  if (refus) return refus;
  const fermees = await fermerLesAutresSessions();
  revalidatePath(retour);
  if (fermees === 0) return { message: "Aucune autre session n'était ouverte." };
  const s = fermees > 1 ? "s" : "";
  return {
    message: `${fermees} autre${s} session${s} fermée${s} : ce compte n'est plus ouvert que dans ce navigateur.`,
  };
}

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

// « Se reconnecter », après le refus d'un geste faute de connexion récente
// (exigerConnexionRecente de roles.ts). La session se ferme d'abord :
// /connexion et la page du lien renvoient une personne déjà connectée vers son
// retour sans rien lui redemander, et un simple lien ramenait au geste
// refusé, en boucle. « retour », l'écran du geste, est refiltré ici.
export async function seReconnecterAction(donnees: FormData): Promise<void> {
  const retour = cheminDeRetour(String(donnees.get("retour") ?? ""));
  await fermerSession();
  redirect(retour === "/" ? "/connexion" : `/connexion?${new URLSearchParams({ retour })}`);
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

/*
 * La connexion par lien. La demande a la forme de celle du code : même
 * réponse, que l'adresse ait un compte ou non. L'envoi du bouton « Me
 * connecter » (page /connexion/lien) est un POST : jamais l'ouverture du lien.
 */
export type EtatLien = {
  // L'adresse à laquelle un lien vient d'être demandé : l'écran le dit.
  email?: string;
  envoyeLe?: number;
  erreur?: string;
};

export async function demanderLienAction(etat: EtatLien, donnees: FormData): Promise<EtatLien> {
  if (!METHODES.includes("lien-email")) return { erreur: PAS_PROPOSEE };
  const email = normaliser(String(donnees.get("email") ?? ""));
  if (!adresseValide(email)) return { erreur: "Adresse e-mail invalide." };
  const enTetes = await headers();
  const origine = adresseDesLiens(enTetes);
  if (!origine)
    return {
      ...etat,
      erreur:
        "Connexion par lien non configurée : URL_PUBLIQUE manque (voir le README de la brique comptes). Contacter l'équipe technique.",
    };
  const resultat = await demanderUnLien(
    email,
    adresseDuVisiteur(enTetes),
    origine,
    String(donnees.get("retour") ?? ""),
    (tache) => after(tache)
  );
  if (resultat === "limite") return { ...etat, erreur: "Trop de demandes de lien. Réessayez dans quelques minutes." };
  return { email, envoyeLe: Date.now() };
}

export async function connecterParLienAction(donnees: FormData): Promise<void> {
  if (!METHODES.includes("lien-email")) redirect("/connexion");
  // Le retour est refiltré ici, comme pour le code : le champ caché se
  // réécrit dans le navigateur.
  const retour = cheminDeRetour(String(donnees.get("retour") ?? ""));
  const resultat = await connecterParLien(String(donnees.get("jeton") ?? ""), adresseDuVisiteur(await headers()));
  if (resultat !== "connecte") {
    // La page du lien, sans jeton : elle dit pourquoi et propose d'en recevoir
    // un nouveau, qui garde le chemin de retour.
    const vers = new URLSearchParams({ erreur: resultat });
    if (retour !== "/") vers.set("retour", retour);
    redirect(`${CHEMIN_LIEN}?${vers}`);
  }
  revalidatePath("/", "layout");
  redirect(retour);
}
