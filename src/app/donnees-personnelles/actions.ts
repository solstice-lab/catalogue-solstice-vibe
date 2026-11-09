"use server";

import { exiger, exigerConnexionRecente } from "@/briques/comptes/roles";
import { apercevoirEffacement, effacerDonnees, type BilanEffacement } from "@/briques/rgpd/effacement";
import { adresseLisible, normaliserAdresse } from "@/briques/rgpd/export";
import { transaction } from "@/lib/db/client";

/*
 * Server actions de l'effacement des données d'une personne, sur
 * /donnees-personnelles. Chacune commence par son garde : une action se poste
 * sans passer par l'écran. Les règles (dernier admin, ses propres données)
 * sont dans la brique rgpd et dans chaque source ; ici, la lecture des valeurs
 * venues du client et la confirmation.
 */

// `reconnexion` accompagne le refus faute de connexion récente : l'écran où
// ramène le bouton « Se reconnecter ».
export type RetourEffacement = { bilan: BilanEffacement } | { erreur: string; reconnexion?: string };

const ILLISIBLE = { erreur: "Adresse e-mail illisible : attendu nom@domaine.ext." };

const adresseDe = (valeur: unknown) => normaliserAdresse(typeof valeur === "string" ? valeur : "");

// Un effacement ne se rattrape pas : il demande une connexion récente, qu'un
// cookie volé n'a pas (audit du 2026-11-09). Dès l'aperçu, pour que le refus
// arrive avant que l'admin ait lu et retapé l'adresse ; et de nouveau à
// l'effacement, la connexion ayant pu vieillir entre les deux.
const ECRAN = "/donnees-personnelles";

export async function apercevoirEffacementAction(adresse: unknown): Promise<RetourEffacement> {
  const personne = await exiger("donnees.effacer");
  const refus = await exigerConnexionRecente(ECRAN);
  if (refus) return refus;
  const cible = adresseDe(adresse);
  if (!adresseLisible(cible)) return ILLISIBLE;
  const issue = await apercevoirEffacement(cible, { transaction, demandeur: personne.email });
  return "erreur" in issue ? issue : { bilan: issue };
}

// L'adresse retapée dans la Modale doit être celle de l'aperçu : un geste qui
// ne se rattrape pas ne part pas sur une adresse lue de travers.
export async function effacerAction(adresse: unknown, confirmation: unknown): Promise<RetourEffacement> {
  const personne = await exiger("donnees.effacer");
  const refus = await exigerConnexionRecente(ECRAN);
  if (refus) return refus;
  const cible = adresseDe(adresse);
  if (!adresseLisible(cible)) return ILLISIBLE;
  if (adresseDe(confirmation) !== cible) {
    return { erreur: "L'adresse retapée n'est pas celle de l'aperçu : rien n'a été effacé." };
  }
  // Ce que l'effacement d'un compte entraîne ailleurs (un module, le journal
  // d'audit si l'appli l'a) passe par le registre des effets de comptes
  // (src/config/effets-comptes.ts), au nom du demandeur.
  const issue = await effacerDonnees(cible, { transaction, demandeur: personne.email });
  return "erreur" in issue ? issue : { bilan: issue };
}
