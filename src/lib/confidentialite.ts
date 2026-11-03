import { MENTIONS_LEGALES, type MentionsLegales } from "@/lib/mentions-legales";
import { TRAITEMENTS_COMPTES } from "@/briques/comptes/confidentialite";
import { TRAITEMENTS_CONTACT } from "@/briques/contact/confidentialite";
import { LIEUX_DEPLOIEMENT } from "@/briques/deploiement/confidentialite";
import { TRAITEMENTS_JOURNAL } from "@/briques/journal/confidentialite";
import { TRAITEMENTS_MAILS } from "@/briques/mails/confidentialite";
import { TRAITEMENTS_NOTIFICATIONS } from "@/briques/notifications/confidentialite";

/*
 * Politique de confidentialité de l'appli (page /confidentialite, lien dans le
 * pied de toute page). Le RGPD (art. 13) demande d'informer chaque personne
 * dont on collecte les données : qui les traite, pourquoi, sur quelle base
 * légale, combien de temps, avec quels sous-traitants, et ses droits.
 *
 * Deux sources, séparées exprès :
 * - les FAITS, que le code établit : chaque brique décrit ses propres
 *   traitements dans src/briques/<brique>/confidentialite.ts, et l'assembleur
 *   retire la description avec la brique ;
 * - les CHOIX du responsable du traitement, à REMPLIR à la mise en route du
 *   projet, avant toute mise en ligne : base légale, durée et destinataires de chaque
 *   traitement, lieu des sous-traitants que le code ne situe pas, contact.
 *   Le catalogue n'en propose aucun : ils engagent le client et se font
 *   valider par lui (son conseil juridique ou son délégué). Une valeur écrite
 *   d'avance passerait pour vraie ; un champ vide se voit, la page l'annonce.
 *
 * Le responsable du traitement n'est pas resaisi ici : c'est l'éditeur des
 * mentions légales (src/lib/mentions-legales.ts), comme l'hébergeur. Un éditeur
 * particulier non professionnel, qui ne publie pas son identité (LCEN art. 6,
 * III, 2), reste le responsable du traitement : les personnes concernées le
 * joignent par le courriel des droits ci-dessous, qui reste requis, et son nom
 * n'est pas réclamé.
 */

export type SousTraitant = {
  /** Clé de son lieu dans CONFIDENTIALITE.lieux, quand le code ne le connaît pas. */
  cle: string;
  /** Nom ou raison sociale. */
  nom: string;
  /** Ce qu'il fait des données, en une ligne. */
  role: string;
};

export type Traitement = {
  /** Clé de ses choix (base légale, durée) dans CONFIDENTIALITE.choix. */
  cle: string;
  titre: string;
  finalite: string;
  donnees: string[];
  /** Les personnes concernées. */
  personnes: string;
  sousTraitants: SousTraitant[];
  /** Ce que le code garantit en plus : durée d'un cookie, effacement d'une empreinte. */
  precisions: string[];
};

export type ChoixDuTraitement = {
  baseLegale: string;
  duree: string;
  /** Qui, chez le responsable ou ailleurs, reçoit les données, en plus des sous-traitants. */
  destinataires: string;
};

export type Confidentialite = {
  contact: {
    /** L'adresse où exercer ses droits. */
    courriel: string;
    /** Facultatif : le délégué à la protection des données, pour qui en a désigné un. */
    delegue: string;
  };
  /** Date de la dernière mise à jour de la politique, telle qu'affichée. */
  miseAJour: string;
  /**
   * L'autorité où porter réclamation, nom et site : la CNIL (www.cnil.fr)
   * pour un responsable établi en France. Vide par défaut comme le reste : le
   * catalogue ne présume pas du pays du client.
   */
  autoriteDeControle: string;
  /** Une ligne par traitement présent, par sa clé. */
  choix: Record<string, ChoixDuTraitement>;
  /**
   * Le lieu de traitement d'un sous-traitant que le code ne situe pas, par sa
   * clé ; hors de l'Union européenne, avec les garanties du transfert
   * (décision d'adéquation, clauses contractuelles types…), à faire valider.
   */
  lieux: Record<string, string>;
  /**
   * Les traitements des données métier (les entités de l'appli), propres à
   * chaque client : le catalogue ne peut pas les décrire pour lui.
   */
  traitementsDuProjet: Traitement[];
  /** Vrai une fois ces traitements décrits, ou leur absence vérifiée. */
  traitementsDuProjetRevus: boolean;
};

export const CONFIDENTIALITE: Confidentialite = {
  contact: {
    courriel: "",
    delegue: "",
  },
  miseAJour: "",
  autoriteDeControle: "",
  choix: {
    hebergement: { baseLegale: "", duree: "", destinataires: "" },
    comptes: { baseLegale: "", duree: "", destinataires: "" },
    "connexion-code": { baseLegale: "", duree: "", destinataires: "" },
    // Lu seulement si "google" est dans METHODES (src/config/comptes.ts).
    "connexion-google": { baseLegale: "", duree: "", destinataires: "" },
    mails: { baseLegale: "", duree: "", destinataires: "" },
    contact: { baseLegale: "", duree: "", destinataires: "" },
    // 12 mois recommandés (README de la brique journal), à valider par le client.
    journal: { baseLegale: "", duree: "", destinataires: "" },
    // 12 mois recommandés (README de la brique notifications), à valider par le
    // client, et à régler aussi dans conservationMois de sa route.
    notifications: { baseLegale: "", duree: "", destinataires: "" },
  },
  lieux: {
    // Ignoré avec la brique déploiement : le lieu se lit alors dans sa
    // configuration (LIEUX_DEPLOIEMENT), pas ici.
    hebergeur: "",
    resend: "",
  },
  traitementsDuProjet: [],
  traitementsDuProjetRevus: false,
};

