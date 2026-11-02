import { describe, expect, it } from "vitest";
import {
  bornesDuMois,
  construireSemaines,
  lireMois,
  moisPrecedent,
  moisSuivant,
  type Evenement,
} from "../src/briques/calendrier/calcul";

// Les règles de la brique calendrier, en calcul pur : aucune base, aucune
// horloge (le jour courant arrive en paramètre, comme pour la brique
// échéances). Repères du calendrier 2026-2027 : le 1er octobre 2026 est un
// jeudi, le 1er juin 2026 et le 1er février 2027 sont des lundis.

const AUJOURDHUI = "2026-10-14";

function evenement(date: string, libelle: string): Evenement {
  return { lien: `/interventions/${libelle}`, libelle, detail: null, date };
}

describe("lireMois", () => {
  it("prend le mois de l'adresse quand il est valide, et le mois courant quand elle est absente", () => {
    expect(lireMois("2026-09", AUJOURDHUI)).toBe("2026-09");
    expect(lireMois(undefined, AUJOURDHUI)).toBe("2026-10");
  });

  it("retombe sur le mois courant pour une adresse retouchée à la main : mois 13, année courte, texte, paramètre répété (aucune erreur à l'écran pour une faute de frappe)", () => {
    for (const saisie of ["2026-13", "2026-00", "2026-1", "26-10", "abc", "", "2026-10-14", "1800-05", "2101-01"]) {
      expect(lireMois(saisie, AUJOURDHUI), saisie).toBe("2026-10");
    }
    expect(lireMois(["2026-09", "2026-08"], AUJOURDHUI)).toBe("2026-10");
  });
});

describe("mois précédent et suivant", () => {
  it("passent d'une année à l'autre", () => {
    expect(moisPrecedent("2027-01")).toBe("2026-12");
    expect(moisSuivant("2026-12")).toBe("2027-01");
    expect(moisPrecedent("2026-10")).toBe("2026-09");
    expect(moisSuivant("2026-10")).toBe("2026-11");
  });

  it("restent sur le mois affiché aux bornes 1900-2100 que lireMois accepte, au lieu de pointer un mois qu'il refuserait (retombée silencieuse sur le mois courant)", () => {
    expect(moisSuivant("2100-12")).toBe("2100-12");
    expect(moisPrecedent("1900-01")).toBe("1900-01");
    expect(lireMois(moisSuivant("2100-12"), AUJOURDHUI)).toBe("2100-12");
    expect(lireMois(moisPrecedent("1900-01"), AUJOURDHUI)).toBe("1900-01");
  });
});

describe("bornesDuMois", () => {
  it("donnent le premier et le dernier jour, février bissextile compris (2028 a un 29 février)", () => {
    expect(bornesDuMois("2026-10")).toEqual({ debut: "2026-10-01", fin: "2026-10-31" });
    expect(bornesDuMois("2026-02")).toEqual({ debut: "2026-02-01", fin: "2026-02-28" });
    expect(bornesDuMois("2028-02")).toEqual({ debut: "2028-02-01", fin: "2028-02-29" });
    expect(bornesDuMois("2026-12")).toEqual({ debut: "2026-12-01", fin: "2026-12-31" });
  });
});

describe("construireSemaines", () => {
  it("commence les semaines un lundi : le 1er octobre 2026, un jeudi, est précédé de trois jours du mois d'avant", () => {
    const semaines = construireSemaines("2026-10", [], AUJOURDHUI);
    expect(semaines[0].map((cellule) => cellule.date)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(semaines[0].map((cellule) => cellule.dansLeMois)).toEqual([false, false, false, true, true, true, true]);
  });

  it("ne laisse aucune semaine incomplète : octobre 2026 finit un samedi et se complète du dimanche suivant", () => {
    const semaines = construireSemaines("2026-10", [], AUJOURDHUI);
    expect(semaines).toHaveLength(5);
    expect(semaines.every((semaine) => semaine.length === 7)).toBe(true);
    const derniere = semaines[4];
    expect(derniere[5]).toMatchObject({ date: "2026-10-31", dansLeMois: true });
    expect(derniere[6]).toMatchObject({ date: "2026-11-01", dansLeMois: false });
  });

  it("n'ajoute aucun jour d'un autre mois quand le mois tient en semaines pleines (février 2027 : lundi 1er, 28 jours)", () => {
    const semaines = construireSemaines("2027-02", [], AUJOURDHUI);
    expect(semaines).toHaveLength(4);
    expect(semaines.flat().every((cellule) => cellule.dansLeMois)).toBe(true);
  });

  it("place chaque événement dans le jour de sa date, triés par libellé dans la journée", () => {
    const semaines = construireSemaines(
      "2026-10",
      [
        evenement("2026-10-14", "Vidange C2"),
        evenement("2026-10-14", "Graissage CV1"),
        evenement("2026-10-01", "Contrôle CHD1"),
      ],
      AUJOURDHUI
    );
    const cellules = semaines.flat();
    const du = (date: string) => cellules.find((cellule) => cellule.date === date)!;
    expect(du("2026-10-14").elements.map((e) => e.libelle)).toEqual(["Graissage CV1", "Vidange C2"]);
    expect(du("2026-10-01").elements.map((e) => e.libelle)).toEqual(["Contrôle CHD1"]);
    expect(du("2026-10-02").elements).toEqual([]);
  });

  it("n'affiche rien dans les jours d'un autre mois : chaque événement se lit dans son propre mois, jamais deux fois", () => {
    const semaines = construireSemaines("2026-10", [evenement("2026-09-30", "Vidange C2")], AUJOURDHUI);
    expect(semaines.flat().flatMap((cellule) => cellule.elements)).toEqual([]);
  });

  it("repère le jour courant, et lui seul", () => {
    const cellules = construireSemaines("2026-10", [], AUJOURDHUI).flat();
    expect(cellules.filter((cellule) => cellule.aujourdhui).map((cellule) => cellule.date)).toEqual(["2026-10-14"]);
    // Un autre mois n'a pas de jour courant.
    expect(
      construireSemaines("2026-11", [], AUJOURDHUI)
        .flat()
        .some((cellule) => cellule.aujourdhui)
    ).toBe(false);
  });
});
