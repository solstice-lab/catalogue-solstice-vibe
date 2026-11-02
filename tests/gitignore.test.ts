import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Test-verrou du .gitignore. Cicatrice d'un projet précédent :
 * des données personnelles sont arrivées dans l'historique git, et les en
 * purger après coup a coûté cher. Le .gitignore est la première barrière ;
 * ce test vérifie qu'il arrête les fichiers types (secrets, dumps, exports,
 * clés, fichiers clients) sans arrêter ce que le dépôt doit suivre (le modèle
 * des variables, le schéma de la brique données, les exemples fictifs).
 *
 * `--no-index` : git check-ignore ignore sinon les règles pour un fichier déjà
 * suivi, et le test passerait sur un exemple suivi que la règle exclurait
 * pourtant à sa prochaine création (un nouvel exemple fictif, un clone neuf).
 */

const RACINE = process.cwd();

// `core.excludesFile` vers un fichier absent : sans lui, les exclusions globales
// du poste comptent aussi. Claude Code y inscrit `.claude/settings.local.json`,
// et le test passait sur ce poste sans que le .gitignore du dépôt ait la règle.
function cheminsIgnores(chemins: string[]): string[] {
  const sansExclusionsGlobales = `core.excludesFile=${path.join(RACINE, ".aucune-exclusion-globale")}`;
  const resultat = spawnSync(
    "git",
    ["-C", RACINE, "-c", sansExclusionsGlobales, "check-ignore", "--no-index", "--stdin", "-z"],
    {
      input: chemins.join("\0"),
      encoding: "utf-8",
    }
  );
  // Code 1 : aucun chemin ignoré. Au-delà : git n'a pas pu répondre, et un
  // test qui le prendrait pour « rien d'ignoré » passerait à tort.
  if (resultat.status !== 0 && resultat.status !== 1) {
    throw new Error(`git check-ignore a échoué (code ${resultat.status}) : ${resultat.stderr}`);
  }
  return resultat.stdout.split("\0").filter(Boolean);
}

function suivisSous(dossier: string): string[] {
  return execFileSync("git", ["-C", RACINE, "ls-files", "-z", "--", dossier], { encoding: "utf-8" })
    .split("\0")
    .filter(Boolean);
}

describe(".gitignore : ce qui ne doit jamais entrer dans l'historique", () => {
  const AIGNORER = [
    // Secrets : un .env.local a déjà pointé la prod sur un autre projet.
    ".env",
    ".env.local",
    ".env.production",
    "sous/dossier/.env.local",
    // Dumps et sauvegardes de base.
    "sauvegarde.dump",
    "base.backup",
    "prod-2026-10-22.sql",
    "scripts/dump.sql",
    // Exports, où qu'ils soient.
    "exports/clients.csv",
    "src/exports/rapport.json",
    // Clés et certificats : une clé commitée puis retirée reste lisible par son SHA.
    "cle.pem",
    "prive.key",
    "extension.crx",
    // Fichiers clients : leur place est donnees-reelles/, jamais suivi.
    "donnees-reelles/clients.xlsx",
    "donnees-reelles/notes.txt",
    "donnees-reelles/exemples/clients.csv",
    // Documents bureautiques déposés hors de scripts/exemples/.
    "clients.csv",
    "scripts/import-client.xlsx",
    "comptabilite.xls",
    "inventaire.ods",
    "contrat-client.pdf",
    "compte-rendu.docx",
    "presentation.pptx",
    // Réglages Claude Code personnels, créés à la main pour couper le hook
    // du dépôt : Claude Code ne l'exclut de git que s'il l'écrit lui-même.
    ".claude/settings.local.json",
    // Une copie de travail de l'app Claude, avec son propre git : le premier
    // npm run format les a toutes reformatées avec le dépôt.
    ".claude/worktrees/une-session/src/app/page.tsx",
  ];

  it("ignore les secrets, dumps, exports, clés et fichiers clients types", () => {
    expect(cheminsIgnores(AIGNORER).sort()).toEqual([...AIGNORER].sort());
  });
});

describe(".gitignore : ce que le dépôt doit continuer de suivre", () => {
  it("laisse passer le modèle des variables et le schéma de la base", () => {
    expect(cheminsIgnores([".env.example", "src/lib/db/schema.sql"])).toEqual([]);
  });

  it("laisse passer les exemples fictifs de scripts/exemples/, suivis ou à venir", () => {
    const exemples = [
      ...suivisSous("scripts/exemples/"),
      "scripts/exemples/nouvel-exemple.csv",
      "scripts/exemples/nouvel-exemple.xlsx",
    ];
    expect(cheminsIgnores(exemples)).toEqual([]);
  });
});