// Les traitements des briques gardées, une ligne chacune : l'assembleur retire
// la ligne avec la brique.
const TRAITEMENTS_DES_BRIQUES: Traitement[] = [
  ...TRAITEMENTS_COMPTES,
  ...TRAITEMENTS_CONTACT,
  ...TRAITEMENTS_JOURNAL,
  ...TRAITEMENTS_MAILS,
  ...TRAITEMENTS_NOTIFICATIONS,
];

// Les lieux que le code établit, apportés par les briques (la région de
// l'hébergeur, lue dans sa configuration) : ils priment sur
// CONFIDENTIALITE.lieux, qui ne servirait qu'à les contredire. Une ligne par
// brique, retirée avec elle.
const LIEUX_CONNUS: Record<string, string> = {
  ...LIEUX_DEPLOIEMENT,
};

// Le traitement que tout site en ligne fait, base ou non : l'hébergeur reçoit
// l'adresse IP de chaque visiteur pour lui répondre. Ce qu'il en garde dans
// ses journaux dépend de lui, pas du code : la durée se remplit dans les choix.
function traitementHebergement(mentions: MentionsLegales): Traitement {
  return {
    cle: "hebergement",
    titre: "Hébergement du site",
    finalite: "Mettre le site en ligne et le faire parvenir à ses visiteurs.",
    donnees: ["Adresse IP de chaque visiteur et requêtes qu'il envoie au site, reçues pour lui répondre."],
    personnes: "Toute personne qui visite le site.",
    sousTraitants: [
      { cle: "hebergeur", nom: mentions.hebergeur.nom.trim(), role: "Hébergement du site et de ses données." },
    ],
    precisions: [],
  };
}

/** Les traitements de l'appli : celui du socle, ceux des briques gardées, puis ceux du projet. */
export function traitements(
  mentions: MentionsLegales = MENTIONS_LEGALES,
  config: Confidentialite = CONFIDENTIALITE
): Traitement[] {
  return [traitementHebergement(mentions), ...TRAITEMENTS_DES_BRIQUES, ...config.traitementsDuProjet];
}

/** Où un sous-traitant traite les données : ce que le code établit, sinon la configuration ("" : à compléter). */
export function lieuDe(sousTraitant: SousTraitant, config: Confidentialite = CONFIDENTIALITE): string {
  return (LIEUX_CONNUS[sousTraitant.cle] ?? config.lieux[sousTraitant.cle] ?? "").trim();
}

/** La carte de la page qui affiche un champ requis : « responsable », « droits » ou la clé d'un traitement. */
export type ChampManquant = { libelle: string; section: string };

/** Les champs requis encore vides (des espaces comptent comme vide), dans l'ordre de la page. */
export function champsManquants(
  config: Confidentialite = CONFIDENTIALITE,
  mentions: MentionsLegales = MENTIONS_LEGALES
): ChampManquant[] {
  const vide = (texte: string | undefined) => (texte ?? "").trim() === "";
  const manquants: ChampManquant[] = [];
  const manque = (libelle: string, section: string) => manquants.push({ libelle, section });

  if (mentions.statutEditeur === "professionnel" && vide(mentions.editeur.nom))
    manque("Responsable du traitement : nom (mentions légales)", "responsable");
  if (vide(config.contact.courriel)) manque("Courriel pour exercer ses droits", "responsable");
  if (vide(config.miseAJour)) manque("Date de mise à jour", "responsable");

  for (const traitement of traitements(mentions, config)) {
    const choix = config.choix[traitement.cle];
    if (vide(choix?.baseLegale)) manque(`${traitement.titre} : base légale`, traitement.cle);
    if (vide(choix?.duree)) manque(`${traitement.titre} : durée de conservation`, traitement.cle);
    if (vide(choix?.destinataires)) manque(`${traitement.titre} : destinataires`, traitement.cle);
    for (const sousTraitant of traitement.sousTraitants) {
      // L'hébergeur sans nom se remplit dans les mentions légales, pas ici.
      if (sousTraitant.cle === "hebergeur" && vide(sousTraitant.nom))
        manque("Hébergeur : nom (mentions légales)", traitement.cle);
      if (vide(lieuDe(sousTraitant, config))) {
        manque(`${traitement.titre} : lieu de traitement (${sousTraitant.nom || "hébergeur"})`, traitement.cle);
      }
    }
  }

  if (!config.traitementsDuProjetRevus)
    manque("Traitements propres au projet : à décrire ou à déclarer absents", "projet");
  if (vide(config.autoriteDeControle)) manque("Autorité de contrôle", "droits");
  return manquants;
}
