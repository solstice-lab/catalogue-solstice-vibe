/*
 * Le branchement : ce que l'appli déclare pour poser la brique sur une de ses
 * entités. La brique ne connaît aucune table métier ; tout ce qu'elle sait
 * d'une entité passe par ici (voir README.md).
 */

export type Intitules = {
  // Les événements au pluriel, en minuscules (« interventions ») : titre
  // d'accessibilité de la grille et état vide d'un mois sans événement.
  entites: string;
  // Titre de la date sur une carte de téléphone (« Réalisée le »).
  date: string;
  // Titre du détail sur une carte de téléphone, s'il y en a un (« Équipement »).
  detail?: string;
};

export type Branchement<Ligne extends Record<string, unknown>> = {
  // Stable et unique dans l'appli ; il nomme le branchement dans les erreurs.
  id: string;
  // Table ou vue lue par son nom : sans jointure, la brique ne connaît que
  // ses colonnes. Un libellé qui en demande davantage passe par une vue.
  table: string;
  // Colonne de type date (« aaaa-mm-jj ») qui place l'événement dans le mois.
  colonneDate: string;
  // Colonnes lues en plus, pour composer libellé, détail et lien.
  colonnes: (keyof Ligne & string)[];
  intitules: Intitules;
  libelle: (ligne: Ligne) => string;
  detail?: (ligne: Ligne) => string;
  // Chemin de la fiche de la ligne : chaque événement y mène.
  lien: (ligne: Ligne) => string;
};

// Table et colonnes entrent telles quelles dans le SQL (un nom ne se passe pas
// en paramètre) : seuls des identifiants simples passent, et une faute de
// frappe dans un branchement casse fort au lieu d'ouvrir une injection.
const IDENTIFIANT = /^[a-z_][a-z0-9_]*$/;

export function verifierBranchement<Ligne extends Record<string, unknown>>(branchement: Branchement<Ligne>): void {
  for (const nom of [branchement.table, branchement.colonneDate, ...branchement.colonnes]) {
    if (!IDENTIFIANT.test(nom)) {
      throw new Error(`Branchement « ${branchement.id} » : « ${nom} » n'est pas un identifiant SQL simple.`);
    }
  }
}
