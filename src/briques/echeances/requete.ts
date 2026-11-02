import { query, queryOne } from "@/lib/db/client";
import { aujourdhui as aujourdhuiDuClient } from "@/lib/format";
import { verifierBranchement, type Branchement } from "./branchement";
import { bornesDeLaVue, echeanceVisible, type Echeance } from "./calcul";

// Alias de la date lue : préfixé pour ne heurter aucune colonne de l'entité.
const COLONNE_ECHEANCE = "__echeance";

// Tables et colonnes déjà vérifiées dans ce process : le type d'une colonne
// ne change pas sans migration, donc sans redémarrage.
const colonnesDateVerifiees = new Set<string>();

/*
 * La colonne de l'échéance doit être de type `date`. Un timestamp sortirait
 * avec son heure (« 2026-11-13 10:00 » passe la borne « 2026-11-13 », donc
 * hors de la vue à J+30), et un timestamptz se ramènerait au jour dans le
 * fuseau de la base, pas dans celui du client (FUSEAU) : un jour d'écart
 * autour de minuit. Refusé au branchement plutôt que mal compté.
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

// Les lignes de la fenêtre de la vue, avec les colonnes demandées en plus
// de la date. Bornes et statuts viennent de calcul.ts.
async function lireFenetre<Ligne extends Record<string, unknown>>(
  branchement: Branchement<Ligne>,
  aujourdhui: string,
  colonnes: string[]
) {
  verifierBranchement(branchement);
  await verifierColonneDate(branchement);
  const { table, colonneDate, delaiAlerteJours: delai, retardSansLimite } = branchement;
  const { debut, fin } = bornesDeLaVue(aujourdhui, delai);
  // Sans limite, seule la fin borne la lecture : un retard de 35 jours reste
  // dans la vue. Une date vide (plan exclu) ne passe ni l'une ni l'autre borne.
  // Conditions et paramètres se construisent ensemble : le numéro de chaque
  // $n vient de la longueur de la liste, jamais écrit en dur.
  const parametres: string[] = [fin];
  const conditions = [`"${colonneDate}" <= $1::date`];
  if (!retardSansLimite) {
    parametres.push(debut);
    conditions.push(`"${colonneDate}" >= $${parametres.length}::date`);
  }
  const lignes = await query<Ligne & { [COLONNE_ECHEANCE]: string }>(
    `SELECT ${colonnes.map((colonne) => `"${colonne}", `).join("")}"${colonneDate}"::text AS "${COLONNE_ECHEANCE}"
       FROM "${table}"
      WHERE ${conditions.join(" AND ")}`,
    parametres
  );
  return lignes.flatMap((ligne) => {
    const visible = echeanceVisible(ligne[COLONNE_ECHEANCE], aujourdhui, delai, retardSansLimite);
    return visible ? [{ ligne, date: ligne[COLONNE_ECHEANCE], ...visible }] : [];
  });
}

/*
 * Les échéances de la vue « À venir » pour un branchement : échues
 * récemment (ou en retard, sans limite d'âge, avec `retardSansLimite`) puis
 * en alerte, par date (les premières ont toutes une date
 * antérieure aux secondes), puis par libellé à date égale.
 *
 * `aujourdhui` se calcule par défaut dans le fuseau du client ; les tests
 * le fixent pour vérifier les bornes.
 */
export async function lireEcheances<Ligne extends Record<string, unknown>>(
  branchement: Branchement<Ligne>,
  aujourdhui: string = aujourdhuiDuClient()
): Promise<Echeance[]> {
  const visibles = await lireFenetre(branchement, aujourdhui, branchement.colonnes);
  return visibles
    .map(({ ligne, date, statut, joursRestants }): Echeance => ({
      lien: branchement.lien(ligne),
      libelle: branchement.libelle(ligne),
      detail: branchement.detail ? branchement.detail(ligne) : null,
      date,
      joursRestants,
      statut,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.libelle.localeCompare(b.libelle));
}

// Le compte de la tuile d'accueil : la date seule, sans les colonnes, le
// libellé ni le lien que la vue construit pour chaque ligne.
export async function compterEcheances<Ligne extends Record<string, unknown>>(
  branchement: Branchement<Ligne>,
  aujourdhui: string = aujourdhuiDuClient()
): Promise<{ enAlerte: number; echues: number }> {
  const visibles = await lireFenetre(branchement, aujourdhui, []);
  const enAlerte = visibles.filter((visible) => visible.statut === "en_alerte").length;
  return { enAlerte, echues: visibles.length - enAlerte };
}
