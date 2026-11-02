import { describe, expect, it } from "vitest";
import { appliquerSchemaEtMigrations, query } from "../src/lib/db/client";

describe("schéma et migrations", () => {
  it("se rejouent deux fois sans erreur (chaque démarrage les rejoue sur une base déjà migrée)", async () => {
    await appliquerSchemaEtMigrations();
    await expect(appliquerSchemaEtMigrations()).resolves.toBeUndefined();
  });

  it("livrent les colonnes nées en migration même sur une base neuve (dossiers.notes vit dans migrations.ts, pas schema.sql)", async () => {
    const colonnes = await query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'dossiers'`
    );
    expect(colonnes.map((c) => c.column_name)).toContain("notes");
  });
});

describe("migrations de la brique import-lot", () => {
  it("livrent les lots d'import avec la suppression des lignes en cascade sur LEUR lot seulement, et un statut borné", async () => {
    const lien = await query<{ confdeltype: string }>(
      `SELECT confdeltype FROM pg_constraint WHERE conname = 'import_lot_lignes_lot_fk'`
    );
    expect(lien).toHaveLength(1);
    // 'c' = CASCADE : les lignes meurent avec leur lot, rien d'autre ne les référence.
    expect(lien[0].confdeltype).toBe("c");
    const statut = await query(`SELECT 1 FROM pg_constraint WHERE conname = 'import_lots_statut_valide'`);
    expect(statut).toHaveLength(1);
  });

  it("livrent les colonnes et les index des lots d'import (rapport, décisions, lots d'un branchement)", async () => {
    const colonnes = await query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('import_lots', 'import_lot_lignes')`
    );
    const noms = colonnes.map((c) => `${c.table_name}.${c.column_name}`);
    expect(noms).toEqual(
      expect.arrayContaining([
        "import_lots.rapport",
        "import_lots.ecartees",
        "import_lots.fusions",
        "import_lot_lignes.valeurs",
        "import_lot_lignes.decisions",
      ])
    );
    const index = await query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE indexname IN ('import_lots_branchement_idx', 'import_lot_lignes_lot_idx')`
    );
    expect(index).toHaveLength(2);
  });
});
