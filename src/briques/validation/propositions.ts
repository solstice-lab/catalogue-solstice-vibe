import { ENTIER_MAX } from "@/lib/db/bornes";
import { query, queryOne, transaction } from "@/lib/db/client";
import { verifierBranchement, type Branchement, type Contenu, type Decideur } from "./branchement";
import { statutDeGroupe, type StatutGroupe } from "./cycle";

/*
 * La file de propositions, en base, par `query()`/`transaction()`. Serveur
 * seulement. Les droits d'accès à la page et à la server action se vérifient
 * côté appli, en première ligne (briques/comptes/roles.ts) ; `peutDecider` du branchement
 * n'est que la seconde ligne de défense.
 */

export type Decision = "acceptee" | "refusee";

// La décision est mal formée ou la proposition introuvable : l'appelant s'est
// trompé, rien n'a été écrit.
export class ErreurDecision extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurDecision";
  }
}

// `peutDecider` du branchement a refusé cette personne.
export class ErreurDroit extends Error {
  constructor() {
    super("Cette personne n'a pas le droit de décider.");
    this.name = "ErreurDroit";
  }
}

// Une décision en lot au-delà du seuil sans confirmation explicite.
export class ErreurConfirmation extends Error {
  constructor(
    public readonly seuil: number,
    public readonly nombre: number
  ) {
    super(`Décider ${nombre} propositions d'un coup (seuil : ${seuil}) exige une confirmation explicite.`);
    this.name = "ErreurConfirmation";
  }
}

export type LignePropositions = {
  id: number;
  type: string;
  cle: string;
  groupe: string | null;
  contenu: Contenu;
  // Pas `Statut` : une base plus récente que ce code peut porter un statut
  // que le code ne connaît pas, et il doit pouvoir se dire inconnu (cycle.ts).
  statut: string;
  creeLe: string;
  decideLe: string | null;
  decidePar: string | null;
};

// Seules ces deux issues tiennent la clé de déduplication (index unique
// partiel de la migration) : un refus la garde, une acceptation la libère.
const STATUTS_QUI_TIENNENT_LA_CLE = `'en_attente', 'refusee'`;

const COLONNES = `id, type, cle, groupe, contenu, statut,
  cree_le::text AS "creeLe", decide_le::text AS "decideLe", decide_par AS "decidePar"`;

export type ResultatProposition =
  | { issue: "creee"; id: number }
  // Contenu et groupe rafraîchis : la source a pu changer pendant l'attente.
  | { issue: "deja_en_attente"; id: number }
  // Le rescan retombe sur une proposition refusée : il ne la ressuscite pas.
  | { issue: "refusee_existante"; id: number };

export async function proposer(
  branchement: Branchement,
  proposition: { type: string; cle: string; contenu: Contenu }
): Promise<ResultatProposition> {
  verifierBranchement(branchement);
  const { type, cle, contenu } = proposition;
  if (!Object.hasOwn(branchement.types, type)) {
    throw new Error(`Branchement « ${branchement.id} » : le type « ${type} » n'est pas déclaré.`);
  }
  if (typeof cle !== "string" || cle.trim() === "") {
    throw new Error("Une proposition a besoin d'une clé de déduplication non vide.");
  }
  if (!estContenu(contenu)) throw new Error(CONTENU_PAS_OBJET);
  const groupe = branchement.groupe?.(type, contenu) ?? null;

  // Deux rescans simultanés passent tous les deux une vérification préalable :
  // l'unicité est garantie par l'index, pas par un SELECT. Si la proposition
  // en conflit change d'état entre l'INSERT et la lecture ou le
  // rafraîchissement (acceptée dans l'intervalle, donc clé libérée), on
  // retente.
  for (let tentative = 0; tentative < 3; tentative++) {
    const inseree = await queryOne<{ id: number }>(
      `INSERT INTO propositions (type, cle, groupe, contenu)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (type, cle) WHERE statut IN (${STATUTS_QUI_TIENNENT_LA_CLE}) DO NOTHING
       RETURNING id`,
      [type, cle, groupe, JSON.stringify(contenu)]
    );
    if (inseree) return { issue: "creee", id: inseree.id };
    const existante = await queryOne<{ id: number; statut: string }>(
      `SELECT id, statut FROM propositions
        WHERE type = $1 AND cle = $2 AND statut IN (${STATUTS_QUI_TIENNENT_LA_CLE})`,
      [type, cle]
    );
    if (existante?.statut === "en_attente") {
      // La source a pu changer pendant l'attente : le contenu et le groupe se
      // rafraîchissent, pour que la personne décide sur le contenu courant.
      // Le filtre sur le statut, relu par la base après le verrou d'une
      // décision en cours, fait qu'une décision n'est jamais écrasée ; un
      // refus, lui, ne se relit que par `leverRefus`.
      const rafraichie = await queryOne<{ id: number }>(
        `UPDATE propositions SET contenu = $2::jsonb, groupe = $3
          WHERE id = $1 AND statut = 'en_attente'
          RETURNING id`,
        [existante.id, JSON.stringify(contenu), groupe]
      );
      if (rafraichie) return { issue: "deja_en_attente", id: rafraichie.id };
    } else if (existante) {
      return { issue: "refusee_existante", id: existante.id };
    }
  }
  throw new Error(`La proposition « ${type} / ${cle} » n'a pu être ni créée ni retrouvée.`);
}

