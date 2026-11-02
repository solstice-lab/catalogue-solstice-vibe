import { cleDeRapprochement, normaliserEspaces } from "@/lib/cle-rapprochement";
import { valeurRetenue } from "@/lib/import-fusion";
import type { Branchement, ChampImport, ValeursLigne } from "./branchement";
import { lireDate } from "./dates";
import type { LigneBrute, LigneEcartee } from "./types";

export type LigneRetenue = {
  /** Numéro de la première ligne du fichier qui la porte. */
  numero: number;
  /** Tous les numéros fusionnés dans cette ligne (au moins un). */
  numeros: number[];
  valeurs: ValeursLigne;
};

export type Fusion = {
  cle: string;
  numeros: number[];
  conflits: { champ: string; retenue: string; ecartee: string }[];
};

export type ResultatValidation = {
  /** Dans l'ordre d'écriture : une ligne qui renvoie à une autre vient après elle. */
  lignes: LigneRetenue[];
  ecartees: LigneEcartee[];
  fusions: Fusion[];
};

const SEPARATEUR_CLE = "|";

// En-têtes comparés sans casse ni espaces (un export ajoute souvent une
// espace de fin) : la même clé de rapprochement que pour les clés métier.
export function colonnesObligatoiresAbsentes(entetes: string[], branchement: Branchement): string[] {
  const presentes = new Set(entetes.map(cleDeRapprochement));
  return (
    branchement.champs
      // Une colonne de clé absente écarterait chaque ligne pour « clé vide » :
      // elle se dit une fois, comme une colonne obligatoire.
      .filter(
        (champ) =>
          (champ.obligatoire || branchement.cle?.includes(champ.champ)) &&
          !champ.entetes.some((entete) => presentes.has(cleDeRapprochement(entete)))
      )
      .map((champ) => champ.entetes[0])
  );
}

export function validerLignes(brutes: LigneBrute[], branchement: Branchement): ResultatValidation {
  const ecartees: LigneEcartee[] = [];
  const retenues: LigneRetenue[] = [];
  // Les en-têtes se normalisent une fois par fichier, pas une fois par ligne.
  const normalisees = new Map<string, string>();
  const normaliser = (entete: string) => {
    let normalisee = normalisees.get(entete);
    if (normalisee === undefined) {
      normalisee = cleDeRapprochement(entete);
      normalisees.set(entete, normalisee);
    }
    return normalisee;
  };
  const parCle = new Map<string, LigneRetenue>();
  const fusionsParCle = new Map<string, Fusion>();

  for (const brute of brutes) {
    if (ligneVide(brute)) continue;
    const typage = typerLigne(brute, branchement, normaliser);
    if ("motif" in typage) {
      ecartees.push({ numero: brute.numero, motif: typage.motif });
      continue;
    }
    const valeurs = typage.valeurs;

    if (!branchement.cle) {
      retenues.push({ numero: brute.numero, numeros: [brute.numero], valeurs });
      continue;
    }

    const cle = cleDeLigne(valeurs, branchement.cle);
    if (cle === null) {
      const manquant = branchement.champs.find(
        (champ) => branchement.cle!.includes(champ.champ) && valeurs[champ.champ] === null
      )!;
      ecartees.push({ numero: brute.numero, motif: `${manquant.entetes[0]} : la clé de dédoublonnage est vide` });
      continue;
    }

    const existante = parCle.get(cle);
    if (!existante) {
      const ligne = { numero: brute.numero, numeros: [brute.numero], valeurs };
      parCle.set(cle, ligne);
      retenues.push(ligne);
      continue;
    }
    // Même clé après normalisation : une seule ligne. Écrire les deux ferait
    // entrer en collision deux clés que la base tient pour égales, et un lot
    // de six mois s'est perdu ainsi.
    const fusion = fusionsParCle.get(cle) ?? { cle, numeros: [...existante.numeros], conflits: [] };
    fusionsParCle.set(cle, fusion);
    existante.numeros.push(brute.numero);
    fusion.numeros.push(brute.numero);
    fusionner(existante.valeurs, valeurs, branchement, fusion);
  }

  const { ordonnees, circulaires } = ordonnerParRenvoi(retenues, branchement);
  for (const ligne of circulaires) {
    // Toutes les lignes du fichier fusionnées dans celle-ci, pas seulement la
    // première : aucune ne doit disparaître sans son numéro.
    for (const numero of ligne.numeros) {
      ecartees.push({ numero, motif: "renvoi circulaire, ou vers une ligne prise dans un renvoi circulaire" });
    }
  }

  return {
    lignes: ordonnees,
    ecartees: ecartees.sort((a, b) => a.numero - b.numero),
    fusions: [...fusionsParCle.values()],
  };
}

