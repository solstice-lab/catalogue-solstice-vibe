import { defineConfig } from "vitest/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { estBaseDeTest, nomsDesBases, urlLocale } from "./scripts/lib/bases-locales";

/*
 * GARDE ANTI-PROD (décision du cadrage données, 2026-09-09) : les tests ne
 * tournent QUE contre une base locale. Sur un projet précédent, .env.local
 * portait l'URL de PRODUCTION et seule une consigne du CLAUDE.md protégeait
 * les tests d'écrire en prod — ici le refus est dans le code, il ne
 * s'oublie pas.
 *
 * DATABASE_URL est requis pour toute la suite, même si le pool de
 * src/lib/db/client.ts ne naît qu'à la première requête : la plupart des
 * fichiers interrogent la base, et l'exiger ici fait passer chaque lancement
 * par la vérification d'hôte et de nom ci-dessous.
 * La base attendue est <appli>_test (nom de package.json), que crée
 * scripts/bases-locales.ts :
 *   DATABASE_URL=postgresql://postgres@localhost:5433/<appli>_test PGSSLMODE=disable npm test
 */
// Calculée au refus seulement : un name de package.json que nomsDesBases()
// rejette ne doit pas bloquer une suite lancée sur une bonne base.
function commandeDesTests(): string {
  const { name: nomPaquet } = JSON.parse(fs.readFileSync(path.resolve(__dirname, "package.json"), "utf-8"));
  return (
    "  npx tsx scripts/bases-locales.ts\n" +
    `  DATABASE_URL=${urlLocale(nomsDesBases(nomPaquet).test, 5433)} PGSSLMODE=disable npm test`
  );
}

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL manquant pour les tests. Créer la base locale jetable puis pointer dessus :\n" + commandeDesTests()
  );
}
const adresse = new URL(url);
const hote = adresse.hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(hote)) {
  throw new Error(
    `Les tests refusent de tourner contre « ${hote} » : base LOCALE uniquement (localhost). ` +
      "Jamais une base distante — elle pourrait être la production."
  );
}
// Localhost ne suffit pas : la base de dev est locale elle aussi, et les tests
// vident les tables. Sur un projet précédent, un `npm test` lancé sur elle a
// effacé le compte admin.
const base = decodeURIComponent(adresse.pathname.slice(1));
if (!estBaseDeTest(base)) {
  throw new Error(
    `Les tests refusent la base « ${base || "(aucune dans l'URL)"} » : son nom ne finit pas par _test ou _test_<n>. ` +
      "Les tests vident les tables, une base de dev y perdrait ses données. Créer la base de test puis pointer dessus :\n" +
      commandeDesTests()
  );
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: [
      // Chaque worker sur sa propre base, avant toute requête (premier de la liste).
      "tests/base-du-worker.ts",
      // Simule next/headers (cookies de la requête) pour tous les tests.
      "tests/setup.ts",
    ],
    // Fichiers en parallèle, une base par worker : chaque fichier qui
    // interroge la base rejoue schéma et migrations puis vide les tables, et
    // sur une base commune deux fichiers en parallèle échouaient sur
    // « already exists » (constat sur un projet précédent). En série, la
    // suite durait 6 min 30 sur un poste à 4 cœurs (2026-11-09).
    // tests/bases-des-workers.ts crée <base>_w1 à <base>_w<maxWorkers> et
    // les supprime à la fin. Au plus 4 workers : le Postgres du poste, partagé
    // par toutes les applis et les sessions parallèles, accepte 100 connexions,
    // et chaque worker ouvre son pool.
    globalSetup: ["tests/bases-des-workers.ts"],
    maxWorkers: Math.max(1, Math.min(4, os.availableParallelism() - 1)),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
