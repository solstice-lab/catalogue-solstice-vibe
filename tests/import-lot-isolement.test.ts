import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Test-verrou : la brique import-lot ne connaît que le socle. Elle doit se
 * brancher sur n'importe quelle entité (contrats, GMAO, un client dont on ne
 * connaît pas encore l'Excel) : un seul import d'un module de l'appli la
 * souderait à son premier client. Liste blanche plutôt que liste noire, pour
 * qu'un module né demain ne passe pas entre les mailles. Modèle :
 * tests/echeances-isolement.test.ts.
 *
 * exceljs n'est permis que dans lecture.ts : changer de bibliothèque (ou
 * lire le .xls un jour) ne doit toucher qu'un fichier.
 *
 * La brique fournit ses écrans : React, Next (navigation et
 * revalidation), le kit `@/ui` et `@/lib/format` rejoignent les imports permis,
 * comme pour la brique échéances. `@/briques/comptes/roles` n'y entre jamais : la brique
 * ne connaît pas les droits, le garde reste en première ligne de l'appli.
 */

const DOSSIER_BRIQUE = path.join(process.cwd(), "src", "briques", "import-lot");

const IMPORTS_PERMIS = [
  /^\.\/[^/]+$/, // un fichier de la brique elle-même, jamais « ../ »
  /^react$/,
  /^next\/(navigation|cache)$/,
  /^@\/ui$/,
  /^@\/lib\/format$/,
  /^@\/lib\/db\/client$/,
  /^@\/lib\/db\/bornes$/,
  /^@\/lib\/cle-rapprochement$/,
  /^@\/lib\/import-fusion$/,
];

const IMPORTS_PAR_FICHIER: Record<string, RegExp[]> = {
  "lecture.ts": [/^exceljs$/, /^jszip$/],
};

function importsHorsSocle(source: string, nomFichier = ""): string[] {
  // Guillemets simples, doubles ET obliques : un import(`@/app/…`) passait.
  const motif =
    /(?:^|[\s;])(?:import|export)\s[^"'`;]*?from\s*["'`]([^"'`]+)["'`]|(?:^|[\s;])import\s*["'`]([^"'`]+)["'`]|import\s*\(\s*["'`]([^"'`]+)["'`]\s*\)|require\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
  const permis = [...IMPORTS_PERMIS, ...(IMPORTS_PAR_FICHIER[nomFichier] ?? [])];
  return [...source.matchAll(motif)]
    .map((correspondance) => correspondance[1] ?? correspondance[2] ?? correspondance[3] ?? correspondance[4])
    .filter((chemin) => !permis.some((motifPermis) => motifPermis.test(chemin)));
}

function fichiersDe(dossier: string): string[] {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = path.join(dossier, entree.name);
    if (entree.isDirectory()) return fichiersDe(chemin);
    return /\.(ts|tsx|js|mjs)$/.test(entree.name) ? [chemin] : [];
  });
}

describe("isolement de la brique import-lot", () => {
  it("n'importe que la brique données (client de base, plus grand INTEGER, clé de rapprochement, règle de fusion), le kit, les formats, React et Next, et exceljs dans lecture.ts : rien de src/app/ ni d'aucun module, ni des droits", () => {
    const fichiers = fichiersDe(DOSSIER_BRIQUE);
    // Sans fichier, le verrou passerait sans rien vérifier.
    expect(fichiers.length).toBeGreaterThan(0);
    const fautifs = fichiers.flatMap((fichier) =>
      importsHorsSocle(fs.readFileSync(fichier, "utf-8"), path.basename(fichier)).map(
        (chemin) => `${path.relative(process.cwd(), fichier)} importe « ${chemin} »`
      )
    );
    expect(fautifs).toEqual([]);
  });

  it("n'importe jamais pg : tout accès à la base passe par src/lib/db/client.ts", () => {
    expect(importsHorsSocle(`import { Pool } from "pg";`, "lot.ts")).toEqual(["pg"]);
  });

  it("attrape un import fautif, sur une ou plusieurs lignes, type seul ou dynamique, les droits de l'appli, et exceljs hors de lecture.ts", () => {
    const source = [
      `import { cheminContrat } from "@/lib/slug";`,
      `import type { Contrat } from "../../app/contrats/ListeContrats";`,
      `import {`,
      `  creerContrat,`,
      `} from "@/lib/db/contrats";`,
      `const module = await import("@/app/contrats/actions");`,
      "const autre = await import(`@/lib/navigation`);",
      `import { exiger } from "@/briques/comptes/roles";`,
      `import { cookies } from "next/headers";`,
      `export { x } from "../voisine";`,
      `import ExcelJS from "exceljs";`,
      `import { query } from "@/lib/db/client";`,
      `import { Tableau } from "@/ui";`,
      `import { lireDate } from "./dates";`,
    ].join("\n");
    expect(importsHorsSocle(source, "lot.ts")).toEqual([
      "@/lib/slug",
      "../../app/contrats/ListeContrats",
      "@/lib/db/contrats",
      "@/app/contrats/actions",
      "@/lib/navigation",
      "@/briques/comptes/roles",
      "next/headers",
      "../voisine",
      "exceljs",
    ]);
    expect(importsHorsSocle(`import ExcelJS from "exceljs";`, "lecture.ts")).toEqual([]);
  });
});
