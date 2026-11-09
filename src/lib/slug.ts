/*
 * Slugs d'URL des fiches : /dossiers/dos-014-atelier-morvan plutôt que
 * /dossiers/213. Repris d'un projet précédent.
 *
 * Le slug n'est PAS stocké en base : il est recalculé à partir des champs de
 * la fiche, à l'affichage pour construire le lien comme côté serveur pour la
 * retrouver. Rien à migrer, rien à tenir à jour au renommage — en
 * contrepartie, deux fiches aux champs EXACTEMENT identiques partagent le
 * même slug : seule la première (id le plus petit) est atteignable par son
 * nom, l'autre reste accessible par son URL numérique, toujours acceptée.
 *
 * Ces fonctions doivent rester la SEULE façon de calculer un slug : liens et
 * résolution d'URL s'appuient tous les deux dessus, toute divergence rendrait
 * des fiches inatteignables.
 */

// Segments statiques de chaque module : un slug identique serait masqué par
// la route statique (Next.js la fait passer avant le segment dynamique) et la
// fiche deviendrait inaccessible par son nom. À compléter à CHAQUE nouveau
// module ou nouvelle page statique d'un module existant.
export const SEGMENTS_RESERVES_PAR_MODULE: Readonly<Record<string, ReadonlySet<string>>> = {
  dossiers: new Set(["nouveau", "modifier"]),
};

// « Atelier Morvan » -> "atelier-morvan", « Éric Müller » -> "eric-muller".
// Peut renvoyer une chaîne vide si le texte ne contient aucune lettre latine
// (voir le repli dans slugAvecGardeFous).
export function slugifier(texte: string): string {
  // NFD sépare chaque lettre accentuée de son accent (« é » -> « e » + accent
  // combinant) ; on ne garde ensuite que l'ASCII, ce qui fait tomber les
  // accents ainsi isolés. Tout ce qui n'est pas lettre ou chiffre devient un
  // séparateur « - ».
  const ascii = Array.from(texte.normalize("NFD"))
    .filter((caractere) => caractere.charCodeAt(0) < 128)
    .join("");
  return ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Slugifie le nom d'une fiche en écartant les deux formes qui la rendraient
// inatteignable. `mot` sert à la fois de repli (nom sans aucune lettre
// latine : idéogrammes, cyrillique…) et de suffixe de désambiguïsation.
export function slugAvecGardeFous(nom: string, reserves: ReadonlySet<string>, mot: string): string {
  const base = slugifier(nom);
  if (base === "") return mot;
  // Un slug purement numérique serait pris pour un id par la résolution
  // d'URL, et un slug réservé serait masqué par une route statique.
  if (/^\d+$/.test(base) || reserves.has(base)) return `${base}-${mot}`;
  return base;
}

// La référence seule est trop opaque et le client seul trop ambigu : le slug
// d'un dossier porte les deux (même logique que compte + nom d'opportunité
// sur un CRM).
export function slugDossier(dossier: { reference: string; client: string }): string {
  return slugAvecGardeFous(
    [dossier.reference, dossier.client].join(" "),
    SEGMENTS_RESERVES_PAR_MODULE.dossiers,
    "dossier"
  );
}

export function cheminDossier(dossier: { reference: string; client: string }): string {
  return `/dossiers/${slugDossier(dossier)}`;
}

// Une URL /<module>/<valeur> peut porter un slug ou, pour les redirections
// internes des server actions (qui ne connaissent que l'id), un id numérique.
export function estIdentifiantNumerique(valeur: string): boolean {
  return /^\d+$/.test(valeur);
}
