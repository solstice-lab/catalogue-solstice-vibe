/*
 * Mentions légales de l'appli (page /mentions-legales, lien dans le pied de
 * toute page). Tout site professionnel publié en France doit identifier son
 * éditeur, son directeur de la publication et son hébergeur (loi pour la
 * confiance dans l'économie numérique, art. 6) — un site vitrine comme un
 * outil interne accessible en ligne.
 *
 * À REMPLIR à la mise en route du projet, avant toute mise en ligne. Les
 * valeurs restent vides dans le catalogue : une valeur inventée passerait pour
 * vraie, un champ vide se voit (la page l'annonce).
 *
 * Un éditeur qui agit à titre non professionnel (un particulier) n'a pas à
 * publier son identité : l'article 6, III, 2 de la même loi lui permet de ne
 * donner que les coordonnées de l'hébergeur, à condition d'avoir communiqué
 * son identité à cet hébergeur. Cas d'origine : tours-de-coloc, éditée par une
 * particulière ; la page restait « À compléter » sans qu'aucune valeur puisse
 * la satisfaire. Le statut se règle ci-dessous ; la page et la politique de
 * confidentialité en tirent les conséquences.
 *
 * Une constante plutôt qu'une variable d'environnement : ces informations sont
 * publiques, et un site vitrine sans base ni connexion n'a rien d'autre à
 * régler. La politique de confidentialité n'est pas ici : elle a sa page,
 * /confidentialite, remplie depuis src/lib/confidentialite.ts.
 */

/**
 * Le statut de l'éditeur : « professionnel » (société, association, indépendant
 * qui édite pour son activité) publie son identité ; « particulier » (personne
 * physique, à titre non professionnel) peut ne publier que son hébergeur.
 */
export type StatutEditeur = "professionnel" | "particulier";

export type MentionsLegales = {
  /** « professionnel » par défaut : le catalogue ne présume pas du statut du client, et c'est le cas qui exige le plus. */
  statutEditeur: StatutEditeur;
  /**
   * Particulier seulement : vrai une fois son identité communiquée à
   * l'hébergeur, condition de la dispense (LCEN art. 6, III, 2). Ignoré pour
   * un éditeur professionnel.
   */
  identiteCommuniqueeALHebergeur: boolean;
  /** Ignoré (ni requis ni affiché) pour un éditeur particulier : l'identité n'est pas publiée. */
  editeur: {
    /** Nom ou raison sociale. */
    nom: string;
    /** Facultatif : société seulement (« SAS », « SARL »…). */
    formeJuridique: string;
    /** Facultatif : société seulement. */
    capital: string;
    adresse: string;
    telephone: string;
    courriel: string;
    /** Facultatif : RCS ou répertoire des métiers, pour qui y est inscrit. */
    immatriculation: string;
    /** Facultatif : numéro de TVA intracommunautaire, pour qui en a un. */
    tva: string;
  };
  /** Ignoré pour un éditeur particulier, comme l'éditeur. */
  directeurPublication: string;
  hebergeur: {
    /** Nom ou raison sociale. */
    nom: string;
    adresse: string;
    telephone: string;
  };
};

export const MENTIONS_LEGALES: MentionsLegales = {
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
  hebergeur: {
    nom: "",
    adresse: "",
    telephone: "",
  },
};

// Les champs que la loi exige de l'éditeur, par statut. Les facultatifs (forme
// juridique, capital, immatriculation, TVA) dépendent de son statut : une
// association n'a ni capital ni RCS, ils ne peuvent donc pas bloquer. Un
// particulier non professionnel n'a à donner que le nom et l'adresse de son
// hébergeur (LCEN art. 6, III, 2 : le téléphone n'y figure pas) ; ni lui ni
// son directeur de la publication ne sont demandés, et en échange il déclare
// avoir communiqué son identité à l'hébergeur. Rien ne vérifie le caractère
// non professionnel : un site avec publicité ou vente n'en relève plus.
export const CHAMPS_REQUIS: {
  libelle: string;
  /** La carte de la page qui affiche le champ. */
  section: "editeur" | "directeur" | "hebergeur";
  /** Les statuts d'éditeur pour lesquels le champ est requis. */
  statuts: StatutEditeur[];
  valeur: (mentions: MentionsLegales) => string;
}[] = [
  {
    libelle: "Éditeur : nom ou raison sociale",
    section: "editeur",
    statuts: ["professionnel"],
    valeur: (m) => m.editeur.nom,
  },
  { libelle: "Éditeur : adresse", section: "editeur", statuts: ["professionnel"], valeur: (m) => m.editeur.adresse },
  {
    libelle: "Éditeur : téléphone",
    section: "editeur",
    statuts: ["professionnel"],
    valeur: (m) => m.editeur.telephone,
  },
  { libelle: "Éditeur : courriel", section: "editeur", statuts: ["professionnel"], valeur: (m) => m.editeur.courriel },
  {
    libelle: "Éditeur particulier : identité communiquée à l'hébergeur",
    section: "editeur",
    statuts: ["particulier"],
    valeur: (m) => (m.identiteCommuniqueeALHebergeur ? "oui" : ""),
  },
  {
    libelle: "Directeur de la publication",
    section: "directeur",
    statuts: ["professionnel"],
    valeur: (m) => m.directeurPublication,
  },
  {
    libelle: "Hébergeur : nom ou raison sociale",
    section: "hebergeur",
    statuts: ["professionnel", "particulier"],
    valeur: (m) => m.hebergeur.nom,
  },
  {
    libelle: "Hébergeur : adresse",
    section: "hebergeur",
    statuts: ["professionnel", "particulier"],
    valeur: (m) => m.hebergeur.adresse,
  },
  {
    libelle: "Hébergeur : téléphone",
    section: "hebergeur",
    statuts: ["professionnel"],
    valeur: (m) => m.hebergeur.telephone,
  },
];

/** Les champs requis du statut de l'éditeur. */
export function champsRequis(mentions: MentionsLegales = MENTIONS_LEGALES) {
  return CHAMPS_REQUIS.filter((champ) => champ.statuts.includes(mentions.statutEditeur));
}

/** Libellés des champs requis encore vides (des espaces comptent comme vide). */
export function champsManquants(mentions: MentionsLegales = MENTIONS_LEGALES): string[] {
  return champsRequis(mentions)
    .filter((champ) => champ.valeur(mentions).trim() === "")
    .map((champ) => champ.libelle);
}
