/*
 * Le traitement de la brique journal, pour la politique de confidentialité
 * (src/lib/confidentialite.ts) : des faits que le code établit, jamais
 * une base légale ni une durée de conservation, que le projet choisit. La
 * durée recommandée par la brique (12 mois, README) se valide avec le client
 * et s'écrit dans CONFIDENTIALITE.choix.journal.
 *
 * Forme : `Traitement` de src/lib/confidentialite.ts, vérifiée là où le socle
 * l'assemble. La brique n'importe pas le socle qui l'importe.
 */

export const TRAITEMENTS_JOURNAL = [
  {
    cle: "journal",
    titre: "Journal des modifications",
    finalite: "Savoir qui a créé, modifié ou supprimé une fiche, ou administré un compte, et quand.",
    donnees: [
      "Pour chaque création, modification ou suppression : le compte de son auteur, la date et l'heure, la fiche concernée et sa référence, et, pour une modification, le nom des champs changés.",
      "Pour chaque geste d'administration des comptes (invitation, rôle, désactivation, domaine ouvert ou fermé) : le compte de son auteur, la date et l'heure, le compte concerné, désigné par son numéro, ou le domaine, et le nom des champs changés.",
    ],
    personnes:
      "Les personnes qui ont un compte et modifient des fiches, et celles dont un administrateur a créé ou modifié le compte.",
    sousTraitants: [],
    precisions: [
      "Le journal ne garde aucune valeur saisie : seulement le nom des champs changés.",
      "L'auteur est désigné par son compte, pas par son adresse : anonymiser un compte anonymise ses lignes du journal.",
      "Le journal ne se modifie pas, et ne s'efface pas depuis l'appli. Seules les personnes habilitées le consultent.",
      "Les lignes ne s'effacent pas d'elles-mêmes : au terme de la durée de conservation, l'équipe technique les efface.",
    ],
  },
];
