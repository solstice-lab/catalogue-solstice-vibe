import { ROLE_ADMIN, ROLE_PAR_DEFAUT, type Role } from "@/config/acces";
import { DUREES_DE_SESSION, ENTREE, LIMITES_PAR_RESEAU, METHODES } from "@/config/comptes";

/*
 * Les types que l'appli remplit dans src/config/comptes.ts, et l'erreur de la
 * brique. Une méthode de connexion s'ajoute ici.
 */

// « code-email » : un code à 6 chiffres envoyé par e-mail, la méthode
// par défaut. « lien-email » : un lien envoyé par e-mail, pour une appli grand
// public seulement (en entreprise, l'antivirus de la messagerie ouvre le lien
// avant la personne : README de la brique). « google » : un compte Google, une
// fois son application OAuth créée (README de la brique). « microsoft » : un
// compte Microsoft (Entra ID), une fois l'application enregistrée dans le
// portail Azure (même README). « demo » : un rôle joué sans rien vérifier,
// hors production.
export type MethodeDeConnexion = "code-email" | "lien-email" | "google" | "microsoft" | "demo";

// Les annuaires (tenants) Entra ID dont la connexion avec Microsoft accepte les
// comptes : « un-seul », celui du client (MICROSOFT_TENANT_ID) ; « tous », tout
// annuaire, et les comptes Microsoft personnels.
export type AnnuairesMicrosoft = "un-seul" | "tous";

export type Entree = {
  // Une adresse et son rôle ; la casse et les espaces ne comptent pas.
  adresses: Readonly<Record<string, Role>>;
  // « client.fr » fait entrer x@client.fr, pas x@equipe.client.fr.
  domaines: readonly string[];
  // Toute adresse bien formée entre, avec ROLE_PAR_DEFAUT : un outil public,
  // ouvert à l'inscription. Jamais un autre rôle que ROLE_PAR_DEFAUT, et
  // jamais avec un seul rôle, où ce rôle-là administre.
  ouverte?: boolean;
};

// Les limites de la connexion par code ou lien qui se comptent par adresse IP,
// sur une heure glissante : l'appli les règle, la brique ne sait pas combien de
// personnes partagent un réseau (README de la brique, « Les limites »). Et le
// plafond de toute l'appli, réglé au même endroit.
export type LimitesParReseau = {
  // Les demandes de code ou de lien d'une IP, toutes adresses confondues.
  demandesParHeure: number;
  // Les saisies fausses de code ou de lien d'une IP, toutes adresses confondues.
  codesFauxParHeure: number;
  // Les demandes de code ou de lien de toute l'appli, toutes adresses et IP
  // confondues. Facultatif : ENVOIS_PAR_HEURE_PAR_DEFAUT sans lui (ou
  // demandesParHeure, si elle est plus haute), pour qu'une
  // appli assemblée avant ce plafond le reçoive sans retoucher sa configuration.
  envoisParHeure?: number;
};

/*
 * Le plafond de toute l'appli quand LIMITES_PAR_RESEAU ne le règle pas. Les
 * limites par adresse et par IP ne bornent pas qui dispose de beaucoup d'IP :
 * il faisait partir autant de mails qu'il voulait au nom de l'appli (coût
 * d'envoi, réputation de l'expéditeur), et remplissait la table des demandes
 * (audit du 2026-11-09). 300 par heure : une appli interne de quelques
 * centaines de personnes n'en voit pas autant se connecter dans la même heure,
 * même un lundi matin où celles absentes depuis sept jours (DUREES_DE_SESSION)
 * se reconnectent toutes ; c'est aussi
 * quinze réseaux au plafond par défaut de vingt demandes. Une appli grand
 * public, ou ouverte à plusieurs entreprises, le relève.
 */
export const ENVOIS_PAR_HEURE_PAR_DEFAUT = 300;

