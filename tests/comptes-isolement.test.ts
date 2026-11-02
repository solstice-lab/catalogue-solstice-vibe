import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Test-verrou : la brique comptes n'importe que le socle (le
 * kit, Next, React, node:crypto), la brique données (le client de base) et la
 * configuration que l'appli remplit (src/config/acces.ts et comptes.ts),
 * l'adresse IP du visiteur (src/lib/adresse-ip.ts, partagée avec contact) et l'envoi de la
 * brique mails pour la connexion par code. Un seul paquet, oauth4webapi,
 * pour le protocole de la connexion avec Google : la session, elle,
 * reste maison (décision du 2026-10-22, voir son README), sans paquet
 * d'authentification. Elle ne connaît aucun module : ce sont eux qui
 * l'appellent (exiger en première ligne de chaque page), jamais l'inverse. Une
 * autre brique n'y entre que déclarée dans son `exige` (la liste de
 * l'assembleur du catalogue, que son test fait respecter) : mails seule
 * aujourd'hui. Liste blanche, comme tests/mails-isolement.test.ts.
 */

const DOSSIER_BRIQUE = path.join(process.cwd(), "src", "briques", "comptes");

const IMPORTS_PERMIS = [
  /^\.\/[^/]+$/, // un fichier de la brique elle-même, jamais « ../ »
  /^@\/ui$/,
  /^@\/config\/(acces|comptes)$/,
  /^@\/lib\/db\/client$/,
  /^@\/lib\/adresse-ip$/,
  // Exigée dans modules.mjs (BRIQUES.comptes.exige) : l'envoi du code.
  /^@\/briques\/mails\/envoi$/,
  /^next\/(headers|navigation|cache|server)$/,
  /^react$/,
  /^node:crypto$/,
  // OpenID Connect pour Google : sans dépendance, certifiée OpenID.
  /^oauth4webapi$/,
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

describe("isolement de la brique comptes", () => {
  it("n'importe que le socle (kit, Next, React, node:crypto, adresse IP), le client de base, la configuration de l'appli, l'envoi de la brique mails et oauth4webapi : aucun module, aucune brique non exigée, aucun autre paquet", () => {
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

  it("attrape un import fautif : un module, une page de l'appli, une brique non exigée, un paquet", () => {
    const source = [
      `import { listerContrats } from "@/lib/db/contrats";`,
      `import { ACTIONS_CONTRATS } from "@/lib/contrats-domaine";`,
      `import {`,
      `  envoyerMail,`,
      `} from "@/briques/validation/decision";`,
      `const module = await import("@/app/dossiers/actions");`,
      `import { statutEcheance } from "../echeances/calcul";`,
      `import NextAuth from "next-auth";`,
      `import { Bouton } from "@/ui";`,
      `import { DROITS } from "@/config/acces";`,
      `import { query } from "@/lib/db/client";`,
      `import { createHmac } from "node:crypto";`,
      `import { entrerEnDemo } from "./demo";`,
      `import { envoyerMail } from "@/briques/mails/envoi";`,
      `import { adresseDuVisiteur } from "@/lib/adresse-ip";`,
      `import * as oauth from "oauth4webapi";`,
      `import { Issuer } from "openid-client";`,
    ].join("\n");
    expect(importsHorsSocle(source)).toEqual([
      "@/lib/db/contrats",
      "@/lib/contrats-domaine",
      "@/briques/validation/decision",
      "@/app/dossiers/actions",
      "../echeances/calcul",
      "next-auth",
      "openid-client",
    ]);
  });
});
