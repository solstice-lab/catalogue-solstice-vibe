import { query, type ExecuteurSql } from "@/lib/db/client";

/*
 * Ce que la brique validation garde sur une adresse, pour l'export et
 * l'effacement des données d'une personne de la brique rgpd, quand l'appli
 * l'a : son registre la rassemble et en vérifie la forme. Sans elle, cette
 * source ne sert à rien.
 *
 * Deux façons d'y être : avoir décidé (decide_par, l'adresse en clair), ou
 * être cité dans le contenu, que la brique ne connaît pas (le demandeur d'une
 * demande d'achat). Le contenu se lit donc comme du texte, où l'adresse doit
 * figurer comme une valeur entière entre guillemets : « x.elle@… » ne passe
 * pas pour « elle@… ». Elle s'y cherche écrite comme le JSON l'écrit
 * (JSON.stringify : guillemets compris, et une barre oblique ou un guillemet
 * de l'adresse échappés). L'adresse arrive en minuscules, sans espaces.
 *
 * L'effacement garde la proposition, histoire d'une décision : l'adresse y
 * est remplacée, comme décideur et comme valeur du contenu, par un texte qui
 * ne désigne personne. Un texte, pas une adresse vide : le contenu d'une
 * demande d'achat exige un demandeur, sinon l'écran la dit illisible.
 */

const ADRESSE_EFFACEE = "(adresse effacée)";

// Chaque valeur qui est l'adresse, à toute profondeur, quelle que soit sa
// casse. Le contenu se parcourt valeur par valeur, pas par une expression
// régulière sur son texte : le « + » ou le point d'une adresse y prenaient
// un sens, et l'adresse restait en place pendant qu'une voisine partait.
function sansLAdresse(valeur: unknown, adresse: string): unknown {
  if (typeof valeur === "string") return valeur.toLowerCase() === adresse ? ADRESSE_EFFACEE : valeur;
  if (Array.isArray(valeur)) return valeur.map((element) => sansLAdresse(element, adresse));
  if (valeur !== null && typeof valeur === "object") {
    return Object.fromEntries(Object.entries(valeur).map(([cle, element]) => [cle, sansLAdresse(element, adresse)]));
  }
  return valeur;
}

export const SOURCES_VALIDATION = [
  {
    cle: "propositions",
    titre: "Propositions soumises à validation",
    tables: ["propositions"],
    lire: (adresse: string) =>
      query(
        `SELECT id, type, cle, groupe, contenu, statut, cree_le, decide_le, decide_par
           FROM propositions
          WHERE lower(decide_par) = $1
             OR strpos(lower(contenu::text), $2) > 0
          ORDER BY cree_le, id`,
        [adresse, JSON.stringify(adresse)]
      ),
    note: "Les propositions que la personne a décidées, ou dont le contenu cite son adresse (le demandeur d'une demande, par exemple).",
    effacement: `Gardées, histoire des décisions : l'adresse y est remplacée par « ${ADRESSE_EFFACEE} », comme décideur et dans le contenu. Un nom écrit dans le contenu reste : à chercher à la main.`,
    effacer: async (executeur: ExecuteurSql, adresse: string) => {
      const lignes = await executeur.query<{ id: number; contenu: unknown; decide_par: string | null }>(
        `SELECT id, contenu, decide_par
           FROM propositions
          WHERE lower(decide_par) = $1
             OR strpos(lower(contenu::text), $2) > 0
          FOR UPDATE`,
        [adresse, JSON.stringify(adresse)]
      );
      for (const ligne of lignes) {
        await executeur.query(`UPDATE propositions SET contenu = $2::jsonb, decide_par = $3 WHERE id = $1`, [
          ligne.id,
          JSON.stringify(sansLAdresse(ligne.contenu, adresse)),
          ligne.decide_par?.toLowerCase() === adresse ? ADRESSE_EFFACEE : ligne.decide_par,
        ]);
      }
      return { lignes: lignes.length };
    },
  },
];
