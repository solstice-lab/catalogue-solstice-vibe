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

export function personneJouee(): Utilisateur | null {
  return joue;
}
