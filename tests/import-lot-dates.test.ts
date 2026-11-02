import { describe, expect, it } from "vitest";
import { lireDate } from "../src/briques/import-lot/dates";

describe("lecture d'une date d'import", () => {
  it("une date ambiguë se lit selon le format configuré, jamais devinée (une appli livrée : un import réel lu jour/mois par erreur)", () => {
    expect(lireDate("05/06/2026", "jour_mois")).toEqual({ etat: "date", valeur: "2026-06-05" });
    expect(lireDate("05/06/2026", "mois_jour")).toEqual({ etat: "date", valeur: "2026-05-06" });
  });

  it("une date impossible dans le format configuré est refusée, jamais relue dans l'autre sens", () => {
    // 13 n'est pas un mois : on ne retourne pas silencieusement « 13 mai ».
    expect(lireDate("05/13/2026", "jour_mois")).toEqual({ etat: "illisible" });
    expect(lireDate("13/05/2026", "mois_jour")).toEqual({ etat: "illisible" });
  });

  it("une date du calendrier seulement : le 31 février est refusé", () => {
    expect(lireDate("31/02/2026", "jour_mois")).toEqual({ etat: "illisible" });
  });

  it("l'ISO est toujours accepté, sans ambiguïté possible", () => {
    expect(lireDate("2026-06-05", "jour_mois")).toEqual({ etat: "date", valeur: "2026-06-05" });
    expect(lireDate("2026-06-05", "mois_jour")).toEqual({ etat: "date", valeur: "2026-06-05" });
  });

  it("l'ISO d'un export (heure, millisecondes, Z, barres) se lit par son jour", () => {
    expect(lireDate("2026-06-05T00:00:00.000Z", "jour_mois")).toEqual({ etat: "date", valeur: "2026-06-05" });
    expect(lireDate("2026-06-05T10:30:00+02:00", "mois_jour")).toEqual({ etat: "date", valeur: "2026-06-05" });
    expect(lireDate("2026/06/05", "jour_mois")).toEqual({ etat: "date", valeur: "2026-06-05" });
  });

  it("une heure collée à la date est ignorée", () => {
    expect(lireDate("05/06/2026 01:30", "jour_mois")).toEqual({ etat: "date", valeur: "2026-06-05" });
  });

  it("une date devenue nombre de série par un tableur se relit comme une date (projet précédent)", () => {
    // 45000 = 15 mars 2023 dans le calendrier des tableurs.
    expect(lireDate(45000, "jour_mois")).toEqual({ etat: "date", valeur: "2023-03-15" });
    expect(lireDate("45000", "jour_mois")).toEqual({ etat: "date", valeur: "2023-03-15" });
    expect(lireDate(45000.75, "jour_mois")).toEqual({ etat: "date", valeur: "2023-03-15" });
  });

  it("un petit nombre n'est pas un numéro de série : « 2026 » ne devient pas une date de 1905", () => {
    expect(lireDate(2026, "jour_mois")).toEqual({ etat: "illisible" });
    expect(lireDate("2026", "jour_mois")).toEqual({ etat: "illisible" });
  });

  it("une cellule de date lue par le tableur (objet Date) garde son jour, quel que soit le fuseau du serveur", () => {
    expect(lireDate(new Date(Date.UTC(2026, 4, 13)), "jour_mois")).toEqual({ etat: "date", valeur: "2026-05-13" });
  });

  it("une cellule de date vide est absente, pas illisible : la ligne n'est pas rejetée (projet précédent)", () => {
    expect(lireDate("", "jour_mois")).toEqual({ etat: "absente" });
    expect(lireDate("   ", "jour_mois")).toEqual({ etat: "absente" });
    expect(lireDate(null, "jour_mois")).toEqual({ etat: "absente" });
    expect(lireDate(undefined, "jour_mois")).toEqual({ etat: "absente" });
  });

  it("un texte qui n'est pas une date est illisible", () => {
    expect(lireDate("bientôt", "jour_mois")).toEqual({ etat: "illisible" });
  });
});
