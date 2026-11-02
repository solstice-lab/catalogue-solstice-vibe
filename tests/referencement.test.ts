import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  champsManquants,
  indexationAutorisee,
  metadonneesDePage,
  metadonneesRacine,
  planDuSite,
  REFERENCEMENT,
  reglesRobots,
  type Referencement,
} from "@/lib/referencement";
import { couleursDeLImage } from "@/lib/image-partage";
import { estOuverte } from "@/briques/comptes/protection";

// Les fonctions reçoivent une configuration choisie par le test, jamais celle
// du dépôt : un projet client remplit la sienne, et ce test doit rester vert
// après (même principe que tests/mentions-legales.test.ts).
const COMPLET: Referencement = {
  nom: "Exemple",
  sitePublic: true,
  description: "Un site d'exemple.",
  localePartage: "fr_FR",
  pagesPubliques: ["/", "/mentions-legales"],
};
const URL_EXEMPLE = "https://www.exemple.test";

const enLigne = (url: string | undefined = URL_EXEMPLE) => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("URL_PUBLIQUE", url);
};

// Chaque test part sans URL_PUBLIQUE, quel que soit l'environnement qui lance
// les tests : sinon « sans URL » deviendrait faux sur une machine qui l'a.
beforeEach(() => {
  vi.stubEnv("URL_PUBLIQUE", undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const FERME = { rules: { userAgent: "*", disallow: "/" } };

describe("indexation : un site n'est ouvert aux moteurs que s'il le demande, en production, à son adresse", () => {
  it("ouvre robots.txt et nomme le sitemap quand tout est réuni", () => {
    enLigne();
    expect(indexationAutorisee(COMPLET)).toBe(true);
    expect(reglesRobots(COMPLET)).toEqual({
      rules: { userAgent: "*", allow: "/" },
      sitemap: "https://www.exemple.test/sitemap.xml",
    });
  });

  // Un site de test indexé fait concurrence au vrai, et ses données de démo
  // remontent dans les résultats.
  it("ferme tout hors production, même avec une URL", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("URL_PUBLIQUE", URL_EXEMPLE);
    expect(reglesRobots(COMPLET)).toEqual(FERME);
  });

  // Une recette sur Render tourne aussi en NODE_ENV=production : c'est
  // l'absence d'URL_PUBLIQUE qui la garde fermée.
  it("ferme tout en production sans URL_PUBLIQUE", () => {
    enLigne("");
    expect(reglesRobots(COMPLET)).toEqual(FERME);
  });

  it.each([
    ["en http", "http://www.exemple.test"],
    ["sans schéma", "www.exemple.test"],
    ["avec un chemin", "https://www.exemple.test/site"],
    ["avec une requête", "https://www.exemple.test/?a=1"],
  ])("ferme tout avec une URL_PUBLIQUE invalide (%s)", (_cas, url) => {
    enLigne(url);
    expect(reglesRobots(COMPLET)).toEqual(FERME);
  });

  // Le garde-fou de l'outil interne : poser son URL (pour le canonique et
  // l'adresse de l'image) ne l'ouvre pas aux moteurs.
  it("ferme tout pour un site qui n'est pas public, même en production avec son URL", () => {
    enLigne();
    expect(reglesRobots({ ...COMPLET, sitePublic: false })).toEqual(FERME);
  });

  it("ferme tout tant qu'un champ manque : un titre « à compléter » ne doit pas être indexé", () => {
    enLigne();
    expect(reglesRobots({ ...COMPLET, description: "  " })).toEqual(FERME);
    expect(reglesRobots({ ...COMPLET, nom: "NOM_APP" })).toEqual(FERME);
  });

  it("la configuration de l'appli, quelle qu'elle soit, reste fermée hors production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("URL_PUBLIQUE", URL_EXEMPLE);
    expect(indexationAutorisee()).toBe(false);
  });

  // Une URL_PUBLIQUE en http, ou oubliée chez l'hébergeur, ne se voyait sur
  // aucune page : le site restait fermé sans que personne le sache.
  it("un site public fermé faute d'un champ le dit une fois dans les journaux, en nommant le champ", async () => {
    vi.resetModules();
    const { indexationAutorisee: indexationNeuve } = await import("@/lib/referencement");
    const avertir = vi.spyOn(console, "warn").mockImplementation(() => {});
    enLigne("http://www.exemple.test");
    indexationNeuve(COMPLET);
    indexationNeuve(COMPLET);
    expect(avertir).toHaveBeenCalledTimes(1);
    expect(avertir.mock.calls[0][0]).toMatch(/URL_PUBLIQUE/);
    avertir.mockRestore();
  });
});

describe("champs à compléter (une valeur vide se voit, jamais un faux contenu)", () => {
  it("nomme le nom resté NOM_APP, la description vide et l'URL absente d'un site public", () => {
    expect(champsManquants({ ...COMPLET, nom: "NOM_APP", description: "" })).toEqual([
      "Nom du site (NOM_APP, src/lib/navigation.ts)",
      "Description du site",
      "Adresse publique (variable URL_PUBLIQUE)",
    ]);
  });

  it("n'exige pas l'URL d'un site qui n'est pas public", () => {
    expect(champsManquants({ ...COMPLET, sitePublic: false })).toEqual([]);
  });

  it("une valeur manquante se lit « À compléter » dans le titre et la description, jamais un texte inventé", () => {
    const meta = metadonneesRacine({ ...COMPLET, nom: "", description: "" });
    expect(meta.title).toEqual({
      template: "%s · À compléter : nom du site",
      default: "À compléter : nom du site",
    });
    expect(meta.description).toBe("À compléter : description du site");
  });
});

describe("plan du site", () => {
  it("donne les pages publiques en adresses absolues, sans date de modification inventée", () => {
    enLigne();
    expect(planDuSite(COMPLET)).toEqual([
      { url: "https://www.exemple.test/" },
      { url: "https://www.exemple.test/mentions-legales" },
    ]);
  });

  it("est vide quand l'indexation est fermée", () => {
    enLigne("");
    expect(planDuSite(COMPLET)).toEqual([]);
  });
});

describe("métadonnées", () => {
  it("la racine porte l'adresse de base, le titre, l'aperçu, et aucune balise noindex quand le site est ouvert", () => {
    enLigne();
    const meta = metadonneesRacine(COMPLET);
    expect(meta.metadataBase?.toString()).toBe("https://www.exemple.test/");
    expect(meta.title).toEqual({ template: "%s · Exemple", default: "Exemple" });
    expect(meta.description).toBe("Un site d'exemple.");
    expect(meta.robots).toBeUndefined();
    expect(meta.openGraph).toEqual({ siteName: "Exemple", locale: "fr_FR", type: "website" });
    expect(meta.twitter).toEqual({ card: "summary_large_image" });
  });

  // robots.txt seul n'empêche pas d'indexer une adresse vue ailleurs : la
  // balise noindex est le vrai verrou.
  it("la racine pose noindex, nofollow quand l'indexation est fermée", () => {
    const meta = metadonneesRacine(COMPLET);
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.metadataBase).toBeUndefined();
  });

  // Posé à la racine, le canonique s'hériterait sur toutes les pages, qui
  // désigneraient alors toutes l'accueil comme leur adresse de référence.
  it("la racine ne pose jamais d'adresse canonique", () => {
    enLigne();
    expect(metadonneesRacine(COMPLET).alternates).toBeUndefined();
  });

  // Next fusionne les métadonnées clé par clé : un openGraph de page
  // remplaçait celui de la racine et perdait l'image de partage, une clé à
  // undefined effaçait la description du site (constaté au curl).
  it("une page pose son titre, sa description et son canonique, et pas d'openGraph", () => {
    enLigne();
    expect(metadonneesDePage({ titre: "Contact", description: "Nous écrire.", chemin: "/contact" })).toEqual({
      title: "Contact",
      description: "Nous écrire.",
      alternates: { canonical: "/contact" },
    });
  });

  it("l'accueil, sans titre ni description, garde ceux du site : aucune clé vide", () => {
    enLigne();
    expect(metadonneesDePage({ chemin: "/" })).toEqual({ alternates: { canonical: "/" } });
  });

  it("sans URL publique, une page n'a pas de canonique", () => {
    expect(metadonneesDePage({ titre: "Contact", chemin: "/contact" })).toEqual({ title: "Contact" });
  });
});

