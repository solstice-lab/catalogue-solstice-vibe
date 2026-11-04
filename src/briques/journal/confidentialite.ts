/*
 * Le traitement de la brique journal, pour la politique de confidentialité
 * (src/lib/confidentialite.ts) : des faits que le code établit, jamais
 * une base légale, que le projet choisit. La durée de conservation
 * (`conservation`, 12 mois, README) est une valeur par défaut, à valider avec
 * le client, qui la surcharge par sa clé (CONFIDENTIALITE.durees).
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
      "Pour chaque export des données d'une personne par un administrateur : le compte de l'administrateur, la date et l'heure, et le compte exporté, désigné par son numéro.",
    ],
    personnes:
      "Les personnes qui ont un compte et modifient des fiches, et celles dont un administrateur a créé ou modifié le compte, ou exporté les données.",
    sousTraitants: [],
    precisions: [
      "Le journal ne garde aucune valeur saisie : seulement le nom des champs changés.",
      "L'auteur est désigné par son compte, pas par son adresse : anonymiser un compte anonymise ses lignes du journal.",
      "Le journal ne se modifie pas, et ne s'efface pas depuis l'appli. Seules les personnes habilitées le consultent.",
      "Les lignes ne s'effacent pas d'elles-mêmes : au terme de la durée de conservation, l'équipe technique les efface.",
    ],
    conservation: [
      {
        // 12 mois : de quoi répondre à « qui a modifié cette fiche » sur un
        // exercice entier. Purgé par le script seul, jamais au passage : le
        // journal ne s'efface pas depuis l'appli (tests/journal.test.ts).
        cle: "journal",
        donnee: "Lignes du journal",
        duree: { mois: 12 },
        depart: "après le geste",
        purge: { table: "journal_audit", colonne: "le" },
      },
    ],
  },
];
