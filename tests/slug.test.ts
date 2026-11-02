import { describe, expect, it } from "vitest";
import { SEGMENTS_RESERVES_PAR_MODULE, slugAvecGardeFous, slugDossier, slugifier } from "../src/lib/slug";

const RESERVES = SEGMENTS_RESERVES_PAR_MODULE.dossiers;

describe("slugs des fiches", () => {
  it("ne produit JAMAIS un slug purement numérique (il serait pris pour un id par la résolution d'URL)", () => {
    const slug = slugDossier({ reference: "2026", client: "123" });
    expect(slug).not.toMatch(/^\d+$/);
  });

  it("évite les segments statiques du module (une fiche nommée « Nouveau » deviendrait inatteignable)", () => {
    expect(slugAvecGardeFous("Nouveau", RESERVES, "dossier")).toBe("nouveau-dossier");
    expect(slugAvecGardeFous("Modifier", RESERVES, "dossier")).toBe("modifier-dossier");
  });

  it("translittère accents et ponctuation (« Éric O'Brien & Cie » → eric-o-brien-cie)", () => {
    expect(slugifier("Éric O'Brien & Cie")).toBe("eric-o-brien-cie");
  });

  it("retombe sur le mot de repli quand le nom n'a aucune lettre latine (idéogrammes, cyrillique)", () => {
    expect(slugAvecGardeFous("株式会社", RESERVES, "dossier")).toBe("dossier");
  });
});
