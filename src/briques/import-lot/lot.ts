import { query, queryOne, transaction } from "@/lib/db/client";
import { verifierBranchement, type Branchement, type ValeursLigne } from "./branchement";
import { ErreurFichier, lireFichier } from "./lecture";
import {
  colonnesObligatoiresAbsentes,
  estVide,
  typerValeur,
  validerLignes,
  type Fusion,
  type LigneRetenue,
  type ResultatValidation,
} from "./validation";
import type { LigneEcartee } from "./types";

export type StatutLot = "en_attente" | "confirme" | "ignore";

export type RapportConfirmation = { creees: number; mises_a_jour: number; inchangees: number };

export type LigneDeLot = {
  id: number;
  numero: number;
  numeros: number[];
  /** Valeurs du fichier, décisions de la personne par-dessus. */
  valeurs: ValeursLigne;
};

export type Lot = {
  id: number;
  branchement: string;
  nomFichier: string;
  statut: StatutLot;
  ecartees: LigneEcartee[];
  fusions: Fusion[];
  rapport: RapportConfirmation | null;
  lignes: LigneDeLot[];
};

/** Une règle du cycle du lot refuse le geste : le message s'affiche tel quel. */
export class ErreurLot extends Error {}

type LigneLue = { id: number; numero: number; numeros: number[]; valeurs: ValeursLigne; decisions: ValeursLigne };

// Le fichier est lu et VALIDÉ en entier avant la première écriture, et il
// n'écrit dans aucune table métier (`ecarter`, s'il existe, peut les lire) : le lot n'est qu'un état à relire (projets
// précédents : un import qui écrit en lisant laisse une moitié de fichier en base).
export async function creerLot(branchement: Branchement, nomFichier: string, octets: Uint8Array): Promise<Lot> {
  verifierBranchement(branchement);
  const lecture = await lireFichier(octets);

  // Une colonne qui manque est une erreur de fichier, dite une fois : sinon
  // chaque ligne serait écartée pour la même raison.
  const absentes = colonnesObligatoiresAbsentes(lecture.entetes, branchement);
  if (absentes.length > 0) {
    throw new ErreurFichier(`Colonne obligatoire absente du fichier : ${absentes.join(", ")}.`);
  }

  const validation = await ecarterSelonLAppli(validerLignes(lecture.lignes, branchement), branchement);

  const id = await transaction(async (client) => {
    const lot = await client.queryOne<{ id: number }>(
      `INSERT INTO import_lots (branchement, nom_fichier, ecartees, fusions)
       VALUES ($1, $2, $3::jsonb, $4::jsonb) RETURNING id`,
      [branchement.id, nomFichier, JSON.stringify(validation.ecartees), JSON.stringify(validation.fusions)]
    );
    // Un seul paramètre JSON pour toutes les lignes : plusieurs centaines de
    // lignes en paramètres séparés butent sur la limite de paramètres d'une
    // requête, l'équivalent du « ~90 lignes » d'une appli livrée.
    await client.query(
      `INSERT INTO import_lot_lignes (lot_id, ordre, numero, numeros, valeurs)
       SELECT $1, l.ord, l.numero, ARRAY(SELECT jsonb_array_elements_text(l.numeros))::int[], l.valeurs
         FROM jsonb_to_recordset($2::jsonb) AS l(numero int, numeros jsonb, valeurs jsonb, ord int)`,
      [lot!.id, JSON.stringify(validation.lignes.map((ligne, ord) => ({ ...ligne, ord })))]
    );
    return lot!.id;
  });

  return (await lireLot(id, branchement.id))!;
}

// Les lignes que l'appli refuse déjà (`ecarter`) rejoignent les lignes écartées,
// avec tous les numéros fusionnés dans la ligne : aucune ne disparaît sans son
// numéro, et sa fusion (conflits entre ses lignes) ne reste pas au rapport d'un
// lot qui ne l'écrit pas. Séquentiel : la lecture est hors transaction, et
// l'ordre des lignes reste celui de l'écriture. Passe APRÈS l'ordre des renvois :
// écarter la cible d'un renvoi laisse la ligne qui la vise sans cible, à
// l'appli d'en tenir compte (voir le README).
async function ecarterSelonLAppli(
  validation: ResultatValidation,
  branchement: Branchement
): Promise<ResultatValidation> {
  if (!branchement.ecarter) return validation;
  const lignes: LigneRetenue[] = [];
  const ecartees = [...validation.ecartees];
  const numerosEcartes = new Set<number>();
  for (const ligne of validation.lignes) {
    const motif = await branchement.ecarter(ligne.valeurs);
    if (motif === null) lignes.push(ligne);
    else
      for (const numero of ligne.numeros) {
        ecartees.push({ numero, motif });
        numerosEcartes.add(numero);
      }
  }
  return {
    lignes,
    ecartees: ecartees.sort((a, b) => a.numero - b.numero),
    fusions: validation.fusions.filter((fusion) => !numerosEcartes.has(fusion.numeros[0])),
  };
}