function ligneVide(brute: LigneBrute): boolean {
  return Object.values(brute.cellules).every(estVide);
}

// Une valeur vide : absente, ou texte blanc. Partagée avec lot.ts, pour qu'une
// décision et une cellule du fichier se jugent vides de la même façon.
export function estVide(valeur: unknown): boolean {
  return valeur === null || valeur === undefined || (typeof valeur === "string" && valeur.trim() === "");
}

// Première valeur non vide parmi les en-têtes du champ : une colonne vide ne
// doit pas écraser une valeur déjà trouvée (leçon d'une appli livrée).
function celluleDuChamp(parCle: Map<string, unknown>, champ: ChampImport, cle: (entete: string) => string): unknown {
  for (const entete of champ.entetes) {
    const valeur = parCle.get(cle(entete));
    if (!estVide(valeur)) return valeur;
  }
  return null;
}

function typerLigne(
  brute: LigneBrute,
  branchement: Branchement,
  cle: (entete: string) => string
): { valeurs: ValeursLigne } | { motif: string } {
  const valeurs: ValeursLigne = {};
  // Index des en-têtes construit une fois par ligne, pas une fois par champ.
  const cellulesParCle = new Map(Object.entries(brute.cellules).map(([entete, valeur]) => [cle(entete), valeur]));
  for (const champ of branchement.champs) {
    const cellule = celluleDuChamp(cellulesParCle, champ, cle);

    if (cellule === null) {
      if (champ.obligatoire) return { motif: `${champ.entetes[0]} : valeur obligatoire absente` };
      valeurs[champ.champ] = null;
      continue;
    }

    const typee = typerValeur(champ, cellule, branchement.formatDate);
    if ("motif" in typee) return typee;
    valeurs[champ.champ] = typee.valeur;
  }
  return { valeurs };
}

// Le typage d'UNE valeur, partagé avec la décision saisie à la main : une
// décision de type nombre ou date ne doit pas contourner la lecture du fichier.
export function typerValeur(
  champ: ChampImport,
  cellule: unknown,
  formatDate: Branchement["formatDate"]
): { valeur: string | number | null } | { motif: string } {
  const etiquette = champ.entetes[0];
  if (champ.type === "texte") return { valeur: texteDe(cellule) };
  if (champ.type === "nombre") {
    const nombre = nombreDe(cellule);
    return nombre === null
      ? { motif: `${etiquette} : « ${String(cellule)} » n'est pas un nombre` }
      : { valeur: nombre };
  }
  const date = lireDate(cellule, formatDate);
  if (date.etat === "illisible") return { motif: `${etiquette} : « ${String(cellule)} » n'est pas une date` };
  return { valeur: date.etat === "date" ? date.valeur : null };
}

function texteDe(cellule: unknown): string | null {
  const texte = normaliserEspaces(cellule instanceof Date ? cellule.toISOString().slice(0, 10) : String(cellule));
  return texte === "" ? null : texte;
}

// Virgule décimale française, espaces (dont l'insécable) comme séparateur de
// milliers. Tout le reste est refusé : un montant illisible absorbé en
// silence est un montant faux (vécu sur un projet précédent).
function nombreDe(cellule: unknown): number | null {
  if (typeof cellule === "number") return Number.isFinite(cellule) ? cellule : null;
  if (typeof cellule !== "string") return null;
  const sansEspaces = cellule.replace(/[\s\u00a0\u202f]/g, "");
  // « 1,234 » vaut 1,234 en français et 1 234 en anglais : on ne devine pas,
  // comme pour les dates. La personne écrit « 1234 » ou « 1,2340 ».
  if (/^-?\d{1,3},\d{3}$/.test(sansEspaces)) return null;
  const texte = sansEspaces.replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(texte) ? Number(texte) : null;
}

