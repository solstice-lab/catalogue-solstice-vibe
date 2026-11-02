import { query, queryOne } from "@/lib/db/client";
import { verifierBranchement, type Branchement } from "./branchement";
import { bornesDuMois, type Evenement } from "./calcul";

// Alias de la date lue : préfixé pour ne heurter aucune colonne de l'entité.
const COLONNE_DATE = "__jour";

// Tables et colonnes déjà vérifiées dans ce process : le type d'une colonne ne
// change pas sans migration, donc sans redémarrage.
const colonnesDateVerifiees = new Set<string>();

/*
 * La colonne de la date doit être de type `date`. Un timestamptz se ramènerait
 * au jour dans le fuseau de la base, pas dans celui du client : un jour
 * d'écart autour de minuit, et une intervention affichée dans la case de la
 * veille. Refusé au branchement plutôt que mal placé. (Même règle que la
 * brique échéances, recopiée : la brique n'importe que le socle.)
 */
async function verifierColonneDate<Ligne extends Record<string, unknown>>(branchement: Branchement<Ligne>) {
  const cle = `${branchement.table}.${branchement.colonneDate}`;
  if (colonnesDateVerifiees.has(cle)) return;
  const colonne = await queryOne<{ data_type: string }>(
    `SELECT data_type FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [branchement.table, branchement.colonneDate]
  );
  if (colonne?.data_type !== "date") {
    throw new Error(
      `Branchement « ${branchement.id} » : la colonne « ${cle} » doit être de type date ` +
        `(trouvé : ${colonne?.data_type ?? "colonne introuvable"}).`
    );
  }
  colonnesDateVerifiees.add(cle);
}

/*
 * Les événements d'un mois (« aaaa-mm »), premier et dernier jour compris,
 * par date puis par libellé à date égale. Les bornes viennent de calcul.ts.
 */
export async function lireEvenements<Ligne extends Record<string, unknown>>(
  branchement: Branchement<Ligne>,
  mois: string
): Promise<Evenement[]> {
  verifierBranchement(branchement);
  await verifierColonneDate(branchement);
  const { table, colonneDate, colonnes } = branchement;
  const { debut, fin } = bornesDuMois(mois);
  // La colonne de date, si l'appli la demande pour composer son lien, sort en
  // texte « aaaa-mm-jj » : pg la rendrait en objet Date, et le slug d'une
  // fiche se composerait avec « Fri Oct 02 2026 00:00:00 GMT… » (vu au test).
  const selection = colonnes.map((colonne) =>
    colonne === colonneDate ? `"${colonne}"::text AS "${colonne}", ` : `"${colonne}", `
  );
  const lignes = await query<Ligne & { [COLONNE_DATE]: string }>(
    `SELECT ${selection.join("")}"${colonneDate}"::text AS "${COLONNE_DATE}"
       FROM "${table}"
      WHERE "${colonneDate}" >= $1::date AND "${colonneDate}" <= $2::date`,
    [debut, fin]
  );
  return lignes
    .map((ligne): Evenement => ({
      lien: branchement.lien(ligne),
      libelle: branchement.libelle(ligne),
      detail: branchement.detail ? branchement.detail(ligne) : null,
      date: ligne[COLONNE_DATE],
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.libelle.localeCompare(b.libelle));
}
