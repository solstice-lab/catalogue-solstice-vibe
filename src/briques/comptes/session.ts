import { cookies } from "next/headers";
import { query, queryOne, type ExecuteurSql } from "@/lib/db/client";
import {
  COLONNES_ENTREE,
  contexteDeLAppli,
  enBaseDe,
  normaliser,
  roleEffectif,
  type CompteAdmis,
  type LigneEntree,
} from "./entree";
import { empreinte, nomDuCookie, nouveauJeton, secretDeSession, signer, verifierSignature } from "./jeton";
import { refuserDesDureesDeSessionInvalides } from "./methodes";
import type { Utilisateur } from "./roles";

/*
 * La session en base. Le rôle n'est jamais dans le cookie : il
 * se relit en base à chaque requête, et retirer un droit agit tout de suite
 * (vécu sur un projet précédent).
 *
 * La politique de session (DUREES_DE_SESSION de src/config/comptes.ts) : un
 * cookie volé valait 30 jours de droits admin (audit du 2026-11-09). Depuis,
 * expire_le est l'échéance d'inactivité : chaque visite la repousse à
 * inactiviteJours, jamais au-delà de maximumJours après cree_le, l'heure de la
 * connexion. Une colonne de plus pour la dernière visite aurait demandé une
 * migration, et la purge (confidentialite.ts) comme le ménage à la connexion
 * lisent déjà expire_le : ils suivent l'inactivité sans changer.
 *
 * tests/setup.ts remplace lireSession, connexionRecente et trouverUtilisateur
 * pour les tests des modules, qui vérifient ce que fait un module, pas qui s'y
 * connecte.
 */

// Au plus une écriture par heure et par session : la session se lit à chaque
// requête, et l'écrire à chaque fois chargerait la base pour rien. Le délai
// d'inactivité se compte en jours ; une heure de moins (une session vue il y a
// 59 minutes garde l'échéance de sa visite précédente) ne change rien à ce
// qu'il protège.
const PAS_DE_RENOUVELLEMENT_MINUTES = 60;

// L'échéance qu'une visite donne à la session « s », en SQL : $2 maximumJours,
// $3 inactiviteJours.
const ECHEANCE = "LEAST(s.cree_le + make_interval(days => $2), now() + make_interval(days => $3))";

// Les attributs du cookie, à la pose comme au retrait : un navigateur refuse
// de retirer un cookie __Host- par un en-tête sans Secure, et la session morte
// restait dans le navigateur.
function attributsDuCookie() {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
}

export async function ouvrirSession(compte: Pick<CompteAdmis, "id">): Promise<void> {
  // Avant toute écriture : sans secret ni durées valables, rien ne s'ouvre à moitié.
  const secret = secretDeSession();
  const { maximumJours, inactiviteJours } = refuserDesDureesDeSessionInvalides();
  // La session que le navigateur portait déjà se ferme : un cookie posé avant
  // la connexion (par un tiers, sur un poste partagé) ne survit pas à elle.
  await fermerSession();
  const jeton = nouveauJeton();
  // Ménage à chaque connexion, plutôt qu'une tâche planifiée à part.
  await query("DELETE FROM sessions WHERE utilisateur_id = $1 AND expire_le <= now()", [compte.id]);
  // Sur un compte encore actif, lu sous verrou partagé : une désactivation en
  // cours (administration.ts) passe avant, et la session ne s'ouvre pas.
  // Sans ce verrou, elle s'ouvrait après que la désactivation avait fermé les
  // sessions du compte, et une réactivation la faisait revivre.
  const ouverte = await query(
    `INSERT INTO sessions (empreinte, utilisateur_id, expire_le)
     SELECT $1, u.id, now() + make_interval(days => LEAST($3::int, $4::int)) FROM utilisateurs u WHERE u.id = $2 AND u.actif FOR SHARE
     RETURNING utilisateur_id`,
    [empreinte(jeton), compte.id, maximumJours, inactiviteJours]
  );
  if (ouverte.length === 0) return;
  await query("UPDATE utilisateurs SET derniere_connexion = now() WHERE id = $1", [compte.id]);
  // Le cookie vit la durée maximale : c'est la base qui ferme la session
  // inactive, et le cookie ne se repose pas à chaque visite (une page ne peut
  // pas écrire de cookie pendant son rendu).
  (await cookies()).set(nomDuCookie(), signer(jeton, secret), {
    ...attributsDuCookie(),
    maxAge: maximumJours * 24 * 60 * 60,
  });
}

// La personne d'un cookie : signature exacte, session ni inactive ni plus
// vieille que la durée maximale, compte actif et encore admis par la
// configuration. Sinon, personne. La visite repousse l'échéance d'inactivité.
export async function lireSessionDe(
  valeur: string | undefined,
  contexte = contexteDeLAppli()
): Promise<Utilisateur | null> {
  const jeton = verifierSignature(valeur);
  if (!jeton) return null;
  const { maximumJours, inactiviteJours } = refuserDesDureesDeSessionInvalides();
  // La durée maximale se compte depuis cree_le, pas seulement par expire_le :
  // une session ouverte avant cette règle (expire_le à 30 jours) ou avant
  // qu'on raccourcisse la durée ne la dépasse pas. Une échéance plus lointaine
  // que celle qu'une visite donnerait se ramène à elle, dès cette visite.
  const ligne = await queryOne<LigneEntree & { a_renouveler: boolean }>(
    `SELECT ${COLONNES_ENTREE},
            s.expire_le < ${ECHEANCE} - make_interval(mins => $4) OR s.expire_le > ${ECHEANCE} AS a_renouveler
       FROM sessions s
       JOIN utilisateurs u ON u.id = s.utilisateur_id
      WHERE s.empreinte = $1 AND s.expire_le > now() AND s.cree_le > now() - make_interval(days => $2) AND u.actif`,
    [empreinte(jeton), maximumJours, inactiviteJours, PAS_DE_RENOUVELLEMENT_MINUTES]
  );
  if (!ligne) return null;
  const role = roleEffectif(ligne.email, ligne.role, contexte, enBaseDe(ligne));
  if (role === null) return null;
  if (ligne.a_renouveler) {
    await query(`UPDATE sessions s SET expire_le = ${ECHEANCE} WHERE s.empreinte = $1 AND s.expire_le > now()`, [
      empreinte(jeton),
      maximumJours,
      inactiviteJours,
    ]);
  }
  return { email: ligne.email, role };
}

