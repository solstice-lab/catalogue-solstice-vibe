/*
 * Règles communes aux imports : la fusion d'une valeur importée avec une
 * valeur en place, et la lecture d'un CSV. Elles vivaient dans
 * scripts/lib/cli.ts ; la brique import-lot (src/) en a besoin et ne peut pas
 * importer un script. UNE implémentation : scripts/lib/cli.ts les ré-exporte.
 */

// La règle de fusion des imports : le vide se remplit, le plein se garde.
// Une valeur CSV différente d'une valeur déjà en base est ÉCARTÉE (et
// rapportée pour arbitrage), jamais écrasante.
export function valeurRetenue(
  enBase: string | null | undefined,
  importee: string | null | undefined
): { valeur: string | null; ecartee: string | null } {
  const base = enBase?.trim() || null;
  const nouvelle = importee?.trim() || null;
  if (base === null) return { valeur: nouvelle, ecartee: null };
  if (nouvelle !== null && nouvelle !== base) return { valeur: base, ecartee: nouvelle };
  return { valeur: base, ecartee: null };
}

// Parseur CSV minimal (guillemets doubles + "" littéral, sauts de ligne dans
// les champs entre guillemets), repris des scripts d'un projet précédent.
// Le séparateur par défaut est la virgule ; un Excel français enregistre en CSV
// avec un point-virgule.
// `garderVides` : garde aussi les lignes blanches, pour que le rang d'un
// enregistrement soit son numéro de ligne dans le fichier.
export function parserCsv(contenu: string, separateur = ",", garderVides = false): string[][] {
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = "";
  let dansGuillemets = false;
  for (let i = 0; i < contenu.length; i++) {
    const c = contenu[i];
    if (dansGuillemets) {
      if (c === '"' && contenu[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') {
        dansGuillemets = false;
      } else {
        champ += c;
      }
    } else if (c === '"') {
      dansGuillemets = true;
    } else if (c === separateur) {
      ligne.push(champ);
      champ = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && contenu[i + 1] === "\n") i++;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = "";
    } else {
      champ += c;
    }
  }
  if (champ !== "" || ligne.length > 0) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  // Écarte les lignes entièrement vides (fin de fichier, lignes blanches).
  return garderVides ? lignes : lignes.filter((l) => l.some((valeur) => valeur.trim() !== ""));
}
