import type {
  AnnuairesMicrosoft,
  DureesDeSession,
  Entree,
  LimitesParReseau,
  MethodeDeConnexion,
} from "@/briques/comptes/methodes";

/*
 * Qui peut se connecter à cette appli, et comment : le fichier
 * que le projet remplit, comme src/config/acces.ts pour les droits. La
 * brique comptes ne connaît aucune adresse.
 */

// Les méthodes proposées sur /connexion, dans cet ordre.
// « code-email » : un code à 6 chiffres envoyé par e-mail (brique mails). En
// local, le mail s'affiche dans la console du serveur (MAILS_FOURNISSEUR=console).
// « lien-email » : un lien envoyé par e-mail, pour une appli grand public
// seulement (en entreprise, l'antivirus de la messagerie ouvre le lien avant
// la personne : README de la brique comptes). En production, URL_PUBLIQUE est
// l'adresse du lien ; sans elle, sa carte sur /connexion dit qu'elle manque.
// « google » : un compte Google, une fois l'application OAuth du client créée
// et GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET déclarés (README de la brique
// comptes) ; sans elles, sa carte sur /connexion dit ce qui manque.
// « microsoft » : un compte Microsoft (Entra ID), une fois l'application
// enregistrée dans le portail Azure et MICROSOFT_CLIENT_ID,
// MICROSOFT_CLIENT_SECRET et MICROSOFT_TENANT_ID déclarés (même README).
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

// Connexion avec Microsoft : « un-seul » (le cas normal) n'accepte que les
// comptes de l'annuaire Entra ID du client, MICROSOFT_TENANT_ID, vérifié dans
// le jeton (émetteur et tid). « tous » accepte tout annuaire, et les comptes
// Microsoft personnels si l'enregistrement de l'application les accepte : pour
// un outil ouvert à plusieurs entreprises. ENTREE décide encore dans les deux
// cas.
export const ANNUAIRES_MICROSOFT: AnnuairesMicrosoft = "un-seul";

// Les limites de la connexion par code ou lien qui se comptent par adresse IP,
// sur une heure. Derrière une même box, un bureau, une école ou un événement
// partagent UNE adresse : demandesParHeure est donc le nombre de personnes qui
// peuvent demander leur code dans l'heure depuis un même réseau, et
// codesFauxParHeure le nombre de saisies fausses qu'il peut commettre (une
// fois et demie plus, pour les fautes de frappe). Un téléphone en Wi-Fi a été
// refusé à sa première demande parce qu'un poste du même réseau avait épuisé la
// limite. Entiers d'au moins 1 : la limite par IP arrête un poste qui demande
// des codes à la chaîne, elle ne se retire pas (refusée au démarrage). Les
// limites par adresse e-mail parlent d'une seule personne et restent celles de
// la brique.
//
// envoisParHeure, facultatif, s'ajoute ici pour régler le plafond des demandes
// de code ou de lien de toute l'appli, toutes adresses et IP confondues : 300
// sans lui, ou demandesParHeure si elle est plus haute
// (ENVOIS_PAR_HEURE_PAR_DEFAUT, qui dit pourquoi), à relever pour une appli
// grand public. Un entier d'au moins 1 lui aussi.
export const LIMITES_PAR_RESEAU: LimitesParReseau = {
  demandesParHeure: 20,
  codesFauxParHeure: 30,
};

// La politique de session, fixée par la personne responsable le 2026-11-09 :
// un cookie volé valait 30 jours de droits admin. Une session dure au plus
// maximumJours depuis la connexion ; sans visite pendant inactiviteJours, elle se
// ferme, et chaque visite repousse ce délai. Effacer les données d'une
// personne, inviter une adresse, changer un rôle ou fermer ses autres sessions
// demande une connexion
// de moins de connexionRecenteMinutes. Des entiers d'au moins 1, l'inactivité
// jamais plus longue que la durée maximale, la connexion récente d'une heure
// au plus, la durée maximale de 400 jours au plus : l'appli refuse de démarrer
// sinon (README de la brique comptes, « La politique de session »).
export const DUREES_DE_SESSION: DureesDeSession = {
  maximumJours: 30,
  inactiviteJours: 7,
  connexionRecenteMinutes: 10,
};
