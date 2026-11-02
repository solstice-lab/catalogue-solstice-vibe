import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Test-verrou : la brique notifications ne connaît que le socle, le client de
 * base et la brique mails, qu'elle déclare dans son `exige`. Elle prévient
 * avant une échéance mais n'importe jamais la brique échéances : le lien se
 * fait côté appli, par une liaison qui fabrique les notifications. Un import
 * de src/briques/echeances/ ou d'un module la souderait à son premier usage,
 * les contrats. Liste blanche, comme tests/echeances-isolement.test.ts.
 */

const DOSSIER_BRIQUE = path.join(process.cwd(), "src", "briques", "notifications");

const IMPORTS_PERMIS = [
  /^\.\/[^/]+$/, // un fichier de la brique elle-même, jamais « ../ »
  /^@\/lib\/db\/client$/,
  /^@\/lib\/format$/,
  /^@\/briques\/mails\/envoi$/,
  // Comparer le secret de la route en temps constant.
  /^node:crypto$/,
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

describe("isolement de la brique notifications", () => {
  it("n'importe que ses fichiers, le client de base, le format et l'envoi de la brique mails : jamais la brique échéances ni un module", () => {
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

  it("attrape un import fautif : la brique échéances, un module, une autre partie de la brique mails, un paquet", () => {
    const source = [
      `import { statutEcheance } from "@/briques/echeances/calcul";`,
      `import type { Echeance } from "../echeances/calcul";`,
      `import {`,
      `  lireContrats,`,
      `} from "@/lib/db/contrats";`,
      "const liaison = await import(`@/lib/notifications-contrats`);",
      `import { creerEnvoyeurResend } from "@/briques/mails/resend";`,
      `import { Pool } from "pg";`,
      `import { query } from "@/lib/db/client";`,
      `import { envoyerMail } from "@/briques/mails/envoi";`,
      `import { estJourDEnvoi } from "./jour";`,
    ].join("\n");
    expect(importsHorsSocle(source)).toEqual([
      "@/briques/echeances/calcul",
      "../echeances/calcul",
      "@/lib/db/contrats",
      "@/lib/notifications-contrats",
      "@/briques/mails/resend",
      "pg",
    ]);
  });
});
