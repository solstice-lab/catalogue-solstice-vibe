import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { query } from "../src/lib/db/client";

/*
 * Test-verrou de l'isolation entre espaces (brique espaces) : un module dont
 * la table est rattachée à un espace (elle a une colonne espace_id) ne
 * l'interroge que par la base de l'espace (exigerMonEspace, brique espaces),
 * jamais par query, queryOne ou transaction du client de base. Sans lui, une
 * requête oubliée lit les fiches de tous les espaces, et rien ne se voit tant
 * qu'on ne teste qu'avec un seul espace : c'est la partie que l'essai
 * tours-de-coloc réécrivait à chaque module (2026-11-03).
 *
 * Les tables rattachées se lisent dans la base, pas dans une liste à tenir :
 * une table neuve avec espace_id entre d'office sous le verrou. Celles de la
 * brique elle-même en sortent : elle filtre ses requêtes par l'espace qu'elle
 * gère, et ses tests le vérifient.
 *
 * Le verrou prouve sa sensibilité sur des sources fautives, et échoue s'il ne
 * relit aucun fichier (cicatrice d'un projet précédent : un test de garde qui
 * ne voyait aucun fichier passait au vert).
 */

const SRC = path.join(process.cwd(), "src");
const BRIQUE = path.join(SRC, "briques", "espaces");
const TABLES_DE_LA_BRIQUE = ["espaces_adhesions", "espaces_invitations"];
const POOL = ["query", "queryOne", "transaction"];

// Les noms du pool qu'un source importe du client de base, hors import de type,
// par tout chemin qui finit par « client » : l'alias, « ./client » depuis
// src/lib/db/, où vivent les fonctions de données des modules, ou un chemin
// relatif plus long. Un import de tout le module (« * as db ») compte pour le
// pool entier.
const CLIENT = /(^|\/)client$/;

function importsDuPool(source: string): string[] {
  const nommes = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  const entier = /import\s+\*\s+as\s+\w+\s+from\s*["']([^"']+)["']/g;
  return [
    ...[...source.matchAll(nommes)]
      .filter((correspondance) => !correspondance[1] && CLIENT.test(correspondance[3]))
      .flatMap((correspondance) => correspondance[2].split(","))
      .map((nom) => nom.trim())
      .filter((nom) => !nom.startsWith("type "))
      .map((nom) => nom.split(/\s+as\s+/)[0])
      .filter((nom) => POOL.includes(nom)),
    ...[...source.matchAll(entier)].filter((correspondance) => CLIENT.test(correspondance[1])).flatMap(() => POOL),
  ];
}

// Les tables rattachées qu'un source nomme alors qu'il importe le pool.
function lecturesHorsAcces(source: string, tables: string[]): string[] {
  if (importsDuPool(source).length === 0) return [];
  return tables.filter((table) => new RegExp(`\\b${table}\\b`, "i").test(source));
}

async function tablesRattachees(): Promise<string[]> {
  const lignes = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND column_name = 'espace_id'
      ORDER BY table_name`
  );
  return lignes.map(({ table_name }) => table_name).filter((table) => !TABLES_DE_LA_BRIQUE.includes(table));
}

function sources(dossier: string): string[] {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = path.join(dossier, entree.name);
    if (entree.isDirectory()) return chemin === BRIQUE ? [] : sources(chemin);
    return /\.(ts|tsx)$/.test(entree.name) ? [chemin] : [];
  });
}

describe("isolation entre espaces : un module rattaché à un espace ne lit sa table que par la base de l'espace", () => {
  it("aucun fichier de src/ n'interroge une table rattachée à un espace par le client de base", async () => {
    const tables = await tablesRattachees();
    const fichiers = sources(SRC);
    expect(fichiers.length).toBeGreaterThan(10);
    const fautes = fichiers.flatMap((fichier) =>
      lecturesHorsAcces(fs.readFileSync(fichier, "utf-8"), tables).map(
        (table) => `${path.relative(process.cwd(), fichier)} interroge ${table} sans la base de l'espace`
      )
    );
    expect(fautes).toEqual([]);
  });

  it("trouve en base une table rattachée par sa colonne espace_id, et laisse les tables de la brique à ses propres tests", async () => {
    const table = "test_isolation_taches";
    await query(`CREATE TABLE IF NOT EXISTS ${table} (id SERIAL PRIMARY KEY, espace_id INTEGER NOT NULL)`);
    try {
      const tables = await tablesRattachees();
      expect(tables).toContain(table);
      for (const propre of TABLES_DE_LA_BRIQUE) expect(tables).not.toContain(propre);
    } finally {
      await query(`DROP TABLE IF EXISTS ${table}`);
    }
  });

  it("attrape un module qui lit une table rattachée par query, queryOne ou transaction, renommé, sur plusieurs lignes, par un chemin relatif ou un import de tout le module (cas fautifs que le verrou doit attraper)", () => {
    const tables = ["taches", "depenses"];
    const fautifs = [
      `import { query } from "@/lib/db/client";\nexport const lister = () => query("SELECT * FROM taches");`,
      `import { queryOne as une } from "./client";\nexport const lire = (id: number) => une("SELECT * FROM depenses WHERE id = $1", [id]);`,
      `import {\n  transaction,\n  type ExecuteurSql,\n} from "@/lib/db/client";\nconst x = "UPDATE Taches SET fait = true";`,
      `import { query } from "../../lib/db/client";\nquery("SELECT * FROM taches");`,
      `import * as db from "@/lib/db/client";\ndb.query("SELECT * FROM depenses");`,
    ];
    expect(fautifs.map((source) => lecturesHorsAcces(source, tables))).toEqual([
      ["taches"],
      ["depenses"],
      ["taches"],
      ["taches"],
      ["depenses"],
    ]);
  });

  it("laisse passer un module qui passe par la base de l'espace, un import de type seul, et le client de base sur une table non rattachée", () => {
    const tables = ["taches"];
    expect(
      lecturesHorsAcces(
        `import type { BaseEspace } from "@/briques/espaces/acces";\nexport const lister = (base: BaseEspace) => base.query("SELECT * FROM taches WHERE espace_id = $1");`,
        tables
      )
    ).toEqual([]);
    expect(
      lecturesHorsAcces(`import type { ExecuteurSql } from "@/lib/db/client";\nconst x = "FROM taches";`, tables)
    ).toEqual([]);
    expect(
      lecturesHorsAcces(`import { query } from "@/lib/db/client";\nquery("SELECT * FROM categories");`, tables)
    ).toEqual([]);
  });
});
