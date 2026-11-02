import { ROLE_ADMIN, ROLE_PAR_DEFAUT, ROLES } from "@/config/acces";
import { ENTREE, METHODES } from "@/config/comptes";
import { queryOne } from "@/lib/db/client";
import type { Entree } from "./methodes";

/*
 * Qui peut entrer, et avec quel rôle. La configuration
 * (src/config/comptes.ts) dit qui ; la base garde les comptes. Une méthode de
 * connexion vérifie l'identité (un code, un fournisseur), puis appelle
 * admettre() : jamais l'inverse, la méthode ne décide pas qui entre.
 *
 * Niveau 3 (administration.ts) : un compte qu'un admin a invité,
 * ou dont il a fixé le rôle à l'écran, est « géré par l'appli » et entre avec
 * son rôle en base, quoi que dise la configuration ; un domaine peut aussi
 * s'ouvrir en base (domaines_admis). Tout autre compte suit les règles du
 * niveau 2 : sans administration, la colonne reste à faux et la table vide.
 */

// Les comptes joués par la méthode démo : un domaine réservé (.example), qui
// n'existe nulle part.
export const DOMAINE_DEMO = "demo.solstice-lab.example";

export type ContexteEntree = {
  entree: Entree;
  premierAdmin: string | undefined;
  demo: boolean;
};

export type CompteAdmis = { id: number; email: string; role: string };

// Relu à chaque appel : la configuration et l'environnement font foi à la
// requête, pas au chargement du module.
export function contexteDeLAppli(): ContexteEntree {
  return {
    entree: ENTREE,
    premierAdmin: process.env.COMPTES_PREMIER_ADMIN || undefined,
    // En production, la méthode démo refuse de démarrer (demo.ts) ; ses
    // comptes n'entrent plus, même avec une session ouverte avant.
    demo: METHODES.includes("demo") && process.env.NODE_ENV !== "production",
  };
}

export function normaliser(email: string): string {
  return email.trim().toLowerCase();
}

export function domaineDe(email: string): string | null {
  const arobase = email.lastIndexOf("@");
  return arobase < 1 ? null : email.slice(arobase + 1);
}

// Ce que la base dit d'un compte en plus de son rôle, lu dans la même requête
// que lui.
export type CompteEnBase = { gereParLAppli: boolean; domaineOuvert: boolean };
const RIEN_EN_BASE: CompteEnBase = { gereParLAppli: false, domaineOuvert: false };

// Les colonnes d'un compte (alias u) que roleEffectif lit, pour chaque lecture
// d'un compte (ici, session.ts, administration.ts). Le domaine ouvert en base
// est une colonne de plus, plutôt qu'une seconde requête à chaque page ; c'est
// ce qui suit le DERNIER « @ », comme domaineDe.
export const COLONNES_ENTREE =
  "u.email, u.role, u.actif, u.gere_par_l_appli, EXISTS (SELECT 1 FROM domaines_admis d WHERE d.actif AND d.domaine = substring(u.email from '@([^@]*)$')) AS domaine_ouvert";
export type LigneEntree = {
  email: string;
  role: string;
  actif: boolean;
  gere_par_l_appli: boolean;
  domaine_ouvert: boolean;
};

export function enBaseDe(ligne: LigneEntree): CompteEnBase {
  return { gereParLAppli: ligne.gere_par_l_appli, domaineOuvert: ligne.domaine_ouvert };
}

export function estAdresseDeDemo(email: string): boolean {
  return domaineDe(normaliser(email)) === DOMAINE_DEMO;
}

function roleListe(email: string, entree: Entree): string | null {
  for (const [adresse, role] of Object.entries(entree.adresses)) {
    if (normaliser(adresse) === email) return role;
  }
  return null;
}

function parDomaine(email: string, contexte: ContexteEntree): boolean {
  const domaine = domaineDe(email);
  return domaine !== null && contexte.entree.domaines.some((admis) => normaliser(admis) === domaine);
}

// L'entrée ouverte : une adresse bien formée suffit (un seul « @ », un domaine
// avec un point). La méthode a déjà vérifié que la personne la détient (le
// code reçu, le compte Google), mais admettre() est exportée : elle ne se fie
// pas à son appelant. Jamais une adresse de démo : sans la démo (en
// production), un compte de démo resté en base n'entre plus, et l'entrée
// ouverte ne doit pas le faire revenir.
const ADRESSE_BIEN_FORMEE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function parEntreeOuverte(email: string, contexte: ContexteEntree): boolean {
  return contexte.entree.ouverte === true && ADRESSE_BIEN_FORMEE.test(email) && !estAdresseDeDemo(email);
}

function estDemo(email: string, contexte: ContexteEntree): boolean {
  return contexte.demo && estAdresseDeDemo(email);
}

function estPremierAdmin(email: string, contexte: ContexteEntree): boolean {
  return contexte.premierAdmin !== undefined && normaliser(contexte.premierAdmin) === email;
}

// Ce qui fait entrer un compte déjà en base, dans l'ordre où roleEffectif le
// lit ; « aucune » pour qui n'est plus admis.
export type OrigineDuCompte = "appli" | "configuration" | "demo" | "domaine" | "premier-admin" | "ouverte" | "aucune";

export function origineDuCompte(email: string, contexte = contexteDeLAppli(), enBase = RIEN_EN_BASE): OrigineDuCompte {
  const adresse = normaliser(email);
  // Jamais un compte de démo : sans la démo (en production), il n'entre pas,
  // même si une ligne en base le disait géré par l'appli.
  if (enBase.gereParLAppli && !estAdresseDeDemo(adresse)) return "appli";
  if (roleListe(adresse, contexte.entree) !== null) return "configuration";
  if (estDemo(adresse, contexte)) return "demo";
  // Avant le domaine : ouvrir le domaine du premier admin ne doit pas le
  // ramener au rôle par défaut (voir roleEffectif).
  if (estPremierAdmin(adresse, contexte)) return "premier-admin";
  if (parDomaine(adresse, contexte) || enBase.domaineOuvert) return "domaine";
  // En dernier : une voie qui donne un rôle (liste, premier admin) l'emporte.
  if (parEntreeOuverte(adresse, contexte)) return "ouverte";
  return "aucune";
}