function cleDeLigne(valeurs: ValeursLigne, champsCle: string[]): string | null {
  const morceaux: string[] = [];
  for (const champ of champsCle) {
    const valeur = valeurs[champ];
    if (valeur === null) return null;
    morceaux.push(cleDeRapprochement(String(valeur)));
  }
  return morceaux.join(SEPARATEUR_CLE);
}

// Le vide se remplit, le plein se garde, le conflit part au rapport : la règle
// des imports (valeurRetenue), appliquée entre lignes d'un même lot.
function fusionner(base: ValeursLigne, ajout: ValeursLigne, branchement: Branchement, fusion: Fusion): void {
  for (const champ of branchement.champs) {
    if (branchement.cle?.includes(champ.champ)) continue;
    const enPlace = base[champ.champ];
    const nouvelle = ajout[champ.champ];
    const { valeur, ecartee } = valeurRetenue(
      enPlace === null ? null : String(enPlace),
      nouvelle === null ? null : String(nouvelle)
    );
    if (enPlace === null && nouvelle !== null) base[champ.champ] = nouvelle;
    else if (valeur !== null && ecartee !== null)
      fusion.conflits.push({ champ: champ.champ, retenue: valeur, ecartee });
  }
}

// Une ligne qui renvoie à une autre du lot s'écrit après elle. Les lignes qui
// restent bloquées (cycle, ou renvoi vers une ligne bloquée) sont rendues à
// part pour être écartées avec leur numéro.
function ordonnerParRenvoi(
  lignes: LigneRetenue[],
  branchement: Branchement
): { ordonnees: LigneRetenue[]; circulaires: LigneRetenue[] } {
  const renvoi = branchement.renvoi;
  if (!renvoi) return { ordonnees: lignes, circulaires: [] };

  // Lignes par valeur de cible, calculées une fois : comparer chaque ligne à
  // toutes les autres coûterait n² clés de rapprochement sur un gros lot.
  const parCible = new Map<string, LigneRetenue[]>();
  for (const ligne of lignes) {
    const cible = ligne.valeurs[renvoi.cible];
    if (cible === null) continue;
    const cle = cleDeRapprochement(String(cible));
    const memes = parCible.get(cle);
    if (memes) memes.push(ligne);
    else parCible.set(cle, [ligne]);
  }
  const dependances = new Map<LigneRetenue, LigneRetenue[]>();
  for (const ligne of lignes) {
    const renvoyee = ligne.valeurs[renvoi.champ];
    const visees = renvoyee === null ? [] : (parCible.get(cleDeRapprochement(String(renvoyee))) ?? []);
    dependances.set(
      ligne,
      visees.filter((autre) => autre !== ligne)
    );
  }

  // Tri topologique linéaire : une ligne sort quand toutes ses dépendances
  // sont sorties. Ce qui ne sort jamais est pris dans un cycle.
  const attendues = new Map<LigneRetenue, number>();
  const dependantes = new Map<LigneRetenue, LigneRetenue[]>();
  for (const ligne of lignes) {
    const deps = dependances.get(ligne)!;
    attendues.set(ligne, deps.length);
    for (const dep of deps) dependantes.set(dep, [...(dependantes.get(dep) ?? []), ligne]);
  }
  const ordonnees: LigneRetenue[] = [];
  const file = lignes.filter((ligne) => attendues.get(ligne) === 0);
  for (let i = 0; i < file.length; i++) {
    const ligne = file[i];
    ordonnees.push(ligne);
    for (const suivante of dependantes.get(ligne) ?? []) {
      const reste = attendues.get(suivante)! - 1;
      attendues.set(suivante, reste);
      if (reste === 0) file.push(suivante);
    }
  }
  const sorties = new Set(ordonnees);
  return { ordonnees, circulaires: lignes.filter((ligne) => !sorties.has(ligne)) };
}