// Chaque lecture ou geste sur un lot nomme son branchement : sans cela, la
// page d'une entité (gardée par le rôle de cette entité) agirait sur le lot
// d'une autre à partir d'un identifiant posté à la main.
export async function lireLot(id: number, branchementId: string): Promise<Lot | null> {
  const lot = await queryOne<{
    id: number;
    branchement: string;
    nom_fichier: string;
    statut: StatutLot;
    ecartees: LigneEcartee[];
    fusions: Fusion[];
    rapport: RapportConfirmation | null;
  }>(
    `SELECT id, branchement, nom_fichier, statut, ecartees, fusions, rapport FROM import_lots WHERE id = $1 AND branchement = $2`,
    [id, branchementId]
  );
  if (!lot) return null;
  const lignes = await query<LigneLue>(
    `SELECT id, numero, numeros, valeurs, decisions FROM import_lot_lignes WHERE lot_id = $1 ORDER BY ordre`,
    [id]
  );
  return {
    id: lot.id,
    branchement: lot.branchement,
    nomFichier: lot.nom_fichier,
    statut: lot.statut,
    ecartees: lot.ecartees,
    fusions: lot.fusions,
    rapport: lot.rapport,
    lignes: lignes.map(fusionnerDecisions),
  };
}

export async function listerLots(
  branchementId: string
): Promise<{ id: number; nomFichier: string; statut: StatutLot; creeLe: Date }[]> {
  const lots = await query<{ id: number; nom_fichier: string; statut: StatutLot; cree_le: Date }>(
    `SELECT id, nom_fichier, statut, cree_le FROM import_lots WHERE branchement = $1 ORDER BY id DESC`,
    [branchementId]
  );
  return lots.map((lot) => ({ id: lot.id, nomFichier: lot.nom_fichier, statut: lot.statut, creeLe: lot.cree_le }));
}

// Les champs de décision d'une ligne qui n'ont pas de valeur : ils bloquent
// la confirmation, rien ne les remplit à la place de la personne (une appli
// livrée : « payant / non payant » vide ne passe jamais en « non payant »).
export function champsDeDecisionVides(valeurs: ValeursLigne, branchement: Branchement): string[] {
  return branchement.champs
    .filter((champ) => champ.decision && estVide(valeurs[champ.champ]))
    .map((champ) => champ.champ);
}

export async function renseignerDecision(
  branchement: Branchement,
  lotId: number,
  ligneId: number,
  champ: string,
  valeur: string | number | null
): Promise<void> {
  const definition = branchement.champs.find((c) => c.champ === champ && c.decision);
  if (!definition) throw new ErreurLot(`« ${champ} » n'est pas un champ de décision.`);

  // Une décision saisie à la main se type comme une cellule du fichier : sans
  // cela, une chaîne quelconque entrerait dans un champ nombre ou date et
  // contournerait la lecture.
  let retenue: string | number | null = null;
  if (!estVide(valeur)) {
    const typee = typerValeur(definition, valeur, branchement.formatDate);
    if ("motif" in typee) throw new ErreurLot(typee.motif);
    retenue = typee.valeur;
  }

  await transaction(async (client) => {
    // Même verrou que la confirmation : une décision ne peut pas s'insérer
    // entre la lecture des lignes par confirmerLot et ses écritures.
    const lot = await client.queryOne<{ branchement: string; statut: StatutLot }>(
      `SELECT branchement, statut FROM import_lots WHERE id = $1 FOR UPDATE`,
      [lotId]
    );
    if (!lot || lot.branchement !== branchement.id) throw new ErreurLot("Lot introuvable.");
    if (lot.statut !== "en_attente") throw new ErreurLot("Ce lot est déjà traité : ses décisions ne changent plus.");
    const mises = await client.query(
      `UPDATE import_lot_lignes
          SET decisions = decisions || jsonb_build_object($3::text, $4::jsonb)
        WHERE id = $1 AND lot_id = $2
        RETURNING id`,
      [ligneId, lotId, champ, JSON.stringify(retenue)]
    );
    if (mises.length === 0) throw new ErreurLot("Ligne introuvable dans ce lot.");
  });
}

