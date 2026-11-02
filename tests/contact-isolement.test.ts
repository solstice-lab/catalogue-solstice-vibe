import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Test-verrou : la brique contact sert une vitrine, sans module ni
 * connexion. Elle n'importe donc ni la session ni un module : le kit, la base
 * (la limite d'envois), et la brique mails pour l'envoi. Pas de paquet non
 * plus : chaque paquet ajouté passe par l'audit de la CI. Liste blanche, comme
 * tests/mails-isolement.test.ts.
 */

const DOSSIER_BRIQUE = path.join(process.cwd(), "src", "briques", "contact");

const IMPORTS_PERMIS = [
  /^\.\/[^/]+$/, // un fichier de la brique elle-même, jamais « ../ »
  /^@\/ui$/,
  /^@\/lib\/db\/client$/,
  /^@\/lib\/format$/,
  // La lecture de l'adresse IP, partagée avec la brique comptes (connexion par code).
  /^@\/lib\/adresse-ip$/,
  // La brique mails, que la brique contact exige (son README).
  /^@\/briques\/mails\/envoi$/,
  // Les en-têtes de la requête, pour l'adresse IP (actions.ts) : jamais cookies.
  /^next\/headers$/,
  /^next\/link$/,
  /^react$/,
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

describe("isolement de la brique contact", () => {
  it("n'importe que ses fichiers, le kit, la base et la brique mails : ni session, ni module, ni paquet", () => {
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

  it("attrape un import fautif : la session, un module, l'intérieur de la brique mails, un paquet", () => {
    const source = [
      `import { exiger } from "@/briques/comptes/roles";`,
      `import { listerDossiers } from "@/lib/db/dossiers";`,
      `import { composerMail } from "@/briques/mails/gabarit";`,
      `import {`,
      `  Resend,`,
      `} from "resend";`,
      `const module = await import("@/app/contact/page");`,
      `import { statutEcheance } from "../echeances/calcul";`,
      `import { envoyerMail } from "@/briques/mails/envoi";`,
      `import { query } from "@/lib/db/client";`,
      `import { CHAMPS } from "./champs";`,
    ].join("\n");
    expect(importsHorsSocle(source)).toEqual([
      "@/briques/comptes/roles",
      "@/lib/db/dossiers",
      "@/briques/mails/gabarit",
      "resend",
      "@/app/contact/page",
      "../echeances/calcul",
    ]);
  });
});
