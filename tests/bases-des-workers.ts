/*
 * globalSetup de vitest : crée une base par worker avant les tests et les
 * supprime après. Les fichiers de test tournent en parallèle, et chacun rejoue
 * schéma et migrations puis vide les tables de la base qu'il vise : sur une
 * base commune, deux migrations simultanées échouaient sur « already exists »
 * et un fichier vidait les lignes d'un autre. tests/base-du-worker.ts fait
 * pointer chaque worker sur la sienne.
 *
 * Créées ici, d'un seul processus et avant le premier worker, plutôt que par
 * scripts/bases-locales.ts ou par chaque worker à la volée :
 * - le script ne connaît pas les bases <appli>_test_<n> des sessions
 *   parallèles, ni celle de la CI ; ici, toute base de test qui passe le
 *   garde de vitest.config.ts a ses bases de workers ;
 * - créées par les workers eux-mêmes, elles demandaient une connexion avant
 *   celle du pool de src/lib/db/client.ts (qui ne vise qu'une base) et un
 *   verrou contre les CREATE DATABASE simultanés.
 * Supprimées à la fin : une base de workers par base de test et par lancement
 * resterait sinon sur le poste, et les assemblages de l'assembleur
 * (tests/aide-assemblage.ts) en créent une neuve à chaque passage.
 *
 * Les CREATE DATABASE passent par query(), la seule porte vers la base : la
 * première requête applique schéma et migrations à la base de DATABASE_URL,
 * une base de test que le garde de vitest.config.ts a déjà acceptée. Une
 * migration cassée arrête donc la suite ici, avant tout test, sur l'erreur de
 * la migration plutôt que sur l'échec de tests/migrations.test.ts.
 */
import type { TestProject } from "vitest/node";
import { query } from "../src/lib/db/client";
import { baseDuWorker } from "../scripts/lib/bases-locales";

declare module "vitest" {
  export interface ProvidedContext {
    // L'URL de la base de test telle que passée à npm test : chaque worker
    // en dérive la sienne (tests/base-du-worker.ts).
    urlDeLaBaseDeTest: string;
  }
}

// Un nom de base entre guillemets : celui de DATABASE_URL n'est contraint que
// par sa fin (_test ou _test_<n>), il peut porter un tiret ou une majuscule.
const identifiant = (nom: string) => `"${nom.replace(/"/g, '""')}"`;

export default async function preparerLesBasesDesWorkers(projet: TestProject) {
  // vitest.config.ts a déjà refusé une URL absente, distante ou hors _test.
  const url = process.env.DATABASE_URL as string;
  const base = decodeURIComponent(new URL(url).pathname.slice(1));
  // VITEST_POOL_ID va de 1 à maxWorkers (vitest 5, PoolRunner.poolId).
  const bases = Array.from({ length: projet.config.maxWorkers }, (_, rang) => baseDuWorker(base, rang + 1));

  // Une base restée d'un lancement interrompu se reprend : les tests vident
  // ce qu'ils visent. Une à une : les CREATE DATABASE simultanés copient tous
  // template1, et n'apportent rien pour quelques bases vides.
  const existantes = new Set(
    (await query<{ datname: string }>("SELECT datname FROM pg_database WHERE datname = ANY($1)", [bases])).map(
      (ligne) => ligne.datname
    )
  );
  for (const nom of bases) {
    if (existantes.has(nom)) continue;
    try {
      await query(`CREATE DATABASE ${identifiant(nom)}`);
    } catch (erreur) {
      // Le teardown n'est pas encore rendu : sans ce ménage, les bases déjà
      // créées resteraient sur le poste.
      await supprimer(bases);
      throw erreur;
    }
  }
  projet.provide("urlDeLaBaseDeTest", url);

  return async () => {
    await supprimer(bases);
    // Ouvert, le pool de ce processus retenait vitest dix secondes après la
    // fin (« close timed out after 10000ms »). client.ts le garde sur
    // globalThis hors production : c'est le seul accès sans toucher au client.
    await globalThis.__slPool?.end();
  };
}

// WITH (FORCE) : un worker arrêté en plein test peut laisser une connexion.
async function supprimer(bases: string[]): Promise<void> {
  for (const nom of bases) await query(`DROP DATABASE IF EXISTS ${identifiant(nom)} WITH (FORCE)`);
}
