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
import type { Utilisateur } from "./roles";

/*
 * La session en base. Le rôle n'est jamais dans le cookie : il
 * se relit en base à chaque requête, et retirer un droit agit tout de suite
 * (vécu sur un projet précédent).
 *
 * tests/setup.ts remplace lireSession et trouverUtilisateur pour les tests des
 * modules, qui vérifient ce que fait un module, pas qui s'y connecte.
 */

export const DUREE_SESSION_JOURS = 30;

// Les attributs du cookie, à la pose comme au retrait : un navigateur refuse
// de retirer un cookie __Host- par un en-tête sans Secure, et la session morte
// restait dans le navigateur.
function attributsDuCookie() {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
}

export async function ouvrirSession(compte: Pick<CompteAdmis, "id">): Promise<void> {
  // Avant toute écriture : sans secret valable, rien ne s'ouvre à moitié.
  const secret = secretDeSession();
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
     SELECT $1, u.id, now() + make_interval(days => $3) FROM utilisateurs u WHERE u.id = $2 AND u.actif FOR SHARE
     RETURNING utilisateur_id`,
    [empreinte(jeton), compte.id, DUREE_SESSION_JOURS]
  );
  if (ouverte.length === 0) return;
  await query("UPDATE utilisateurs SET derniere_connexion = now() WHERE id = $1", [compte.id]);
  (await cookies()).set(nomDuCookie(), signer(jeton, secret), {
    ...attributsDuCookie(),
    maxAge: DUREE_SESSION_JOURS * 24 * 60 * 60,
  });
}

// La personne d'un cookie : signature exacte, session non expirée, compte
// actif et encore admis par la configuration. Sinon, personne.
export async function lireSessionDe(
  valeur: string | undefined,
  contexte = contexteDeLAppli()
): Promise<Utilisateur | null> {
  const jeton = verifierSignature(valeur);
  if (!jeton) return null;
  const ligne = await queryOne<LigneEntree>(
    `SELECT ${COLONNES_ENTREE}
       FROM sessions s
       JOIN utilisateurs u ON u.id = s.utilisateur_id
      WHERE s.empreinte = $1 AND s.expire_le > now() AND u.actif`,
    [empreinte(jeton)]
  );
  if (!ligne) return null;
  const role = roleEffectif(ligne.email, ligne.role, contexte, enBaseDe(ligne));
  return role === null ? null : { email: ligne.email, role };
}

export async function lireSession(): Promise<Utilisateur | null> {
  return lireSessionDe((await cookies()).get(nomDuCookie())?.value);
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
