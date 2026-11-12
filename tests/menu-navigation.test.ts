import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * La charte « registre » met l'élément de menu actif en accent : le menu doit
 * donc savoir quelle entrée mène à la page ouverte, et le dire aussi aux
 * lecteurs d'écran (aria-current). Le chemin vient du routeur de Next, seule
 * frontière simulée ici. Les routes sont fictives : ce test part dans toute
 * appli assemblée, qui n'a ni la vitrine du kit ni les modules du catalogue.
 */
const chemin = vi.hoisted(() => ({ courant: "/" as string | null }));
vi.mock("next/navigation", () => ({ usePathname: () => chemin.courant }));

const { MenuNavigation } = await import("@/ui/MenuNavigation");

const LIENS = [
  { libelle: "Accueil", href: "/" },
  { libelle: "Clients", href: "/clients" },
  { libelle: "Paramètres", href: "/parametres" },
];

function liensActifs(page: string | null): string[] {
  chemin.courant = page;
  const html = renderToStaticMarkup(createElement(MenuNavigation, { liens: LIENS }));
  return [...html.matchAll(/<a[^>]*aria-current="page"[^>]*>([^<]*)<\/a>/g)].map(([, libelle]) => libelle);
}

describe("menu de l'en-tête : l'entrée active", () => {
  it("marque l'entrée de la page ouverte, et elle seule", () => {
    expect(liensActifs("/parametres")).toEqual(["Paramètres"]);
  });

  it("garde l'entrée d'une rubrique active sur ses sous-pages (la fiche d'un client reste dans Clients)", () => {
    expect(liensActifs("/clients/atelier-morvan/modifier")).toEqual(["Clients"]);
  });

  it("ne marque pas une rubrique sur une route qui ne fait que commencer par les mêmes lettres", () => {
    expect(liensActifs("/clients-archives")).toEqual([]);
  });

  it("ne marque l'accueil que sur l'accueil, pas sur toutes les pages qu'il préfixe", () => {
    expect(liensActifs("/")).toEqual(["Accueil"]);
    expect(liensActifs("/clients")).toEqual(["Clients"]);
  });

  it("ne marque rien hors des entrées du menu, ni sans chemin connu", () => {
    expect(liensActifs("/aide")).toEqual([]);
    expect(liensActifs(null)).toEqual([]);
  });
});
