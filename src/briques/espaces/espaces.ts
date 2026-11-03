import { randomInt } from "node:crypto";
import { query, transaction, type ExecuteurSql } from "@/lib/db/client";
import { ESPACES } from "@/config/espaces";
import { ALPHABET_CODE, LONGUEUR_CODE, normaliserCode } from "./code";
import { jouerLesEffetsDuDepart } from "./departs";
import type { Adhesion, Espace, MotifDepart, Refus, RoleEspace } from "./domaine";
import { verifierNom, verifierPrenom } from "./saisie";

/*
 * Les gestes de la brique espaces : créer, rejoindre, quitter, retirer un
 * membre, nommer ou retirer un gestionnaire, régénérer le code. Serveur
 * seulement. Les server actions de /espace les appellent après leur garde,
 * avec la personne qu'il rend ; chaque geste retrouve son compte en base par
 * son adresse, actif.
 *
 * Les verrous, pour que deux gestes ne s'attendent jamais l'un l'autre :
 * - créer et rejoindre prennent d'abord le compte : sa ligne (FOR SHARE), puis
 *   un verrou consultatif. La ligne garde le compte actif jusqu'à la fin du
 *   geste : sans elle, une désactivation ou un effacement joué entre la
 *   lecture et l'écriture ne voyait pas l'adhésion à venir, qui naissait
 *   ensuite sur un compte inactif, ou gardait un prénom effacé. Le verrou
 *   consultatif fait passer une à une deux demandes du même compte : sans
 *   lui, elles liraient chacune « aucun espace » et en rejoindraient deux,
 *   malgré le réglage « un seul espace par compte » ;
 * - tous les gestes prennent ensuite la ligne de l'espace (FOR UPDATE), avant
 *   toute lecture des adhésions : le comptage des gestionnaires et l'écriture
 *   se font sous elle, dans la même transaction. Sans elle, deux gestionnaires
 *   qui se rétrogradent l'un l'autre liraient chacun deux gestionnaires, et
 *   passeraient tous deux : le piège du dernier admin de la brique comptes ;
 * - l'invitation prend enfin un verrou consultatif commun à toute l'appli,
 *   pour son plafond (invitations.ts).
 * Les autres gestes lisent le compte sans le verrouiller : prendre sa ligne
 * après celle de l'espace inverserait l'ordre des effets d'un compte désactivé
 * (effets-comptes.ts), qui tiennent la ligne du compte, écrite par la brique
 * comptes, avant de prendre celles des espaces.
 *
 * Une adhésion ne se supprime jamais : elle se termine (départ et motif), et
 * les modules en sont prévenus dans la même transaction, sous le verrou de
 * l'espace (departs.ts).
 */

type Personne = { email: string };

const vocabulaire = () => ESPACES.vocabulaire;

const COMPTE_INTROUVABLE: Refus = { erreur: "Votre compte est introuvable ou désactivé." };
const CODE_MAL_FORME: Refus = {
  erreur: "Ce n'est pas un code d'invitation : huit lettres et chiffres, comme ABCD-EFGH.",
};
const CODE_INCONNU: Refus = {
  erreur: "Aucun code ne correspond : vérifiez-le auprès de la personne qui vous l'a donné.",
};
const TROP_DE_CODES: Refus = { erreur: "Trop de codes faux en une heure : réessayez plus tard." };
const MEMBRE_INTROUVABLE: Refus = { erreur: "Ce membre est introuvable : il est peut-être déjà parti." };

const pasMembre = (): Refus => ({ erreur: `Vous ne faites pas partie ${vocabulaire().du}.` });
const reserve = (): Refus => ({
  erreur: `Ce geste est réservé au rôle « ${vocabulaire().gestionnaire} » ${vocabulaire().du}.`,
});
const dernierGestionnaire = (vous: boolean): Refus => ({
  erreur: `${vous ? "Vous êtes" : "C'est"} le dernier membre au rôle « ${vocabulaire().gestionnaire} » ${vocabulaire().du} : nommez d'abord quelqu'un d'autre à ce rôle.`,
});

const adresseDe = (personne: Personne) => personne.email.trim().toLowerCase();

async function compteDe(executeur: ExecuteurSql, personne: Personne): Promise<number | null> {
  const [ligne] = await executeur.query<{ id: number }>("SELECT id FROM utilisateurs WHERE email = $1 AND actif", [
    adresseDe(personne),
  ]);
  return ligne?.id ?? null;
}

