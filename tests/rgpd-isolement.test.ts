import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Test-verrou : la brique rgpd ne connaît aucune table ni aucun module.
 * Ce que l'appli garde sur une personne, chaque unité le décrit chez elle, et
 * src/config/donnees-personnelles.ts les rassemble, comme src/config/acces.ts
 * rassemble les actions. La brique n'importe donc que ce registre, le format
 * des dates et ses propres fichiers. Liste blanche, comme
 * tests/contact-isolement.test.ts.
 */

const DOSSIER_BRIQUE = path.join(process.cwd(), "src", "briques", "rgpd");

const IMPORTS_PERMIS = [
  /^\.\/[^/]+$/, // un fichier de la brique elle-même, jamais « ../ »
  /^@\/config\/donnees-personnelles$/,
  /^@\/lib\/format$/,
];

function importsHorsSocle(source: string): string[] {
  // Guillemets simples, doubles ET obliques : un import(`@/app/…`) passait.
  const motif =
    /(?:^|[\s;])(?:import|export)\s[^"'`;]*?from\s*["'`]([^"'`]+)["'`]|(?:^|[\s;])import\s*["'`]([^"'`]+)["'`]|import\s*\(\s*["'`]([^"'`]+)["'`]\s*\)|require\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
  return [...source.matchAll(motif)]
    .map((correspondance) => correspondance[1] ?? correspondance[2] ?? correspondance[3] ?? correspondance[4])
    .filter((chemin) => !IMPORTS_PERMIS.some((permis) => permis.test(chemin)));
}

function fichiersDe(dossier: string): string[] {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = path.join(dossier, entree.name);
    if (entree.isDirectory()) return fichiersDe(chemin);
    return /\.(ts|tsx|js|mjs)$/.test(entree.name) ? [chemin] : [];
  });
}

describe("isolement de la brique rgpd", () => {
  it("n'importe que ses fichiers, le registre des données personnelles et le format : ni table, ni module, ni paquet", () => {
    const fichiers = fichiersDe(DOSSIER_BRIQUE);
    // Sans fichier, le verrou passerait sans rien vérifier.
    expect(fichiers.length).toBeGreaterThan(0);
    const fautifs = fichiers.flatMap((fichier) =>
      importsHorsSocle(fs.readFileSync(fichier, "utf-8")).map(
        (chemin) => `${path.relative(process.cwd(), fichier)} importe « ${chemin} »`
      )
    );
    expect(fautifs).toEqual([]);
  });

  it("attrape un import fautif : la base, un module, une autre brique, un paquet", () => {
    const source = [
      `import { query } from "@/lib/db/client";`,
      `import { listerContrats } from "@/lib/db/contrats";`,
      `import { exiger } from "@/briques/comptes/roles";`,
      `import archiver from "archiver";`,
      `import { SOURCES } from "@/config/donnees-personnelles";`,
      `import { aujourdhui } from "@/lib/format";`,
      `import { vientDUnAutreSite } from "./origine";`,
    ].join("\n");
    expect(importsHorsSocle(source)).toEqual([
      "@/lib/db/client",
      "@/lib/db/contrats",
      "@/briques/comptes/roles",
      "archiver",
    ]);
  });
});
