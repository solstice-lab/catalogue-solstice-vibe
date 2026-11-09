import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import net from "node:net";

/*
 * Avec la brique données : /sante fait un vrai SELECT 1 et
 * répond 503 si la base ne répond pas. Les cas sans base sont dans
 * sante.test.ts, que toute appli garde ; ceux-ci partent avec la brique,
 * comme le pool qu'ils manipulent.
 *
 * Chaque test recharge la route dans un registre de modules vierge et sans
 * pool mémorisé sur globalThis (comme client-pool.test.ts) : la base visée
 * change d'un test à l'autre.
 */

const urlDesTests = process.env.DATABASE_URL;
let poolDesAutresTests: typeof globalThis.__slPool;
let initDesAutresTests: typeof globalThis.__slInitialisationDuProcessus;

beforeEach(() => {
  poolDesAutresTests = globalThis.__slPool;
  initDesAutresTests = globalThis.__slInitialisationDuProcessus;
  globalThis.__slPool = undefined;
  globalThis.__slInitialisationDuProcessus = undefined;
  delete process.env.DATABASE_URL;
  vi.stubEnv("COMMIT_DEPLOYE", undefined);
  vi.resetModules();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  // Une affectation de undefined écrirait la chaîne "undefined" dans l'environnement.
  if (urlDesTests === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = urlDesTests;
  await globalThis.__slPool?.end();
  globalThis.__slPool = poolDesAutresTests;
  globalThis.__slInitialisationDuProcessus = initDesAutresTests;
});

async function interrogerSante(): Promise<{ reponse: Response; corps: unknown }> {
  const { GET } = await import("../src/app/sante/route");
  const reponse = await GET();
  return { reponse, corps: await reponse.json() };
}

// Un port que personne n'écoute : on le prend au système puis on le rend.
// Rien n'est arrêté pour simuler une base tombée.
async function portFerme(): Promise<number> {
  const serveur = net.createServer();
  await new Promise<void>((resolve) => serveur.listen(0, "127.0.0.1", resolve));
  const { port } = serveur.address() as net.AddressInfo;
  await new Promise((resolve) => serveur.close(resolve));
  return port;
}

describe("route /sante, avec la brique données", () => {
  it("répond 200 avec une base joignable, après un vrai SELECT 1", async () => {
    process.env.DATABASE_URL = urlDesTests;
    const { reponse, corps } = await interrogerSante();
    expect(reponse.status).toBe(200);
    expect(corps).toEqual({ commit: "inconnu", base: "ok" });
  });

  it("répond 503 avec une base injoignable, sans le message brut de Postgres ni l'adresse de la base dans la réponse", async () => {
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.DATABASE_URL = `postgresql://postgres@127.0.0.1:${await portFerme()}/appli_test_127`;

    const { reponse, corps } = await interrogerSante();
    expect(reponse.status).toBe(503);
    // Égalité stricte : aucune autre clé, donc ni erreur ni URL.
    expect(corps).toEqual({ commit: "inconnu", base: "injoignable" });
    // La cause reste lisible dans les journaux du serveur, pour le diagnostic.
    expect(journal).toHaveBeenCalled();
  });

  it("n'est pas mise en cache non plus quand la base tombe : une réponse gardée dirait une base vivante après sa chute", async () => {
    const route = await import("../src/app/sante/route");
    process.env.DATABASE_URL = `postgresql://postgres@127.0.0.1:${await portFerme()}/appli_test_127`;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await route.GET()).headers.get("cache-control")).toBe("no-store");
  });
});
