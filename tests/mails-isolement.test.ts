import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Test-verrou : la brique mails ne dépend ni de la base ni d'une session. La
 * connexion par code l'appelle avant toute session, et un site sans
 * base doit pouvoir envoyer un mail de contact : un import de @/lib/db ou de
 * src/app/ la souderait à ce qui n'existe pas encore à ce moment-là. Pas de
 * paquet non plus : Resend s'appelle par fetch, et chaque paquet ajouté passe
 * par l'audit de la CI. Liste blanche, comme tests/calendrier-isolement.test.ts.
 */

const DOSSIER_BRIQUE = path.join(process.cwd(), "src", "briques", "mails");

const IMPORTS_PERMIS = [
  /^\.\/[^/]+$/, // un fichier de la brique elle-même, jamais « ../ »
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

describe("isolement de la brique mails", () => {
  it("n'importe que ses propres fichiers et le format du socle : ni base, ni session, ni paquet", () => {
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

  it("attrape un import fautif : la base, une session, un paquet, la brique voisine", () => {
    const source = [
      `import { query } from "@/lib/db/client";`,
      `import { cookies } from "next/headers";`,
      `import { Resend } from "resend";`,
      `import {`,
      `  exigerRole,`,
      `} from "@/briques/comptes/roles";`,
      `const module = await import("@/app/connexion/actions");`,
      `import { statutEcheance } from "../echeances/calcul";`,
      `import { LOCALE } from "@/lib/format";`,
      `import { composerMail } from "./gabarit";`,
    ].join("\n");
    expect(importsHorsSocle(source)).toEqual([
      "@/lib/db/client",
      "next/headers",
      "resend",
      "@/briques/comptes/roles",
      "@/app/connexion/actions",
      "../echeances/calcul",
    ]);
  });
});