// Le compte actif de la personne, verrouillé jusqu'à la fin de la transaction
// (voir l'en-tête) ; null s'il n'existe pas ou n'est plus actif.
async function verrouillerLeCompte(executeur: ExecuteurSql, personne: Personne): Promise<number | null> {
  const [ligne] = await executeur.query<{ id: number }>(
    "SELECT id FROM utilisateurs WHERE email = $1 AND actif FOR SHARE",
    [adresseDe(personne)]
  );
  if (!ligne) return null;
  await executeur.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`espaces:compte:${ligne.id}`]);
  return ligne.id;
}

async function verrouillerLEspace(executeur: ExecuteurSql, espaceId: number): Promise<Espace | null> {
  const [espace] = await executeur.query<Espace>("SELECT id, nom, code FROM espaces WHERE id = $1 FOR UPDATE", [
    espaceId,
  ]);
  return espace ?? null;
}

type AdhesionEnCours = { id: number; role: RoleEspace; prenom: string };

async function adhesionEnCours(
  executeur: ExecuteurSql,
  espaceId: number,
  utilisateurId: number
): Promise<AdhesionEnCours | null> {
  const [ligne] = await executeur.query<AdhesionEnCours>(
    `SELECT id, role, prenom FROM espaces_adhesions
      WHERE espace_id = $1 AND utilisateur_id = $2 AND depart_le IS NULL`,
    [espaceId, utilisateurId]
  );
  return ligne ?? null;
}

async function membresEnCours(executeur: ExecuteurSql, espaceId: number): Promise<number> {
  const [ligne] = await executeur.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM espaces_adhesions WHERE espace_id = $1 AND depart_le IS NULL",
    [espaceId]
  );
  return ligne.n;
}

