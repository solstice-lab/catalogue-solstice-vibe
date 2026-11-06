import type { Metadata, MetadataRoute } from "next";
import { NOM_APP } from "@/lib/navigation";

/*
 * Référencement et aperçu au partage : titre et description de
 * chaque page, adresse canonique, robots.txt, sitemap.xml, Open Graph et carte
 * de réseau social. Lu par src/app/layout.tsx, robots.ts, sitemap.ts,
 * opengraph-image.tsx, et par le generateMetadata de chaque page publique
 * (metadonneesDePage, exigé des pages du sitemap).
 *
 * À REMPLIR à la mise en route du projet, sur le patron des mentions légales
 * (src/lib/mentions-legales.ts) : des constantes publiques, vides par défaut.
 * Une valeur vide se lit « À compléter » dans l'onglet et dans l'aperçu,
 * jamais un texte inventé, et le site reste fermé aux moteurs tant qu'il en
 * manque une.
 *
 * L'adresse publique, elle, est une variable d'environnement (URL_PUBLIQUE),
 * déclarée sur le seul service de production : une recette tourne aussi en
 * NODE_ENV=production, et une constante l'aurait ouverte aux moteurs sous
 * l'adresse du vrai site.
 */

export type Referencement = {
  /** Nom du site : titre de l'accueil, suffixe des autres titres, aperçu. */
  nom: string;
  /**
   * Le site doit-il être trouvé par les moteurs ? Oui pour un site vitrine,
   * non pour un outil interne, même en ligne. Décidé au cadrage.
   */
  sitePublic: boolean;
  /** Une à deux phrases : sous le titre dans les résultats et l'aperçu. */
  description: string;
  /** Langue de l'aperçu (Open Graph), au format langue_PAYS. */
  localePartage: string;
  /**
   * Les pages du sitemap. Seulement des pages ouvertes sans connexion
   * (tests/referencement.test.ts le verrouille). Avec la brique comptes, une
   * page publique entre aussi dans ROUTES_OUVERTES de la brique (et OUVERTS
   * de tests/gardes-acces.test.ts), et l'accueil n'en est pas une.
   */
  pagesPubliques: string[];
};

export const REFERENCEMENT: Referencement = {
  nom: NOM_APP,
  sitePublic: false,
  description: "",
  localePartage: "fr_FR",
  // Sans l'accueil : la brique comptes le met derrière la connexion. Une
  // appli sans elle reçoit aussi « / » de l'assembleur. Une page par ligne :
  // une brique qui en ajoute une la retire avec elle.
  pagesPubliques: [
    "/mentions-legales",
    "/confidentialite",
    // Brique contact : le formulaire public d'une vitrine.
    "/contact",
  ],
};

// La valeur de remplacement de NOM_APP compte comme vide : elle ne doit
// jamais partir dans un titre indexé.
const NOM_NON_RENSEIGNE = "NOM_APP";

const renseigne = (texte: string) => texte.trim() !== "";
export const nomRenseigne = (config: Referencement) => renseigne(config.nom) && config.nom.trim() !== NOM_NON_RENSEIGNE;

/**
 * L'adresse publique du site (variable URL_PUBLIQUE), ou null si elle est
 * absente ou invalide. Seule une origine en https est admise : l'appli est
 * servie à la racine de son domaine, et une adresse en http désignerait un
 * site qui n'est pas celui qu'on publie.
 */
export function urlPublique(): URL | null {
  const valeur = process.env.URL_PUBLIQUE?.trim();
  if (!valeur) return null;
  try {
    const url = new URL(valeur);
    const origineSeule = url.pathname === "/" && url.search === "" && url.hash === "";
    return url.protocol === "https:" && origineSeule ? url : null;
  } catch {
    return null;
  }
}

/** Libellés des valeurs encore à remplir. */
export function champsManquants(config: Referencement = REFERENCEMENT): string[] {
  const manquants: string[] = [];
  if (!nomRenseigne(config)) manquants.push("Nom du site (NOM_APP, src/lib/navigation.ts)");
  if (!renseigne(config.description)) manquants.push("Description du site");
  if (config.sitePublic && urlPublique() === null) manquants.push("Adresse publique (variable URL_PUBLIQUE)");
  return manquants;
}

/**
 * Vrai seulement pour un site public, en production, à son adresse publique,
 * et complet. Tout le reste (développement, recette, outil interne, valeur à
 * compléter) est fermé aux moteurs.
 */