// Le rôle d'un compte déjà en base, à chaque requête : celui de la base pour
// un compte géré par l'appli (niveau 3), celui de la configuration pour
// une adresse listée (elle fait foi), celui de la base pour une personne
// admise autrement, null pour qui n'est plus admis.
//
// Sauf par un domaine ouvert depuis l'écran : ROLE_PAR_DEFAUT, jamais le rôle
// en base. Ce rôle-là, aucun admin ne l'a choisi à l'écran (il aurait alors
// repris le compte) : c'est celui que la ligne garde d'avant, et ouvrir le
// domaine rendait « admin » à un ancien admin retiré de la configuration. Même
// règle, pour la même raison, par l'entrée ouverte.
export function roleEffectif(
  email: string,
  roleEnBase: string,
  contexte = contexteDeLAppli(),
  enBase = RIEN_EN_BASE
): string | null {
  const adresse = normaliser(email);
  const origine = origineDuCompte(adresse, contexte, enBase);
  if (origine === "aucune") return null;
  if (origine === "configuration") return roleListe(adresse, contexte.entree);
  if (origine === "domaine" && !parDomaine(adresse, contexte)) return ROLE_PAR_DEFAUT;
  if (origine === "ouverte") return ROLE_PAR_DEFAUT;
  return roleEnBase;
}

async function domaineOuvertEnBase(email: string): Promise<boolean> {
  const domaine = domaineDe(email);
  return (
    domaine !== null &&
    (await queryOne("SELECT 1 FROM domaines_admis WHERE actif AND domaine = $1", [domaine])) !== undefined
  );
}

async function roleInitial(email: string, contexte: ContexteEntree): Promise<string | null> {
  const liste = roleListe(email, contexte.entree);
  if (liste !== null) return liste;
  if (estDemo(email, contexte)) {
    const role = email.slice(0, email.indexOf("@"));
    return (ROLES as readonly string[]).includes(role) ? role : null;
  }
  if (estPremierAdmin(email, contexte)) {
    // Le PREMIER admin seulement : un admin désactivé compte aussi, sinon la
    // variable, restée déclarée, referait un admin à la prochaine adresse
    // qu'on y écrit. Les comptes de démo ne comptent pas : un catalogue essayé
    // en démo garde un admin de démo, qui n'administre rien de réel.
    const admin = await queryOne("SELECT 1 FROM utilisateurs WHERE role = $1 AND email NOT LIKE $2", [
      ROLE_ADMIN,
      `%@${DOMAINE_DEMO}`,
    ]);
    if (!admin) return ROLE_ADMIN;
  }
  // Jamais l'administration par un domaine : n'importe qui du domaine entre.
  return parDomaine(email, contexte) || (await domaineOuvertEnBase(email)) || parEntreeOuverte(email, contexte)
    ? ROLE_PAR_DEFAUT
    : null;
}

// Le rôle avec lequel une adresse normalisée entrerait, sans rien écrire ; null
// si elle n'entre pas. Un compte désactivé n'entre plus : on désactive un
// compte, on ne le supprime pas.
async function roleALEntree(adresse: string, contexte: ContexteEntree): Promise<string | null> {
  const existant = await queryOne<LigneEntree>(`SELECT ${COLONNES_ENTREE} FROM utilisateurs u WHERE u.email = $1`, [
    adresse,
  ]);
  if (existant && !existant.actif) return null;
  return existant ? roleEffectif(adresse, existant.role, contexte, enBaseDe(existant)) : roleInitial(adresse, contexte);
}

// Vrai si admettre() laisserait entrer cette adresse, sans créer de compte : la
// connexion par code n'envoie son code qu'à qui entrerait, et un compte
// ne doit pas naître à la seule demande d'un code.
export async function seraitAdmis(email: string, contexte = contexteDeLAppli()): Promise<boolean> {
  return (await roleALEntree(normaliser(email), contexte)) !== null;
}

// Le compte d'une personne dont la méthode a vérifié l'identité, créé s'il
// manque, ou null si elle n'entre pas.
//
// Le rôle n'est réécrit que sur un compte actif que l'appli ne gère pas : le
// rôle a été lu avant l'écriture, et un changement fait à l'écran entre les
// deux était défait par la connexion. Sans réécriture, le
// compte se relit tel qu'il est, et une désactivation passée entre-temps ne
// laisse entrer personne.
export async function admettre(email: string, contexte = contexteDeLAppli()): Promise<CompteAdmis | null> {
  const adresse = normaliser(email);
  const role = await roleALEntree(adresse, contexte);
  if (role === null) return null;
  const compte = await queryOne<CompteAdmis>(
    `INSERT INTO utilisateurs (email, role) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role
       WHERE utilisateurs.actif AND NOT utilisateurs.gere_par_l_appli
     RETURNING id, email, role`,
    [adresse, role]
  );
  if (compte) return compte;
  const releu = await queryOne<LigneEntree & { id: number }>(
    `SELECT u.id, ${COLONNES_ENTREE} FROM utilisateurs u WHERE u.email = $1 AND u.actif`,
    [adresse]
  );
  const releuRole = releu ? roleEffectif(adresse, releu.role, contexte, enBaseDe(releu)) : null;
  return releu && releuRole !== null ? { id: releu.id, email: releu.email, role: releuRole } : null;
}
