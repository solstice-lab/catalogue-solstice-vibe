"use client";

import { useRouter } from "next/navigation";
import { Tableau, type Colonne } from "@/ui";
import { date } from "@/lib/format";
import { BadgeStatutLot } from "./BadgeStatutLot";
import { libelleStatutLot } from "./presentation";

export type LotAffiche = { id: number; nomFichier: string; statut: string; creeLe: string };

const COLONNES: Colonne<LotAffiche>[] = [
  { cle: "nomFichier", titre: "Fichier" },
  // « aaaa-mm-jj » : se trie dans l'ordre du calendrier ; le filtre cherche
  // dans ce que l'écran montre.
  {
    cle: "creeLe",
    titre: "Envoyé le",
    chiffres: true,
    rendu: (lot) => date(lot.creeLe),
    filtre: (lot) => date(lot.creeLe),
  },
  {
    cle: "statut",
    titre: "Statut",
    rendu: (lot) => <BadgeStatutLot statut={lot.statut} />,
    filtre: (lot) => libelleStatutLot(lot.statut).libelle,
  },
];

// `idTableau` porte l'id du branchement : deux imports d'une même appli ne
// mélangent pas leurs vues conservées (tri, filtres).
export function ListeLots({ lots, chemin, idTableau }: { lots: LotAffiche[]; chemin: string; idTableau: string }) {
  const router = useRouter();
  return (
    <Tableau
      id={idTableau}
      colonnes={COLONNES}
      lignes={lots}
      cleLigne={(lot) => String(lot.id)}
      messageVide="Aucun lot ne correspond aux filtres."
      auClicLigne={(lot) => router.push(`${chemin}/${lot.id}`)}
    />
  );
}
