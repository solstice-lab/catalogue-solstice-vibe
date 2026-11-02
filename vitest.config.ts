import { defineConfig } from "vitest/config";
import fs from "node:fs";
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
    // Simule next/headers (cookies de la requête) pour tous les tests.
    setupFiles: ["tests/setup.ts"],
    // Chaque fichier de test qui interroge la base rejoue schéma + migrations contre
    // la même base locale : deux fichiers de test en parallèle font courir
    // deux migrations en même temps, l'une échoue sur « already exists »
    // (constat sur un projet précédent : instable en parallèle,
    // systématiquement vert en série).
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
