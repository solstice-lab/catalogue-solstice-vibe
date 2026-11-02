import type { RapportConfirmation } from "./lot";
import type { Client } from "./types";

/*
 * Ce que l'appli remplit pour brancher la brique sur une entité (voir le
 * README, « Ce qu'on configure »). La brique ne connaît ni la table cible ni
 * ses colonnes : l'appli donne les fonctions qui écrivent, par ses propres
 * modules de src/lib/db/ (SQL à la main interdit : les fonctions de l'appli
 * remplissent ce qu'un INSERT oublie, voir la skill solstice-donnees).
 */

export type TypeChamp = "texte" | "nombre" | "date";

export type ChampImport = {
  /** Nom du champ dans l'appli. */
  champ: string;
  /**
   * En-têtes du fichier qui l'alimentent. Plusieurs graphies possibles
   * (« Républications » / « Republications » selon l'export) : la première
   * valeur non vide l'emporte, une colonne vide n'écrase jamais une valeur
   * trouvée (leçon d'une appli livrée).
   */
  entetes: string[];
  /** Un identifiant à zéros de tête se déclare « texte ». */
  type: TypeChamp;
  /** Une ligne qui n'en a pas est écartée avec son numéro. */
  obligatoire?: boolean;
  /**
   * Choix que la personne doit faire avant de confirmer : jamais rempli par
   * défaut. Une valeur du fichier, si elle existe, vaut proposition.
   */
  decision?: boolean;
};

export type FormatDate = "jour_mois" | "mois_jour";

export type ModeEcriture = "mise_a_jour" | "remplacement";

export type ResultatEcriture = "cree" | "mis_a_jour" | "inchange";

export type ValeursLigne = Record<string, string | number | null>;

export type Branchement = {
  /** Identifiant stable et unique du branchement : rattache les lots à leur entité. */
  id: string;
  champs: ChampImport[];
  /**
   * Champs qui identifient une ligne. Absente : aucun dédoublonnage, deux
   * lignes identiques sont deux lignes (deux demi-journées, vécu sur un projet précédent).
   */
  cle?: string[];
  /** Jamais deviné : « 05/06/2026 » se lit selon ce réglage (leçon d'une appli livrée). */
  formatDate: FormatDate;
  mode: ModeEcriture;
  /**
   * Écrit UNE ligne retenue, avec le client de la transaction de la
   * confirmation. Mode « mise_a_jour » : l'appli met à jour en place la ligne
   * qui porte la même clé.
   */
  ecrire: (client: Client, valeurs: ValeursLigne) => Promise<ResultatEcriture>;
  /**
   * Facultatif. Dit, À LA LECTURE du fichier, qu'une ligne retenue serait
   * refusée par `ecrire` pour une raison que seule l'appli connaît (une règle
   * métier lue en base) : rend le motif, ou null. La ligne est alors écartée
   * avec ce motif et tous ses numéros, comme une ligne mal typée, au lieu de
   * bloquer le lot entier à la confirmation (relevé en recette). N'est
   * qu'un avertissement précoce : `ecrire` garde sa propre vérification,
   * car la base peut changer entre la lecture et la confirmation. Lit la base
   * hors transaction, une ligne à la fois (rendre null sans requête quand la
   * ligne n'est pas concernée).
   */
  ecarter?: (valeurs: ValeursLigne) => Promise<string | null>;
  /**
   * Mode « remplacement » seulement : efface la période que le fichier
   * recouvre, AVANT les écritures et dans la même transaction. Appelée
   * seulement quand tout est validé (vécu sur un projet précédent : un import destructif lit
   * tout ou rien).
   */
  remplacer?: (client: Client, lignes: ValeursLigne[]) => Promise<void>;
  /**
   * Si l'entité se référence : `champ` porte la valeur de `cible` d'une autre
   * ligne du lot, qui doit être écrite avant (vécu sur un projet précédent).
   */
  renvoi?: { champ: string; cible: string };
  /**
   * Exigé par les écrans de la brique : où ils vivent et ce qu'ils disent de
   * cette entité (voir le README, « Ce qu'on configure »). Un branchement qui
   * garde ses propres pages s'en passe.
   */
  ecran?: EcranImport;
};

/** Une colonne du tableau des lignes retenues, sur la page d'un lot. */
export type ColonneEcran = {
  champ: string;
  /** Par défaut, le premier en-tête du champ. */
  titre?: string;
  largeur?: string;
  /**
   * Ce que la cellule montre (un montant en euros, un état en libellé),
   * calculé sur le serveur. Le tri reste sur la valeur du lot, le filtre
   * cherche dans ce que l'écran montre. Par défaut : une date formatée, la
   * valeur telle quelle sinon. Une cellule vide montre toujours « — ».
   */
  affichage?: (valeur: string | number) => string;
};

/**
 * Les mots de l'entité. Chaque phrase est déclarée entière : le genre et le
 * nombre changent d'une entité à l'autre (« aucune commande n'a été écrite »,
 * « aucun équipement n'a été écrit »), et une phrase assemblée par morceaux se
 * trompait d'accord.
 */
