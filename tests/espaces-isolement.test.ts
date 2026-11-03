import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Test-verrou : la brique espaces ne connaît que le socle, et les deux
 * briques qu'elle exige (comptes pour qui est connecté et ses effets, mails
 * pour les invitations). Elle se branche sur n'importe quel module (une coloc,
 * une association) : un seul import d'un module de l'appli la souderait à son
 * premier client. Liste blanche plutôt que liste noire, pour qu'un module né
 * demain ne passe pas entre les mailles. Modèle : tests/import-lot-isolement.test.ts.
 */

const DOSSIER_BRIQUE = path.join(process.cwd(), "src", "briques", "espaces");

const IMPORTS_PERMIS = [
  /^\.\/[^/]+$/, // un fichier de la brique elle-même, jamais « ../ »
  /^react$/,
  /^next\/(navigation|headers)$/,
  /^node:crypto$/,
  /^@\/ui$/,
  /^@\/lib\/format$/,
  /^@\/lib\/db\/client$/,
  /^@\/config\/espaces$/,
  /^@\/briques\/comptes\/(roles|effets)$/,
  /^@\/briques\/mails\/envoi$/,
];

function importsHorsSocle(source: string): string[] {
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

describe("isolement de la brique espaces", () => {
  it("n'importe que le socle (kit, formats, client de base, React, Next), ses réglages, et les briques comptes et mails qu'elle exige : rien de src/app/ ni d'aucun module", () => {
    const fichiers = fichiersDe(DOSSIER_BRIQUE);
    // Sans fichier, le verrou passerait sans rien vérifier.
    expect(fichiers.length).toBeGreaterThan(5);
    const fautifs = fichiers.flatMap((fichier) =>
      importsHorsSocle(fs.readFileSync(fichier, "utf-8")).map(
        (chemin) => `${path.relative(process.cwd(), fichier)} importe « ${chemin} »`
      )
    );
    expect(fautifs).toEqual([]);
  });

  it("attrape un import fautif : un module, une page, une autre brique, pg, sur une ou plusieurs lignes ou dynamique", () => {
    const source = [
      `import { listerTaches } from "@/lib/db/taches";`,
      `import {`,
      `  creerAction,`,
      `} from "@/app/espace/actions";`,
      `import { journaliser } from "@/briques/journal/journal";`,
      `import { Pool } from "pg";`,
      `const m = await import("../voisine");`,
      `import { NOM_APP } from "@/lib/navigation";`,
      `import { query } from "@/lib/db/client";`,
      `import { exiger } from "@/briques/comptes/roles";`,
    ].join("\n");
    expect(importsHorsSocle(source)).toEqual([
      "@/lib/db/taches",
      "@/app/espace/actions",
      "@/briques/journal/journal",
      "pg",
      "../voisine",
      "@/lib/navigation",
    ]);
  });
});