export function indexationAutorisee(config: Referencement = REFERENCEMENT): boolean {
  if (process.env.NODE_ENV !== "production" || !config.sitePublic) return false;
  // champsManquants exige aussi URL_PUBLIQUE, valide, d'un site public.
  const manquants = champsManquants(config);
  if (manquants.length === 0) return true;
  // Un site déclaré public qui reste fermé ne se voit sur aucune page : une
  // URL_PUBLIQUE en http ou oubliée chez l'hébergeur passerait inaperçue. Dit
  // une fois par démarrage, dans les journaux de l'hébergeur.
  if (!fermetureSignalee) {
    fermetureSignalee = true;
    console.warn(`Référencement : site public fermé aux moteurs, à compléter : ${manquants.join(" ; ")}.`);
  }
  return false;
}
let fermetureSignalee = false;

// Fermé, robots.txt interdit tout, en plus de noindex. Conséquence connue :
// Twitterbot et LinkedInBot respectent robots.txt et ne lisent donc pas
// l'aperçu d'un outil interne en ligne. Variante, si un cas réel la demande :
// en production avec URL_PUBLIQUE mais site non public, ouvrir l'exploration
// et garder noindex ; la recette et le local restent fermés.
export function reglesRobots(config: Referencement = REFERENCEMENT): MetadataRoute.Robots {
  const url = urlPublique();
  if (!indexationAutorisee(config) || !url) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: new URL("/sitemap.xml", url).toString(),
  };
}

// Sans lastModified : la date de dernière modification d'une page n'est connue
// nulle part, et une date inventée serait un faux contenu.
export function planDuSite(config: Referencement = REFERENCEMENT): MetadataRoute.Sitemap {
  const url = urlPublique();
  if (!indexationAutorisee(config) || !url) return [];
  return config.pagesPubliques.map((chemin) => ({ url: new URL(chemin, url).toString() }));
}

/** Le nom tel qu'il s'affiche : « À compléter » tant qu'il n'est pas rempli. */
export const nomAffiche = (config: Referencement = REFERENCEMENT) =>
  nomRenseigne(config) ? config.nom.trim() : "À compléter : nom du site";
/** La description telle qu'elle s'affiche, sur le même principe. */
export const descriptionAffichee = (config: Referencement = REFERENCEMENT) =>
  renseigne(config.description) ? config.description.trim() : "À compléter : description du site";

/**
 * Les métadonnées de la racine (src/app/layout.tsx). Jamais d'adresse
 * canonique ici : elle s'hériterait sur chaque page, qui désignerait alors
 * l'accueil comme son adresse de référence.
 */
export function metadonneesRacine(config: Referencement = REFERENCEMENT): Metadata {
  const nom = nomAffiche(config);
  return {
    ...(urlPublique() && { metadataBase: urlPublique() }),
    title: { template: `%s · ${nom}`, default: nom },
    description: descriptionAffichee(config),
    // En plus de robots.txt, pour les robots qui ne le lisent pas. Un robot
    // qui le respecte n'explore pas la page et ne voit donc pas cette balise :
    // une adresse vue ailleurs peut alors être indexée sans son contenu.
    ...(!indexationAutorisee(config) && { robots: { index: false, follow: false } }),
    // Ni titre ni description ici : Next reprend ceux de chaque page pour son
    // aperçu. L'image vient de opengraph-image.tsx et twitter-image.tsx, et
    // Next ne la garde que si la page ne pose pas son propre openGraph (il
    // remplacerait celui-ci en entier : constaté au curl, sans og:image).
    openGraph: { siteName: nom, locale: config.localePartage, type: "website" },
    twitter: { card: "summary_large_image" },
  };
}

/**
 * Les métadonnées d'une page, à rendre par son generateMetadata. Sans titre,
 * la page garde le nom du site seul (l'accueil) ; sans description, celle du
 * site. Le canonique ne se pose qu'avec une URL publique : un chemin relatif
 * sans adresse de base est une erreur de build. Aucune clé à undefined : Next
 * l'appliquerait et effacerait la valeur de la racine (constaté pour la
 * description).
 */
export function metadonneesDePage(page: { titre?: string; description?: string; chemin: string }): Metadata {
  return {
    ...(page.titre !== undefined && { title: page.titre }),
    ...(page.description !== undefined && { description: page.description }),
    ...(urlPublique() && { alternates: { canonical: page.chemin } }),
  };
}
