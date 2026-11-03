import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PageConfidentialite from "@/app/confidentialite/page";
import { champsManquants, traitements, type Confidentialite, type Traitement } from "@/lib/confidentialite";
import type { MentionsLegales } from "@/lib/mentions-legales";

// Comme /mentions-legales : la page sert aussi une vitrine sans base ni
// connexion. Elle lève l'erreur dès qu'elle lit la session ou, avec la brique
// données, que son graphe d'import atteint la base.
vi.mock("next/headers", () => ({
  cookies: async () => {
    throw new Error("La page de confidentialité a lu la session");
  },
}));
vi.mock("@/lib/db/client", () => {
  throw new Error("La page de confidentialité importe la base");
});

// La page est rendue sur une configuration choisie par le test, jamais sur
// celle du dépôt : un projet client remplit la sienne, et ce test doit rester
// vert après.
const etat = vi.hoisted(() => ({ confidentialite: null as unknown, mentions: null as unknown }));
vi.mock("@/lib/confidentialite", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/confidentialite")>();
  return {
    ...original,
    get CONFIDENTIALITE() {
      return etat.confidentialite;
    },
  };
});
vi.mock("@/lib/mentions-legales", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/mentions-legales")>();
  return {
    ...original,
    get MENTIONS_LEGALES() {
      return etat.mentions;
    },
  };
});

// Valeurs factices : aucune vraie entreprise ni personne dans le dépôt.
const MENTIONS: MentionsLegales = {
  statutEditeur: "professionnel",
  identiteCommuniqueeALHebergeur: false,
  editeur: {
    nom: "Exemple SAS",
    formeJuridique: "",
    capital: "",
    adresse: "1 rue de l'Exemple, 75000 Paris",
    telephone: "01 00 00 00 00",
    courriel: "contact@exemple.test",
    immatriculation: "",
    tva: "",
  },
  directeurPublication: "Prénom Nom",
  hebergeur: { nom: "Hébergeur Exemple", adresse: "2 avenue de l'Exemple, 69000 Lyon", telephone: "04 00 00 00 00" },
};

const VIDE: Confidentialite = {
  contact: { courriel: "", delegue: "" },
  miseAJour: "",
  autoriteDeControle: "",
  choix: {},
  lieux: {},
  traitementsDuProjet: [],
  traitementsDuProjetRevus: false,
};

// Une base légale et une durée factices, reconnaissables : le test vérifie
// qu'elles sortent de la configuration, et de nulle part ailleurs.
const BASE_LEGALE = "Base légale factice du test";
const DUREE = "Durée factice du test";
const DESTINATAIRES = "Destinataires factices du test";

// Son sous-traitant n'a pas de lieu connu du code : sa ligne de la
// configuration s'affiche quelles que soient les briques gardées (une copie
// sans la brique mails n'a pas Resend).
const DU_PROJET: Traitement = {
  cle: "projet-exemple",
  titre: "Traitement factice du projet",
  finalite: "Finalité factice",
  donnees: ["Donnée factice"],
  personnes: "Personnes factices",
  sousTraitants: [{ cle: "sous-traitant-factice", nom: "Sous-traitant factice", role: "Rôle factice." }],
  precisions: [],
};

// Tout rempli : chaque traitement présent (ceux des briques du catalogue
// compris) reçoit ses choix, chaque sous-traitant sans lieu connu le sien.
function rempli(): Confidentialite {
  const base: Confidentialite = {
    contact: { courriel: "donnees@exemple.test", delegue: "Délégué Exemple" },
    miseAJour: "1er janvier 2026",
    autoriteDeControle: "Autorité factice",
    choix: {},
    lieux: {},
    traitementsDuProjet: [DU_PROJET],
    traitementsDuProjetRevus: true,
  };
  for (const traitement of traitements(MENTIONS, base)) {
    base.choix[traitement.cle] = { baseLegale: BASE_LEGALE, duree: DUREE, destinataires: DESTINATAIRES };
    for (const sousTraitant of traitement.sousTraitants) base.lieux[sousTraitant.cle] = "Lieu factice";
  }
  return base;
}

const rendre = (confidentialite: Confidentialite, mentions: MentionsLegales = MENTIONS) => {
  etat.confidentialite = confidentialite;
  etat.mentions = mentions;
  return renderToStaticMarkup(PageConfidentialite());
};

afterEach(() => {
  etat.confidentialite = null;
  etat.mentions = null;
});

