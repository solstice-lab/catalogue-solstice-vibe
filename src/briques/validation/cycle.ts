/*
 * Le cycle d'une proposition : les statuts, le statut d'un groupe, le libellé
 * d'un statut. Calcul pur, sans base ni horloge, importable côté client.
 */

// Fixes en v1 (README, « Décisions à prendre ») : la contrainte de la table
// `propositions` les liste, et un test compare cette liste à la contrainte
// (projet précédent : le code écrivait un verdict que la base refusait).
export const STATUTS = ["en_attente", "acceptee", "refusee"] as const;
export type Statut = (typeof STATUTS)[number];

export type StatutGroupe = Statut | "partielle" | "inconnu";

export type Ton = "attente" | "positif" | "negatif" | "inconnu";

const LIBELLES: Record<Statut, { libelle: string; ton: Ton }> = {
  en_attente: { libelle: "En attente", ton: "attente" },
  acceptee: { libelle: "Acceptée", ton: "positif" },
  refusee: { libelle: "Refusée", ton: "negatif" },
};

export function estStatutConnu(valeur: unknown): valeur is Statut {
  return typeof valeur === "string" && (STATUTS as readonly string[]).includes(valeur);
}

/*
 * Un statut inconnu se dit tel quel, avec sa valeur : un état qu'on ne sait
 * pas lire ne doit jamais passer pour « tout va bien » (vécu sur un projet précédent). Une
 * valeur absente est inconnue elle aussi, pas « en attente » par défaut.
 */
export function libelleStatut(statut: string | null | undefined): { libelle: string; ton: Ton } {
  if (estStatutConnu(statut)) return LIBELLES[statut];
  return { libelle: `Statut inconnu : ${statut ? `« ${statut} »` : "(vide)"}`, ton: "inconnu" };
}

/*
 * Le statut d'un groupe de propositions. « En attente » prime : un groupe où
 * il reste quelque chose à décider n'est pas décidé. Un groupe entièrement
 * refusé reste « refusee », jamais « acceptee » (un lot entièrement
 * ignoré s'affichait « Confirmé »). Un statut inconnu l'emporte sur tout, y
 * compris sur « en attente » : mieux vaut un groupe qui se dit illisible
 * qu'un groupe qui se dit sain.
 */
export function statutDeGroupe(statuts: readonly string[]): StatutGroupe {
  if (statuts.length === 0) {
    throw new Error("Un groupe vide n'a pas de statut.");
  }
  if (!statuts.every(estStatutConnu)) return "inconnu";
  if (statuts.includes("en_attente")) return "en_attente";
  if (statuts.every((statut) => statut === "refusee")) return "refusee";
  if (statuts.every((statut) => statut === "acceptee")) return "acceptee";
  return "partielle";
}
