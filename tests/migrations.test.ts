import { describe, expect, it, vi } from "vitest";
import { appliquerSchemaEtMigrations, query } from "../src/lib/db/client";

describe("schéma et migrations", () => {
  it("se rejouent deux fois sans erreur (chaque démarrage les rejoue sur une base déjà migrée)", async () => {
    await appliquerSchemaEtMigrations();
    await expect(appliquerSchemaEtMigrations()).resolves.toBeUndefined();
  });

  // Audit du 2026-11-09 : deux instances qui démarrent ensemble (un
  // déploiement qui en lance plusieurs, un redémarrage pendant qu'une autre
  // tourne) rejouaient le schéma en même temps, et un CREATE … IF NOT EXISTS
  // concurrent levait « already exists » : l'instance perdante ne démarrait
  // pas. Les tests l'avaient vécu sur une base commune à leurs workers. Deux
  // chargements du client, chacun avec son pool, tiennent lieu d'instances.
  it("se rejouent sans erreur depuis deux instances qui démarrent ensemble sur une base vide : le rejeu se fait sous verrou", async () => {
    const urlDuWorker = process.env.DATABASE_URL as string;
    const url = new URL(urlDuWorker);
    // Nom en _test, comme toute base que les tests vident (garde de vitest.config.ts).
    const nom = `${decodeURIComponent(url.pathname.slice(1))}_rejeu_test`;
    url.pathname = `/${nom}`;
    await query(`DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
    await query(`CREATE DATABASE "${nom}"`);
    const poolDuWorker = globalThis.__slPool;
    const pools: (typeof globalThis.__slPool)[] = [];
    try {
      process.env.DATABASE_URL = url.toString();
      const rejeux: Promise<void>[] = [];
      for (let instance = 0; instance < 2; instance++) {
        globalThis.__slPool = undefined;
        vi.resetModules();
        const client = await import("../src/lib/db/client");
        // Le pool naît dans la partie synchrone de l'appel, sur DATABASE_URL.
        rejeux.push(client.appliquerSchemaEtMigrations());
        pools.push(globalThis.__slPool);
      }
      expect(new Set(pools).size).toBe(2);
      await expect(Promise.all(rejeux)).resolves.toEqual([undefined, undefined]);
    } finally {
      process.env.DATABASE_URL = urlDuWorker;
      for (const pool of pools) await pool?.end();
      globalThis.__slPool = poolDuWorker;
      vi.resetModules();
      // pool.end() rend la main avant que ses connexions se ferment : un DROP
      // … WITH (FORCE) aussitôt les coupait, et chacune levait une erreur
      // sans personne pour l'écouter. On attend qu'elles soient parties.
      await expect
        .poll(
          async () =>
            (await query<{ n: number }>("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1", [nom]))[0]
              .n,
          { timeout: 10_000 }
        )
        .toBe(0);
      await query(`DROP DATABASE IF EXISTS "${nom}"`);
    }
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
