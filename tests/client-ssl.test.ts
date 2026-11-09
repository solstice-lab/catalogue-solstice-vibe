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

// Un .env.local recopié chez l'hébergeur (PGSSLMODE=disable pour le Postgres du
// poste) faisait circuler le mot de passe et les données en clair : « disable »
// était accepté sans bruit partout. En production vers un hôte distant, il fait
// refuser le démarrage ; en local et hors production, rien ne change.
describe("client de base : PGSSLMODE=disable refusé en production vers un hôte distant", () => {
  const distante = "postgresql://app@db.exemple.fr:5432/appli";
  const production = { NODE_ENV: "production", PGSSLMODE: "disable" };

  it("refuse en production vers un hôte distant, et le message dit quoi faire", () => {
    const appel = () => optionsSsl({ ...production, DATABASE_URL: distante });
    expect(appel).toThrow(/PGSSLMODE=disable/);
    expect(appel).toThrow(/PGSSLMODE=no-verify/);
    expect(appel).toThrow(/PGSSLROOTCERT/);
    expect(appel).toThrow(/db\.exemple\.fr/);
  });

  it("refuse aussi une liste d'hôtes dont un seul est distant, un hôte en paramètre et une URL illisible", () => {
    for (const url of [
      "postgresql://app@localhost:5432,db.exemple.fr:5432/appli",
      "postgresql://app@localhost/appli?host=db.exemple.fr",
      "postgresql:///appli?host=/var/run/postgresql,db.exemple.fr",
      "pas une url",
    ]) {
      expect(() => optionsSsl({ ...production, DATABASE_URL: url }), url).toThrow(/PGSSLMODE=disable/);
    }
  });

  // pg lit le sslmode de l'URL après les options du client : `?sslmode=disable` y gagne
  // sur tout et laissait la connexion en clair sans que PGSSLMODE soit posée.
  it("refuse aussi sslmode=disable écrit dans DATABASE_URL, sans PGSSLMODE", () => {
    for (const url of [
      "postgresql://app@db.exemple.fr/appli?sslmode=disable",
      "postgresql://app@db.exemple.fr/appli?application_name=x&SSLMODE=disable",
    ]) {
      expect(() => optionsSsl({ NODE_ENV: "production", DATABASE_URL: url }), url).toThrow(/sslmode=disable/);
    }
    // Vers la machine locale ou hors production, il passe comme PGSSLMODE=disable.
    expect(
      optionsSsl({ NODE_ENV: "production", DATABASE_URL: "postgresql://app@localhost/appli?sslmode=disable" })
    ).toEqual({
      rejectUnauthorized: true,
    });
    expect(optionsSsl({ DATABASE_URL: "postgresql://app@db.exemple.fr/appli?sslmode=disable" })).toEqual({
      rejectUnauthorized: true,
    });
  });

  it("refuse une URL sans hôte quand PGHOST (lu par pg à sa place) vise un hôte distant", () => {
    expect(() => optionsSsl({ ...production, DATABASE_URL: "postgresql:///appli", PGHOST: "db.exemple.fr" })).toThrow(
      /PGSSLMODE=disable/
    );
  });

  it("accepte en production vers la machine locale : localhost, 127.0.0.1, [::1], socket Unix", () => {
    for (const url of [
      "postgresql://postgres@localhost:5433/appli",
      "postgresql://postgres@127.0.0.1/appli",
      "postgresql://postgres@[::1]:5432/appli",
      "postgresql://postgres@LOCALHOST:5432,127.0.0.1:5433/appli",
      "postgresql:///appli",
      "postgresql:///appli?host=/var/run/postgresql",
      "postgresql:///appli?host=::1",
      "postgresql://%2Fvar%2Frun%2Fpostgresql/appli",
    ]) {
      expect(optionsSsl({ ...production, DATABASE_URL: url }), url).toBe(false);
    }
  });

  it("accepte hors production vers un hôte distant (le développeur qui vise une base de recette)", () => {
    for (const NODE_ENV of ["development", "test", undefined]) {
      expect(optionsSsl({ NODE_ENV, PGSSLMODE: "disable", DATABASE_URL: distante })).toBe(false);
    }
  });

  it("ne touche pas aux autres réglages : no-verify et vérification par défaut passent en production distante", () => {
    const base = { NODE_ENV: "production", DATABASE_URL: distante };
    expect(optionsSsl({ ...base, PGSSLMODE: "no-verify" })).toEqual({ rejectUnauthorized: false });
    expect(optionsSsl({ ...base })).toEqual({ rejectUnauthorized: true });
  });

  it("sans DATABASE_URL, le refus reste à creerPool (rien à juger ici)", () => {
    expect(optionsSsl(production)).toBe(false);
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
    vi.unstubAllEnvs();
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

  it("en production vers un hôte distant, PGSSLMODE=disable fait refuser la première requête avant toute connexion, et le refus se rejoue (le .env.local recopié chez l'hébergeur)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.DATABASE_URL = "postgresql://app@db.exemple.fr:5432/appli";
    process.env.PGSSLMODE = "disable";
    delete process.env.PGSSLROOTCERT;
    const client = await import("../src/lib/db/client");

    await expect(client.query("SELECT 1")).rejects.toThrow(/PGSSLMODE=disable/);
    await expect(client.query("SELECT 1")).rejects.toThrow(/PGSSLMODE=disable/);
    expect(optionsDesPools).toEqual([]);
  });
});
