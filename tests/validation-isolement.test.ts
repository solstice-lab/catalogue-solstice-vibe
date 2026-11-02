import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Test-verrou : la brique validation ne connaît que le socle. Elle doit se
 * brancher sur une demande d'achat, une non-conformité ou des congés : un
 * import de src/briques/comptes/roles.ts (qui tire next/navigation et la règle d'accès
 * d'un module) ou de la brique import-lot la souderait à un client. Les
 * droits entrent par `peutDecider` du branchement, jamais par un import. Une
 * liste blanche plutôt qu'une liste noire, pour qu'un module né demain ne
 * passe pas entre les mailles.
 */

const DOSSIER_BRIQUE = path.join(process.cwd(), "src", "briques", "validation");

const IMPORTS_PERMIS = [
  /^\.\/[^/]+$/, // un fichier de la brique elle-même, jamais « ../ »
  /^@\/lib\/db\/client$/,
  /^@\/lib\/db\/bornes$/,
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

describe("isolement de la brique validation", () => {
  it("n'importe que le socle (format) et la brique données (client de base, plus grand INTEGER) : ni les droits de la brique comptes, ni un module de l'appli, ni une autre brique", () => {
    const fichiers = fichiersDe(DOSSIER_BRIQUE);
    // Sans fichier de code, le verrou passerait sans rien vérifier.
    expect(fichiers.length).toBeGreaterThan(0);
    const fautifs = fichiers.flatMap((fichier) =>
      importsHorsSocle(fs.readFileSync(fichier, "utf-8")).map(
        (chemin) => `${path.relative(process.cwd(), fichier)} importe « ${chemin} »`
      )
    );
    expect(fautifs).toEqual([]);
  });

  it("attrape un import fautif, sur une ou plusieurs lignes, type seul ou dynamique", () => {
    const source = [
      `import { exiger } from "@/briques/comptes/roles";`,
      `import type { Utilisateur } from "../../lib/roles";`,
      `import {`,
      `  lireLot,`,
      `} from "@/briques/import-lot/lot";`,
      `const module = await import("@/lib/db/achats");`,
      "const navigation = await import(`next/navigation`);",
      `export { x } from "../voisine";`,
      `import "pg";`,
      `import { query } from "@/lib/db/client";`,
      `import { aujourdhui } from "@/lib/format";`,
      `import { STATUTS } from "./cycle";`,
    ].join("\n");
    expect(importsHorsSocle(source)).toEqual([
      "@/briques/comptes/roles",
      "../../lib/roles",
      "@/briques/import-lot/lot",
      "@/lib/db/achats",
      "next/navigation",
      "../voisine",
      "pg",
    ]);
  });
});
