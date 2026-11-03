import { ROLE_ADMIN, ROLE_PAR_DEFAUT, type Role } from "@/config/acces";
import { ENTREE, METHODES } from "@/config/comptes";

/*
 * Les types que l'appli remplit dans src/config/comptes.ts, et l'erreur de la
 * brique. Une méthode de connexion s'ajoute ici (à venir : Microsoft,
 * lien magique).
 */

// « code-email » : un code à 6 chiffres envoyé par e-mail, la méthode
// par défaut. « google » : un compte Google, une fois son application
// OAuth créée (README de la brique). « demo » : un rôle joué sans rien
// vérifier, hors production.
export type MethodeDeConnexion = "code-email" | "google" | "demo";

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

// Son message commence par « Brique comptes : » et ne cite jamais un secret.
export class ErreurComptes extends Error {
  constructor(message: string) {
    super(`Brique comptes : ${message}`);
    this.name = "ErreurComptes";
  }
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
