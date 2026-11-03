import type { Entree, MethodeDeConnexion } from "@/briques/comptes/methodes";

/*
 * Qui peut se connecter à cette appli, et comment : le fichier
 * que le projet remplit, comme src/config/acces.ts pour les droits. La
 * brique comptes ne connaît aucune adresse.
 */

// Les méthodes proposées sur /connexion, dans cet ordre.
// « code-email » : un code à 6 chiffres envoyé par e-mail (brique mails). En
// local, le mail s'affiche dans la console du serveur (MAILS_FOURNISSEUR=console).
// « google » : un compte Google, une fois l'application OAuth du client créée
// et GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET déclarés (README de la brique
// comptes) ; sans elles, sa carte sur /connexion dit ce qui manque.
// « demo » ouvre une session à qui la demande, sans rien vérifier : elle
// refuse de démarrer en production, et se retire d'ici avant toute mise en
// ligne.
export const METHODES: readonly MethodeDeConnexion[] = ["code-email", "demo"];

// Qui entre. Une adresse listée reçoit son rôle, et la configuration fait foi
// à chaque requête : changer le rôle ici agit au prochain déploiement. Un
// domaine fait entrer toute adresse @domaine (pas ses sous-domaines) avec
// ROLE_PAR_DEFAUT ; son rôle se change ensuite en base. Une adresse retirée
// d'ici perd sa session à la requête suivante.
//
// Sauf pour un compte que l'écran /comptes gère (brique
// gestion-comptes) : invité là, ou dont le rôle y a été changé, il entre avec son rôle en
// base, et seule sa désactivation à l'écran le fait sortir.
//
// Le premier admin ne s'écrit pas ici : COMPTES_PREMIER_ADMIN, au premier
// démarrage (voir .env.example).
//
// ouverte : true pour un outil public, ouvert à l'inscription. Toute adresse
// entre alors, avec ROLE_PAR_DEFAUT seulement ; les adresses listées et le
// premier admin gardent leur rôle. Deux rôles au moins (src/config/acces.ts) :
// avec un seul, ROLE_PAR_DEFAUT administre, et la brique refuse de démarrer.
export const ENTREE: Entree = {
  adresses: {},
  domaines: [],
  ouverte: false,
};

// Connexion avec Google : le ou les domaines Google Workspace du client
// (« client.fr »), vérifiés dans le jeton de Google (revendication hd). Vide,
// tout compte dont Google garantit l'adresse (Gmail ou Workspace) passe à
// ENTREE ; rempli, seuls les comptes de ces Workspace y passent. ENTREE
// décide encore : le domaine s'y ajoute, il ne la remplace pas.
export const DOMAINES_GOOGLE_WORKSPACE: readonly string[] = [];
