import { conservations, libelleDuree, type ConservationLue, type Duree } from "@/lib/confidentialite";
import type { ExecuteurEffacement } from "./effacement";

/*
 * La purge des données au terme de leur durée de conservation. La brique ne
 * connaît aucune table : chaque brique déclare la durée de ses données à côté
 * de la description de ses traitements (son confidentialite.ts), la politique
 * de confidentialité les affiche, et la purge lit les mêmes, surcharges du
 * projet comprises (conservations() de src/lib/confidentialite.ts).
 *
 * Deux portes, une seule fonction :
 * - le script (scripts/purger-donnees.ts), en dry-run par défaut, que lance un
 *   humain : toutes les données déclarées, le journal d'audit compris ;
 * - purgerAuPassage, pour une appli sans tâche planifiée, que l'appelant
 *   déclenche au détour d'une lecture : seulement les données marquées
 *   `auPassage`. Cas d'origine : tours-de-coloc purgeait ses tours de plus de
 *   12 mois au moment où une lecture créait ceux d'une nouvelle semaine, et
 *   cette purge, avec ses gardes, avait pris un ticket entier.
 *
 * Un verrou consultatif de la base, pris dans la transaction, fait passer son
 * chemin à une purge qui en trouve une autre en cours : deux requêtes
 * simultanées ne la jouent pas deux fois, et aucune n'attend l'autre.
 *
 * Une durée déclarée sans purge possible (un compte s'anonymise, il ne se
 * supprime pas ; un message dort dans la boîte de l'éditeur) n'est jamais
 * ignorée : le bilan la rappelle, avec les lignes échues quand elles sont en
 * base.
 *
 * La brique n'importe pas la base : l'appelant lui passe sa fonction de
 * transaction, comme pour l'effacement.
 */

export type OptionsPurge = {
  transaction: <T>(travail: (executeur: ExecuteurEffacement) => Promise<T>) => Promise<T>;
  /** Les conservations à purger : celles de l'appli par défaut. Pour les tests. */
  conservations?: ConservationLue[];
};

type LigneDuBilan = {
  cle: string;
  traitement: string;
  donnee: string;
  /** « 12 mois après le geste ». */
  duree: string;
};

export type BilanPurge = {
  /** Faux pour l'aperçu : rien n'a été effacé. */
  effectue: boolean;
  /** Ce que la purge efface (ou effacerait), table par table. */
  effacees: (LigneDuBilan & { table: string; lignes: number })[];
  /** Les lignes échues que rien n'efface d'office, et ce qu'il faut en faire. */
  aLaMain: (LigneDuBilan & { table: string; lignes: number; raison: string })[];
  /** Les durées déclarées hors de la base, rappelées. */
  horsBase: (LigneDuBilan & { raison: string })[];
};

/** Une autre purge tenait le verrou : rien n'a été fait. */
export type PurgeOccupee = { occupee: true };

export class ErreurPurge extends Error {
  constructor(message: string) {
    super(`Brique rgpd, purge : ${message}`);
    this.name = "ErreurPurge";
  }
}

/** Interne, exportée pour son test : la clé du verrou consultatif. */
export const CLE_VERROU_PURGE = "brique rgpd : purge des données";

const IDENTIFIANT = /^[a-z_][a-z0-9_]*$/;

// Les noms de table et de colonne entrent dans le SQL tels quels : seul un
// identifiant simple passe, vérifié pour toutes les conservations avant la
// première requête.
function verifierIdentifiants(liste: ConservationLue[]): void {
  for (const { cle, purge } of liste) {
    if (!("table" in purge)) continue;
    if (!IDENTIFIANT.test(purge.table) || !IDENTIFIANT.test(purge.colonne)) {
      throw new ErreurPurge(`« ${cle} » : table et colonne doivent être des identifiants simples ([a-z_][a-z0-9_]*).`);
    }
  }
}

const UNITES_SQL: Record<string, string> = { heures: "hours", jours: "days", mois: "months" };

// La condition d'échéance, à l'horloge de la base, comme les purges que font
// déjà les briques (codes de connexion, notifications).
function echue(colonne: string, duree: Duree): { sql: string; nombre: number } {
  const [unite, nombre] = Object.entries(duree)[0];
  return { sql: `${colonne} < now() - make_interval(${UNITES_SQL[unite]} => $1)`, nombre };
}

const decrire = ({ cle, traitement, donnee, duree, depart }: ConservationLue): LigneDuBilan => ({
  cle,
  traitement,
  donnee,
  duree: `${libelleDuree(duree)} ${depart}`,
});

// Ce qui fait sortir de la transaction pour l'annuler : le bilan d'un aperçu,
// ou le verrou déjà pris.
class Annulation {
  constructor(readonly issue: BilanPurge | PurgeOccupee) {}
}

async function jouer(
  options: OptionsPurge,
  effectuer: boolean,
  auPassage: boolean
): Promise<BilanPurge | PurgeOccupee> {
  const toutes = options.conservations ?? conservations();
  verifierIdentifiants(toutes);
  const retenues = auPassage ? toutes.filter(({ purge }) => "auPassage" in purge && purge.auPassage === true) : toutes;
  try {
    return await options.transaction(async (executeur) => {
      const [verrou] = await executeur.query(`SELECT pg_try_advisory_xact_lock(hashtext($1)) AS pris`, [
        CLE_VERROU_PURGE,
      ]);
      if (verrou?.pris !== true) throw new Annulation({ occupee: true });

      const bilan: BilanPurge = { effectue: effectuer, effacees: [], aLaMain: [], horsBase: [] };
      for (const conservation of retenues) {
        const { purge } = conservation;
        if ("horsBase" in purge) {
          bilan.horsBase.push({ ...decrire(conservation), raison: purge.horsBase });
          continue;
        }
        const condition = echue(purge.colonne, conservation.duree);
        if ("aLaMain" in purge) {
          const [{ n }] = await executeur.query(
            `SELECT count(*)::int AS n FROM ${purge.table} WHERE ${condition.sql}`,
            [condition.nombre]
          );
          bilan.aLaMain.push({
            ...decrire(conservation),
            table: purge.table,
            lignes: Number(n),
            raison: purge.aLaMain,
          });
          continue;
        }
        const effacees = await executeur.query(`DELETE FROM ${purge.table} WHERE ${condition.sql} RETURNING 1`, [
          condition.nombre,
        ]);
        bilan.effacees.push({ ...decrire(conservation), table: purge.table, lignes: effacees.length });
      }
      if (!effectuer) throw new Annulation(bilan);
      return bilan;
    });
  } catch (erreur) {
    if (erreur instanceof Annulation) return erreur.issue;
    throw erreur;
  }
}

/** Ce que la purge effacerait, joué puis annulé : le rapport du dry-run. */
export function apercevoirPurge(options: OptionsPurge): Promise<BilanPurge | PurgeOccupee> {
  return jouer(options, false, false);
}

/** Efface, en une transaction, tout ce qui a passé sa durée déclarée ; rappelle ce qui ne s'efface pas d'office. */
export function purger(options: OptionsPurge): Promise<BilanPurge | PurgeOccupee> {
  return jouer(options, true, false);
}

/**
 * La purge des seules données marquées `auPassage`, à appeler au détour d'une
 * lecture dans une appli sans tâche planifiée. Rejouée, elle ne trouve plus
 * rien ; une autre en cours la fait passer son chemin ({ occupee: true }).
 */
export function purgerAuPassage(options: OptionsPurge): Promise<BilanPurge | PurgeOccupee> {
  return jouer(options, true, true);
}
