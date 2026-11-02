"use client";

import { Tableau, type Colonne } from "@/ui";
import { dateHeure } from "@/lib/format";
import { libelleAction } from "./evenements";
import type { LigneJournal } from "./journal";

// Le Tableau trie et filtre sur la valeur brute : il reçoit le libellé de
// l'action et la liste des champs en texte, pas les clés stockées. L'instant
// reste en ISO pour trier juste, et se filtre comme il s'affiche.
type Ligne = LigneJournal & { action_libelle: string; champs_texte: string };

const COLONNES: Colonne<Ligne>[] = [
  {
    cle: "le",
    titre: "Date",
    chiffres: true,
    rendu: (ligne) => dateHeure(ligne.le),
    filtre: (ligne) => dateHeure(ligne.le),
  },
  { cle: "auteur", titre: "Qui" },
  { cle: "entite", titre: "Entité" },
  { cle: "libelle", titre: "Référence" },
  { cle: "action_libelle", titre: "Action" },
  { cle: "champs_texte", titre: "Champs modifiés" },
];

// Sans exports .xlsx ni PNG : un fichier téléchargé copierait les adresses des
// auteurs hors de la base, où ni la purge des 12 mois ni l'anonymisation d'un
// compte ne l'atteindraient.
export function TableauJournal({
  id,
  lignes,
  avecEntite,
}: {
  id: string;
  lignes: LigneJournal[];
  // L'historique d'une fiche n'a qu'une entité : la colonne y serait vide de sens.
  avecEntite: boolean;
}) {
  const colonnes = avecEntite ? COLONNES : COLONNES.filter((colonne) => colonne.cle !== "entite");
  return (
    <Tableau
      id={id}
      colonnes={colonnes}
      lignes={lignes.map((ligne) => ({
        ...ligne,
        action_libelle: libelleAction(ligne.action),
        champs_texte: ligne.champs.join(", "),
      }))}
      cleLigne={(ligne) => ligne.id}
    />
  );
}