// Les propositions des types du branchement, les plus anciennes d'abord.
export async function lirePropositions(
  branchement: Branchement,
  filtres: { statut?: string } = {}
): Promise<LignePropositions[]> {
  verifierBranchement(branchement);
  const parametres: unknown[] = [Object.keys(branchement.types)];
  let condition = "";
  if (filtres.statut !== undefined) {
    parametres.push(filtres.statut);
    condition = ` AND statut = $${parametres.length}`;
  }
  return query<LignePropositions>(
    `SELECT ${COLONNES} FROM propositions WHERE type = ANY($1)${condition} ORDER BY cree_le, id`,
    parametres
  );
}

export type Groupe = { groupe: string; statut: StatutGroupe; total: number; enAttente: number };

export async function lireGroupes(branchement: Branchement): Promise<Groupe[]> {
  verifierBranchement(branchement);
  // Le groupement se fait en base : ni contenu JSON ni date ne remontent pour
  // un simple compte par statut. Le tri reste celui de `localeCompare`, pas la
  // collation de la base, pour que l'ordre affiché ne change pas.
  const lignes = await query<{ groupe: string; statuts: string[] }>(
    `SELECT groupe, array_agg(statut) AS statuts FROM propositions
      WHERE type = ANY($1) AND groupe IS NOT NULL
      GROUP BY groupe`,
    [Object.keys(branchement.types)]
  );
  return lignes
    .map(({ groupe, statuts }) => ({
      groupe,
      statut: statutDeGroupe(statuts),
      total: statuts.length,
      enAttente: statuts.filter((statut) => statut === "en_attente").length,
    }))
    .sort((a, b) => a.groupe.localeCompare(b.groupe));
}

/*
 * Une décision exige un décideur identifié par son e-mail : ni lien à jeton,
 * ni défaut (leçon d'une appli livrée). Qu'il vienne bien d'une session, c'est
 * l'engagement du garde de l'appli : la brique ne distingue pas une session
 * d'un objet fabriqué. Sans décideur reconnaissable, rien n'est décidé ; sans
 * droit, rien non plus.
 */
async function verifierDecideur(branchement: Branchement, decideur: unknown): Promise<Decideur> {
  const email = (decideur as { email?: unknown } | null | undefined)?.email;
  if (typeof decideur !== "object" || decideur === null || typeof email !== "string" || email.trim() === "") {
    throw new ErreurDecision("Une décision exige une personne identifiée.");
  }
  // Copie de l'objet reçu, e-mail normalisé : `peutDecider` et les
  // applicateurs reçoivent le décideur que l'appli a passé, rôle compris.
  // Réduit à son e-mail, il faisait refuser tout le monde par un
  // `peutDecider` branché sur `peut()` de briques/comptes/roles.ts, qui lit `role`.
  const identifie: Decideur = { ...(decideur as Decideur), email: email.trim() };
  // Attendu : une règle qui relit le rôle en base rend une promesse, et une
  // promesse non attendue passerait pour un « oui ».
  if (!(await branchement.peutDecider(identifie))) throw new ErreurDroit();
  return identifie;
}

// Le contenu est un objet : `undefined` partirait en null et la base lèverait
// une violation NOT NULL brute ; un tableau ou un scalaire entrerait à tort
// dans la file. Sa forme par type reste l'affaire de l'appli.
const CONTENU_PAS_OBJET = "Le contenu d'une proposition est un objet.";

function estContenu(contenu: unknown): contenu is Contenu {
  return typeof contenu === "object" && contenu !== null && !Array.isArray(contenu);
}

// Jamais de décision par défaut : une valeur vide ou inattendue bloque
// (leçon d'une appli livrée). L'égalité est stricte, « ACCEPTEE » ne passe pas.
function verifierDecision(decision: unknown): Decision {
  if (decision !== "acceptee" && decision !== "refusee") {
    throw new ErreurDecision("La décision doit être « acceptee » ou « refusee », sans valeur par défaut.");
  }
  return decision;
}

function verifierId(id: unknown): number {
  if (typeof id !== "number" || !Number.isInteger(id) || id < 1 || id > ENTIER_MAX) {
    throw new ErreurDecision("Proposition introuvable.");
  }
  return id;
}

type LigneADecider = { id: number; type: string; contenu: Contenu; statut: string };

export type ResultatDecision =
  | { issue: "acceptee" }
  | { issue: "refusee" }
  // Page périmée, double clic, deux personnes : rien de plus n'est fait.
  | { issue: "deja_decidee"; statut: string }
  // L'appariement ne tient plus : la proposition reste en attente, avec le
  // motif ; la personne la refuse si elle veut.
  | { issue: "obsolete"; motif: string };

