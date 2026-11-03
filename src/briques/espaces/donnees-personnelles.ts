import { query, type ExecuteurSql } from "@/lib/db/client";

/*
 * Ce que la brique espaces garde sur une adresse, pour l'export et
 * l'effacement des données d'une personne de la brique rgpd, quand l'appli
 * l'a : son registre (src/config/donnees-personnelles.ts) les rassemble.
 *
 * Une adhésion désigne son compte (utilisateur_id), jamais l'adresse : elle se
 * retrouve par la jointure avec utilisateurs, où l'adresse arrive en
 * minuscules, sans espaces, comme ici. Ni les autres membres ni le code de
 * l'espace ne sortent : ils ne sont pas les données de la personne, et le code
 * ouvrirait l'espace à qui récupère le fichier.
 *
 * L'effacement des adhésions ne réécrit rien ici : l'effet d'effacement du
 * registre des effets de comptes (effets-comptes.ts), joué par l'anonymisation
 * du compte, les termine et remplace le prénom. Il les compte, AVANT elle : le
 * registre se parcourt à l'envers.
 */

const ADHESIONS_DE_L_ADRESSE = `FROM espaces_adhesions a
           JOIN espaces e ON e.id = a.espace_id
           JOIN utilisateurs u ON u.id = a.utilisateur_id
          WHERE u.email = $1`;

const ESSAIS_DE_L_ADRESSE = `FROM espaces_essais_code s
           JOIN utilisateurs u ON u.id = s.utilisateur_id
          WHERE u.email = $1`;

export const SOURCES_ESPACES = [
  {
    cle: "espaces",
    titre: "Espaces",
    tables: ["espaces", "espaces_adhesions"],
    lire: (adresse: string) =>
      query(
        `SELECT e.nom AS espace, a.prenom, a.role, a.arrivee_le, a.depart_le, a.motif_depart
           ${ADHESIONS_DE_L_ADRESSE} ORDER BY a.arrivee_le, a.id`,
        [adresse]
      ),
    note: "Les espaces dont la personne a fait ou fait partie : le nom de l'espace, le prénom qu'elle y porte, son rôle, ses dates d'arrivée et de départ. Les autres membres et le code de l'espace n'y sont pas.",
    effacement:
      "Les adhésions en cours se terminent, et le prénom devient « Ancien membre » dans toutes, à l'anonymisation du compte. Un espace dont la personne était la dernière à le gérer passe à son membre le plus ancien.",
    effacer: async (executeur: ExecuteurSql, adresse: string) => ({
      lignes: (await executeur.query(`SELECT 1 ${ADHESIONS_DE_L_ADRESSE}`, [adresse])).length,
    }),
  },
  {
    cle: "codes-espaces",
    titre: "Codes d'espace faux saisis",
    tables: ["espaces_essais_code"],
    lire: (adresse: string) => query(`SELECT s.essaye_le ${ESSAIS_DE_L_ADRESSE} ORDER BY s.essaye_le`, [adresse]),
    note: "L'heure de chaque code faux saisi pour rejoindre un espace, sans le code. Ils servent une heure, à plafonner les essais, et sont effacés ensuite, lors d'un code saisi par quiconque.",
    effacement: "Supprimés.",
    effacer: async (executeur: ExecuteurSql, adresse: string) => ({
      lignes: (
        await executeur.query(
          `DELETE FROM espaces_essais_code s USING utilisateurs u
            WHERE u.id = s.utilisateur_id AND u.email = $1 RETURNING 1`,
          [adresse]
        )
      ).length,
    }),
  },
];
