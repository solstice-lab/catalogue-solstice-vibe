import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

/*
 * /sante est la sonde de l'hébergeur et le repère de la CI
 * après un déploiement. Sur un projet précédent, placée derrière
 * l'authentification, elle recevait une redirection et chaque déploiement
 * échouait. Elle doit répondre sans session, sans base, et ne rien livrer
 * d'autre que le commit et l'état de la base.
 *
 * Ces cas valent pour toute appli, qu'elle ait une base ou non. Avec la
 * brique données, ceux d'une base joignable ou tombée sont dans
 * sante-base.test.ts. Chaque test recharge la route dans un
 * registre de modules vierge.
 */

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", undefined);
  vi.stubEnv("COMMIT_DEPLOYE", undefined);
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function interrogerSante(): Promise<{ reponse: Response; corps: unknown }> {
  const { GET } = await import("../src/app/sante/route");
  const reponse = await GET();
  return { reponse, corps: await reponse.json() };
}

describe("route /sante", () => {
  it("répond 200 sans base configurée et sans lever : la sonde ne doit pas dépendre d'une brique optionnelle", async () => {
    const { reponse, corps } = await interrogerSante();
    expect(reponse.status).toBe(200);
    expect(corps).toEqual({ commit: "inconnu", base: "non-configuree" });
  });

  it("répond de même avec une DATABASE_URL vide, comme un hébergeur qui déclare la variable sans valeur", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { reponse, corps } = await interrogerSante();
    expect(reponse.status).toBe(200);
    expect(corps).toEqual({ commit: "inconnu", base: "non-configuree" });
  });

  it("renvoie le commit de COMMIT_DEPLOYE : sans lui, la CI ne sait pas si sa version est en ligne", async () => {
    vi.stubEnv("COMMIT_DEPLOYE", "3f2a9c1");
    expect((await interrogerSante()).corps).toMatchObject({ commit: "3f2a9c1" });

    vi.stubEnv("COMMIT_DEPLOYE", "");
    expect((await interrogerSante()).corps).toMatchObject({ commit: "inconnu" });
  });

  it("n'est jamais mise en cache : une réponse gardée dirait l'ancien commit après un déploiement", async () => {
    const route = await import("../src/app/sante/route");
    expect(route.dynamic).toBe("force-dynamic");
    expect((await route.GET()).headers.get("cache-control")).toBe("no-store");
  });

  it("passe le proxy sans redirection : derrière l'authentification, la sonde échouait à chaque déploiement", () => {
    const reponse = proxy(new NextRequest("http://localhost/sante"));
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("location")).toBeNull();
    expect(reponse.headers.get("x-middleware-next")).toBe("1");
  });
});
