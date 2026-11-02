import { query, type ExecuteurSql } from "@/lib/db/client";
import { anonymiserLeCompte, avertissementDeConfiguration } from "./administration";
import { empreinteDeLAdresse } from "./code-email";
import { secretDeSession } from "./jeton";

/*
 * Ce que la brique comptes garde sur une adresse, pour l'export et
 * l'effacement des données d'une personne de la brique rgpd, quand l'appli
 * l'a : son registre les rassemble et en vérifie la forme. Sans elle, ces
 * sources ne servent à rien.
 *
 * L'adresse arrive en minuscules, sans espaces : comme dans utilisateurs.
 * Aucune empreinte ne sort : elles ne se lisent pas, et celle du jeton de
 * session donnerait une prise de plus à qui récupère le fichier.
 *
 * L'effacement parcourt le registre à l'envers : le compte, première source,
 * s'anonymise après tout ce qui le retrouve par son adresse.
 */

export const SOURCES_COMPTES = [
  {
    cle: "compte",
    titre: "Compte",
    tables: ["utilisateurs"],
    // Les colonnes nommées, pas `*` : une colonne ajoutée au compte (une
    // empreinte, un secret) ne sort qu'après décision, ici. gere_par_l_appli
    // sort : elle dit si le rôle a été fixé par un admin dans l'appli,
    // ce qui décide de l'accès quoi que dise la configuration.
    lire: (adresse: string) =>
      query(
        `SELECT email, role, actif, gere_par_l_appli, cree_le, derniere_connexion FROM utilisateurs WHERE email = $1`,
        [adresse]
      ),
    effacement:
      "Anonymisé, pas supprimé : son adresse devient « efface-<numéro>@efface.invalid », il est désactivé et sa dernière connexion est oubliée. Ce qui le désigne par son numéro (le journal d'audit) ne mène plus à l'adresse.",
    effacer: async (executeur: ExecuteurSql, adresse: string) => {
      const issue = await anonymiserLeCompte(executeur, adresse);
      if (issue === null) {
        const avertissement = avertissementDeConfiguration(adresse);
        return { lignes: 0, ...(avertissement ? { avertissement } : {}) };
      }
      if ("erreur" in issue) return issue;
      return {
        lignes: 1,
        gestes: [{ ...issue.geste, action: "modification" as const, champs: issue.geste.champs ?? [] }],
        ...(issue.avertissement ? { avertissement: issue.avertissement } : {}),
      };
    },
  },
  {
    cle: "sessions",
    titre: "Sessions",
    tables: ["sessions"],
    lire: (adresse: string) =>
      query(
        `SELECT s.cree_le, s.expire_le
           FROM sessions s
           JOIN utilisateurs u ON u.id = s.utilisateur_id
          WHERE u.email = $1
          ORDER BY s.cree_le`,
        [adresse]
      ),
    note: "Les dates de chaque session. L'empreinte de son jeton n'est pas exportée : elle ne se lit pas.",
    effacement: "Supprimées : la personne est déconnectée partout.",
    effacer: async (executeur: ExecuteurSql, adresse: string) => ({
      lignes: (
        await executeur.query(
          `DELETE FROM sessions s USING utilisateurs u
            WHERE u.id = s.utilisateur_id AND u.email = $1
            RETURNING 1`,
          [adresse]
        )
      ).length,
    }),
  },
  {
    cle: "codes-connexion",
    titre: "Demandes de code de connexion",
    tables: ["codes_connexion"],
    lire: (adresse: string) =>
      query(
        `SELECT cree_le, expire_le, essais, consomme
           FROM codes_connexion
          WHERE adresse_empreinte = $1
          ORDER BY cree_le`,
        [empreinteDeLAdresse(secretDeSession(), adresse)]
      ),
    note: "Retrouvées par l'empreinte à clé de l'adresse. Elles servent une heure, et sont effacées ensuite, lors d'une demande de code suivante. Les empreintes de l'adresse, du code et de l'adresse IP ne sont pas exportées : elles ne se lisent pas.",
    effacement: "Supprimées.",
    effacer: async (executeur: ExecuteurSql, adresse: string) => ({
      lignes: (
        await executeur.query(`DELETE FROM codes_connexion WHERE adresse_empreinte = $1 RETURNING 1`, [
          empreinteDeLAdresse(secretDeSession(), adresse),
        ])
      ).length,
    }),
  },
];
