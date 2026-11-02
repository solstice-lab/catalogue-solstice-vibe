import { afterEach, describe, expect, it } from "vitest";
import {
  aujourdhui,
  date,
  dateHeure,
  formatDateTableur,
  jourSemaineCourt,
  moisAnnee,
  montantCentimes,
} from "../src/lib/format";

const fuseauInitial = process.env.TZ;

afterEach(() => {
  process.env.TZ = fuseauInitial;
});

describe("format", () => {
  it("affiche une date « aaaa-mm-jj » au jour dit, même dans un fuseau négatif (la fin d'un contrat s'affichait la veille aux Antilles)", () => {
    process.env.TZ = "America/Martinique";
    expect(date("2026-10-14")).toBe("14/10/2026");
    process.env.TZ = "UTC";
    expect(date("2026-10-14")).toBe("14/10/2026");
  });

  it("écrit le mois et le jour de la semaine au jour dit, même dans un fuseau négatif (le calendrier de la GMAO : « 2026-10-05 » lu comme minuit UTC serait un dimanche aux Antilles)", () => {
    for (const fuseauDuServeur of ["UTC", "America/Martinique"]) {
      process.env.TZ = fuseauDuServeur;
      expect(moisAnnee("2026-10")).toBe("octobre 2026");
      expect(moisAnnee("2027-02")).toBe("février 2027");
      expect(jourSemaineCourt("2026-10-05")).toBe("lun.");
      expect(jourSemaineCourt("2026-10-04")).toBe("dim.");
    }
  });

  it("donne au tableur le format de date de l'écran : jour, mois, année dans l'ordre de la langue du client (export .xlsx, relevé en recette)", () => {
    expect(formatDateTableur()).toBe("dd/mm/yyyy");
    expect(formatDateTableur("en-US")).toBe("mm/dd/yyyy");
    expect(formatDateTableur("de-DE")).toBe("dd.mm.yyyy");
    expect(formatDateTableur("ja-JP")).toBe("yyyy/mm/dd");
  });

  it("affiche un montant en centimes sans décimales inutiles, et un tiret s'il est inconnu (un « 0 € » passerait pour une saisie)", () => {
    expect(montantCentimes(null)).toBe("—");
    expect(montantCentimes(1250000).replace(/\s/g, " ")).toBe("12 500 €");
    expect(montantCentimes(1250050).replace(/\s/g, " ")).toBe("12 500,50 €");
  });

  it("compte « aujourd'hui » dans le fuseau du client autour de minuit, quel que soit celui du serveur (à 23 h 30 UTC, Paris est déjà le lendemain)", () => {
    for (const fuseauDuServeur of ["UTC", "America/Martinique"]) {
      process.env.TZ = fuseauDuServeur;
      // Heure d'été : minuit à Paris tombe à 22 h UTC.
      expect(aujourdhui(new Date("2026-10-14T21:59:59Z"))).toBe("2026-10-14");
      expect(aujourdhui(new Date("2026-10-14T22:00:00Z"))).toBe("2026-10-15");
      expect(aujourdhui(new Date("2026-10-14T23:30:00Z"))).toBe("2026-10-15");
      // Heure d'hiver : minuit à Paris tombe à 23 h UTC, et l'année change.
      expect(aujourdhui(new Date("2026-12-31T22:59:59Z"))).toBe("2026-12-31");
      expect(aujourdhui(new Date("2026-12-31T23:00:00Z"))).toBe("2027-01-01");
    }
  });

  it("affiche un instant (une ligne du journal) à l'heure du client, quel que soit le fuseau du serveur", () => {
    for (const fuseauDuServeur of ["UTC", "America/Martinique"]) {
      process.env.TZ = fuseauDuServeur;
      expect(dateHeure("2026-10-14T22:30:00Z")).toBe("15/10/2026 00:30");
      expect(dateHeure(new Date("2026-12-31T08:05:00Z"))).toBe("31/12/2026 09:05");
    }
  });
});
