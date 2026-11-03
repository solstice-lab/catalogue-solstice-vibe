import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { query, queryOne, transaction } from "@/lib/db/client";
import { utilisateurCourant, type Utilisateur } from "@/briques/comptes/roles";
import { ESPACES } from "@/config/espaces";
import type { Adhesion, Espace, Refus, RoleEspace } from "./domaine";

/*
 * L'accès unique d'un module rattaché à un espace : l'espace de la personne
 * connectée, et une base dont chaque requête reçoit l'identifiant de cet
 * espace en $1. Serveur seulement.
 *
 * C'est l'isolation entre groupes que l'essai tours-de-coloc réécrivait à
 * chaque module (2026-11-03) : une requête oubliée y lisait les fiches de
 * toutes les colocs, et rien ne se voyait tant qu'on ne testait qu'avec une
 * seule. tests/espaces-isolation.test.ts refuse un module qui interrogerait une
 * table rattachée à un espace (colonne espace_id) sans passer par ici.
 *
 * L'espace n'est jamais lu dans l'URL ni dans un formulaire : il vient de
 * l'adhésion en cours, relue en base à chaque requête. Un membre retiré perd
 * l'accès à la requête suivante, sans se reconnecter, comme le rôle de la
 * brique comptes : porté par le jeton, il survivait au retrait du droit.
 */

// Le cookie de l'espace choisi, avec plusieurs espaces par compte. Il ne
// donne rien : il désigne une adhésion en cours, revérifiée à chaque requête.
export const COOKIE_ESPACE = "espace_courant";

type Ligne = Awaited<ReturnType<typeof query>>[number];

type Requetes = {
  query<T extends Ligne = Ligne>(texte: string, params?: unknown[]): Promise<T[]>;
  queryOne<T extends Ligne = Ligne>(texte: string, params?: unknown[]): Promise<T | undefined>;
};

/**
 * La base de l'espace : l'identifiant de l'espace est toujours `$1`, les
 * paramètres de l'appelant suivent à partir de `$2`. Une requête qui ne nomme
 * ni `espace_id` ni `$1` est refusée avant de partir.
 */
export type BaseEspace = Requetes & {
  transaction<R>(fn: (tx: Requetes) => Promise<R>): Promise<R>;
};

export type MonEspace = {
  utilisateur: Utilisateur;
  espace: Espace;
  adhesion: Adhesion;
  base: BaseEspace;
};

// Un garde-fou d'appoint, pas la garantie : la garantie est que $1 vaut
// toujours l'espace. Il attrape la requête écrite sans penser à l'espace,
// que Postgres accepterait (un $1 inutilisé ne lève pas toujours). Il se lit
// sans les commentaires SQL : « -- espace_id $1 » ne filtre rien.
function verifierRequete(texte: string): void {
  const sql = texte.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  if (!/\bespace_id\b/.test(sql) || !/\$1(?!\d)/.test(sql)) {
    throw new Error(
      "Brique espaces : une requête de la base de l'espace doit filtrer par espace_id, qui est toujours le paramètre $1."
    );
  }
}

function filtrer<F extends (texte: string, params?: unknown[]) => Promise<unknown>>(executer: F, espaceId: number): F {
  return (async (texte: string, params: unknown[] = []) => {
    verifierRequete(texte);
    return executer(texte, [espaceId, ...params]);
  }) as F;
}

function baseDe(espaceId: number): BaseEspace {
  return {
    query: filtrer(query, espaceId) as Requetes["query"],
    queryOne: filtrer(queryOne, espaceId) as Requetes["queryOne"],
    transaction: (fn) =>
      transaction((tx) =>
        fn({
          query: filtrer(tx.query, espaceId) as Requetes["query"],
          queryOne: filtrer(tx.queryOne, espaceId) as Requetes["queryOne"],
        })
      ),
  };
}

type LigneAdhesion = {
  adhesion_id: number;
  prenom: string;
  role: RoleEspace;
  arrivee_le: Date;
  espace_id: number;
  nom: string;
  code: string;
};

async function choixDuCookie(): Promise<number | null> {
  if (!ESPACES.plusieursParCompte) return null;
  const valeur = (await cookies()).get(COOKIE_ESPACE)?.value;
  const id = Number(valeur);
  return Number.isInteger(id) ? id : null;
}

/**
 * L'espace de la personne connectée, ou null : sans session, sans espace, ou
 * avec un compte désactivé. Avec plusieurs espaces par compte, celui du cookie
 * s'il désigne une adhésion en cours, sinon le plus récemment rejoint.
 */
export const monEspace = cache(async (): Promise<MonEspace | null> => {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) return null;
  const lignes = await query<LigneAdhesion>(
    `SELECT a.id AS adhesion_id, a.prenom, a.role, a.arrivee_le, e.id AS espace_id, e.nom, e.code
       FROM espaces_adhesions a
       JOIN espaces e ON e.id = a.espace_id
       JOIN utilisateurs u ON u.id = a.utilisateur_id
      WHERE u.email = $1 AND u.actif AND a.depart_le IS NULL
      ORDER BY a.arrivee_le DESC, a.id DESC`,
    [utilisateur.email.trim().toLowerCase()]
  );
  if (lignes.length === 0) return null;
  const choisi = await choixDuCookie();
  const ligne = lignes.find((candidate) => candidate.espace_id === choisi) ?? lignes[0];
  return {
    utilisateur,
    espace: { id: ligne.espace_id, nom: ligne.nom, code: ligne.code },
    adhesion: {
      id: ligne.adhesion_id,
      prenom: ligne.prenom,
      role: ligne.role,
      arriveeLe: ligne.arrivee_le.toISOString(),
    },
    base: baseDe(ligne.espace_id),
  };
});

/**
 * À appeler juste après `exiger(action)`, en tête de chaque page et server
 * action d'un module rattaché à un espace : une personne sans espace part vers
 * « Créer ou rejoindre ».
 */
export async function exigerMonEspace(): Promise<MonEspace> {
  const courant = await monEspace();
  if (!courant) redirect("/espace/rejoindre");
  return courant;
}

/** Avec plusieurs espaces par compte : l'espace que la personne veut voir, s'il est le sien. */
export async function choisirEspace(personne: { email: string }, espaceId: number): Promise<Refus | undefined> {
  const membre = await queryOne(
    `SELECT 1 FROM espaces_adhesions a JOIN utilisateurs u ON u.id = a.utilisateur_id
      WHERE a.espace_id = $1 AND u.email = $2 AND u.actif AND a.depart_le IS NULL`,
    [Number.isInteger(espaceId) ? espaceId : 0, personne.email.trim().toLowerCase()]
  );
  if (!membre) return { erreur: `Vous ne faites pas partie ${ESPACES.vocabulaire.du}.` };
  (await cookies()).set(COOKIE_ESPACE, String(espaceId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}
