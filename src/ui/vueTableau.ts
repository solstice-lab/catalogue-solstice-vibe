/*
 * Conservation de la vue d'un Tableau (tri, filtres, déplis) à travers la
 * navigation : quitter la page et y revenir rend exactement la même vue.
 * Comportement par défaut de tout Tableau du kit, pas une option par écran
 * (arbitré le 2026-09-09).
 *
 * Stockage en sessionStorage — décision explicite : fermer l'onglet remet la
 * vue à zéro. localStorage a été écarté : la vue aurait survécu d'un jour à
 * l'autre, ce qui n'est pas le défaut voulu pour le kit.
 *
 * Lecture par useSyncExternalStore côté composant, jamais par un setState
 * dans un effet (règle lint react-hooks/set-state-in-effect) : ce module est
 * donc un vrai store — cache en mémoire pour des snapshots stables par
 * référence, abonnés notifiés à chaque écriture.
 */

export type TriTableau = { cle: string; sens: 1 | -1 } | null;

export type VueTableau = {
  tri: TriTableau;
  filtres: Record<string, string>;
  /** Clés (cleLigne) des lignes dépliées, en mode hiérarchique. */
  deplis: string[];
};

const VUE_INITIALE: VueTableau = { tri: null, filtres: {}, deplis: [] };

// Le cache fait foi après la première lecture : sessionStorage n'est relu
// qu'une fois par id, et surtout chaque snapshot garde une référence stable —
// exigence de useSyncExternalStore (un objet neuf à chaque lecture boucle).
const cache = new Map<string, VueTableau>();
const abonnes = new Map<string, Set<() => void>>();

const cleStockage = (id: string) => `sl-tableau:${id}`;

export function lireVue(id: string): VueTableau {
  const connue = cache.get(id);
  if (connue) return connue;
  let vue = VUE_INITIALE;
  try {
    const brut = window.sessionStorage.getItem(cleStockage(id));
    if (brut) vue = { ...VUE_INITIALE, ...(JSON.parse(brut) as Partial<VueTableau>) };
  } catch {
    // Stockage indisponible (navigation privée, iframe restreinte…) : la vue
    // par défaut suffit, le tableau reste pleinement fonctionnel.
  }
  cache.set(id, vue);
  return vue;
}

/** Snapshot serveur : le rendu SSR part toujours de la vue par défaut, le
 * client se recale sur la vue stockée juste après l'hydratation. */
export const vueInitiale = () => VUE_INITIALE;

export function ecrireVue(id: string, maj: Partial<VueTableau>) {
  const suivante = { ...lireVue(id), ...maj };
  cache.set(id, suivante);
  try {
    window.sessionStorage.setItem(cleStockage(id), JSON.stringify(suivante));
  } catch {
    // Sans stockage, la vue vit le temps du montage : dégradation silencieuse.
  }
  abonnes.get(id)?.forEach((notifier) => notifier());
}

export function sAbonner(id: string, notifier: () => void): () => void {
  let ensemble = abonnes.get(id);
  if (!ensemble) {
    ensemble = new Set();
    abonnes.set(id, ensemble);
  }
  ensemble.add(notifier);
  return () => {
    ensemble.delete(notifier);
  };
}