export async function confirmerLot(
  branchement: Branchement,
  lotId: number
): Promise<{ dejaConfirme: boolean; rapport: RapportConfirmation }> {
  verifierBranchement(branchement);
  return transaction(async (client) => {
    // Verrou sur le lot : deux confirmations simultanées s'attendent, et la
    // seconde trouve le lot déjà confirmé. Une page périmée soumise deux
    // fois fabriquait une erreur d'intégrité dans une appli livrée.
    const lot = await client.queryOne<{ branchement: string; statut: StatutLot; rapport: RapportConfirmation | null }>(
      `SELECT branchement, statut, rapport FROM import_lots WHERE id = $1 FOR UPDATE`,
      [lotId]
    );
    if (!lot) throw new ErreurLot("Lot introuvable.");
    if (lot.branchement !== branchement.id) throw new ErreurLot("Ce lot n'appartient pas à cette entité.");
    if (lot.statut === "confirme") return { dejaConfirme: true, rapport: lot.rapport! };
    if (lot.statut === "ignore") throw new ErreurLot("Ce lot a été ignoré : il ne peut plus être confirmé.");

    const lues = await client.query<LigneLue>(
      `SELECT id, numero, numeros, valeurs, decisions FROM import_lot_lignes WHERE lot_id = $1 ORDER BY ordre`,
      [lotId]
    );
    // Un lot sans ligne retenue confirmé s'afficherait « Confirmé » alors que
    // rien n'a été importé (vu dans une appli livrée).
    if (lues.length === 0) throw new ErreurLot("Aucune ligne à confirmer : ignorer le lot.");

    const lignes = lues.map(fusionnerDecisions);
    const manquantes = lignes.flatMap((ligne) =>
      champsDeDecisionVides(ligne.valeurs, branchement).map((champ) => {
        const etiquette = branchement.champs.find((c) => c.champ === champ)!.entetes[0];
        return `ligne ${ligne.numero} : ${etiquette}`;
      })
    );
    if (manquantes.length > 0) {
      throw new ErreurLot(`Décision manquante, à renseigner avant de confirmer : ${manquantes.join(" ; ")}.`);
    }

    // Tout est validé : seulement maintenant, la première écriture. En mode
    // remplacement, effacer avant d'avoir tout vérifié perdrait la période
    // (vécu sur un projet précédent) ; et si une écriture échoue, la transaction restitue tout.
    if (branchement.mode === "remplacement") {
      await branchement.remplacer!(
        client,
        lignes.map((ligne) => ligne.valeurs)
      );
    }
    const rapport: RapportConfirmation = { creees: 0, mises_a_jour: 0, inchangees: 0 };
    for (const ligne of lignes) {
      const resultat = await branchement.ecrire(client, ligne.valeurs);
      if (resultat === "cree") rapport.creees += 1;
      else if (resultat === "mis_a_jour") rapport.mises_a_jour += 1;
      else rapport.inchangees += 1;
    }

    await client.query(
      `UPDATE import_lots SET statut = 'confirme', rapport = $2::jsonb, confirme_le = now() WHERE id = $1`,
      [lotId, JSON.stringify(rapport)]
    );
    return { dejaConfirme: false, rapport };
  });
}

export async function ignorerLot(lotId: number, branchementId: string): Promise<void> {
  // Un seul UPDATE conditionnel : un lot confirmé entre une lecture et une
  // écriture séparées ne serait pas ignoré en silence.
  const mis = await query(
    `UPDATE import_lots SET statut = 'ignore' WHERE id = $1 AND branchement = $2 AND statut = 'en_attente' RETURNING id`,
    [lotId, branchementId]
  );
  if (mis.length > 0) return;
  const lot = await queryOne<{ statut: StatutLot }>(
    `SELECT statut FROM import_lots WHERE id = $1 AND branchement = $2`,
    [lotId, branchementId]
  );
  if (!lot) throw new ErreurLot("Lot introuvable.");
  if (lot.statut === "confirme") throw new ErreurLot("Ce lot est confirmé : il ne peut plus être ignoré.");
  // Déjà ignoré : ignorer deux fois ne plante pas.
}

// Supprime le lot et SES lignes, rien d'autre : ni l'entité écrite, ni les
// lignes d'un autre lot (vu dans une appli livrée). Défaire ce qu'un lot confirmé a
// écrit est un geste de l'appli, pas de la brique.
export async function supprimerLot(lotId: number, branchementId: string): Promise<void> {
  await query(`DELETE FROM import_lots WHERE id = $1 AND branchement = $2`, [lotId, branchementId]);
}

function fusionnerDecisions(ligne: LigneLue): LigneDeLot {
  const valeurs: ValeursLigne = { ...ligne.valeurs };
  for (const [champ, valeur] of Object.entries(ligne.decisions)) {
    if (!estVide(valeur)) valeurs[champ] = valeur;
    else valeurs[champ] = null;
  }
  return { id: ligne.id, numero: ligne.numero, numeros: ligne.numeros, valeurs };
}
