import { describe, expect, it } from "vitest";
import { estDateIso } from "../src/lib/date-iso";

describe("estDateIso", () => {
  it("accepte une date « aaaa-mm-jj » qui existe au calendrier, 29 février d'une année bissextile compris", () => {
    expect(estDateIso("2026-10-14")).toBe(true);
    expect(estDateIso("2028-02-29")).toBe(true);
  });

  it("refuse une date au bon motif qui n'existe pas (un 31 juin passait le motif, puis faisait planter l'enregistrement en base)", () => {
    expect(estDateIso("2026-06-31")).toBe(false);
    expect(estDateIso("2027-02-29")).toBe(false);
    expect(estDateIso("2026-13-01")).toBe(false);
  });

  it("refuse tout ce qui n'est pas exactement « aaaa-mm-jj »", () => {
    expect(estDateIso("14/10/2026")).toBe(false);
    expect(estDateIso("2026-10-14T00:00:00Z")).toBe(false);
    expect(estDateIso("")).toBe(false);
  });
});
