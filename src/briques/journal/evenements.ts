/*
 * Ce qu'une ligne du journal dit : l'action, son libellé, les champs
 * changés. Calcul pur, sans base, importable côté client et par
 * src/config/acces.ts.
 */

// Le droit de lire le journal, déclaré comme celui d'un module : qui l'a se
// dit dans src/config/acces.ts (DROITS), jamais ici.
export const ACTIONS_JOURNAL = ["journal.consulter"] as const;

// La contrainte journal_audit_action_check les liste, et un test compare cette
// liste à la contrainte (même piège que la brique validation : un code qui
// écrit une valeur que la base refuse). « export » : l'export des données
// d'une personne par l'admin (brique rgpd), seule lecture tracée.
export const ACTIONS_JOURNALISEES = ["creation", "modification", "suppression", "export"] as const;
export type ActionJournalisee = (typeof ACTIONS_JOURNALISEES)[number];

const LIBELLES: Record<ActionJournalisee, string> = {
  creation: "Création",
  modification: "Modification",
  suppression: "Suppression",
  export: "Export des données",
};

export function estActionJournalisee(valeur: unknown): valeur is ActionJournalisee {
  return typeof valeur === "string" && (ACTIONS_JOURNALISEES as readonly string[]).includes(valeur);
}

// Une base plus récente que le code peut porter une action inconnue : elle se
// dit telle quelle, jamais comme une action connue.
export function libelleAction(action: string): string {
  return estActionJournalisee(action) ? LIBELLES[action] : `Action inconnue : « ${action} »`;
}

// Les NOMS des champs dont la valeur change, jamais leurs valeurs : le journal
// ne recopie aucune donnée personnelle. Seuls les
// champs de l'après comptent (ce que le formulaire envoie), et les valeurs se
// comparent en texte : pg rend un BIGINT ou un NUMERIC en chaîne, le
// formulaire en nombre.
export function champsModifies(avant: Record<string, unknown>, apres: Record<string, unknown>): string[] {
  const enTexte = (valeur: unknown) => (valeur === null || valeur === undefined ? null : String(valeur));
  return Object.keys(apres).filter((champ) => enTexte(avant[champ]) !== enTexte(apres[champ]));
}
