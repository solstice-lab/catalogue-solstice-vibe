import { describe, expect, it } from "vitest";
import { slugAvecGardeFous, slugifier } from "../src/lib/slug";

// Les segments statiques d'un module, comme un module les déclare dans
// SEGMENTS_RESERVES_PAR_MODULE : le test ne dépend d'aucun module, l'appli
// assemblée n'en reçoit pas.
const RESERVES: ReadonlySet<string> = new Set(["nouveau", "modifier"]);

describe("slugs des fiches", () => {
  it("ne produit JAMAIS un slug purement numérique (il serait pris pour un id par la résolution d'URL)", () => {
    expect(slugAvecGardeFous("2026", RESERVES, "fiche")).toBe("2026-fiche");
    expect(slugAvecGardeFous("2026 123", RESERVES, "fiche")).not.toMatch(/^\d+$/);
  });

  it("évite les segments statiques du module (une fiche nommée « Nouveau » deviendrait inatteignable)", () => {
    expect(slugAvecGardeFous("Nouveau", RESERVES, "fiche")).toBe("nouveau-fiche");
    expect(slugAvecGardeFous("Modifier", RESERVES, "fiche")).toBe("modifier-fiche");
  });

  it("translittère accents et ponctuation (« Éric O'Brien & Cie » → eric-o-brien-cie)", () => {
    expect(slugifier("Éric O'Brien & Cie")).toBe("eric-o-brien-cie");
  });

  it("retombe sur le mot de repli quand le nom n'a aucune lettre latine (idéogrammes, cyrillique)", () => {
    expect(slugAvecGardeFous("株式会社", RESERVES, "fiche")).toBe("fiche");
  });
});