// La politique de session, que l'appli règle (src/config/comptes.ts). Un
// cookie volé valait 30 jours de droits admin, sans expiration à
// l'inactivité ni preuve redemandée avant un geste sensible (audit du
// 2026-11-09).
export type DureesDeSession = {
  // Depuis la connexion, visites comprises : au-delà, il faut se reconnecter.
  maximumJours: number;
  // Sans visite pendant ce délai, la session se ferme. Chaque visite le repousse,
  // jamais au-delà de maximumJours.
  inactiviteJours: number;
  // Une connexion plus ancienne ne suffit pas aux gestes sensibles (effacer les
  // données d'une personne, inviter, changer un rôle, fermer ses autres sessions) :
  // exigerConnexionRecente de roles.ts.
  connexionRecenteMinutes: number;
};

// Son message commence par « Brique comptes : » et ne cite jamais un secret.
export class ErreurComptes extends Error {
  constructor(message: string) {
    super(`Brique comptes : ${message}`);
    this.name = "ErreurComptes";
  }
}

// Les limites par réseau et le plafond : un entier d'au moins 1, jamais nul ni sans plafond.
// Une limite à 0 refuserait toute demande depuis toute IP, et une limite qui
// n'en est plus une (Infinity, NaN) retirerait ce qui arrête un poste qui demande
// des codes à la chaîne : coût d'envoi et réputation de l'expéditeur. Appelé
// par le proxy comme les gardes ci-dessous, et par la brique à chaque
// lecture : l'appli refuse de démarrer au lieu de refuser, sans un mot, tout le
// monde.
export function refuserDesLimitesParReseauInvalides(
  limites: LimitesParReseau = LIMITES_PAR_RESEAU
): Required<LimitesParReseau> {
  // Les clés nommées : une clé absente ferait de la comparaison « >= undefined »
  // une limite qui ne refuse jamais, sans un mot. Le plafond absent prend son
  // défaut, jamais sous demandesParHeure : l'assembleur règle celle-ci depuis
  // la blueprint (400 personnes par réseau), pas le plafond, qui aurait
  // refusé un seul réseau avant sa propre limite. Présent, il se vérifie comme
  // les autres, et l'appli qui le règle plus bas le veut ainsi.
  const completes = {
    ...limites,
    envoisParHeure:
      limites.envoisParHeure === undefined
        ? Math.max(ENVOIS_PAR_HEURE_PAR_DEFAUT, limites.demandesParHeure)
        : limites.envoisParHeure,
  };
  for (const nom of ["demandesParHeure", "codesFauxParHeure", "envoisParHeure"] as const) {
    const valeur: unknown = completes[nom];
    if (typeof valeur !== "number" || !Number.isInteger(valeur) || valeur < 1) {
      throw new ErreurComptes(
        `la limite « ${nom} » de LIMITES_PAR_RESEAU (src/config/comptes.ts) doit être un entier d'au moins 1 (valeur lue : ${String(valeur)}). Une limite par réseau se règle, elle ne se retire pas.`
      );
    }
  }
  return completes;
}

// Bornes des durées de session, au même titre que les limites par réseau :
// l'appli refuse de démarrer plutôt que de tenir une politique qu'on ne lui a
// pas demandée. Une inactivité plus longue que la durée maximale ne voudrait
// rien dire. Une connexion « récente » de plus d'une heure ne prouve plus
// que la personne est devant l'écran, et laisse au voleur d'un cookie tout
// juste ouvert le temps d'agir. Au-delà de 400 jours, Chrome raccourcit de
// lui-même la vie du cookie, et la base garderait une échéance qu'il ne tient pas.
const MAXIMUM_JOURS_PLAFOND = 400;
const CONNEXION_RECENTE_PLAFOND_MINUTES = 60;