describe("politique de confidentialité (RGPD art. 13)", () => {
  it("la page vide s'affiche sans session ni base et nomme chaque champ requis manquant", () => {
    const html = rendre(VIDE);
    const manquants = champsManquants(VIDE, MENTIONS);

    expect(manquants.length).toBeGreaterThan(0);
    for (const champ of manquants) expect(html).toContain(champ.libelle);
    expect(html).toContain("À compléter");
  });

  // Le cœur de la règle : le catalogue ne propose ni base légale, ni durée, ni
  // destinataires, ni autorité de contrôle.
  // Elles engagent le responsable du traitement et se font valider ; une
  // valeur écrite d'avance passerait pour vraie.
  it("chaque traitement réclame sa base légale, sa durée et ses destinataires tant que le projet ne les a pas écrits", () => {
    const libelles = champsManquants(VIDE, MENTIONS).map((champ) => champ.libelle);
    const presents = traitements(MENTIONS, VIDE);

    expect(presents.length).toBeGreaterThan(0);
    for (const traitement of presents) {
      expect(libelles).toContain(`${traitement.titre} : base légale`);
      expect(libelles).toContain(`${traitement.titre} : durée de conservation`);
      expect(libelles).toContain(`${traitement.titre} : destinataires`);
    }
    expect(rendre(VIDE)).not.toContain(BASE_LEGALE);
  });

  it("la page remplie affiche les valeurs de la configuration, sans avertissement", () => {
    const html = rendre(rempli());

    for (const texte of [
      BASE_LEGALE,
      DUREE,
      DESTINATAIRES,
      "Lieu factice",
      "Délégué Exemple",
      "1er janvier 2026",
      "Autorité factice",
      "Exemple SAS",
    ]) {
      expect(html).toContain(texte);
    }
    expect(html).toContain("mailto:donnees@exemple.test");
    expect(html).toContain('href="/mentions-legales"');
    expect(html).not.toContain("À compléter");
    expect(html).not.toContain("Non renseigné");
    expect(champsManquants(rempli(), MENTIONS)).toEqual([]);
  });

  it("affiche chaque traitement présent, celui du socle, ceux des briques gardées et ceux du projet", () => {
    const html = rendre(rempli());
    const presents = traitements(MENTIONS, rempli());

    expect(presents.map((traitement) => traitement.cle)).toContain("hebergement");
    expect(presents.map((traitement) => traitement.cle)).toContain(DU_PROJET.cle);
    // React échappe l'apostrophe dans le HTML.
    const enHtml = (texte: string) => texte.replace(/'/g, "&#x27;");
    for (const traitement of presents) {
      expect(html).toContain(enHtml(traitement.titre));
      expect(html).toContain(enHtml(traitement.finalite));
    }
  });

  it("deux traitements ne partagent jamais une clé : leurs choix se mélangeraient", () => {
    const cles = traitements(MENTIONS, rempli()).map((traitement) => traitement.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });

  // Le responsable du traitement est l'éditeur des mentions légales : une seule
  // source, pas deux valeurs qui divergent.
  it("prend le responsable et l'hébergeur dans les mentions légales, et les réclame s'ils manquent", () => {
    const sansEditeur: MentionsLegales = {
      ...MENTIONS,
      editeur: { ...MENTIONS.editeur, nom: "" },
      hebergeur: { ...MENTIONS.hebergeur, nom: "" },
    };
    const libelles = champsManquants(rempli(), sansEditeur).map((champ) => champ.libelle);

    expect(libelles).toContain("Responsable du traitement : nom (mentions légales)");
    expect(libelles).toContain("Hébergeur : nom (mentions légales)");
    expect(rendre(rempli())).toContain("Hébergeur Exemple");
  });

  // LCEN art. 6, III, 2 : un éditeur particulier non professionnel ne publie
  // pas son identité. Il reste responsable du traitement (RGPD art. 13) : les
  // personnes concernées le joignent par le courriel des droits, qui reste
  // requis. Cas d'origine : tours-de-coloc.
  describe("responsable du traitement d'un éditeur particulier non professionnel", () => {
    const PARTICULIER: MentionsLegales = {
      ...MENTIONS,
      statutEditeur: "particulier",
      identiteCommuniqueeALHebergeur: true,
      editeur: { ...MENTIONS.editeur, nom: "", adresse: "", telephone: "", courriel: "" },
      directeurPublication: "",
    };

    it("ne réclame plus son nom, mais réclame toujours le courriel des droits", () => {
      expect(champsManquants(rempli(), PARTICULIER)).toEqual([]);

      const sansCourriel = { ...rempli(), contact: { courriel: "", delegue: "" } };
      expect(champsManquants(sansCourriel, PARTICULIER).map((champ) => champ.libelle)).toEqual([
        "Courriel pour exercer ses droits",
      ]);
    });

    it("la page renvoie au courriel des droits, sans nom ni renvoi vers des coordonnées publiées nulle part", () => {
      const html = rendre(rempli(), PARTICULIER);

      expect(html).toContain("à titre non professionnel");
      expect(html).toContain("mailto:donnees@exemple.test");
      expect(html).not.toContain("Non renseigné");
      expect(html).not.toContain("À compléter");
      expect(html).not.toContain("Voir les <a");
    });

    it("l'éditeur professionnel garde son nom requis", () => {
      const sansNom: MentionsLegales = { ...MENTIONS, editeur: { ...MENTIONS.editeur, nom: "" } };
      expect(champsManquants(rempli(), sansNom).map((champ) => champ.libelle)).toContain(
        "Responsable du traitement : nom (mentions légales)"
      );
    });
  });

  it("réclame la revue des traitements propres au projet, même sans aucun traitement déclaré", () => {
    const revue = { ...rempli(), traitementsDuProjet: [], traitementsDuProjetRevus: false };
    expect(champsManquants(revue, MENTIONS).map((champ) => champ.libelle)).toEqual([
      "Traitements propres au projet : à décrire ou à déclarer absents",
    ]);
    expect(champsManquants({ ...revue, traitementsDuProjetRevus: true }, MENTIONS)).toEqual([]);
  });

  it("une valeur faite d'espaces compte comme vide", () => {
    const blanc = { ...rempli(), contact: { courriel: "   ", delegue: "" } };
    expect(champsManquants(blanc, MENTIONS).map((champ) => champ.libelle)).toEqual([
      "Courriel pour exercer ses droits",
    ]);
  });

  it("le délégué à la protection des données est facultatif", () => {
    const sansDelegue = { ...rempli(), contact: { ...rempli().contact, delegue: "" } };
    expect(champsManquants(sansDelegue, MENTIONS)).toEqual([]);
    expect(rendre(sansDelegue)).not.toContain("Délégué à la protection des données");
  });

  // Même décision que pour les mentions légales : un site en ligne sans
  // ces informations n'est pas conforme, c'est là que le signal compte.
  it("une configuration incomplète reste signalée en production, pas seulement en développement", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(rendre({ ...rempli(), miseAJour: "" })).toContain("À compléter");
      expect(rendre(rempli())).not.toContain("À compléter");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
