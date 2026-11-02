import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Test-verrou : la brique échéances ne connaît que le socle. Elle naît dans
 * l'appli contrats mais doit pouvoir s'extraire vers le catalogue et se
 * brancher sur un véhicule ou une demande d'achat (README, « Briques ») :
 * un seul import de src/app/contrats/ la soudait à son premier client. Une
 * liste blanche plutôt qu'une liste noire, pour qu'un module né demain ne
 * passe pas entre les mailles.
 */

const DOSSIER_BRIQUE = path.join(process.cwd(), "src", "briques", "echeances");

const IMPORTS_PERMIS = [
  /^\.\/[^/]+$/, // un fichier de la brique elle-même, jamais « ../ »
  /^react$/,
  /^next\/(link|navigation)$/,
  /^@\/ui$/,
  /^@\/lib\/db\/client$/,
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

describe("isolement de la brique échéances", () => {
  it("n'importe que le socle (kit, format) et la brique données (client de base) : rien de src/app/ ni d'aucun module", () => {
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

  it("attrape un import fautif, sur une ou plusieurs lignes, type seul ou dynamique", () => {
    const source = [
      `import { cheminContrat } from "@/lib/slug";`,
      `import type { Contrat } from "../../app/contrats/ListeContrats";`,
      `import {`,
      `  supprimerContratAction,`,
      `} from "@/app/contrats/actions";`,
      `const module = await import("@/lib/db/contrats");`,
      "const actions = await import(`@/app/contrats/actions`);",
      `export { x } from "../voisine";`,
      `import "pg";`,
      `import { Tableau } from "@/ui";`,
      `import { query } from "@/lib/db/client";`,
      `import { statutEcheance } from "./calcul";`,
    ].join("\n");
    expect(importsHorsSocle(source)).toEqual([
      "@/lib/slug",
      "../../app/contrats/ListeContrats",
      "@/app/contrats/actions",
      "@/lib/db/contrats",
      "@/app/contrats/actions",
      "../voisine",
      "pg",
    ]);
  });
});
