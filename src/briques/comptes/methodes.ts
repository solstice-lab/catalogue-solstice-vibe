import { ROLE_ADMIN, ROLE_PAR_DEFAUT, type Role } from "@/config/acces";
import { ENTREE, LIMITES_PAR_RESEAU, METHODES } from "@/config/comptes";

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
// personnes partagent un réseau (README de la brique, « Les limites »).
export type LimitesParReseau = {
  // Les demandes de code ou de lien d'une IP, toutes adresses confondues.
  demandesParHeure: number;
  // Les saisies fausses de code ou de lien d'une IP, toutes adresses confondues.
  codesFauxParHeure: number;
};

// Son message commence par « Brique comptes : » et ne cite jamais un secret.
export class ErreurComptes extends Error {
  constructor(message: string) {
    super(`Brique comptes : ${message}`);
    this.name = "ErreurComptes";
  }
}

// Les limites par réseau : un entier d'au moins 1, jamais nul ni sans plafond.
// Une limite à 0 refuserait toute demande depuis toute IP, et une limite qui
// n'en est plus une (Infinity, NaN) retirerait ce qui arrête un poste qui demande
// des codes à la chaîne : coût d'envoi et réputation de l'expéditeur. Appelé
// par le proxy comme les deux gardes ci-dessous, et par la brique à chaque
// lecture : l'appli refuse de démarrer au lieu de refuser, sans un mot, tout le
// monde.
export function refuserDesLimitesParReseauInvalides(limites: LimitesParReseau = LIMITES_PAR_RESEAU): LimitesParReseau {
  for (const [nom, valeur] of Object.entries(limites)) {
    if (!Number.isInteger(valeur) || valeur < 1) {
      throw new ErreurComptes(
        `la limite « ${nom} » de LIMITES_PAR_RESEAU (src/config/comptes.ts) doit être un entier d'au moins 1 (valeur lue : ${String(valeur)}). Une limite par réseau se règle, elle ne se retire pas.`
      );
    }
  }
  return limites;
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
