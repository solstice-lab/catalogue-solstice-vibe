import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PageContact from "@/app/contact/page";
import { CHAMPS } from "@/briques/contact/champs";
import type { LienNavigation } from "@/ui";

// La page de contact est publique : une vitrine n'a pas de connexion,
// et un visiteur anonyme doit pouvoir écrire. Elle lève l'erreur dès qu'elle
// lit la session, au lieu de passer en silence.
vi.mock("next/headers", () => ({
  cookies: async () => {
    throw new Error("La page de contact a lu la session");
  },
  headers: async () => new Headers(),
}));

describe("page de contact", () => {
  it("s'affiche sans session, avec le champ piège et l'heure d'affichage que les filtres lisent", () => {
    const html = renderToStaticMarkup(PageContact());
    for (const nom of Object.values(CHAMPS)) expect(html, nom).toContain(`name="${nom}"`);
  });

  // Le pied de toute page porte une fois ce lien : la mention en fait un
  // second.
  it("porte la mention d'information sous le formulaire, avec le renvoi vers la politique de confidentialité", () => {
    const html = renderToStaticMarkup(PageContact());
    expect(html).toMatch(/servent uniquement à vous répondre/);
    expect(html.split('href="/confidentialite"')).toHaveLength(3);
  });
});

// Le squelette de la page suit ce que l'appli a : un menu à gardes n'existe
// qu'avec la brique comptes (le test lit donc la navigation, pas un import de
// la brique, qui n'existe pas dans une appli assemblée sans elle). Cas
// d'origine : dans un site vitrine, le formulaire avait l'allure d'un écran de
// gestion au milieu de pages publiques.
describe("squelette de la page de contact", () => {
  const accueil: LienNavigation = { libelle: "Accueil", href: "/" };
  const offre: LienNavigation = { libelle: "Notre offre", href: "/offre" };
  const gestion: LienNavigation = { libelle: "Gestion interne", href: "/gestion", visible: () => true };

  afterEach(() => {
    vi.doUnmock("@/lib/navigation");
    vi.resetModules();
  });

  async function afficher(navigation: LienNavigation[]) {
    vi.resetModules();
    vi.doMock("@/lib/navigation", () => ({ NAVIGATION: navigation, NOM_APP: "Mon site" }));
    const { default: page } = await import("@/app/contact/page");
    return renderToStaticMarkup(page());
  }

  it("prend le squelette d'une page publique quand l'appli n'a pas de menu à gardes (pas de brique comptes)", async () => {
    const html = await afficher([accueil, offre]);
    expect(html).toMatch(/<h1[^>]*>Contact<\/h1>/);
    expect(html).toContain('href="/offre"');
    for (const nom of Object.values(CHAMPS)) expect(html, nom).toContain(`name="${nom}"`);
  });

  it("garde le squelette d'un écran d'outil quand l'appli a un menu à gardes (brique comptes), sans en montrer les entrées gardées", async () => {
    const html = await afficher([accueil, gestion]);
    expect(html).not.toMatch(/<h1/);
    expect(html).not.toContain('href="/gestion"');
    for (const nom of Object.values(CHAMPS)) expect(html, nom).toContain(`name="${nom}"`);
  });
});
