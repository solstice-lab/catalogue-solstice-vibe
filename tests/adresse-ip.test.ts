import { afterEach, describe, expect, it, vi } from "vitest";
import { adresseDuVisiteur, empreinteDe } from "../src/lib/adresse-ip";

/*
 * La lecture de l'adresse IP du visiteur (socle). Derrière
 * l'hébergeur, l'appli ne voit que son proxy : l'adresse vient d'un en-tête
 * qu'il pose, nommé par IP_EN_TETE_CLIENT. Tout autre en-tête se forge.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const derriereCloudflare = () => vi.stubEnv("IP_EN_TETE_CLIENT", "cf-connecting-ip");

describe("adresse IP du visiteur : l'en-tête de l'hébergeur, et lui seul", () => {
  it("lit l'en-tête que la configuration nomme", () => {
    derriereCloudflare();
    expect(adresseDuVisiteur(new Headers({ "cf-connecting-ip": "203.0.113.1" }))).toBe("203.0.113.1");
  });

  it("ne se laisse pas changer par un en-tête forgé : X-Forwarded-For, X-Real-IP ou un autre que celui configuré (le projet précédent lisait CF-Connecting-IP devant Render)", () => {
    derriereCloudflare();
    const forges = { "x-forwarded-for": "198.51.100.1", "x-real-ip": "198.51.100.2", "true-client-ip": "198.51.100.3" };
    expect(adresseDuVisiteur(new Headers({ ...forges, "cf-connecting-ip": "203.0.113.1" }))).toBe("203.0.113.1");
  });

  it("ignore la casse et les espaces du nom configuré", () => {
    vi.stubEnv("IP_EN_TETE_CLIENT", " CF-Connecting-IP ");
    expect(adresseDuVisiteur(new Headers({ "cf-connecting-ip": "203.0.113.1" }))).toBe("203.0.113.1");
  });

  it("prend la dernière entrée d'une liste : celle qu'ajoute le proxy, si l'en-tête configuré en est une", () => {
    vi.stubEnv("IP_EN_TETE_CLIENT", "x-forwarded-for");
    expect(adresseDuVisiteur(new Headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.1" }))).toBe("203.0.113.1");
  });

  it("répond « local » hors production quand l'en-tête configuré manque à la requête (serveur de développement, sans proxy)", () => {
    derriereCloudflare();
    expect(adresseDuVisiteur(new Headers({ "x-forwarded-for": "198.51.100.1" }))).toBe("local");
    expect(adresseDuVisiteur(new Headers({ "cf-connecting-ip": " " }))).toBe("local");
  });

  it("ne donne aucune adresse en production quand l'en-tête configuré manque, et l'avertit une seule fois : un en-tête mal réglé mettait tous les visiteurs dans un même compte, sans un mot", async () => {
    vi.resetModules();
    const { adresseDuVisiteur: lire } = await import("../src/lib/adresse-ip");
    derriereCloudflare();
    vi.stubEnv("NODE_ENV", "production");
    const avertissement = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(lire(new Headers({ "x-forwarded-for": "198.51.100.1" }))).toBeNull();
    expect(lire(new Headers())).toBeNull();
    expect(lire(new Headers({ "cf-connecting-ip": "203.0.113.1" }))).toBe("203.0.113.1");
    expect(avertissement).toHaveBeenCalledTimes(1);
    expect(String(avertissement.mock.calls[0][0])).toContain("cf-connecting-ip");
  });

  it("répond « local » hors production sans en-tête configuré", () => {
    vi.stubEnv("IP_EN_TETE_CLIENT", "");
    expect(adresseDuVisiteur(new Headers({ "x-forwarded-for": "198.51.100.1" }))).toBe("local");
  });

  it("ne donne aucune adresse en production sans en-tête configuré, et l'avertit une seule fois : un compte commun à tous les visiteurs serait un déni de service", async () => {
    vi.resetModules();
    const { adresseDuVisiteur: lire } = await import("../src/lib/adresse-ip");
    vi.stubEnv("IP_EN_TETE_CLIENT", "");
    vi.stubEnv("NODE_ENV", "production");
    const avertissement = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(lire(new Headers({ "x-forwarded-for": "198.51.100.1" }))).toBeNull();
    expect(lire(new Headers())).toBeNull();
    expect(avertissement).toHaveBeenCalledTimes(1);
    expect(String(avertissement.mock.calls[0][0])).toContain("IP_EN_TETE_CLIENT");
  });
});

describe("empreinte d'une adresse", () => {
  it("garde une empreinte stable, jamais l'adresse en clair", () => {
    expect(empreinteDe("203.0.113.1")).toBe(empreinteDe("203.0.113.1"));
    expect(empreinteDe("203.0.113.1")).not.toBe(empreinteDe("203.0.113.2"));
    expect(empreinteDe("203.0.113.1")).toMatch(/^[0-9a-f]{64}$/);
  });
});
