/*
 * Le traitement de la brique espaces, pour la politique de confidentialité
 * (src/lib/confidentialite.ts) : des faits que le code établit, jamais une
 * base légale ni une durée de conservation, que le projet choisit
 * (CONFIDENTIALITE.choix.espaces).
 *
 * Forme : `Traitement` de src/lib/confidentialite.ts, vérifiée là où le socle
 * l'assemble. La brique n'importe pas le socle qui l'importe. Le prestataire
 * d'envoi des invitations est celui de la brique mails, décrit avec elle.
 */

export const TRAITEMENTS_ESPACES = [
  {
    cle: "espaces",
    titre: "Espaces partagés",
    finalite:
      "Permettre à des personnes de se regrouper dans un espace commun, de s'y inviter et d'y voir qui en fait partie.",
    donnees: [
      "Pour chaque membre : le compte, le prénom choisi pour l'espace, le rôle, les dates d'arrivée et de départ, et le motif du départ.",
      "Pour chaque invitation par e-mail : l'adresse invitée, transmise au prestataire d'envoi et non gardée par le site, qui ne compte que l'espace et l'heure de l'envoi.",
      "Pour chaque code faux saisi : le compte et l'heure, gardés une heure.",
    ],
    personnes: "Les membres des espaces, et les personnes qu'un membre invite par e-mail.",
    sousTraitants: [],
    precisions: [
      "Les autres membres d'un espace ne voient que le prénom choisi pour l'espace et le rôle, jamais l'adresse e-mail.",
      "Une adhésion terminée reste, avec sa date de départ ; à l'effacement des données de la personne, son prénom devient « Ancien membre ».",
    ],
  },
];
