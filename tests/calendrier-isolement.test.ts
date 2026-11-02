import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Test-verrou : la brique calendrier ne connaît que le socle. Comme la brique
 * échéances (tests/echeances-isolement.test.ts), elle doit pouvoir se brancher
 * sur une autre entité d'une autre appli : un seul import de src/app/ ou d'un
 * module la souderait à la GMAO. Une liste blanche plutôt qu'une liste noire,
 * pour qu'un module né demain ne passe pas entre les mailles.
 */

const DOSSIER_BRIQUE = path.join(process.cwd(), "src", "briques", "calendrier");

const IMPORTS_PERMIS = [
  /^\.\/[^/]+$/, // un fichier de la brique elle-même, jamais « ../ »
  /^react$/,
  /^next\/link$/,
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

describe("isolement de la brique calendrier", () => {
  it("n'importe que le socle (kit, format) et la brique données (client de base) : rien de src/app/, de src/lib/slug ni d'aucun module de l'appli", () => {
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

  it("attrape un import fautif, sur une ou plusieurs lignes, type seul ou dynamique, y compris la brique voisine", () => {
    const source = [
      `import { cheminIntervention } from "@/lib/slug";`,
      `import type { Intervention } from "../../app/interventions/ListeInterventions";`,
      `import {`,
      `  supprimerInterventionsAction,`,
      `} from "@/app/interventions/actions";`,
      `const module = await import("@/lib/db/interventions");`,
      "const actions = await import(`@/app/interventions/actions`);",
      `import { statutEcheance } from "../echeances/calcul";`,
      `export { x } from "../voisine";`,
      `import "pg";`,
      `import { GrilleMois } from "@/ui";`,
      `import { query } from "@/lib/db/client";`,
      `import { construireSemaines } from "./calcul";`,
    ].join("\n");
    expect(importsHorsSocle(source)).toEqual([
      "@/lib/slug",
      "../../app/interventions/ListeInterventions",
      "@/app/interventions/actions",
      "@/lib/db/interventions",
      "@/app/interventions/actions",
      "../echeances/calcul",
      "../voisine",
      "pg",
    ]);
  });
});
