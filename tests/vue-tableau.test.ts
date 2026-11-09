import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * La vue d'un Tableau (tri, filtres par colonne, déplis) gardée à la
 * navigation : src/ui/vueTableau.ts, sans test jusqu'à l'audit du 2026-11-09.
 * Le module ne lit que window.sessionStorage : un stockage simulé suffit,
 * sans DOM. Chaque test recharge le module, dont le cache en mémoire vit le
 * temps d'une page ; le stockage, lui, survit au rechargement, comme
 * sessionStorage à une navigation dans l'onglet.
 */

type Module = typeof import("../src/ui/vueTableau");

let stockage: Map<string, string>;

function simulerLeStockage(indisponible = false) {
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (cle: string) => {
        if (indisponible) throw new Error("SecurityError");
        return stockage.get(cle) ?? null;
      },
      setItem: (cle: string, valeur: string) => {
        if (indisponible) throw new Error("SecurityError");
        stockage.set(cle, valeur);
      },
    },
  });
}

// Le module tel qu'une nouvelle page le charge : cache vide, stockage gardé.
async function nouvellePage(): Promise<Module> {
  vi.resetModules();
  return import("../src/ui/vueTableau");
}

beforeEach(() => {
  stockage = new Map();
  simulerLeStockage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("vue d'un Tableau : tri, filtres et déplis gardés à la navigation", () => {
  it("part sans tri, sans filtre ni dépli pour un tableau jamais vu", async () => {
    const { lireVue, vueInitiale } = await nouvellePage();
    expect(lireVue("contrats")).toEqual({ tri: null, filtres: {}, deplis: [] });
    expect(vueInitiale()).toEqual({ tri: null, filtres: {}, deplis: [] });
  });

  it("retrouve, après une navigation dans l'onglet, le tri, les filtres par colonne et les déplis laissés (arbitré le 2026-09-09)", async () => {
    const premiere = await nouvellePage();
    premiere.ecrireVue("contrats", { tri: { cle: "montant", sens: -1 } });
    premiere.ecrireVue("contrats", { filtres: { statut: "actif", client: "dupont" } });
    premiere.ecrireVue("contrats", { deplis: ["2026", "2026/T1"] });

    const retour = await nouvellePage();
    expect(retour.lireVue("contrats")).toEqual({
      tri: { cle: "montant", sens: -1 },
      filtres: { statut: "actif", client: "dupont" },
      deplis: ["2026", "2026/T1"],
    });
  });

  it("ne mêle pas les vues de deux tableaux : chacune vit sous son id", async () => {
    const page = await nouvellePage();
    page.ecrireVue("contrats", { filtres: { statut: "actif" } });
    page.ecrireVue("factures", { tri: { cle: "date", sens: 1 } });
    expect([...stockage.keys()].sort()).toEqual(["sl-tableau:contrats", "sl-tableau:factures"]);

    const retour = await nouvellePage();
    expect(retour.lireVue("contrats")).toEqual({ tri: null, filtres: { statut: "actif" }, deplis: [] });
    expect(retour.lireVue("factures")).toEqual({ tri: { cle: "date", sens: 1 }, filtres: {}, deplis: [] });
  });

  it("complète une vue gardée par une version antérieure (sans déplis) au lieu de la perdre", async () => {
    stockage.set("sl-tableau:contrats", JSON.stringify({ tri: { cle: "client", sens: 1 } }));
    const { lireVue } = await nouvellePage();
    expect(lireVue("contrats")).toEqual({ tri: { cle: "client", sens: 1 }, filtres: {}, deplis: [] });
  });

  it("rend la même vue tant qu'elle ne change pas, une nouvelle dès qu'elle change : useSyncExternalStore boucle sur un objet neuf à chaque lecture", async () => {
    const { ecrireVue, lireVue } = await nouvellePage();
    const avant = lireVue("contrats");
    expect(lireVue("contrats")).toBe(avant);
    ecrireVue("contrats", { filtres: { statut: "actif" } });
    const apres = lireVue("contrats");
    expect(apres).not.toBe(avant);
    expect(lireVue("contrats")).toBe(apres);
  });

  it("prévient les abonnés du seul tableau modifié, et plus après désabonnement", async () => {
    const { ecrireVue, sAbonner } = await nouvellePage();
    const contrats = vi.fn();
    const factures = vi.fn();
    const desabonner = sAbonner("contrats", contrats);
    sAbonner("factures", factures);

    ecrireVue("contrats", { tri: { cle: "montant", sens: 1 } });
    expect(contrats).toHaveBeenCalledTimes(1);
    expect(factures).not.toHaveBeenCalled();

    desabonner();
    ecrireVue("contrats", { tri: null });
    expect(contrats).toHaveBeenCalledTimes(1);
  });

  it("reste utilisable sans stockage (navigation privée, iframe restreinte) : la vue vit le temps de la page", async () => {
    simulerLeStockage(true);
    const { ecrireVue, lireVue, sAbonner } = await nouvellePage();
    expect(lireVue("contrats")).toEqual({ tri: null, filtres: {}, deplis: [] });
    const notifier = vi.fn();
    sAbonner("contrats", notifier);
    ecrireVue("contrats", { filtres: { statut: "actif" } });
    expect(lireVue("contrats").filtres).toEqual({ statut: "actif" });
    expect(notifier).toHaveBeenCalledTimes(1);
  });
});
