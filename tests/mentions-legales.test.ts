import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PageMentionsLegales from "@/app/mentions-legales/page";
import { CHAMPS_REQUIS, champsManquants, type MentionsLegales } from "@/lib/mentions-legales";

// Le socle doit servir un site vitrine sans base ni connexion : la page
// lève l'erreur dès qu'elle lit la session ou, avec la brique données, que son
// graphe d'import atteint la base, au lieu de passer en silence.
vi.mock("next/headers", () => ({
  cookies: async () => {
    throw new Error("La page des mentions légales a lu la session");
  },
}));
vi.mock("@/lib/db/client", () => {
  throw new Error("La page des mentions légales importe la base");
});

// La page est rendue sur une configuration choisie par le test, jamais sur
// celle du dépôt : un projet client remplit ses mentions, et ce test doit
// rester vert après.
const etat = vi.hoisted(() => ({ mentions: null as unknown }));
vi.mock("@/lib/mentions-legales", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/mentions-legales")>();
  return {
    ...original,
    get MENTIONS_LEGALES() {
      return etat.mentions;
    },
  };
});

const VIDES: MentionsLegales = {
  editeur: {
    nom: "",
    formeJuridique: "",
    capital: "",
    adresse: "",
    telephone: "",
    courriel: "",
    immatriculation: "",
    tva: "",
  },
  directeurPublication: "",
  hebergeur: { nom: "", adresse: "", telephone: "" },
};

// Valeurs factices : aucune vraie entreprise ni personne dans le dépôt.
const REMPLIES: MentionsLegales = {
  editeur: {
    nom: "Exemple SAS",
    formeJuridique: "SAS",
    capital: "1 000 €",
    adresse: "1 rue de l'Exemple, 75000 Paris",
    telephone: "01 00 00 00 00",
    courriel: "contact@exemple.test",
    immatriculation: "RCS Paris 000 000 000",
    tva: "FR00000000000",
  },
  directeurPublication: "Prénom Nom",
  hebergeur: {
    nom: "Hébergeur Exemple",
    adresse: "2 avenue de l'Exemple, 69000 Lyon",
    telephone: "04 00 00 00 00",
  },
};

const rendre = (mentions: MentionsLegales) => {
  etat.mentions = mentions;
  return renderToStaticMarkup(PageMentionsLegales());
};

afterEach(() => {
  etat.mentions = null;
});

describe("mentions légales (LCEN art. 6)", () => {
  it("la page vide s'affiche sans session ni base et nomme chaque champ requis manquant", () => {
    const html = rendre(VIDES);

    for (const section of ["Éditeur", "Directeur de la publication", "Hébergeur"]) {
      expect(html).toContain(section);
    }
    for (const champ of CHAMPS_REQUIS) expect(html).toContain(champ.libelle);
    expect(html).toContain("À compléter");
  });

  it("la page remplie affiche les valeurs, facultatives comprises, sans avertissement", () => {
    const html = rendre(REMPLIES);

    for (const texte of ["Exemple SAS", "Prénom Nom", "Hébergeur Exemple", "RCS Paris 000 000 000", "FR00000000000"]) {
      expect(html).toContain(texte);
    }
    expect(html).toContain("mailto:contact@exemple.test");
    // Le pied de toute page porte une fois ce lien : la carte qui renvoie au
    // RGPD en fait un second.
    expect(html).toContain("Données personnelles");
    expect(html.split('href="/confidentialite"')).toHaveLength(3);
    expect(html).not.toContain("À compléter");
    expect(html).not.toContain("Non renseigné");
  });

  it("une configuration vide manque de tous les champs requis, une remplie d'aucun", () => {
    expect(champsManquants(VIDES)).toEqual(CHAMPS_REQUIS.map((champ) => champ.libelle));
    expect(champsManquants(REMPLIES)).toEqual([]);
  });

  it("une valeur faite d'espaces compte comme vide", () => {
    const blanc = { ...REMPLIES, directeurPublication: "   " };
    expect(champsManquants(blanc)).toEqual(["Directeur de la publication"]);
  });

  it("les champs facultatifs (forme juridique, capital, RCS, TVA) ne bloquent rien", () => {
    const sansFacultatifs: MentionsLegales = {
      ...REMPLIES,
      editeur: { ...REMPLIES.editeur, formeJuridique: "", capital: "", immatriculation: "", tva: "" },
    };
    expect(champsManquants(sansFacultatifs)).toEqual([]);
  });

  // En production aussi, la personne responsable du
  // projet a tranché : un site en ligne sans mentions n'est pas conforme, le
  // signal doit s'y voir.
  it("une configuration incomplète reste signalée en production, pas seulement en développement", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(rendre({ ...REMPLIES, directeurPublication: "" })).toContain("À compléter");
      expect(rendre(REMPLIES)).not.toContain("À compléter");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
