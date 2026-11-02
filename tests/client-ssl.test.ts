import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { erreurDeCertificatTraduite, optionsSsl } from "../src/lib/db/client";

// Le client coupait la vérification du certificat de la base dès que
// PGSSLMODE ne valait pas « disable » : une connexion chiffrée, mais à
// n'importe quel serveur qui se présente. La vérification est la règle, la
// coupure se demande en toutes lettres.
//
// pg est simulé, frontière vers un serveur TLS que la base locale des tests
// n'a pas : le faux pool garde les options reçues et répond par le refus
// choisi. Aucun test de ce fichier n'interroge la vraie base.

const { optionsDesPools, reponse } = vi.hoisted(() => ({
  optionsDesPools: [] as unknown[],
  reponse: { refus: undefined as unknown },
}));

vi.mock("pg", () => ({
  Pool: class {
    constructor(options: unknown) {
      optionsDesPools.push(options);
    }
    async query() {
      throw reponse.refus;
    }
    async end() {}
  },
}));

const dossiers: string[] = [];

afterEach(() => {
  for (const dossier of dossiers.splice(0)) fs.rmSync(dossier, { recursive: true, force: true });
});

function fichierCa(contenu: string): string {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "client-ssl-"));
  dossiers.push(dossier);
  const chemin = path.join(dossier, "ca.pem");
  fs.writeFileSync(chemin, contenu);
  return chemin;
}

describe("client de base : options SSL tirées de l'environnement", () => {
  it("PGSSLMODE=disable : pas de SSL (le Postgres local n'en a pas)", () => {
    expect(optionsSsl({ PGSSLMODE: "disable" })).toBe(false);
  });

  it("PGSSLMODE=no-verify : chiffré sans vérifier le certificat, et seulement sur demande explicite", () => {
    expect(optionsSsl({ PGSSLMODE: "no-verify" })).toEqual({ rejectUnauthorized: false });
  });

  it("PGSSLROOTCERT posé : le certificat se vérifie avec ce CA", () => {
    const ca = "-----BEGIN CERTIFICATE-----\nfactice\n-----END CERTIFICATE-----\n";
    expect(optionsSsl({ PGSSLROOTCERT: fichierCa(ca) })).toEqual({ rejectUnauthorized: true, ca });
  });

  it("sans rien : le certificat se vérifie par les CA que Node reconnaît (la vérification était coupée par défaut)", () => {
    expect(optionsSsl({})).toEqual({ rejectUnauthorized: true });
    // Une valeur de libpq que le client ne connaît pas ne coupe rien.
    expect(optionsSsl({ PGSSLMODE: "require" })).toEqual({ rejectUnauthorized: true });
  });

  it("PGSSLROOTCERT vers un fichier absent : l'erreur nomme la variable", () => {
    expect(() => optionsSsl({ PGSSLROOTCERT: path.join(os.tmpdir(), "absent-client-ssl.pem") })).toThrow(
      /PGSSLROOTCERT/
    );
  });
});

describe("client de base : un certificat refusé se dit avec la variable à poser", () => {
  it("traduit un refus de certificat en un message qui nomme PGSSLROOTCERT et PGSSLMODE=no-verify", () => {
    const refus = Object.assign(new Error("self-signed certificate in certificate chain"), {
      code: "SELF_SIGNED_CERT_IN_CHAIN",
    });
    const traduite = erreurDeCertificatTraduite(refus);
    expect(traduite).toBeInstanceOf(Error);
    expect((traduite as Error).message).toMatch(/PGSSLROOTCERT/);
    expect((traduite as Error).message).toMatch(/PGSSLMODE=no-verify/);
    expect((traduite as Error).cause).toBe(refus);
  });

  it("laisse passer telle quelle toute autre erreur (une migration fautive garde son message)", () => {
    const autre = Object.assign(new Error('relation "x" does not exist'), { code: "42P01" });
    expect(erreurDeCertificatTraduite(autre)).toBe(autre);
  });
});

describe("client de base : au démarrage, le pool vérifie et le refus se traduit", () => {
  const VARIABLES = ["DATABASE_URL", "PGSSLMODE", "PGSSLROOTCERT"] as const;
  let environnement: Record<string, string | undefined>;
  let poolDesAutresTests: typeof globalThis.__slPool;
  let initDesAutresTests: typeof globalThis.__slInitPromise;

  beforeEach(() => {
    environnement = Object.fromEntries(VARIABLES.map((nom) => [nom, process.env[nom]]));
    poolDesAutresTests = globalThis.__slPool;
    initDesAutresTests = globalThis.__slInitPromise;
    globalThis.__slPool = undefined;
    globalThis.__slInitPromise = undefined;
    optionsDesPools.length = 0;
    vi.resetModules();
  });

  afterEach(() => {
    // Une affectation de undefined écrirait la chaîne "undefined" dans l'environnement.
    for (const nom of VARIABLES) {
      if (environnement[nom] === undefined) delete process.env[nom];
      else process.env[nom] = environnement[nom];
    }
    globalThis.__slPool = poolDesAutresTests;
    globalThis.__slInitPromise = initDesAutresTests;
  });

  it("sans PGSSLMODE, le pool reçoit la vérification, et un certificat refusé à l'initialisation nomme PGSSLROOTCERT", async () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/base_simulee";
    delete process.env.PGSSLMODE;
    delete process.env.PGSSLROOTCERT;
    reponse.refus = Object.assign(new Error("self-signed certificate in certificate chain"), {
      code: "SELF_SIGNED_CERT_IN_CHAIN",
    });
    const client = await import("../src/lib/db/client");

    await expect(client.query("SELECT 1")).rejects.toThrow(/PGSSLROOTCERT/);
    expect(optionsDesPools).toEqual([expect.objectContaining({ ssl: { rejectUnauthorized: true } })]);
  });
});
