/*
 * Rangement et clé de rapprochement des clés métier saisies ou importées
 * (nom d'un tiers, référence d'une pièce). UNE implémentation pour tous
 * les modules métier : deux copies auraient fini par rapprocher différemment,
 * et un import aurait dédoublonné une entité autrement qu'une autre.
 */

// Rangement sans espaces superflus : une saisie collée d'un tableur arrive
// souvent avec des espaces doublés ou en bout de cellule.
export function normaliserEspaces(saisie: string): string {
  return saisie.trim().replace(/\s+/g, " ");
}

// Clé d'unicité : sans aucun espace (« AB13 » et « AB 13 » ont produit deux
// lignes au lieu d'une au re-sync d'un import), en minuscules et en forme
// composée NFC. Calculée ici et non par lower() en SQL : lower() dépend de la
// collation de la base, et sur une base en collation C « É » ne devient pas
// « é ». La ponctuation, elle, compte.
export function cleDeRapprochement(texte: string): string {
  return texte.normalize("NFC").replace(/\s/g, "").toLowerCase();
}
