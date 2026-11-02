/*
 * Le traitement de la brique notifications, pour la politique de
 * confidentialité (src/lib/confidentialite.ts) : des faits que le code établit,
 * jamais une base légale ni une durée de conservation, que le projet choisit.
 * La durée recommandée par la brique (12 mois, README) se valide avec le
 * client et s'écrit dans CONFIDENTIALITE.choix.notifications ; la route efface
 * le journal au-delà de conservationMois, à régler pareil.
 *
 * Le prestataire d'envoi est celui de la brique mails, déjà décrit par elle.
 * Forme : `Traitement` de src/lib/confidentialite.ts, vérifiée là où le socle
 * l'assemble. La brique n'importe pas le socle qui l'importe.
 */

export const TRAITEMENTS_NOTIFICATIONS = [
  {
    cle: "notifications",
    titre: "Notifications par e-mail",
    finalite:
      "Prévenir par e-mail les personnes concernées par ce qui arrive bientôt, et garder la trace de chaque envoi.",
    donnees: [
      "Pour chaque notification : l'adresse qui l'a reçue, son objet, la date de l'envoi, son résultat et l'erreur éventuelle. Le contenu de l'e-mail n'est pas gardé.",
    ],
    personnes: "Les personnes que l'appli prévient, par exemple le responsable d'un contrat.",
    sousTraitants: [],
    precisions: [
      "Les e-mails partent par le prestataire d'envoi décrit à « Envoi des e-mails ».",
      "Les lignes plus anciennes que la durée de conservation s'effacent d'elles-mêmes, à chaque envoi.",
    ],
  },
];