// Les pages du sitemap : chacune existe et pose son titre et son canonique.
// Un groupe de routes « (x)/ » n'est pas suivi : la page se dit alors
// absente, l'erreur se voit.
const RACINE = path.resolve(__dirname, "..");
const lireDuDepot = (fichier: string) => {
  const absolu = path.join(RACINE, fichier);
  return fs.existsSync(absolu) ? fs.readFileSync(absolu, "utf8") : null;
};
const fichiersDeLaPage = (chemin: string) => {
  const segments = chemin.split("/").filter(Boolean);
  return {
    page: ["src/app", ...segments, "page.tsx"].join("/"),
    layouts: Array.from({ length: segments.length + 1 }, (_, n) =>
      ["src/app", ...segments.slice(0, n), "layout.tsx"].join("/")
    ),
  };
};
function ecartsDesPagesPubliques(chemins: string[], lire: (fichier: string) => string | null): string[] {
  return chemins.flatMap((chemin) => {
    const { page } = fichiersDeLaPage(chemin);
    const source = lire(page);
    if (source === null) return [`${chemin} : aucune page ${page}`];
    return source.includes("metadonneesDePage(")
      ? []
      : [`${chemin} : la page n'appelle pas metadonneesDePage (ni titre ni canonique)`];
  });
}

