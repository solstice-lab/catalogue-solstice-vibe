import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppLayout, PageVitrine } from "@/ui";

/*
 * Les deux squelettes de page du kit posent eux-mêmes la signature Solstice
 * Lab et les liens des mentions légales et de la confidentialité : une page
 * de site vitrine construite à la main les oubliait, et le site partait sans
 * mentions (LCEN) ni politique de confidentialité (RGPD). Le test lit les
 * adresses rendues, pas le balisage ni les classes. Les squelettes sont
 * appelés comme des fonctions : ils n'ont pas de hook (le menu, qui en a,
 * reste un élément rendu ensuite).
 */

function adresses(page: ReactElement): string[] {
  return [...renderToStaticMarkup(page).matchAll(/href="([^"]*)"/g)].map(([, href]) => href);
}

const SQUELETTES: [string, ReactElement][] = [
  ["AppLayout", AppLayout({ nom: "Outil", children: "Contenu" })],
  ["PageVitrine", PageVitrine({ nom: "Site", liens: [{ libelle: "Offre", href: "#offre" }], children: "Contenu" })],
];

describe("squelettes de page du kit", () => {
  it.each(SQUELETTES)(
    "%s porte toujours la signature Solstice Lab et les liens des mentions légales et de la confidentialité",
    (_, page) => {
      expect(adresses(page)).toEqual(
        expect.arrayContaining(["https://solstice-lab.com", "/mentions-legales", "/confidentialite"])
      );
    }
  );

  it("PageVitrine mène du nom du site à l'accueil et propose les liens de l'en-tête", () => {
    const page = PageVitrine({
      nom: "Site",
      liens: [
        { libelle: "Offre", href: "#offre" },
        { libelle: "Méthode", href: "#methode" },
      ],
      children: "Contenu",
    });
    expect(adresses(page)).toEqual(expect.arrayContaining(["/", "#offre", "#methode"]));
  });
});
