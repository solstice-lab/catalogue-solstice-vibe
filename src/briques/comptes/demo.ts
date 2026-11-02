import { ROLES, type Role } from "@/config/acces";
import { METHODES } from "@/config/comptes";
import { admettre, DOMAINE_DEMO } from "./entree";
import { refuserLaDemoEnProduction } from "./methodes";
import type { Utilisateur } from "./roles";
import { ouvrirSession } from "./session";

/*
 * La méthode démo : « Jouer membre », « Jouer admin », sans
 * rien vérifier. Elle ouvre une vraie session, sur un compte par rôle de
 * ROLES, pour que la démo passe par le même chemin que la connexion réelle.
 *
 * Elle refuse de démarrer en production : n'importe qui y joue l'admin. Le
 * refus vaut à chaque requête, dès le proxy (methodes.ts), pas au chargement
 * du module : next build tourne avec NODE_ENV=production, et l'appli de démo
 * doit pouvoir se construire.
 */

// Adresses fictives et DIFFÉRENTES : la brique validation trace le décideur
// par son adresse, et deux personnes distinctes vérifient que la file marque
// « La vôtre » la demande de la personne connectée, et d'elle seule.
export const UTILISATEURS_DEMO = Object.fromEntries(
  ROLES.map((role) => [role, { email: `${role}@${DOMAINE_DEMO}`, role }])
) as Readonly<Record<Role, Utilisateur>>;

export function demoProposee(): boolean {
  refuserLaDemoEnProduction();
  return METHODES.includes("demo");
}

// Ouvre la session du rôle joué ; faux pour une valeur qui n'est pas un rôle
// (une valeur postée à la main ne crée pas de rôle).
export async function entrerEnDemo(role: string): Promise<boolean> {
  if (!demoProposee() || !Object.hasOwn(UTILISATEURS_DEMO, role)) return false;
  const compte = await admettre(UTILISATEURS_DEMO[role as Role].email);
  if (!compte) return false;
  // Changer de rôle ferme la session précédente (ouvrirSession s'en charge).
  await ouvrirSession(compte);
  return true;
}