export type TextesEcran = {
  /** Libellé du champ d'envoi : « Fichier des commandes ». */
  fichier: string;
  /** Où le lot écrit, préposition comprise : « dans les commandes ». */
  dansLEntite: string;
  /**
   * Ce que la confirmation fait de chaque ligne, après « N lignes seront
   * écrites dans … : » : « créées si la référence est nouvelle, mises à jour sinon. »
   */
  ecriture: string;
  /** Ce qu'un lot supprimé laisse : « Les commandes qu'il a déjà écrites restent en place. » */
  ecritsRestent: string;
  /** Ce qu'un lot ignoré n'a pas écrit : « aucune commande n'a été écrite ». */
  rienEcrit: string;
  /** Un lot sans fusion : « Aucune référence n'apparaît deux fois dans le fichier. » */
  aucuneFusion: string;
  /** Le compte rendu d'une confirmation, sans point final. */
  rapport: (rapport: RapportConfirmation) => string;
  /** Une aide au-dessus des lignes retenues, si l'écriture a des règles à dire. */
  aideRetenues?: string;
};

export type EcranImport = {
  /**
   * Adresse des pages de l'import : la liste, `${chemin}/<id>` pour un lot,
   * `${chemin}/envoi` pour le Route Handler. Sans valeur par défaut : la
   * brique ne nomme pas les pages d'une appli, et un « /importer » écrit dans
   * son code passait pour une trace du module métier qui la branchait, dans
   * une copie qui ne garde que la brique.
   */
  chemin: string;
  /** Pages que la confirmation change, à revalider : la liste de l'entité, l'accueil… */
  cheminsEcrits?: string[];
  /** Colonnes des lignes retenues ; par défaut, tous les champs dans l'ordre déclaré. */
  colonnes?: ColonneEcran[];
  textes?: Partial<TextesEcran>;
  /**
   * Le message à montrer pour une erreur levée par `ecrire` pendant la
   * confirmation (fournisseur introuvable, référence prise au même instant),
   * ou null : une
   * erreur qui n'est pas traduite est une vraie panne et mène à la page
   * d'erreur.
   */
  refus?: (erreur: unknown) => string | null;
};

export function verifierBranchement(branchement: Branchement): void {
  const noms = branchement.champs.map((champ) => champ.champ);
  if (new Set(noms).size !== noms.length) {
    throw new Error(`Branchement « ${branchement.id} » : un champ est déclaré deux fois.`);
  }
  for (const nom of branchement.cle ?? []) {
    if (!noms.includes(nom)) {
      throw new Error(`Branchement « ${branchement.id} » : la clé « ${nom} » n'est pas un champ déclaré.`);
    }
  }
  if (branchement.cle?.length === 0) {
    throw new Error(`Branchement « ${branchement.id} » : une clé vide ne dédoublonne rien, la retirer.`);
  }
  if (branchement.renvoi) {
    for (const nom of [branchement.renvoi.champ, branchement.renvoi.cible]) {
      if (!noms.includes(nom)) {
        throw new Error(
          `Branchement « ${branchement.id} » : le renvoi cite « ${nom} », qui n'est pas un champ déclaré.`
        );
      }
    }
  }
  if (branchement.mode === "remplacement" && !branchement.remplacer) {
    throw new Error(`Branchement « ${branchement.id} » : le mode « remplacement » exige la fonction « remplacer ».`);
  }
  if (branchement.mode === "mise_a_jour" && branchement.remplacer) {
    throw new Error(`Branchement « ${branchement.id} » : « remplacer » n'a de sens qu'en mode « remplacement ».`);
  }
}

// Appelée par les écrans de la brique et par l'envoi : une faute de
// branchement casse à la première page ouverte, pas devant la personne qui a
// déjà envoyé son fichier.
export function verifierEcran(branchement: Branchement): void {
  // La page d'un lot ne sait pas encore saisir une décision (à venir) : un lot
  // dont la décision est vide ne se confirme jamais, et la personne resterait
  // devant un bouton qui refuse sans lui donner de quoi répondre.
  const decisions = branchement.champs.filter((champ) => champ.decision).map((champ) => champ.champ);
  if (decisions.length > 0) {
    throw new Error(
      `Branchement « ${branchement.id} » : les écrans de la brique ne savent pas encore saisir un champ de décision (${decisions.join(", ")}) : c'est à venir.`
    );
  }
  if (!branchement.ecran) {
    throw new Error(
      `Branchement « ${branchement.id} » : les écrans de la brique exigent le réglage « ecran », au moins son chemin.`
    );
  }
  const noms = branchement.champs.map((champ) => champ.champ);
  for (const colonne of branchement.ecran.colonnes ?? []) {
    if (!noms.includes(colonne.champ)) {
      throw new Error(
        `Branchement « ${branchement.id} » : la colonne « ${colonne.champ} » n'est pas un champ déclaré.`
      );
    }
  }
  const chemin = branchement.ecran.chemin;
  if (!chemin.startsWith("/") || chemin.endsWith("/")) {
    throw new Error(
      `Branchement « ${branchement.id} » : le chemin « ${chemin} » doit commencer par « / » et ne pas finir par « / ».`
    );
  }
}