async function gestionnairesEnCours(executeur: ExecuteurSql, espaceId: number): Promise<number> {
  const [ligne] = await executeur.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM espaces_adhesions
      WHERE espace_id = $1 AND depart_le IS NULL AND role = 'gestionnaire'`,
    [espaceId]
  );
  return ligne.n;
}

async function terminer(executeur: ExecuteurSql, adhesionId: number, motif: MotifDepart): Promise<void> {
  await executeur.query("UPDATE espaces_adhesions SET depart_le = now(), motif_depart = $2 WHERE id = $1", [
    adhesionId,
    motif,
  ]);
}

// Avec le réglage « un seul espace par compte », le refus à qui en a déjà un.
// À lire sous le verrou du compte.
async function refusSiDejaUnEspace(executeur: ExecuteurSql, utilisateurId: number): Promise<Refus | null> {
  if (ESPACES.plusieursParCompte) return null;
  const [ligne] = await executeur.query<{ nom: string }>(
    `SELECT e.nom FROM espaces_adhesions a JOIN espaces e ON e.id = a.espace_id
      WHERE a.utilisateur_id = $1 AND a.depart_le IS NULL LIMIT 1`,
    [utilisateurId]
  );
  if (!ligne) return null;
  const { du, le, un } = vocabulaire();
  return {
    erreur: `Vous faites déjà partie ${du} « ${ligne.nom} ». Quittez ${le} avant de rejoindre ou de créer ${un}.`,
  };
}

// Un code que n'a aucun espace. La contrainte d'unicité tranche en dernier
// ressort ; avec 31 puissance 8 codes, dix tirages pris de suite ne se voient pas.
async function tirerUnCodeLibre(executeur: ExecuteurSql): Promise<string> {
  for (let tirage = 0; tirage < 10; tirage++) {
    const code = Array.from({ length: LONGUEUR_CODE }, () => ALPHABET_CODE[randomInt(ALPHABET_CODE.length)]).join("");
    const [pris] = await executeur.query("SELECT 1 FROM espaces WHERE code = $1", [code]);
    if (!pris) return code;
  }
  throw new Error("Brique espaces : aucun code libre en dix tirages.");
}

/**
 * L'adhésion en cours de la personne, si elle est gestionnaire de l'espace :
 * prend le verrou de l'espace, à appeler en tête de transaction.
 */
export async function gestionnaireDe(
  executeur: ExecuteurSql,
  personne: Personne,
  espaceId: number
): Promise<AdhesionEnCours | Refus> {
  if (!(await verrouillerLEspace(executeur, espaceId))) return pasMembre();
  const utilisateurId = await compteDe(executeur, personne);
  if (utilisateurId === null) return COMPTE_INTROUVABLE;
  const adhesion = await adhesionEnCours(executeur, espaceId, utilisateurId);
  if (!adhesion) return pasMembre();
  if (adhesion.role !== "gestionnaire") return reserve();
  return adhesion;
}

/**
 * Un espace qui a des membres et plus aucun gestionnaire reçoit le plus ancien
 * d'entre eux comme gestionnaire. Sous le verrou de l'espace, pris par l'appelant.
 */
export async function nommerUnSuccesseur(executeur: ExecuteurSql, espaceId: number): Promise<void> {
  if ((await gestionnairesEnCours(executeur, espaceId)) > 0) return;
  await executeur.query(
    `UPDATE espaces_adhesions SET role = 'gestionnaire'
      WHERE id = (SELECT id FROM espaces_adhesions
                   WHERE espace_id = $1 AND depart_le IS NULL
                   ORDER BY arrivee_le, id LIMIT 1)`,
    [espaceId]
  );
}

export async function creerEspace(
  personne: Personne,
  saisie: { nom: string; prenom: string }
): Promise<Refus | { espace: Espace }> {
  const nom = verifierNom(saisie.nom);
  if ("erreur" in nom) return nom;
  const prenom = verifierPrenom(saisie.prenom);
  if ("erreur" in prenom) return prenom;
  return transaction(async (tx) => {
    const utilisateurId = await verrouillerLeCompte(tx, personne);
    if (utilisateurId === null) return COMPTE_INTROUVABLE;
    const deja = await refusSiDejaUnEspace(tx, utilisateurId);
    if (deja) return deja;
    const code = await tirerUnCodeLibre(tx);
    const [espace] = await tx.query<Espace>("INSERT INTO espaces (nom, code) VALUES ($1, $2) RETURNING id, nom, code", [
      nom.valeur,
      code,
    ]);
    await tx.query(
      "INSERT INTO espaces_adhesions (espace_id, utilisateur_id, prenom, role) VALUES ($1, $2, $3, 'gestionnaire')",
      [espace.id, utilisateurId, prenom.valeur]
    );
    return { espace };
  });
}

/**
 * Rejoindre par le code. Rejoindre un espace dont on est déjà membre ne fait
 * rien de plus (`deja`). Un espace sans membre revient à qui le rejoint, comme
 * gestionnaire. Les codes faux d'un compte se comptent en base : au plafond,
 * même le bon code est refusé, sinon le plafond n'arrêterait rien.
 */
export async function rejoindre(
  personne: Personne,
  saisie: { code: string; prenom: string }
): Promise<Refus | { espace: Espace; deja: boolean }> {
  const prenom = verifierPrenom(saisie.prenom);
  if ("erreur" in prenom) return prenom;
  const code = normaliserCode(saisie.code);
  if (code === null) return CODE_MAL_FORME;
  return transaction(async (tx) => {
    const utilisateurId = await verrouillerLeCompte(tx, personne);
    if (utilisateurId === null) return COMPTE_INTROUVABLE;

    // Les essais de plus d'une heure ne comptent plus : ils partent, ceux de
    // tous les comptes, à chaque saisie.
    await tx.query("DELETE FROM espaces_essais_code WHERE essaye_le < now() - interval '1 hour'");
    const [essais] = await tx.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM espaces_essais_code WHERE utilisateur_id = $1",
      [utilisateurId]
    );
    if (essais.n >= ESPACES.plafonds.codesFauxParHeure) return TROP_DE_CODES;

    const [espace] = await tx.query<Espace>("SELECT id, nom, code FROM espaces WHERE code = $1 FOR UPDATE", [code]);
    if (!espace) {
      await tx.query("INSERT INTO espaces_essais_code (utilisateur_id) VALUES ($1)", [utilisateurId]);
      return CODE_INCONNU;
    }
    if (await adhesionEnCours(tx, espace.id, utilisateurId)) return { espace, deja: true };
    const deja = await refusSiDejaUnEspace(tx, utilisateurId);
    if (deja) return deja;
    const role: RoleEspace = (await membresEnCours(tx, espace.id)) === 0 ? "gestionnaire" : "membre";
    await tx.query("INSERT INTO espaces_adhesions (espace_id, utilisateur_id, prenom, role) VALUES ($1, $2, $3, $4)", [
      espace.id,
      utilisateurId,
      prenom.valeur,
      role,
    ]);
    return { espace, deja: false };
  });
}

/** Seul dans l'espace, le dernier gestionnaire part ; avec d'autres membres, il nomme d'abord quelqu'un. */
export async function quitter(personne: Personne, espaceId: number): Promise<Refus | undefined> {
  return transaction(async (tx) => {
    if (!(await verrouillerLEspace(tx, espaceId))) return pasMembre();
    const utilisateurId = await compteDe(tx, personne);
    if (utilisateurId === null) return COMPTE_INTROUVABLE;
    const adhesion = await adhesionEnCours(tx, espaceId, utilisateurId);
    if (!adhesion) return pasMembre();
    if (
      adhesion.role === "gestionnaire" &&
      (await gestionnairesEnCours(tx, espaceId)) === 1 &&
      (await membresEnCours(tx, espaceId)) > 1
    ) {
      return dernierGestionnaire(true);
    }
    await terminer(tx, adhesion.id, "parti");
    await jouerLesEffetsDuDepart(tx, { espaceId, utilisateurId, adhesionId: adhesion.id, motif: "parti" });
  });
}

// Un membre en cours de cet espace, désigné par son adhésion.
async function cibleDans(executeur: ExecuteurSql, espaceId: number, adhesionId: number) {
  if (!Number.isInteger(adhesionId)) return null;
  const [cible] = await executeur.query<AdhesionEnCours & { utilisateur_id: number }>(
    `SELECT id, role, prenom, utilisateur_id FROM espaces_adhesions
      WHERE id = $1 AND espace_id = $2 AND depart_le IS NULL`,
    [adhesionId, espaceId]
  );
  return cible ?? null;
}

/** Réservé aux gestionnaires. Se retirer soi-même, c'est quitter. */
export async function retirerMembre(
  personne: Personne,
  espaceId: number,
  adhesionId: number
): Promise<Refus | undefined> {
  return transaction(async (tx) => {
    const acteur = await gestionnaireDe(tx, personne, espaceId);
    if ("erreur" in acteur) return acteur;
    const cible = await cibleDans(tx, espaceId, adhesionId);
    if (!cible) return MEMBRE_INTROUVABLE;
    if (cible.id === acteur.id) return { erreur: `Pour partir, quittez ${vocabulaire().le}.` };
    await terminer(tx, cible.id, "retire");
    await jouerLesEffetsDuDepart(tx, {
      espaceId,
      utilisateurId: cible.utilisateur_id,
      adhesionId: cible.id,
      motif: "retire",
    });
  });
}

export async function nommerGestionnaire(
  personne: Personne,
  espaceId: number,
  adhesionId: number
): Promise<Refus | undefined> {
  return transaction(async (tx) => {
    const acteur = await gestionnaireDe(tx, personne, espaceId);
    if ("erreur" in acteur) return acteur;
    const cible = await cibleDans(tx, espaceId, adhesionId);
    if (!cible) return MEMBRE_INTROUVABLE;
    await tx.query("UPDATE espaces_adhesions SET role = 'gestionnaire' WHERE id = $1", [cible.id]);
  });
}

/** Le dernier gestionnaire garde son rôle, qu'on le lui retire ou qu'il se le retire. */
export async function retirerGestionnaire(
  personne: Personne,
  espaceId: number,
  adhesionId: number
): Promise<Refus | undefined> {
  return transaction(async (tx) => {
    const acteur = await gestionnaireDe(tx, personne, espaceId);
    if ("erreur" in acteur) return acteur;
    const cible = await cibleDans(tx, espaceId, adhesionId);
    if (!cible) return MEMBRE_INTROUVABLE;
    if (cible.role !== "gestionnaire") return undefined;
    if ((await gestionnairesEnCours(tx, espaceId)) === 1) return dernierGestionnaire(cible.id === acteur.id);
    await tx.query("UPDATE espaces_adhesions SET role = 'membre' WHERE id = $1", [cible.id]);
  });
}

/** L'ancien code et son lien cessent aussitôt de marcher. */
export async function regenererCode(personne: Personne, espaceId: number): Promise<Refus | { code: string }> {
  return transaction(async (tx) => {
    const acteur = await gestionnaireDe(tx, personne, espaceId);
    if ("erreur" in acteur) return acteur;
    const code = await tirerUnCodeLibre(tx);
    await tx.query("UPDATE espaces SET code = $2 WHERE id = $1", [espaceId, code]);
    return { code };
  });
}

/** Les membres présents, dans l'ordre d'arrivée : prénom et rôle, jamais l'adresse. */
export async function lireMembres(espaceId: number): Promise<Adhesion[]> {
  const lignes = await query<{ id: number; prenom: string; role: RoleEspace; arrivee_le: Date }>(
    `SELECT id, prenom, role, arrivee_le FROM espaces_adhesions
      WHERE espace_id = $1 AND depart_le IS NULL ORDER BY arrivee_le, id`,
    [espaceId]
  );
  return lignes.map(({ id, prenom, role, arrivee_le }) => ({ id, prenom, role, arriveeLe: arrivee_le.toISOString() }));
}

/** Les espaces dont la personne est membre, le plus récemment rejoint d'abord. */
export async function lireMesEspaces(personne: Personne): Promise<Pick<Espace, "id" | "nom">[]> {
  return query<Pick<Espace, "id" | "nom">>(
    `SELECT e.id, e.nom FROM espaces_adhesions a
       JOIN espaces e ON e.id = a.espace_id
       JOIN utilisateurs u ON u.id = a.utilisateur_id
      WHERE u.email = $1 AND u.actif AND a.depart_le IS NULL
      ORDER BY a.arrivee_le DESC, a.id DESC`,
    [adresseDe(personne)]
  );
}
