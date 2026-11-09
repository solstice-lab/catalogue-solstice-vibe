import type { Utilisateur } from "../src/briques/comptes/roles";
import { UTILISATEURS_DEMO } from "../src/briques/comptes/demo";

/*
 * La personne connectée des tests des modules. tests/setup.ts
 * branche lireSession (src/briques/comptes/session.ts) sur cette valeur : un
 * module se teste sur ce qu'il fait, pas sur la façon dont on se connecte. La
 * vraie session (cookie signé, base) se teste dans tests/comptes-session.test.ts.
 *
 * Un rôle qui n'est pas déclaré dans ROLES se joue aussi : c'est le cas d'un
 * rôle retiré de la configuration, que les droits doivent refuser.
 */

let joue: Utilisateur | null = null;

export function jouer(role: string | null): void {
  joue =
    role === null
      ? null
      : Object.hasOwn(UTILISATEURS_DEMO, role)
        ? UTILISATEURS_DEMO[role as keyof typeof UTILISATEURS_DEMO]
        : { email: `${role}@demo.solstice-lab.example`, role };
}

// Une personne précise, quand le test a besoin de son adresse : la brique
// espaces retrouve le compte en base par l'adresse de la personne connectée.
export function jouerLaPersonne(personne: Utilisateur): void {
  joue = personne;
}

export function personneJouee(): Utilisateur | null {
  return joue;
}

// L'âge de la connexion de la personne jouée : récente par défaut
// (tests/setup.ts), pour que les tests des modules vérifient le geste et non
// l'heure de la connexion. Un test du refus joue une connexion ancienne, que
// exigerConnexionRecente (src/briques/comptes/roles.ts) doit arrêter.
let connexion: "recente" | "ancienne" = "recente";

export function jouerLaConnexion(age: "recente" | "ancienne"): void {
  connexion = age;
}

export function connexionJouee(): "recente" | "ancienne" {
  return connexion;
}
