import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PageMentionsLegales from "@/app/mentions-legales/page";
import { CHAMPS_REQUIS, champsManquants, champsRequis, type MentionsLegales } from "@/lib/mentions-legales";

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
  statutEditeur: "professionnel",
  identiteCommuniqueeALHebergeur: false,
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
  statutEditeur: "professionnel",
  identiteCommuniqueeALHebergeur: false,
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
    for (const champ of champsRequis(VIDES)) expect(html).toContain(champ.libelle);
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
    expect(champsManquants(VIDES)).toEqual(champsRequis(VIDES).map((champ) => champ.libelle));
    expect(champsRequis(VIDES)).toEqual(CHAMPS_REQUIS.filter((champ) => champ.statuts.includes("professionnel")));
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

// LCEN art. 6, III, 2 : une personne qui édite un site à titre non
// professionnel peut ne publier que les coordonnées de l'hébergeur, si elle
// lui a communiqué son identité. Cas d'origine : tours-de-coloc, dont la
// demandeuse édite à titre de particulier ; la page restait « À compléter »
// sans qu'aucune valeur puisse la satisfaire.
describe("mentions légales d'un éditeur particulier non professionnel (LCEN art. 6, III, 2)", () => {
  const PARTICULIER: MentionsLegales = {
    ...VIDES,
    statutEditeur: "particulier",
    identiteCommuniqueeALHebergeur: true,
    hebergeur: REMPLIES.hebergeur,
  };

  it("ne réclame ni les coordonnées de l'éditeur ni le directeur de la publication, seulement l'hébergeur", () => {
    expect(champsManquants(PARTICULIER)).toEqual([]);
    const sections = champsRequis(PARTICULIER).map((champ) => champ.section);
    expect(sections).not.toContain("directeur");
    expect(sections).toContain("hebergeur");
  });

  // Le III, 2 ne nomme que le nom (ou la raison sociale) et l'adresse de l'hébergeur ; le téléphone relève du III, 1.
  it("réclame toujours le nom et l'adresse de l'hébergeur, pas son téléphone", () => {
    expect(champsManquants({ ...PARTICULIER, hebergeur: VIDES.hebergeur })).toEqual([
      "Hébergeur : nom ou raison sociale",
      "Hébergeur : adresse",
    ]);
    const sansTelephone = { ...PARTICULIER, hebergeur: { ...REMPLIES.hebergeur, telephone: "" } };
    expect(champsManquants(sansTelephone)).toEqual([]);
    expect(rendre(sansTelephone)).not.toContain("Non renseigné");
  });

  it("réclame la déclaration que l'identité a été communiquée à l'hébergeur, condition de la dispense", () => {
    expect(champsManquants({ ...PARTICULIER, identiteCommuniqueeALHebergeur: false })).toEqual([
      "Éditeur particulier : identité communiquée à l'hébergeur",
    ]);
  });

  it("la page dit ce que la loi prévoit, affiche l'hébergeur et n'affiche aucune coordonnée d'éditeur", () => {
    const html = rendre(PARTICULIER);

    expect(html).toContain("à titre non professionnel");
    expect(html).toContain("article 6, III, 2");
    expect(html).toContain("communiquée à l&#x27;hébergeur");
    expect(html).toContain("Hébergeur Exemple");
    expect(html).not.toContain("Directeur de la publication");
    expect(html).not.toContain("Non renseigné");
    expect(html).not.toContain("À compléter");
  });

  it("la page n'affiche pas les coordonnées d'éditeur saisies par erreur : l'anonymat est le but", () => {
    const html = rendre({ ...PARTICULIER, editeur: REMPLIES.editeur, directeurPublication: "Prénom Nom" });

    for (const texte of ["Exemple SAS", "1 rue de l&#x27;Exemple", "contact@exemple.test", "Prénom Nom"]) {
      expect(html).not.toContain(texte);
    }
  });

  it("la page reste « À compléter » et n'affirme pas la communication tant que l'identité n'est pas déclarée communiquée", () => {
    const html = rendre({ ...PARTICULIER, identiteCommuniqueeALHebergeur: false });
    expect(html).toContain("À compléter");
    expect(html).not.toContain("a été communiquée");
  });

  it("un éditeur professionnel garde toutes ses exigences, même avec la déclaration posée", () => {
    const professionnel = { ...VIDES, identiteCommuniqueeALHebergeur: true };
    expect(champsManquants(professionnel)).toEqual(champsRequis(VIDES).map((champ) => champ.libelle));
    expect(champsManquants(professionnel)).toContain("Éditeur : courriel");
    expect(rendre(professionnel)).not.toContain("à titre non professionnel");
  });
});
