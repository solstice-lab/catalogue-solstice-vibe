import { describe, expect, it } from "vitest";
import { estJourDEnvoi, jourDeLaSemaine } from "@/briques/notifications/jour";
import { aujourdhui } from "@/lib/format";

/*
 * Brique notifications : le jour d'envoi. Un projet précédent décidait du jour
 * dans la route, avec l'horloge du serveur : rien ne se testait sans attendre
 * le bon jour, et à minuit UTC Paris avait déjà changé de date.
 */

describe("brique notifications : le jour d'envoi", () => {
  it("le jour d'envoi est décidé par une fonction pure, testable sans horloge (projet précédent : jour codé dans la route)", () => {
    // Le 2026-10-26 est un lundi.
    expect(jourDeLaSemaine("2026-10-26")).toBe("lundi");
    expect(jourDeLaSemaine("2026-11-01")).toBe("dimanche");
    expect(estJourDEnvoi("2026-10-26", ["lundi"])).toBe(true);
    expect(estJourDEnvoi("2026-10-27", ["lundi"])).toBe(false);
    expect(estJourDEnvoi("2026-10-29", ["lundi", "jeudi"])).toBe(true);
    expect(estJourDEnvoi("2026-10-26", [])).toBe(false);
  });

  it("le jour de la semaine ne dépend pas du fuseau du serveur : une date « aaaa-mm-jj » est un jour du calendrier", () => {
    // new Date("2026-10-26") vaut minuit UTC : lu en heure locale dans un
    // fuseau négatif, ce serait encore dimanche.
    const fuseau = process.env.TZ;
    process.env.TZ = "America/Martinique";
    try {
      expect(jourDeLaSemaine("2026-10-26")).toBe("lundi");
    } finally {
      process.env.TZ = fuseau;
    }
  });

  it("refuse une date qui n'est pas « aaaa-mm-jj » ou qui n'existe pas au calendrier", () => {
    expect(() => jourDeLaSemaine("26/10/2026")).toThrow(/aaaa-mm-jj/);
    expect(() => jourDeLaSemaine("2026-02-30")).toThrow(/aaaa-mm-jj/);
  });

  it("la date du jour se calcule dans le fuseau du client et s'injecte, jamais celle du serveur (à 23 h 30 UTC, Paris est déjà le lendemain)", () => {
    // Dimanche 25 octobre 2026, 23 h 30 UTC : lundi 26 à 0 h 30 à Paris.
    const maintenant = new Date("2026-10-25T23:30:00Z");
    expect(maintenant.toISOString().slice(0, 10)).toBe("2026-10-25");
    const jour = aujourdhui(maintenant);
    expect(jour).toBe("2026-10-26");
    expect(estJourDEnvoi(jour, ["lundi"])).toBe(true);
  });
});
