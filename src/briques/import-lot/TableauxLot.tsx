"use client";

import { EtatVide, Tableau, type Colonne } from "@/ui";
import type { ColonneAffichee, FusionAffichee, LigneAffichee } from "./presentation";
import type { LigneEcartee } from "./types";

/*
 * Ce que le lot contient, en trois tableaux : les lignes retenues (celles qui
 * s'écriront), les lignes écartées avec leur numéro dans le fichier, et les
 * fusions. Rien ne se perd en silence : ce qui n'est pas retenu est ici.
 * Les chaînes arrivent déjà prêtes à s'afficher (presentation.ts) ; le
 * Tableau trie sur la valeur du lot (nombre, dates « aaaa-mm-jj »).
 * `idTableau` porte l'id du branchement : deux imports ne mélangent pas leurs
 * vues conservées.
 */

const COLONNE_LIGNE: Colonne<LigneAffichee> = {
  // Plusieurs numéros quand des lignes du fichier ont été fusionnées.
  cle: "numero",
  titre: "Ligne",
  chiffres: true,
  rendu: (l) => l.ligne,
  filtre: (l) => String(l.ligne),
  largeur: "90px",
};

const COLONNES_ECARTEES: Colonne<LigneEcartee>[] = [
  { cle: "numero", titre: "Ligne du fichier", chiffres: true, largeur: "140px" },
  { cle: "motif", titre: "Motif" },
];

export function TableauRetenues({
  colonnes,
  lignes,
  idTableau,
}: {
  colonnes: ColonneAffichee[];
  lignes: LigneAffichee[];
  idTableau: string;
}) {
  if (lignes.length === 0) {
    return (
      <EtatVide
        titre="Aucune ligne retenue"
        description="Ce lot ne peut pas être confirmé. Les lignes écartées, ci-dessous, disent pourquoi : corriger le fichier et le renvoyer, ou ignorer ce lot."
      />
    );
  }
  // `v:<champ>` trie, `a:<champ>` s'affiche et se filtre (presentation.ts).
  const champs: Colonne<LigneAffichee>[] = colonnes.map(({ cle, titre, chiffres, largeur }) => {
    const affiche = `a:${cle.slice(2)}`;
    return { cle, titre, chiffres, largeur, rendu: (l) => l[affiche], filtre: (l) => String(l[affiche]) };
  });
  return (
    <Tableau
      id={`${idTableau}-retenues`}
      colonnes={[COLONNE_LIGNE, ...champs]}
      lignes={lignes}
      cleLigne={(ligne) => String(ligne.id)}
      messageVide="Aucune ligne ne correspond aux filtres."
    />
  );
}

export function TableauEcartees({ lignes, idTableau }: { lignes: LigneEcartee[]; idTableau: string }) {
  if (lignes.length === 0)
    return <EtatVide titre="Aucune ligne écartée" description="Toutes les lignes du fichier ont pu être lues." />;
  return (
    <Tableau
      id={`${idTableau}-ecartees`}
      colonnes={COLONNES_ECARTEES}
      lignes={lignes}
      messageVide="Aucune ligne ne correspond aux filtres."
    />
  );
}

export function TableauFusions({
  fusions,
  titreCle,
  aucuneFusion,
  idTableau,
}: {
  fusions: FusionAffichee[];
  titreCle: string;
  aucuneFusion: string;
  idTableau: string;
}) {
  if (fusions.length === 0) return <EtatVide titre="Aucune fusion" description={aucuneFusion} />;
  const colonnes: Colonne<FusionAffichee>[] = [
    { cle: "cle", titre: titreCle, largeur: "130px" },
    { cle: "lignes", titre: "Lignes fusionnées", largeur: "170px" },
    { cle: "conflits", titre: "Valeurs en conflit (retenue / écartée)" },
  ];
  return (
    <Tableau
      id={`${idTableau}-fusions`}
      colonnes={colonnes}
      lignes={fusions}
      messageVide="Aucune fusion ne correspond aux filtres."
    />
  );
}
