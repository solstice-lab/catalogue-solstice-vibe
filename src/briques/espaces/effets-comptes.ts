import type { Effet, EffetsDeCompte } from "@/briques/comptes/effets";
import type { ExecuteurSql } from "@/lib/db/client";
import { jouerLesEffetsDuDepart, type MotifDuDepart } from "./departs";
import { nommerUnSuccesseur } from "./espaces";

/*
 * Ce que la brique espaces fait quand un compte est désactivé ou effacé : son
 * entrée du registre des effets de comptes (src/config/effets-comptes.ts),
 * que l'assembleur retire avec elle. Dans tours-de-coloc, terminer une
 * appartenance à la désactivation obligeait à retoucher
 * src/app/comptes/actions.ts (2026-11-03).
 *
 * Joués dans la transaction du geste, par l'exécuteur reçu, jamais par
 * query() : tests/comptes-effets.test.ts le verrouille pour tout le registre.
 *
 * - Désactivation : les adhésions en cours se terminent (« compte
 *   désactivé ») ; un espace qui perd ainsi son dernier gestionnaire reçoit le
 *   membre le plus ancien à ce rôle.
 * - Effacement : la même chose, puis le prénom devient « Ancien membre » dans
 *   toutes les adhésions du compte, terminées comprises. L'espace garde la
 *   trace d'une présence, plus de la personne.
 * - Réactivation : rien. Une adhésion terminée ne revit pas : la personne
 *   rejoint de nouveau par le code.
 *
 * À la désactivation et à l'effacement, chaque adhésion terminée passe
 * ensuite aux effets de départ des modules (departs.ts), comme quitter et
 * retirer un membre : un module garde un seul point d'entrée pour tout départ.
 */

export const ANCIEN_MEMBRE = "Ancien membre";

type Termine = { id: number; espace_id: number };

// Rend les adhésions terminées, dans l'ordre des espaces, pour les effets de
// départ des modules (departs.ts).
async function terminerLesAdhesions(tx: ExecuteurSql, utilisateurId: number): Promise<Termine[]> {
  // Le verrou de chaque espace touché, dans l'ordre des identifiants : les
  // gestes de la brique prennent le même, et deux espaces verrouillés dans
  // deux ordres différents s'attendraient l'un l'autre.
  const espaces = await tx.query<{ id: number }>(
    `SELECT e.id FROM espaces e
      WHERE e.id IN (SELECT espace_id FROM espaces_adhesions WHERE utilisateur_id = $1 AND depart_le IS NULL)
      ORDER BY e.id FOR UPDATE`,
    [utilisateurId]
  );
  const terminees = await tx.query<Termine>(
    `UPDATE espaces_adhesions SET depart_le = now(), motif_depart = 'compte-desactive'
      WHERE utilisateur_id = $1 AND depart_le IS NULL
      RETURNING id, espace_id`,
    [utilisateurId]
  );
  for (const { id } of espaces) await nommerUnSuccesseur(tx, id);
  return terminees.sort((a, b) => a.espace_id - b.espace_id || a.id - b.id);
}

// Les modules voient le départ une fois le geste fait : successeur nommé et,
// à l'effacement, prénom remplacé. Les verrous des espaces sont déjà pris.
async function prevenirLesModules(
  tx: ExecuteurSql,
  utilisateurId: number,
  terminees: Termine[],
  motif: MotifDuDepart
): Promise<void> {
  for (const { id, espace_id } of terminees) {
    await jouerLesEffetsDuDepart(tx, { espaceId: espace_id, utilisateurId, adhesionId: id, motif });
  }
}

const desactivation: Effet = async (tx, { id }) => {
  const terminees = await terminerLesAdhesions(tx, id);
  await prevenirLesModules(tx, id, terminees, "compte-desactive");
};

// Un compte déjà désactivé n'a plus d'adhésion en cours : ses modules ont été
// prévenus à la désactivation, l'effacement ne rejoue pas ce départ.
const effacement: Effet = async (tx, { id }) => {
  const terminees = await terminerLesAdhesions(tx, id);
  await tx.query("UPDATE espaces_adhesions SET prenom = $2 WHERE utilisateur_id = $1", [id, ANCIEN_MEMBRE]);
  await prevenirLesModules(tx, id, terminees, "compte-efface");
};

export const EFFETS_ESPACES: EffetsDeCompte = {
  unite: "espaces",
  desactivation,
  effacement,
};
