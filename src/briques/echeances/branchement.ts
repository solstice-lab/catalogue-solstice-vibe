/*
 * Le branchement : ce que l'appli déclare pour poser la brique sur une de
 * ses entités. La brique ne connaît aucune table métier ; tout ce qu'elle
 * sait d'une entité passe par ici (voir README.md).
 */

export type Intitules = {
  // Nom de l'entité au singulier, en titre de colonne (« Contrat »).
  entite: string;
  // Titre de la colonne de date (« Fin »).
  date: string;
  // Libellé de la tuile d'accueil, si deux branchements la partagent
  // (« Maintenances à traiter ») ; sinon « Échéances à N jours ».
  tuile?: string;
  // Titre du détail, s'il y en a un (« Objet »).
  detail?: string;
};

export type Branchement<Ligne extends Record<string, unknown>> = {
  // Stable et unique dans l'appli : il rattache la vue conservée du tableau
  // (voir Tableau, `id`). Jamais dérivé des données.
  id: string;
  table: string;
  // Colonne de type date (« aaaa-mm-jj ») qui porte l'échéance.
  colonneDate: string;
  // Colonnes lues en plus, pour composer libellé, détail et lien.
  colonnes: (keyof Ligne & string)[];
  // Réglé une fois au branchement : en alerte J+delai compris, échu récent
  // jusqu'à J−(delai−1) (sauf `retardSansLimite`). Pas de délai par ligne en v1.
  delaiAlerteJours: number;
  // Une échéance passée ne quitte jamais la vue : une maintenance en retard
  // doit rester visible jusqu'à sa réalisation. Absent : borne
  // basse de J−(delai−1), comme pour une fin de contrat.
  retardSansLimite?: boolean;
  intitules: Intitules;
  libelle: (ligne: Ligne) => string;
  detail?: (ligne: Ligne) => string;
  // Chemin de la fiche de la ligne : chaque échéance y mène.
  lien: (ligne: Ligne) => string;
};

// Ce que la vue côté client reçoit du branchement : ses fonctions restent
// sur le serveur (elles ne traversent pas la frontière client).
export type PresentationEcheances = Pick<
  Branchement<Record<string, unknown>>,
  "id" | "delaiAlerteJours" | "retardSansLimite" | "intitules"
>;

export function presentationDe<Ligne extends Record<string, unknown>>(
  branchement: Branchement<Ligne>
): PresentationEcheances {
  return {
    id: branchement.id,
    delaiAlerteJours: branchement.delaiAlerteJours,
    retardSansLimite: branchement.retardSansLimite,
    intitules: branchement.intitules,
  };
}

// Table et colonnes entrent telles quelles dans le SQL (un nom ne se passe
// pas en paramètre) : seuls des identifiants simples passent, et une faute
// de frappe dans un branchement casse fort au lieu d'ouvrir une injection.
const IDENTIFIANT = /^[a-z_][a-z0-9_]*$/;

export function verifierBranchement<Ligne extends Record<string, unknown>>(branchement: Branchement<Ligne>): void {
  for (const nom of [branchement.table, branchement.colonneDate, ...branchement.colonnes]) {
    if (!IDENTIFIANT.test(nom)) {
      throw new Error(`Branchement « ${branchement.id} » : « ${nom} » n'est pas un identifiant SQL simple.`);
    }
  }
  if (!Number.isInteger(branchement.delaiAlerteJours) || branchement.delaiAlerteJours < 1) {
    throw new Error(
      `Branchement « ${branchement.id} » : le délai d'alerte doit être un nombre entier de jours, au moins 1.`
    );
  }
}
