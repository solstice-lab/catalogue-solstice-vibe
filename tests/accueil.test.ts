import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { prerender } from "react-dom/static";
import { AccueilDeDepart, premiereEntree } from "../src/lib/accueil";
import type { Referencement } from "../src/lib/referencement";
import type { LienNavigation } from "../src/ui";

/*
 * L'accueil de départ d'une appli assemblée : son nom, sa description et un
 * appel à l'action, lus de ce que la blueprint a déjà fait écrire
 * (NOM_APP, REFERENCEMENT). Cas d'origine : le 2026-11-05, l'essai tours-de-coloc
 * montrait un onglet « Ma coloc » à côté d'un accueil qui disait « Page d'accueil
 * à écrire ».
 *
 * La page lit la navigation et la configuration du référencement, qui sont celles
 * de l'appli : les tests donnent les leurs, comme tests/contact-page.test.ts.
 */

const config = (champs: Partial<Referencement> = {}): Referencement => ({
  nom: "Tours de coloc",
  sitePublic: false,
  description: "Qui passe l'aspirateur cette semaine, sans en discuter.",
  localePartage: "fr_FR",
  pagesPubliques: [],
  ...champs,
});

const accueil: LienNavigation = { libelle: "Accueil", href: "/" };
const mesDonnees: LienNavigation = { libelle: "Suivi", href: "/suivi", visible: () => true };
const comptes: LienNavigation = { libelle: "Réglages", href: "/reglages", visible: () => false };
const offre: LienNavigation = { libelle: "Notre offre", href: "/offre" };

// Le menu d'un écran à gardes s'écrit en asynchrone (il interroge les droits de la
// personne) : renderToStaticMarkup ne l'attend pas, prerender oui. Le HTML échappe
// aussi les apostrophes : le texte se compare lu comme le navigateur le lit.
async function rendu(element: ReactElement): Promise<string> {
  const { prelude } = await prerender(element);
  return (await new Response(prelude).text()).replaceAll("&#x27;", "'");
}

// Le bouton d'appel à l'action, que ne confond pas avec une entrée du menu.
const BOUTON = /<a [^>]*class="sl-bouton[^"]*"[^>]*>/;

describe("premiereEntree : où l'accueil envoie une appli sans espaces", () => {
  it("prend le premier onglet que la personne peut ouvrir, jamais l'accueil lui-même", async () => {
    expect(await premiereEntree([accueil, comptes, mesDonnees])).toEqual({
      libelle: "Suivi",
      href: "/suivi",
    });
  });

  it("ne rend rien quand la navigation n'a que l'accueil : un lien vers soi-même serait une impasse", async () => {
    expect(await premiereEntree([accueil])).toBeUndefined();
    expect(await premiereEntree([accueil, comptes])).toBeUndefined();
  });

  it("attend un garde asynchrone, comme le menu", async () => {
    const tard: LienNavigation = { libelle: "Agenda", href: "/agenda", visible: async () => true };
    expect(await premiereEntree([accueil, tard])).toEqual({ libelle: "Agenda", href: "/agenda" });
  });
});

describe("accueil de départ d'une appli à menu gardé (avec la brique comptes)", () => {
  it("affiche le nom, la description et l'appel à l'action fourni", async () => {
    const html = await rendu(
      AccueilDeDepart({
        navigation: [accueil, mesDonnees],
        entree: { libelle: "Ma coloc", href: "/mon-groupe" },
        config: config(),
      })
    );
    expect(html).toContain("Tours de coloc");
    expect(html).toContain("Qui passe l'aspirateur cette semaine, sans en discuter.");
    expect(html).toMatch(/<a [^>]*class="sl-bouton[^"]*"[^>]*href="\/mon-groupe"[^>]*>Ma coloc<\/a>/);
    expect(html).not.toContain("Page d'accueil à écrire");
  });

  it("n'affiche aucun bouton quand il n'y a pas d'entrée (aucun onglet ouvert à la personne)", async () => {
    const html = await rendu(AccueilDeDepart({ navigation: [accueil, mesDonnees], config: config() }));
    expect(html).toContain("Tours de coloc");
    expect(html).not.toMatch(BOUTON);
  });

  it("ne montre pas un paragraphe vide quand la blueprint n'a pas de description", async () => {
    const html = await rendu(
      AccueilDeDepart({ navigation: [accueil, mesDonnees], config: config({ description: "" }) })
    );
    expect(html).toContain("Tours de coloc");
    expect(html).not.toContain("<p></p>");
    expect(html).not.toContain("À compléter");
  });
});

describe("accueil de départ d'une appli sans menu gardé (site public, sans la brique comptes)", () => {
  it("prend le squelette d'une page vitrine : le nom en titre de page, la description en chapô, un lien vers le premier onglet", async () => {
    const html = await rendu(
      AccueilDeDepart({
        navigation: [accueil, offre],
        entree: { libelle: "Notre offre", href: "/offre" },
        config: config({ nom: "L'ordre du jour", description: "Le site de l'association." }),
      })
    );
    expect(html).toMatch(/<h1[^>]*>L'ordre du jour<\/h1>/);
    expect(html).toContain("Le site de l'association.");
    expect(html).toMatch(/<a [^>]*class="sl-bouton[^"]*"[^>]*href="\/offre"[^>]*>Notre offre<\/a>/);
  });

  it("reste sobre quand le site n'a qu'une page : nom et description, aucun lien inventé", async () => {
    const html = await rendu(AccueilDeDepart({ navigation: [accueil], config: config() }));
    expect(html).toMatch(/<h1[^>]*>Tours de coloc<\/h1>/);
    expect(html).not.toMatch(BOUTON);
  });
});

describe("accueil sans nom renseigné (le catalogue, ou une blueprint sans nom_affiche)", () => {
  it.each([["NOM_APP"], [""], ["   "]])(
    "garde l'état vide « Page d'accueil à écrire » plutôt que d'afficher « %s » comme un nom",
    async (nom) => {
      const html = await rendu(AccueilDeDepart({ navigation: [accueil, mesDonnees], config: config({ nom }) }));
      expect(html).toContain("Page d'accueil à écrire");
      expect(html).not.toMatch(BOUTON);
    }
  );
});
