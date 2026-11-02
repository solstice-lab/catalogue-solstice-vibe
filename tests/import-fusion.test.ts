import { describe, expect, it } from "vitest";
import { valeurRetenue } from "../scripts/lib/cli";

describe("règle de fusion des imports (valeurRetenue)", () => {
  it("remplit un champ vide en base avec la valeur importée", () => {
    expect(valeurRetenue(null, "Atelier Morvan")).toEqual({ valeur: "Atelier Morvan", ecartee: null });
    expect(valeurRetenue("  ", "Atelier Morvan").valeur).toBe("Atelier Morvan");
  });

  it("ne dégrade JAMAIS une valeur pleine — le conflit part au rapport, pas en base (règle des fusions d'import)", () => {
    const fusion = valeurRetenue("Atelier Morvan", "Atelier Morvan SAS");
    expect(fusion.valeur).toBe("Atelier Morvan");
    expect(fusion.ecartee).toBe("Atelier Morvan SAS");
  });

  it("un import vide ne vide jamais un champ plein", () => {
    expect(valeurRetenue("Atelier Morvan", "")).toEqual({ valeur: "Atelier Morvan", ecartee: null });
  });

  it("une valeur identique ne produit ni écriture ni conflit", () => {
    expect(valeurRetenue("Atelier Morvan", "Atelier Morvan")).toEqual({ valeur: "Atelier Morvan", ecartee: null });
  });
});
