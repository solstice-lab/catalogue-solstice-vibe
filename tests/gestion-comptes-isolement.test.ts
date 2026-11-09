import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Test-verrou : la brique gestion-comptes n'importe que le socle
 * (le kit, React, les formats) et la brique comptes, qu'elle exige : les règles
 * de l'administration vivent dans comptes (administration.ts), l'écran ne fait
 * que les montrer. Elle ne lit pas la base elle-même, et ne connaît aucun
 * module. Liste blanche, comme tests/comptes-isolement.test.ts.
 */

const DOSSIER_BRIQUE = path.join(process.cwd(), "src", "briques", "gestion-comptes");

const IMPORTS_PERMIS = [
  /^\.\/[^/]+$/, // un fichier de la brique elle-même, jamais « ../ »
  /^@\/ui$/,
  /^@\/lib\/format$/,
  // Exigée dans modules.mjs (BRIQUES["gestion-comptes"].exige). RefusReconnexion :
  // le refus d'un changement de rôle faute de connexion récente, et son bouton
  // « Se reconnecter », rendus comme sur les autres écrans qui l'exigent.
  /^@\/briques\/comptes\/(administration|entree|RefusReconnexion)$/,
  /^react$/,
];

function importsHorsSocle(source: string): string[] {
  const motif =
    /(?:^|[\s;])(?:import|export)\s[^"'`;]*?from\s*["'`]([^"'`]+)["'`]|(?:^|[\s;])import\s*["'`]([^"'`]+)["'`]|import\s*\(\s*["'`]([^"'`]+)["'`]\s*\)|require\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
  return [...source.matchAll(motif)]
    .map((correspondance) => correspondance[1] ?? correspondance[2] ?? correspondance[3] ?? correspondance[4])
    .filter((chemin) => !IMPORTS_PERMIS.some((permis) => permis.test(chemin)));
}

describe("isolement de la brique gestion-comptes", () => {
  it("n'importe que le socle (kit, React, formats) et la brique comptes : ni la base, ni un module, ni une autre brique", () => {
    const fichiers = fs
      .readdirSync(DOSSIER_BRIQUE)
      .filter((nom) => /\.(ts|tsx)$/.test(nom))
      .map((nom) => path.join(DOSSIER_BRIQUE, nom));
    // Sans fichier, le verrou passerait sans rien vérifier.
    expect(fichiers.length).toBeGreaterThan(0);
    const fautifs = fichiers.flatMap((fichier) =>
      importsHorsSocle(fs.readFileSync(fichier, "utf-8")).map(
        (chemin) => `${path.relative(process.cwd(), fichier)} importe « ${chemin} »`
      )
    );
    expect(fautifs).toEqual([]);
  });

  it("attrape un import fautif : la base, un module, une page, une brique non exigée", () => {
    const source = [
      `import { query } from "@/lib/db/client";`,
      `import { listerContrats } from "@/lib/db/contrats";`,
      `import { inviterAction } from "@/app/comptes/actions";`,
      `import { envoyerMail } from "@/briques/mails/envoi";`,
      `import { Bouton } from "@/ui";`,
      `import type { CompteAdministre } from "@/briques/comptes/administration";`,
    ].join("\n");
    expect(importsHorsSocle(source)).toEqual([
      "@/lib/db/client",
      "@/lib/db/contrats",
      "@/app/comptes/actions",
      "@/briques/mails/envoi",
    ]);
  });
});
