import { query, type ExecuteurSql } from "@/lib/db/client";

/*
 * Ce que la brique import-lot garde sur une adresse, pour l'export et
 * l'effacement des données d'une personne de la brique rgpd, quand l'appli
 * l'a : son registre la rassemble et en vérifie la forme. Sans elle, cette
 * source ne sert à rien.
 *
 * Une ligne de fichier importé garde ses valeurs telles quelles, quel que soit
 * le branchement : l'adresse s'y cherche comme une valeur entière entre
 * guillemets, comme dans le contenu d'une proposition (brique validation).
 * L'adresse arrive en minuscules, sans espaces.
 *
 * L'effacement garde la ligne, histoire du lot, et y remplace l'adresse par un
 * texte qui ne désigne personne. Ce qui l'entoure (un nom) n'est reconnu par
 * rien : la note de l'effacement le dit.
 */

const ADRESSE_EFFACEE = "(adresse effacée)";

// Chaque valeur qui est l'adresse, quelle que soit sa casse, parcourue valeur
// par valeur et non par une expression régulière : le « + » ou le point d'une
// adresse y prenaient un sens. Même règle que la brique validation, recopiée :
// une brique n'importe pas une autre.
function sansLAdresse(valeur: unknown, adresse: string): unknown {
  if (typeof valeur === "string") return valeur.toLowerCase() === adresse ? ADRESSE_EFFACEE : valeur;
  if (Array.isArray(valeur)) return valeur.map((element) => sansLAdresse(element, adresse));
  if (valeur !== null && typeof valeur === "object") {
    return Object.fromEntries(Object.entries(valeur).map(([cle, element]) => [cle, sansLAdresse(element, adresse)]));
  }
  return valeur;
}

export const SOURCES_IMPORT_LOT = [
  {
    cle: "lignes-importees",
    titre: "Lignes de fichiers importés",
    tables: ["import_lot_lignes", "import_lots"],
    lire: (adresse: string) =>
      query(
        `SELECT l.nom_fichier, l.statut, l.cree_le, li.numero, li.valeurs, li.decisions
           FROM import_lot_lignes li
           JOIN import_lots l ON l.id = li.lot_id
          WHERE strpos(lower(li.valeurs::text), $1) > 0
          ORDER BY l.cree_le, li.ordre`,
        // Écrite comme le JSON l'écrit : guillemets compris, caractères échappés.
        [JSON.stringify(adresse)]
      ),
    note: "Les lignes d'un fichier importé où l'adresse figure telle quelle. Les motifs des lignes écartées d'un lot ne sont pas parcourus.",
    effacement: `Gardées, histoire du lot : l'adresse y est remplacée par « ${ADRESSE_EFFACEE} ». Les autres valeurs de la ligne (un nom) restent : à relire à la main.`,
    effacer: async (executeur: ExecuteurSql, adresse: string) => {
      const lignes = await executeur.query<{ id: number; valeurs: unknown }>(
        `SELECT id, valeurs FROM import_lot_lignes WHERE strpos(lower(valeurs::text), $1) > 0 FOR UPDATE`,
        [JSON.stringify(adresse)]
      );
      for (const ligne of lignes) {
        await executeur.query(`UPDATE import_lot_lignes SET valeurs = $2::jsonb WHERE id = $1`, [
          ligne.id,
          JSON.stringify(sansLAdresse(ligne.valeurs, adresse)),
        ]);
      }
      return { lignes: lignes.length };
    },
  },
];
