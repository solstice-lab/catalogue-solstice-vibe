import { query, type ExecuteurSql } from "@/lib/db/client";

/*
 * Ce que la brique notifications garde sur une adresse, pour l'export et
 * l'effacement des données d'une personne de la brique rgpd, quand l'appli
 * l'a : son registre la rassemble et en vérifie la forme. Sans elle, cette
 * source ne sert à rien.
 *
 * Le journal range le destinataire en minuscules, sans espaces, comme
 * l'adresse arrive ici. Ni l'id de la ligne ni le contenu du mail ne sortent :
 * l'un n'apprend rien, l'autre n'est pas gardé.
 *
 * L'effacement garde la ligne, trace d'un envoi, et y vide le destinataire :
 * la colonne l'admet, comme pour un envoi sans destinataire.
 */

export const SOURCES_NOTIFICATIONS = [
  {
    cle: "notifications",
    titre: "Notifications reçues par e-mail",
    tables: ["notifications_envois"],
    lire: (adresse: string) =>
      query(
        `SELECT envoye_le, source, mode, objet, resultat, erreur
           FROM notifications_envois
          WHERE destinataire = $1
          ORDER BY envoye_le, id`,
        [adresse]
      ),
    note: "Les notifications que l'appli a envoyées à cette adresse, ou tenté d'envoyer : la date, le branchement qui l'a envoyée, l'objet et le résultat. Le contenu des e-mails n'est pas gardé. En mode essai, la ligne porte l'adresse qui a reçu l'essai.",
    effacement:
      "Gardées, trace des envois : l'adresse du destinataire est retirée. L'objet reste : un nom qu'il citerait se cherche à la main. Elles s'effacent au terme de leur durée de conservation.",
    effacer: async (executeur: ExecuteurSql, adresse: string) => ({
      lignes: (
        await executeur.query(
          `UPDATE notifications_envois SET destinataire = NULL WHERE destinataire = $1 RETURNING 1`,
          [adresse]
        )
      ).length,
    }),
  },
];