export async function lireSession(): Promise<Utilisateur | null> {
  return lireSessionDe((await cookies()).get(nomDuCookie())?.value);
}

// La session « s » valable (échéances, compte actif), en SQL : $1 l'empreinte
// du jeton, $2 maximumJours.
const SESSION_VALABLE = `s.empreinte = $1 AND s.expire_le > now() AND s.cree_le > now() - make_interval(days => $2)
  AND EXISTS (SELECT 1 FROM utilisateurs u WHERE u.id = s.utilisateur_id AND u.actif)`;

// Vrai si la session de ce cookie est valable et que la personne s'est
// connectée (code, lien, Google, Microsoft) il y a moins de
// connexionRecenteMinutes. cree_le est l'heure de la connexion : une visite
// repousse l'échéance d'inactivité, jamais elle.
export async function connexionRecenteDe(valeur: string | undefined): Promise<boolean> {
  const jeton = verifierSignature(valeur);
  if (!jeton) return false;
  const { maximumJours, connexionRecenteMinutes } = refuserDesDureesDeSessionInvalides();
  const ligne = await queryOne(
    `SELECT 1 FROM sessions s WHERE ${SESSION_VALABLE} AND s.cree_le > now() - make_interval(mins => $3)`,
    [empreinte(jeton), maximumJours, connexionRecenteMinutes]
  );
  return ligne !== undefined;
}

export async function connexionRecente(): Promise<boolean> {
  return connexionRecenteDe((await cookies()).get(nomDuCookie())?.value);
}

// Les sessions encore ouvertes du compte de la session courante, hors elle :
// $1 et $2 comme SESSION_VALABLE.
const AUTRES_SESSIONS = `autre.utilisateur_id = (SELECT s.utilisateur_id FROM sessions s WHERE ${SESSION_VALABLE})
  AND autre.empreinte <> $1 AND autre.expire_le > now()`;

async function jetonCourant(): Promise<string | null> {
  return verifierSignature((await cookies()).get(nomDuCookie())?.value);
}

// Le nombre de sessions ouvertes ailleurs (un autre navigateur, un autre
// appareil) pour le compte de la personne connectée ; 0 sans session.
export async function autresSessionsOuvertes(): Promise<number> {
  const jeton = await jetonCourant();
  if (!jeton) return 0;
  const { maximumJours } = refuserDesDureesDeSessionInvalides();
  const ligne = await queryOne<{ nombre: number }>(
    `SELECT count(*)::int AS nombre FROM sessions autre WHERE ${AUTRES_SESSIONS}`,
    [empreinte(jeton), maximumJours]
  );
  return ligne?.nombre ?? 0;
}

// Ferme toutes les sessions du compte de la personne connectée sauf la
// courante, et rend leur nombre ; sans session valable, rien. La connexion
// récente s'exige avant (exigerConnexionRecente de roles.ts) : sinon, un
// cookie volé fermerait la session de la personne à qui il a été volé.
export async function fermerLesAutresSessions(): Promise<number> {
  const jeton = await jetonCourant();
  if (!jeton) return 0;
  const { maximumJours } = refuserDesDureesDeSessionInvalides();
  const fermees = await query(`DELETE FROM sessions autre WHERE ${AUTRES_SESSIONS} RETURNING 1`, [
    empreinte(jeton),
    maximumJours,
  ]);
  return fermees.length;
}

export async function fermerSession(): Promise<void> {
  const pot = await cookies();
  const jeton = verifierSignature(pot.get(nomDuCookie())?.value);
  if (jeton) await query("DELETE FROM sessions WHERE empreinte = $1", [empreinte(jeton)]);
  pot.delete({ name: nomDuCookie(), ...attributsDuCookie() });
}

// Une personne par son adresse (le décideur de la brique validation, qui ne
// connaît qu'une adresse), aux mêmes conditions qu'une session.
export async function trouverUtilisateur(email: string, contexte = contexteDeLAppli()): Promise<Utilisateur | null> {
  const ligne = await queryOne<LigneEntree>(
    `SELECT ${COLONNES_ENTREE} FROM utilisateurs u WHERE u.email = $1 AND u.actif`,
    [normaliser(email)]
  );
  if (!ligne) return null;
  const role = roleEffectif(ligne.email, ligne.role, contexte, enBaseDe(ligne));
  return role === null ? null : { email: ligne.email, role };
}

// Toutes les sessions d'un compte qu'on désactive (administration.ts),
// dans la transaction de l'appelant : sans cela, une réactivation ferait
// revivre un cookie resté sur un poste partagé, ou volé.
export async function fermerLesSessionsDe(executeur: ExecuteurSql, utilisateurId: number): Promise<void> {
  await executeur.query("DELETE FROM sessions WHERE utilisateur_id = $1", [utilisateurId]);
}
