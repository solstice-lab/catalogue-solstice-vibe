import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PageContact from "@/app/contact/page";
import { CHAMPS } from "@/briques/contact/champs";

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