describe("verrou des pages publiques", () => {
  it("chaque page du sitemap existe et pose ses métadonnées", () => {
    expect(ecartsDesPagesPubliques(REFERENCEMENT.pagesPubliques, lireDuDepot)).toEqual([]);
  });

  it("attrape une page absente et une page sans métadonnées", () => {
    const sources: Record<string, string> = { "src/app/a-propos/page.tsx": "export default function Page() {}" };
    expect(ecartsDesPagesPubliques(["/a-propos", "/absente"], (f) => sources[f] ?? null)).toEqual([
      "/a-propos : la page n'appelle pas metadonneesDePage (ni titre ni canonique)",
      "/absente : aucune page src/app/absente/page.tsx",
    ]);
  });
});

describe("verrou des pages publiques : jamais une page derrière connexion dans le sitemap", () => {
  // Retiré avec la brique comptes, qui seule appelle exiger et protège tout
  // par défaut dans le proxy. La liste ouverte du proxy fait foi ; la lecture
  // de la page et des layouts au-dessus d'elle attrape en plus un exiger
  // posé à la main (pas dans les composants qu'ils importent).
  it("chaque page du sitemap et chaque adresse lue par les robots s'ouvrent sans session", () => {
    const adresses = [
      ...REFERENCEMENT.pagesPubliques,
      "/robots.txt",
      "/sitemap.xml",
      "/opengraph-image",
      "/twitter-image",
    ];
    expect(adresses.filter((chemin) => !estOuverte(chemin))).toEqual([]);
  });

  const derriereConnexion = (chemins: string[], lire: (fichier: string) => string | null) =>
    chemins.flatMap((chemin) => {
      const { page, layouts } = fichiersDeLaPage(chemin);
      return [page, ...layouts]
        .filter((fichier) => /\bexiger\(/.test(lire(fichier) ?? ""))
        .map((fichier) => `${chemin} : ${fichier} appelle exiger`);
    });

  it("aucune page du sitemap ni aucun layout au-dessus d'elle n'appelle exiger", () => {
    expect(derriereConnexion(REFERENCEMENT.pagesPubliques, lireDuDepot)).toEqual([]);
  });

  it("attrape une page et un layout qui appellent exiger", () => {
    const sources: Record<string, string> = {
      "src/app/clients/page.tsx": 'await exiger("clients.acceder");',
      "src/app/espace/layout.tsx": 'await exiger("espace.acceder");',
      "src/app/espace/offres/page.tsx": "export default function Page() {}",
    };
    expect(derriereConnexion(["/clients", "/espace/offres"], (f) => sources[f] ?? null)).toEqual([
      "/clients : src/app/clients/page.tsx appelle exiger",
      "/espace/offres : src/app/espace/layout.tsx appelle exiger",
    ]);
  });
});

describe("image de partage : elle suit le thème (src/ui/theme/tokens.css)", () => {
  // L'image est dessinée par Satori, qui ne lit ni var() ni color-mix() : un
  // thème client qui en met dans un token de l'image doit casser ici, pas en
  // silence au build.
  it("lit les couleurs et le rayon du thème du dépôt", () => {
    const css = fs.readFileSync(path.join(RACINE, "src/ui/theme/tokens.css"), "utf8");
    const theme = couleursDeLImage(css);
    expect(Object.keys(theme).sort()).toEqual(["accent", "rayon", "structure", "texte"]);
  });

  it("prend les valeurs écrites dans tokens.css", () => {
    const css =
      ":root {\n  --couleur-structure: #102030;\n  --couleur-accent: rgb(1, 2, 3);\n  --texte-sur-structure: #fff;\n  --rayon: 6px;\n}";
    expect(couleursDeLImage(css)).toEqual({
      structure: "#102030",
      accent: "rgb(1, 2, 3)",
      texte: "#fff",
      rayon: "6px",
    });
  });

  it("ignore un token cité dans un commentaire, et accepte un nom de couleur et un rayon nul", () => {
    const css =
      "/* --couleur-accent: #000000; ancienne valeur ; à ne pas lire */\n:root {\n  --couleur-structure: navy;\n  --couleur-accent: #ffc72c; /* accent ; dosé */\n  --texte-sur-structure: #fff;\n  --rayon: 0;\n}";
    expect(couleursDeLImage(css)).toEqual({ structure: "navy", accent: "#ffc72c", texte: "#fff", rayon: "0" });
  });

  it("refuse un token absent ou que l'image ne sait pas lire, en le nommant", () => {
    const css =
      ":root {\n  --couleur-structure: color-mix(in srgb, red 50%, blue);\n  --couleur-accent: var(--autre);\n  --texte-sur-structure: #12345;\n}";
    expect(() => couleursDeLImage(css)).toThrow(
      /--couleur-structure.*--couleur-accent.*--texte-sur-structure.*--rayon/s
    );
  });
});
