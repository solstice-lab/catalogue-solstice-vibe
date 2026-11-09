import { Pool, type QueryResultRow } from "pg";
import fs from "node:fs";
import path from "node:path";
import { appliquerMigrations } from "./migrations";

// Client Postgres — repris d'un projet précédent, où ce mécanisme tourne en
// prod depuis l'origine. L'accès se fait exclusivement via query()/queryOne()/
// transaction() ci-dessous : aucun autre fichier n'importe "pg".
//
// Le pool se crée à la PREMIÈRE REQUÊTE, pas au chargement du module :
// importer un fichier de src/lib/db/ n'exige rien, et `npm run build` passe
// sans DATABASE_URL (créé au chargement, il faisait échouer le build de
// toute page qui importe la base, alors que le build ne l'interroge pas).
// C'est la première requête qui lève si la variable manque.

const SCHEMA_PATH = path.join(process.cwd(), "src", "lib", "db", "schema.sql");

declare global {
  var __slPool: Pool | undefined;
  var __slInitPromise: Promise<void> | undefined;
}

function creerPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL manquant. En local : monter un Postgres jetable et pointer dessus " +
        "(voir la section Données du CLAUDE.md) ; en prod : l'URL de la base managée de l'hébergeur."
    );
  }
  return new Pool({ connectionString, ssl: optionsSsl() });
}

// `::1` sans crochets : la seule forme possible dans le paramètre `host=`.
const HOTE_LOCAL = /^(localhost|127\.0\.0\.1|\[?::1\]?)$/i;

