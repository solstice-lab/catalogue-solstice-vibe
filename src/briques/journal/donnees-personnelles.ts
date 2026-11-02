import { query, type ExecuteurSql } from "@/lib/db/client";

/*
 * Ce que la brique journal garde sur une adresse, pour l'export et
 * l'effacement des données d'une personne de la brique rgpd, quand l'appli
 * l'a : son registre la rassemble et en vérifie la forme. Sans elle, cette
 * source ne sert à rien.
 *
 * Une ligne du journal désigne son auteur par son compte (utilisateur_id),
 * jamais par son adresse : elle se retrouve par la jointure avec utilisateurs,
 * où l'adresse est rangée en minuscules, sans espaces, comme elle arrive ici.
 * Ni l'id du compte ni celui de la ligne ne sortent : ils n'apprennent rien.
 *
 * L'effacement ne réécrit rien : la base refuse tout UPDATE du journal, et
 * l'anonymisation du compte (brique comptes) le détache de l'adresse. Il
 * compte les lignes, AVANT elle : le registre se parcourt à l'envers.
 */

const DE_L_ADRESSE = `FROM journal_audit j
           JOIN utilisateurs u ON u.id = j.utilisateur_id
          WHERE u.email = $1`;

export const SOURCES_JOURNAL = [
  {
    cle: "journal",
    titre: "Journal des modifications",
    tables: ["journal_audit"],
    lire: (adresse: string) =>
      query(`SELECT j.le, j.action, j.entite, j.entite_id, j.libelle, j.champs ${DE_L_ADRESSE} ORDER BY j.le, j.id`, [
        adresse,
      ]),
    note: "Les créations, modifications et suppressions de fiches faites par la personne : la fiche, sa référence et, pour une modification, le nom des champs changés, jamais leurs valeurs. Le journal se retrouve par son auteur : les gestes d'autres personnes sur une fiche qui la concerne, ou sur son compte, n'y sont pas.",
    effacement:
      "Rien n'est réécrit : le journal désigne l'auteur par son numéro de compte, que l'anonymisation du compte détache de l'adresse. Elles s'effacent au terme de leur durée de conservation (12 mois recommandés), par l'équipe technique.",
    effacer: async (executeur: ExecuteurSql, adresse: string) => ({
      lignes: (await executeur.query(`SELECT 1 ${DE_L_ADRESSE}`, [adresse])).length,
    }),
  },
];
