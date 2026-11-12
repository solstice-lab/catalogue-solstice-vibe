import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * La charte « registre » met l'élément de menu actif en jaune : le menu doit
 * donc savoir quelle entrée mène à la page ouverte, et le dire aussi aux
 * lecteurs d'écran (aria-current). Le chemin vient du routeur de Next, seule
 * frontière simulée ici.
 */
const chemin = vi.hoisted(() => ({ courant: "/" as string | null }));
vi.mock("next/navigation", () => ({ usePathname: () => chemin.courant }));

const { MenuNavigation } = await import("@/ui/MenuNavigation");

const LIENS = [
  { libelle: "Accueil", href: "/" },
  { libelle: "Dossiers", href: "/dossiers" },
  { libelle: "Journal", href: "/journal" },
];

function liensActifs(page: string | null): string[] {
  chemin.courant = page;
  const html = renderToStaticMarkup(createElement(MenuNavigation, { liens: LIENS }));
  return [...html.matchAll(/<a[^>]*aria-current="page"[^>]*>([^<]*)<\/a>/g)].map(([, libelle]) => libelle);
}

describe("menu de l'en-tête : l'entrée active", () => {
  it("marque l'entrée de la page ouverte, et elle seule", () => {
    expect(liensActifs("/journal")).toEqual(["Journal"]);
  });

  it("garde l'entrée d'une rubrique active sur ses sous-pages (la fiche d'un dossier reste dans Dossiers)", () => {
    expect(liensActifs("/dossiers/atelier-morvan/modifier")).toEqual(["Dossiers"]);
  });

  it("ne marque l'accueil que sur l'accueil, pas sur toutes les pages qu'il préfixe", () => {
    expect(liensActifs("/")).toEqual(["Accueil"]);
    expect(liensActifs("/dossiers")).toEqual(["Dossiers"]);
  });

  it("ne marque rien hors des entrées du menu, ni sans chemin connu", () => {
    expect(liensActifs("/kit")).toEqual([]);
    expect(liensActifs(null)).toEqual([]);
  });
});
