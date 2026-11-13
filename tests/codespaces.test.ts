import { afterEach, describe, expect, it, vi } from "vitest";
import { origineDuCodespace, originesDuCodespace } from "../src/lib/codespaces";

/*
 * Essai du 2026-11-13 dans GitHub Codespaces : aucun formulaire ne passait.
 * Le proxy du Codespace transmet l'en-tête Origin « localhost:3000 » et
 * x-forwarded-host « <codespace>-3000.app.github.dev » ; Next refusait la
 * Server Action (connexion par code), les briques rgpd et import-lot leur
 * Route Handler. L'exception ne vaut que dans un Codespace, hors production :
 * partout ailleurs, la protection reste entière.
 */

const CODESPACE = {
  CODESPACE_NAME: "essai-abc123",
  GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev",
};
const HOTE_DU_CODESPACE = "essai-abc123-3000.app.github.dev";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

function dansUnCodespace(nodeEnv: string): void {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("CODESPACE_NAME", CODESPACE.CODESPACE_NAME);
  vi.stubEnv("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", CODESPACE.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN);
}

function horsCodespace(nodeEnv: string): void {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("CODESPACE_NAME", undefined);
  vi.stubEnv("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", undefined);
}

describe("origines admises dans un Codespace", () => {
  it("n'admet rien hors d'un Codespace, en développement comme en production", () => {
    horsCodespace("development");
    expect(originesDuCodespace()).toEqual([]);
    horsCodespace("production");
    expect(originesDuCodespace()).toEqual([]);
  });

  it("n'admet rien en production, même avec les variables d'un Codespace", () => {
    dansUnCodespace("production");
    expect(originesDuCodespace()).toEqual([]);
  });

  it("n'admet rien si une seule des deux variables du Codespace est posée", () => {
    horsCodespace("development");
    vi.stubEnv("CODESPACE_NAME", CODESPACE.CODESPACE_NAME);
    expect(originesDuCodespace()).toEqual([]);
    horsCodespace("development");
    vi.stubEnv("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", CODESPACE.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN);
    expect(originesDuCodespace()).toEqual([]);
  });

  it("admet l'origine localhost:3000 que transmet le proxy, dans un Codespace hors production", () => {
    dansUnCodespace("development");
    expect(originesDuCodespace()).toEqual(["localhost:3000"]);
  });
});

describe("requête venue du navigateur du Codespace (Route Handlers des briques)", () => {
  it("reconnaît l'origine localhost:3000 adressée à l'hôte redirigé de ce Codespace", () => {
    dansUnCodespace("development");
    expect(origineDuCodespace("http://localhost:3000", HOTE_DU_CODESPACE)).toBe(true);
  });

  it("ne reconnaît ni un autre Codespace, ni une autre origine, ni la production, ni un poste", () => {
    dansUnCodespace("development");
    expect(origineDuCodespace("http://localhost:3000", "autre-xyz-3000.app.github.dev")).toBe(false);
    expect(origineDuCodespace("https://autre.exemple.test", HOTE_DU_CODESPACE)).toBe(false);
    expect(origineDuCodespace("null", HOTE_DU_CODESPACE)).toBe(false);
    dansUnCodespace("production");
    expect(origineDuCodespace("http://localhost:3000", HOTE_DU_CODESPACE)).toBe(false);
    horsCodespace("development");
    expect(origineDuCodespace("http://localhost:3000", HOTE_DU_CODESPACE)).toBe(false);
  });
});

describe("next.config.ts", () => {
  async function originesDesServerActions(): Promise<string[] | undefined> {
    vi.resetModules();
    const config = (await import("../next.config")).default;
    return config.experimental?.serverActions?.allowedOrigins;
  }

  it("garde à Next sa protection entière des Server Actions hors d'un Codespace et en production", async () => {
    horsCodespace("development");
    expect(await originesDesServerActions()).toEqual([]);
    horsCodespace("production");
    expect(await originesDesServerActions()).toEqual([]);
    dansUnCodespace("production");
    expect(await originesDesServerActions()).toEqual([]);
  });

  it("admet l'origine du proxy pour les Server Actions dans un Codespace, hors production", async () => {
    dansUnCodespace("development");
    expect(await originesDesServerActions()).toEqual(["localhost:3000"]);
  });
});
