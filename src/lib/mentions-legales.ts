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
 * Une constante plutôt qu'une variable d'environnement : ces informations sont
 * publiques, et un site vitrine sans base ni connexion n'a rien d'autre à
 * régler. La politique de confidentialité n'est pas ici : elle a sa page,
 * /confidentialite, remplie depuis src/lib/confidentialite.ts.
 */

export type MentionsLegales = {
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
  directeurPublication: string;
  hebergeur: {
    /** Nom ou raison sociale. */
    nom: string;
    adresse: string;
    telephone: string;
  };
};

export const MENTIONS_LEGALES: MentionsLegales = {
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

// Les champs que la loi exige de tout éditeur. Les facultatifs (forme
// juridique, capital, immatriculation, TVA) dépendent de son statut : une
// association n'a ni capital ni RCS, ils ne peuvent donc pas bloquer.
export const CHAMPS_REQUIS: {
  libelle: string;
  /** La carte de la page qui affiche le champ. */
  section: "editeur" | "directeur" | "hebergeur";
  valeur: (mentions: MentionsLegales) => string;
}[] = [
  { libelle: "Éditeur : nom ou raison sociale", section: "editeur", valeur: (m) => m.editeur.nom },
  { libelle: "Éditeur : adresse", section: "editeur", valeur: (m) => m.editeur.adresse },
  { libelle: "Éditeur : téléphone", section: "editeur", valeur: (m) => m.editeur.telephone },
  { libelle: "Éditeur : courriel", section: "editeur", valeur: (m) => m.editeur.courriel },
  { libelle: "Directeur de la publication", section: "directeur", valeur: (m) => m.directeurPublication },
  { libelle: "Hébergeur : nom ou raison sociale", section: "hebergeur", valeur: (m) => m.hebergeur.nom },
  { libelle: "Hébergeur : adresse", section: "hebergeur", valeur: (m) => m.hebergeur.adresse },
  { libelle: "Hébergeur : téléphone", section: "hebergeur", valeur: (m) => m.hebergeur.telephone },
];

/** Libellés des champs requis encore vides (des espaces comptent comme vide). */
export function champsManquants(mentions: MentionsLegales = MENTIONS_LEGALES): string[] {
  return CHAMPS_REQUIS.filter((champ) => champ.valeur(mentions).trim() === "").map((champ) => champ.libelle);
}
