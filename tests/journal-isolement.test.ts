import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Tests-verrous de la brique journal.
 *
 * 1. Elle ne connaît que le socle, la base et, de la brique comptes, qu'elle
 *    exige, les droits et le type des effets de comptes : l'auteur d'une ligne
 *    est la personne de la session, l'historique ne se montre qu'à qui a
 *    journal.consulter, et la désactivation, la réactivation et l'effacement
 *    d'un compte se tracent par le registre des effets. Jamais un module :
 *    ce sont les modules qui l'appellent. Une liste blanche, pour qu'un import
 *    né demain ne passe pas entre les mailles.
 * 2. Le journal ne s'efface ni ne se réécrit depuis l'appli. La base refuse
 *    l'UPDATE (trigger de l'étape de migration) mais garde le DELETE pour la
 *    purge de la brique RGPD, un script lancé par un humain : c'est ce
 *    verrou qui l'interdit au code de l'appli. Cette purge n'écrit pas la
 *    requête en toutes lettres : elle la bâtit depuis la durée que la brique
 *    déclare (confidentialite.ts), et tests/journal.test.ts vérifie que
 *    cette durée ne se purge jamais au passage d'une requête.
 */

const RACINE = process.cwd();
const DOSSIER_BRIQUE = path.join(RACINE, "src", "briques", "journal");

const IMPORTS_PERMIS = [
  /^\.\/[^/]+$/, // un fichier de la brique elle-même, jamais « ../ »
  /^@\/lib\/db\/client$/,
  /^@\/lib\/format$/,
  /^@\/ui$/,
  /^@\/briques\/comptes\/(roles|effets)$/,
];

function importsHorsPermis(source: string): string[] {
  const motif =
    /(?:^|[\s;])(?:import|export)\s[^"'`;]*?from\s*["'`]([^"'`]+)["'`]|(?:^|[\s;])import\s*["'`]([^"'`]+)["'`]|import\s*\(\s*["'`]([^"'`]+)["'`]\s*\)|require\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
  return [...source.matchAll(motif)]
    .map((correspondance) => correspondance[1] ?? correspondance[2] ?? correspondance[3] ?? correspondance[4])
    .filter((chemin) => !IMPORTS_PERMIS.some((permis) => permis.test(chemin)));
}

// Un DELETE, un TRUNCATE ou un UPDATE qui vise la table, quelle que soit la
// casse ou la mise en ligne. « BEFORE UPDATE ON journal_audit » (le trigger)
// n'en est pas un.
const ECRITURE_INTERDITE = /\b(?:DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?|UPDATE)\s+(?:ONLY\s+)?journal_audit\b/i;

function fichiersDe(dossier: string): string[] {
  if (!fs.existsSync(dossier)) return [];
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = path.join(dossier, entree.name);
    if (entree.isDirectory()) return fichiersDe(chemin);
    return /\.(ts|tsx|js|mjs|sql)$/.test(entree.name) ? [chemin] : [];
  });
}

const relatif = (chemin: string) => path.relative(RACINE, chemin).split(path.sep).join("/");

// Les seuls fichiers qui peuvent supprimer des lignes du journal, chacun avec
// sa raison. Vide : la purge de la brique RGPD ne nomme aucune table.
const PURGES_AUTORISEES: Record<string, string> = {};

describe("isolement de la brique journal", () => {
  it("n'importe que le socle, le client de base et les droits de la brique comptes : jamais un module ni une autre brique", () => {
    const fichiers = fichiersDe(DOSSIER_BRIQUE);
    expect(fichiers.length).toBeGreaterThan(0);
    const fautifs = fichiers.flatMap((fichier) =>
      importsHorsPermis(fs.readFileSync(fichier, "utf-8")).map((chemin) => `${relatif(fichier)} importe « ${chemin} »`)
    );
    expect(fautifs).toEqual([]);
  });

  it("attrape un import fautif : un module, la session de comptes, une autre brique, pg", () => {
    const source = [
      `import { lireDossierParIdentifiant } from "@/lib/db/dossiers";`,
      `import { lireSession } from "@/briques/comptes/session";`,
      `import { proposer } from "@/briques/validation/propositions";`,
      `import "pg";`,
      `import { query } from "@/lib/db/client";`,
      `import { exiger } from "@/briques/comptes/roles";`,
      `import { Tableau } from "@/ui";`,
      `import { libelleAction } from "./evenements";`,
    ].join("\n");
    expect(importsHorsPermis(source)).toEqual([
      "@/lib/db/dossiers",
      "@/briques/comptes/session",
      "@/briques/validation/propositions",
      "pg",
    ]);
  });
});

describe("le journal ne s'efface ni ne se réécrit depuis l'appli", () => {
  it("aucun fichier de src/ ni de scripts/ ne supprime, ne vide ni ne modifie journal_audit (la purge revient à la brique RGPD)", () => {
    const fichiers = [...fichiersDe(path.join(RACINE, "src")), ...fichiersDe(path.join(RACINE, "scripts"))];
    expect(fichiers.length).toBeGreaterThan(0);
    const fautifs = fichiers
      .filter((fichier) => ECRITURE_INTERDITE.test(fs.readFileSync(fichier, "utf-8")))
      .map(relatif)
      .filter((chemin) => !Object.hasOwn(PURGES_AUTORISEES, chemin));
    expect(fautifs).toEqual([]);
  });

  it("attrape une suppression, un vidage ou une réécriture, et laisse passer le trigger et la lecture", () => {
    expect(ECRITURE_INTERDITE.test("await query(`DELETE FROM journal_audit WHERE le < $1`)")).toBe(true);
    expect(ECRITURE_INTERDITE.test("delete\n  from journal_audit")).toBe(true);
    expect(ECRITURE_INTERDITE.test("TRUNCATE TABLE journal_audit")).toBe(true);
    expect(ECRITURE_INTERDITE.test("truncate journal_audit")).toBe(true);
    expect(ECRITURE_INTERDITE.test("UPDATE ONLY journal_audit SET libelle = ''")).toBe(true);
    expect(ECRITURE_INTERDITE.test("BEFORE UPDATE ON journal_audit FOR EACH ROW")).toBe(false);
    expect(ECRITURE_INTERDITE.test("SELECT * FROM journal_audit")).toBe(false);
  });
});
