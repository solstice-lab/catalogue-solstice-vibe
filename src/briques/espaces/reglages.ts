/*
 * La forme des réglages de la brique espaces, que l'appli remplit dans
 * src/config/espaces.ts. Importable côté client : les écrans en lisent le
 * vocabulaire.
 */

// Les mots de l'interface et des mails, écrits en entier : « une coloc »,
// « l'espace », « du club ». Le genre et l'élision ne se devinent pas d'un
// seul nom.
export type VocabulaireEspaces = {
  /** « un espace », « une coloc » */
  un: string;
  /** « l'espace », « la coloc » */
  le: string;
  /** « de l'espace », « de la coloc », « du club » */
  du: string;
  /** « mon espace », « ma coloc » */
  mon: string;
  /** « cet espace », « cette coloc » */
  ce: string;
  /** Le nom du rôle qui gère l'espace : « Gestionnaire », « Admin de la coloc ». */
  gestionnaire: string;
  /** Le nom du rôle des autres : « Membre ». */
  membre: string;
};

export type ReglagesEspaces = {
  /**
   * Faux : un compte n'a qu'un espace à la fois, créer ou rejoindre est refusé
   * à qui en a déjà un. Vrai : « Mon espace » propose de passer de l'un à
   * l'autre.
   */
  plusieursParCompte: boolean;
  vocabulaire: VocabulaireEspaces;
  plafonds: {
    /** Invitations par e-mail d'un espace, sur 24 heures glissantes. */
    invitationsParEspaceParJour: number;
    /** Invitations par e-mail de toute l'appli, sur 24 heures glissantes. */
    invitationsParJour: number;
    /** Codes faux qu'un compte peut saisir en une heure. */
    codesFauxParHeure: number;
  };
};

export function majuscule(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}