async function deciderUne(
  branchement: Branchement,
  id: number,
  decision: Decision,
  decideur: Decideur
): Promise<ResultatDecision> {
  // Une seule transaction : verrou de la ligne, revérification, applicateur
  // et changement de statut réussissent ou échouent ensemble. Le verrou fait
  // que deux acceptations simultanées n'appliquent qu'une fois : la
  // seconde attend, relit « acceptee » et ne fait rien.
  return transaction(async (tx): Promise<ResultatDecision> => {
    const ligne = await tx.queryOne<LigneADecider>(
      `SELECT id, type, contenu, statut FROM propositions WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!ligne) throw new ErreurDecision("Proposition introuvable.");
    if (ligne.statut !== "en_attente") return { issue: "deja_decidee", statut: ligne.statut };

    if (decision === "acceptee") {
      if (!Object.hasOwn(branchement.types, ligne.type)) {
        throw new ErreurDecision(`Le type « ${ligne.type} » n'est pas déclaré par ce branchement.`);
      }
      const type = branchement.types[ligne.type];
      const verification = await type.reverifier(ligne.contenu, tx);
      if (!verification.valide) return { issue: "obsolete", motif: verification.motif };
      await type.appliquer(ligne.contenu, tx, decideur);
    }

    await tx.query(`UPDATE propositions SET statut = $2, decide_le = now(), decide_par = $3 WHERE id = $1`, [
      id,
      decision,
      decideur.email,
    ]);
    return { issue: decision };
  });
}

export async function decider(
  branchement: Branchement,
  demande: { id: number; decision: Decision; decideur: Decideur }
): Promise<ResultatDecision> {
  verifierBranchement(branchement);
  const decideur = await verifierDecideur(branchement, demande.decideur);
  const decision = verifierDecision(demande.decision);
  return deciderUne(branchement, verifierId(demande.id), decision, decideur);
}

export type ResultatLeverRefus = { issue: "levee" } | { issue: "pas_refusee"; statut: string };

/*
 * Lever un refus est un geste humain, jamais un effet du rescan : la
 * proposition revient en attente avec le contenu frais que l'appli fournit
 * (vécu sur un projet précédent). Elle garde sa clé, donc aucune doublure.
 */
export async function leverRefus(
  branchement: Branchement,
  demande: { id: number; contenu: Contenu; decideur: Decideur }
): Promise<ResultatLeverRefus> {
  verifierBranchement(branchement);
  await verifierDecideur(branchement, demande.decideur);
  const id = verifierId(demande.id);
  const { contenu } = demande;
  if (!estContenu(contenu)) throw new ErreurDecision(CONTENU_PAS_OBJET);
  return transaction(async (tx): Promise<ResultatLeverRefus> => {
    const ligne = await tx.queryOne<LigneADecider>(
      `SELECT id, type, contenu, statut FROM propositions WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!ligne) throw new ErreurDecision("Proposition introuvable.");
    if (ligne.statut !== "refusee") return { issue: "pas_refusee", statut: ligne.statut };
    const groupe = branchement.groupe?.(ligne.type, contenu) ?? null;
    await tx.query(
      `UPDATE propositions
          SET statut = 'en_attente', contenu = $2::jsonb, groupe = $3, decide_le = NULL, decide_par = NULL
        WHERE id = $1`,
      [id, JSON.stringify(contenu), groupe]
    );
    return { issue: "levee" };
  });
}

export type ResultatLot = ResultatDecision | { issue: "echec"; message: string };

/*
 * Décision en lot, proposition par proposition (README, « Décisions à
 * prendre ») : une proposition obsolète ou en échec ne bloque pas les autres,
 * le rapport dit ce qui est arrivé à chacune. À l'inverse, une décision mal
 * formée ou un lot trop gros sans confirmation bloquent le lot ENTIER avant
 * toute écriture.
 */
export async function deciderEnLot(
  branchement: Branchement,
  demande: {
    decisions: { id: number; decision: Decision }[];
    decideur: Decideur;
    confirme?: boolean;
  }
): Promise<({ id: number } & ResultatLot)[]> {
  verifierBranchement(branchement);
  const decideur = await verifierDecideur(branchement, demande.decideur);
  if (!Array.isArray(demande.decisions) || demande.decisions.length === 0) {
    throw new ErreurDecision("Un lot sans proposition ne décide rien.");
  }
  const decisions = demande.decisions.map((element) => ({
    id: verifierId(element?.id),
    decision: verifierDecision(element?.decision),
  }));
  if (decisions.length > branchement.seuilLot && demande.confirme !== true) {
    throw new ErreurConfirmation(branchement.seuilLot, decisions.length);
  }

  const rapport: ({ id: number } & ResultatLot)[] = [];
  for (const { id, decision } of decisions) {
    try {
      rapport.push({ id, ...(await deciderUne(branchement, id, decision, decideur)) });
    } catch (erreur) {
      rapport.push({ id, issue: "echec", message: erreur instanceof Error ? erreur.message : String(erreur) });
    }
  }
  return rapport;
}