// Le premier hôte non local de DATABASE_URL, ou undefined si tous le sont (ou si
// l'URL manque : creerPool refuse alors, avec son propre message). Même notion
// que `hoteLocal` des gardes (.claude/hooks/gardes.mjs) : localhost, 127.0.0.1,
// [::1], un hôte vide ou un chemin de socket Unix. Une liste d'hôtes
// (`h1:5432,h2:5432`) ou un `host=` en paramètre se juge hôte par hôte : un seul
// distant suffit. Un hôte vide est lu par pg dans PGHOST. Une URL illisible
// n'est pas prouvée locale : elle compte comme distante. Seul l'hôte sort dans
// le message, jamais l'URL, qui porte le mot de passe.
function hoteDistant(env: Record<string, string | undefined>): string | undefined {
  const url = env.DATABASE_URL?.trim();
  if (!url) return undefined;
  const lue = url.match(/^postgres(?:ql)?:\/\/([^/?#]*)([^#]*)/i);
  if (!lue) return "URL illisible";
  const autorite = lue[1].slice(lue[1].lastIndexOf("@") + 1);
  const hotes = autorite.split(",").map((h) => (h.startsWith("[") ? h.slice(0, h.indexOf("]") + 1) : h.split(":")[0]));
  const parametres = new URLSearchParams(lue[2].replace(/^[^?]*\??/, ""));
  for (const nom of ["host", "hostaddr"]) {
    const valeur = parametres.get(nom);
    if (valeur) hotes.push(...valeur.split(","));
  }
  const lus = hotes.flatMap((brut) => {
    try {
      return [decodeURIComponent(brut)];
    } catch {
      return [brut]; // Un % mal formé : l'hôte reste tel quel, et ne sera pas reconnu local.
    }
  });
  const pghote = (env.PGHOST ?? "").trim().split(",");
  const effectifs = lus.flatMap((hote) => (hote === "" ? pghote : [hote]));
  return effectifs.find((hote) => hote !== "" && !hote.startsWith("/") && !HOTE_LOCAL.test(hote));
}

// Le chiffrement de la connexion, tiré de l'environnement. La vérification
// du certificat est la règle : coupée d'office, comme le faisait ce client,
// la connexion était chiffrée vers n'importe quel serveur qui se présentait.
// - PGSSLMODE=disable : pas de SSL (le Postgres local n'en a pas). Refusé en
//   production vers un hôte distant : un .env.local recopié chez l'hébergeur
//   faisait circuler le mot de passe et les données en clair, sans une ligne
//   au journal (audit du 2026-11-09). Le refus lève ici, à la première
//   requête, comme les autres refus de configuration : une erreur qui dit quoi
//   poser, jamais une base qui répond à la place d'un message. Hors production
//   et vers la machine locale, rien ne change : les tests et le Postgres du
//   poste n'ont pas de SSL ;
// - PGSSLMODE=no-verify : chiffré sans vérification, à demander en toutes
//   lettres, pour un hébergeur dont le certificat ne se vérifie pas ;
// - PGSSLROOTCERT : le chemin du CA de l'hébergeur (PEM), quand Node ne le
//   reconnaît pas ;
// - sinon : vérification par les CA que Node reconnaît (sa liste embarquée,
//   que NODE_EXTRA_CA_CERTS complète). Une autre valeur de
//   PGSSLMODE (« require » de libpq, une faute de frappe) ne coupe rien.
// Un `sslmode` écrit dans DATABASE_URL passe avant ces options (pg lit
// l'URL en dernier) : ne pas en mettre. Seul `sslmode=disable` y est refusé
// comme PGSSLMODE=disable ; les autres valeurs ne sont pas jugées.
export function optionsSsl(
  env: Record<string, string | undefined> = process.env
): false | { rejectUnauthorized: boolean; ca?: string } {
  const mode = env.PGSSLMODE?.trim();
  // `sslmode=disable` dans l'URL passe avant les options d'ici (pg le lit en
  // dernier) : le même trou, par une autre porte.
  const dansLUrl = /[?&]sslmode=disable(?:[&#]|$)/i.test(env.DATABASE_URL ?? "");
  if (mode === "disable" || dansLUrl) {
    const distant = env.NODE_ENV === "production" ? hoteDistant(env) : undefined;
    if (distant !== undefined) {
      const quoi = mode === "disable" ? "PGSSLMODE=disable" : "sslmode=disable dans DATABASE_URL";
      throw new Error(
        `${quoi} refusé en production vers un hôte distant (${distant}) : mot de passe et données circuleraient en clair. ` +
          "Retirer PGSSLMODE et tout sslmode de DATABASE_URL (le certificat se vérifie alors), poser PGSSLROOTCERT avec le chemin du CA de l'hébergeur " +
          "s'il n'est pas reconnu par Node, ou PGSSLMODE=no-verify (chiffré sans vérifier) en connaissance de cause."
      );
    }
  }
  if (mode === "disable") return false;
  if (mode === "no-verify") return { rejectUnauthorized: false };
  const cheminCa = env.PGSSLROOTCERT?.trim();
  if (!cheminCa) return { rejectUnauthorized: true };
  try {
    return { rejectUnauthorized: true, ca: fs.readFileSync(cheminCa, "utf-8") };
  } catch (erreur) {
    throw new Error(
      `PGSSLROOTCERT désigne un fichier illisible (${cheminCa}) : donner le chemin du CA de l'hébergeur.`,
      {
        cause: erreur,
      }
    );
  }
}

// Les codes de Node pour un certificat refusé (module tls) : seuls ceux-là
// relèvent de PGSSLROOTCERT ou de no-verify. Une base injoignable ou un mot de
// passe faux gardent leur message.
const CODES_CERTIFICAT = new Set([
  "CERT_REVOKED",
  "CERT_SIGNATURE_FAILURE",
  "CERT_CHAIN_TOO_LONG",
  "INVALID_CA",
  "HOSTNAME_MISMATCH",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_UNTRUSTED",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

// Un certificat refusé au démarrage ne disait que le code de Node
// (« self-signed certificate in certificate chain ») : rien sur la variable
// qui le règle. Exportée pour son test ; toute autre erreur passe telle quelle.
export function erreurDeCertificatTraduite(erreur: unknown): unknown {
  const code = (erreur as { code?: unknown } | null)?.code;
  if (typeof code !== "string" || !CODES_CERTIFICAT.has(code)) return erreur;
  return new Error(
    `Certificat de la base refusé (${code}). Poser (ou corriger) PGSSLROOTCERT avec le chemin du CA de l'hébergeur ; ` +
      "s'il n'en fournit pas, PGSSLMODE=no-verify chiffre sans vérifier, en connaissance de cause.",
    { cause: erreur }
  );
}

// Si creerPool() lève (variable absente, CA illisible), rien n'est mémorisé : la requête
// suivante retente, comme pour un échec d'initialisation (voir plus bas).
let pool: Pool | undefined;

function obtenirPool(): Pool {
  if (!pool) {
    pool = globalThis.__slPool ?? creerPool();
    if (process.env.NODE_ENV !== "production") {
      globalThis.__slPool = pool;
    }
  }
  return pool;
}

// La clé du verrou consultatif qui sérialise le rejeu entre instances. Fixe :
// toutes les instances d'une appli doivent prendre la même. Un verrou
// consultatif vaut pour une base, pas pour le serveur : deux applis sur le même
// Postgres ne s'attendent pas.
const VERROU_DU_REJEU = "schema-et-migrations:rejeu";

// Schéma initial (bases neuves) puis migrations (toutes les bases), dans cet
// ordre. Exportée pour le test qui verrouille l'idempotence : rejouée deux
// fois, elle ne doit rien casser.
//
// Sous verrou : deux instances qui démarrent ensemble rejouaient le schéma en
// même temps, et un CREATE … IF NOT EXISTS concurrent levait « already
// exists » (doublon dans pg_type), l'instance perdante ne démarrait pas (audit
// du 2026-11-09 ; les tests l'avaient vécu sur une base commune à leurs
// workers). La seconde attend la première, puis rejoue sur une base à jour.
// Verrou de session, pas de transaction : le rejeu se fait hors transaction,
// et une étape qui plante ne doit pas défaire les précédentes. Il est tenu
// par une connexion à part, relâché dans tous les cas ; si elle tombe,
// Postgres le relâche avec elle.
export async function appliquerSchemaEtMigrations(): Promise<void> {
  const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
  const pool = obtenirPool();
  const connexion = await pool.connect();
  // Un verrou qui n'a pas pu se rendre (ou se prendre) : la connexion est
  // détruite plutôt que rendue au pool, et Postgres le relâche avec elle.
  // L'erreur d'une étape reste celle qui remonte, avec son nom.
  let rendu = false;
  try {
    await connexion.query("SELECT pg_advisory_lock(hashtext($1))", [VERROU_DU_REJEU]);
    try {
      await pool.query(schema);
      await appliquerMigrations(pool);
    } finally {
      rendu = await connexion.query("SELECT pg_advisory_unlock(hashtext($1))", [VERROU_DU_REJEU]).then(
        () => true,
        () => false
      );
    }
  } finally {
    connexion.release(!rendu);
  }
}

// L'initialisation ne doit être lancée qu'une seule fois par process, et
// toute requête doit attendre qu'elle soit terminée : on mémorise la
// promesse plutôt qu'un simple booléen.
//
// IMPORTANT : on ne met JAMAIS en cache un échec. Si l'init échoue (migration
// bancale, base momentanément injoignable au démarrage…), on remet la
// promesse à undefined pour que la requête suivante RETENTE. Sans ça, une
// promesse rejetée resterait mémorisée et toutes les requêtes suivantes
// retomberaient sur la même erreur jusqu'au redémarrage du process — un
// incident transitoire ne se rétablirait pas tout seul (leçon d'un projet précédent).
function getInitPromise(): Promise<void> {
  if (!globalThis.__slInitPromise) {
    globalThis.__slInitPromise = appliquerSchemaEtMigrations().catch((erreur) => {
      globalThis.__slInitPromise = undefined;
      throw erreurDeCertificatTraduite(erreur);
    });
  }
  return globalThis.__slInitPromise;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  texte: string,
  params: unknown[] = []
): Promise<T[]> {
  await getInitPromise();
  const resultat = await obtenirPool().query<T>(texte, params);
  return resultat.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  texte: string,
  params: unknown[] = []
): Promise<T | undefined> {
  const lignes = await query<T>(texte, params);
  return lignes[0];
}

// Une erreur pg est-elle le refus d'une contrainte donnée ? Les modules
// traduisent ces refus (doublon, clé étrangère) en messages d'écran ; le
// décodage vit ici une fois, pour qu'aucun module n'oublie un code — un
// ON DELETE RESTRICT lève 23001 ou 23503 selon la version de Postgres.
export function estRefusDeLaBase(erreur: unknown, codes: readonly string[], contrainte: string): boolean {
  const { code, constraint } = (erreur ?? {}) as { code?: string; constraint?: string };
  return code !== undefined && codes.includes(code) && constraint === contrainte;
}

// Ce que les fonctions d'accès aux données exécutent : `query` du pool, ou celui
// du client d'une transaction qu'un appelant ouvre (la brique import-lot, la
// brique validation). Une fonction qui prend un exécuteur écrit dans la
// transaction de l'appelant ; par `query()` elle en sortirait, et un échec plus
// loin laisserait son écriture.
export type ExecuteurSql = { query: typeof query };

// Plusieurs requêtes dans une même transaction : elles réussissent ou
// échouent ENSEMBLE (suppressions liées, upserts multi-tables…).
export async function transaction<T>(
  fn: (client: { query: typeof query; queryOne: typeof queryOne }) => Promise<T>
): Promise<T> {
  await getInitPromise();
  const client = await obtenirPool().connect();
  try {
    await client.query("BEGIN");
    const wrapper = {
      query: (async (texte: string, params: unknown[] = []) =>
        (await client.query(texte, params)).rows) as typeof query,
      queryOne: (async (texte: string, params: unknown[] = []) =>
        (await client.query(texte, params)).rows[0]) as typeof queryOne,
    };
    const resultat = await fn(wrapper);
    await client.query("COMMIT");
    return resultat;
  } catch (erreur) {
    await client.query("ROLLBACK");
    throw erreur;
  } finally {
    client.release();
  }
}