export function refuserDesDureesDeSessionInvalides(durees: DureesDeSession = DUREES_DE_SESSION): DureesDeSession {
  const refuser = (motif: string): never => {
    throw new ErreurComptes(`DUREES_DE_SESSION (src/config/comptes.ts) : ${motif}`);
  };
  // Les clés nommées : une clé absente ferait une comparaison avec undefined
  // qui ne refuse jamais, sans un mot.
  for (const nom of ["maximumJours", "inactiviteJours", "connexionRecenteMinutes"] as const) {
    const valeur: unknown = durees[nom];
    if (typeof valeur !== "number" || !Number.isInteger(valeur) || valeur < 1) {
      refuser(`« ${nom} » doit être un entier d'au moins 1 (valeur lue : ${String(valeur)}).`);
    }
  }
  if (durees.maximumJours > MAXIMUM_JOURS_PLAFOND) {
    refuser(`« maximumJours » ne dépasse pas ${MAXIMUM_JOURS_PLAFOND} jours (valeur lue : ${durees.maximumJours}).`);
  }
  if (durees.inactiviteJours > durees.maximumJours) {
    refuser(
      `« inactiviteJours » (${durees.inactiviteJours}) ne dépasse pas « maximumJours » (${durees.maximumJours}).`
    );
  }
  if (durees.connexionRecenteMinutes > CONNEXION_RECENTE_PLAFOND_MINUTES) {
    refuser(
      `« connexionRecenteMinutes » ne dépasse pas ${CONNEXION_RECENTE_PLAFOND_MINUTES} minutes (valeur lue : ${durees.connexionRecenteMinutes}) : au-delà, la connexion ne prouve plus que la personne est devant l'écran.`
    );
  }
  return durees;
}

// La démo en production : n'importe qui y jouerait l'admin. Appelé par le
// proxy à chaque requête, /sante comprise : la sonde de l'hébergeur échoue, et
// le déploiement avec elle, au lieu d'une appli en ligne dont seules les pages
// plantent. Sans accès à la base : le proxy l'importe.
export function refuserLaDemoEnProduction(): void {
  if (METHODES.includes("demo") && process.env.NODE_ENV === "production") {
    throw new ErreurComptes(
      "la méthode démo refuse de démarrer en production : n'importe qui y jouerait l'admin. La retirer de METHODES (src/config/comptes.ts) avant la mise en ligne."
    );
  }
}

// La production sans IP_EN_TETE_CLIENT : l'adresse du visiteur ne se lit pas
// (src/lib/adresse-ip.ts), et toutes les requêtes tombaient hors de toute
// limite par IP. Un tiers invalidait chaque code reçu par une adresse visée
// (trois saisies fausses par minute) et savait qui demandait un code à
// l'instant (« expiré » contre « incorrect »), avec un seul avertissement au
// journal (audit du 2026-11-09). Appelé par le proxy comme la démo, /sante
// comprise : le déploiement échoue au lieu d'une appli en ligne sans limite.
// Seulement avec le code ou le lien : Google et Microsoft ne lisent pas l'IP.
// Le message ne nomme pas le fichier de l'hébergeur : il part avec la brique
// deploiement, et une appli sans elle le citait sans l'avoir (2026-11-09).
export function refuserLaProductionSansEnTeteIp(): void {
  const lisentLIp = METHODES.includes("code-email") || METHODES.includes("lien-email");
  if (lisentLIp && process.env.NODE_ENV === "production" && (process.env.IP_EN_TETE_CLIENT ?? "").trim() === "") {
    throw new ErreurComptes(
      "IP_EN_TETE_CLIENT est obligatoire en production : sans elle, les limites par adresse IP de la connexion ne voient pas qui demande. La déclarer chez l'hébergeur, à l'en-tête où son proxy pose l'adresse du visiteur (Render : cf-connecting-ip)."
    );
  }
}

// L'entrée ouverte avec un seul rôle : ROLE_PAR_DEFAUT y est aussi le rôle
// d'administration, et n'importe quelle adresse d'Internet recevrait toutes
// les actions, effacer les données de n'importe qui comprise. Appelé par le
// proxy comme la démo : l'appli refuse de démarrer, au lieu de s'ouvrir à tous
// en administration.
export function refuserUneEntreeOuverteQuiAdministre(
  entree: Entree = ENTREE,
  roleParDefaut: string = ROLE_PAR_DEFAUT,
  roleAdmin: string = ROLE_ADMIN
): void {
  if (entree.ouverte === true && roleParDefaut === roleAdmin) {
    throw new ErreurComptes(
      "l'entrée ouverte (ouverte de ENTREE, src/config/comptes.ts) exige deux rôles au moins : avec un seul, ROLE_PAR_DEFAUT administre, et n'importe quelle adresse recevrait toutes les actions. Ajouter un rôle d'administration dans src/config/acces.ts, ou retirer l'option."
    );
  }
}
