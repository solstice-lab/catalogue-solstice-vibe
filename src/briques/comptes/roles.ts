import { notFound } from "next/navigation";
import { cache } from "react";
import { DROITS, ROLES, type Action, type Droits, type Role } from "@/config/acces";
import { lireSession, trouverUtilisateur } from "./session";

/*
 * Gardes d'accès — LE mécanisme des droits, sans aucun nom de module. Qui a
 * droit à quoi se déclare dans src/config/acces.ts.
 *
 * Règle reprise d'un projet précédent : masquer une entrée de navigation ne
 * protège RIEN, les URLs se devinent. Chaque page et chaque server action
 * commence par `exiger(action)` ; tests/gardes-acces.test.ts le verrouille.
 * La règle elle-même ne se recopie jamais localement : deux copies finissent
 * toujours par diverger, et c'est la plus permissive qui gagne.
 *
 * Refus par défaut : sans utilisateur, ou avec un rôle que ROLES ne déclare
 * pas, aucune action ne passe. Avant cette règle, un visiteur sans cookie jouait
 * l'admin.
 *
 * La personne connectée vient de la session (session.ts), son
 * rôle relu en base à chaque requête.
 */

// Le rôle reste une chaîne : il vient de la base, et un rôle retiré de la
// configuration doit être refusé, pas rejeté par le typage.
export type Utilisateur = {
  email: string;
  role: string;
};

// Le type de DROITS, sur des actions et des rôles donnés : chaque action
// reçoit au moins un rôle (une liste vide ne donnerait l'action à personne).
export type DroitsDe<A extends string, R extends string> = Record<A, readonly [R, ...R[]]>;

function estRole(valeur: string | undefined): valeur is Role {
  return (ROLES as readonly (string | undefined)[]).includes(valeur);
}

// Relu à chaque appel, jamais mémorisé : retirer un rôle de ROLES ou une
// action de DROITS agit à la requête suivante.
export function peut(utilisateur: Utilisateur | null, action: Action): boolean {
  if (!utilisateur || !estRole(utilisateur.role)) return false;
  const droits: Droits = DROITS;
  const roles: readonly Role[] = Object.hasOwn(droits, action) ? droits[action] : [];
  return roles.includes(utilisateur.role);
}

// À appeler en PREMIÈRE ligne de chaque page et server action. Plusieurs
// actions : il suffit d'en avoir une (« À traiter » s'ouvre à qui peut ouvrir
// l'une de ses files). Un accès refusé rend un 404, pas un 403 : ne pas
// confirmer à un curieux que la ressource existe.
export async function exiger(...actions: [Action, ...Action[]]): Promise<Utilisateur> {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur || !actions.some((action) => peut(utilisateur, action))) notFound();
  return utilisateur;
}

// Le garde d'affichage d'une entrée de navigation : la MÊME règle que celle
// de la page (lib/navigation.ts).
export function visiblePour(action: Action): () => Promise<boolean> {
  return async () => peut(await utilisateurCourant(), action);
}

// Sans session valable, personne. Une lecture en base par requête, pas une
// par appel : le menu appelle visiblePour pour chacune de ses entrées.
export const utilisateurCourant = cache(async (): Promise<Utilisateur | null> => lireSession());

// La brique validation n'exige du décideur que son adresse (elle ne connaît
// aucun rôle) : on la retrouve en base, aux mêmes conditions qu'une session,
// plutôt que de croire le rôle de l'objet reçu. Une adresse inconnue,
// désactivée ou plus admise n'est personne.
export async function utilisateurDeLEmail(email: string): Promise<Utilisateur | null> {
  return trouverUtilisateur(email);
}
