"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Bouton, Modale, Tableau, type Colonne } from "@/ui";
import { montant } from "@/lib/format";
import { LIBELLES_STATUT_DOSSIER, type Dossier } from "@/lib/dossiers-domaine";
import { cheminDossier } from "@/lib/slug";
import { supprimerDossiersAction } from "./actions";

// Le Tableau trie et filtre sur la valeur brute de chaque colonne : on lui
// donne donc le libellé du statut et le montant en euros, pas les valeurs de
// stockage — sinon filtrer « Gagné » ne trouverait rien (statut = 'gagne').
type LigneDossier = Dossier & { statut_libelle: string; montant_euros: number };

const TON_STATUT = { en_cours: "accent", gagne: "positif", perdu: "negatif" } as const;

const COLONNES: Colonne<LigneDossier>[] = [
  { cle: "reference", titre: "Référence", largeur: "120px" },
  { cle: "client", titre: "Client" },
  {
    cle: "montant_euros",
    titre: "Montant",
    chiffres: true,
    rendu: (d) => montant(d.montant_euros, d.montant_centimes % 100 === 0 ? 0 : 2),
  },
  {
    cle: "statut_libelle",
    titre: "Statut",
    rendu: (d) => <Badge ton={TON_STATUT[d.statut]}>{d.statut_libelle}</Badge>,
  },
  { cle: "echeance", titre: "Échéance", chiffres: true },
];

export function ListeDossiers({ dossiers }: { dossiers: Dossier[] }) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState<{
    lignes: LigneDossier[];
    vider: () => void;
  } | null>(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  const lignes: LigneDossier[] = dossiers.map((dossier) => ({
    ...dossier,
    statut_libelle: LIBELLES_STATUT_DOSSIER[dossier.statut],
    montant_euros: dossier.montant_centimes / 100,
  }));

  const supprimerSelection = async () => {
    if (!confirmation) return;
    setSuppressionEnCours(true);
    try {
      await supprimerDossiersAction(confirmation.lignes.map((ligne) => ligne.id));
      confirmation.vider();
      setConfirmation(null);
    } finally {
      setSuppressionEnCours(false);
    }
  };

  return (
    <>
      <Tableau
        id="dossiers"
        colonnes={COLONNES}
        lignes={lignes}
        cleLigne={(dossier) => dossier.reference}
        messageVide="Aucun dossier ne correspond aux filtres."
        auClicLigne={(dossier) => router.push(cheminDossier(dossier))}
        exports={{ nomFichier: "dossiers", titre: "Dossiers" }}
        actionsLot={(selection, vider) => (
          <Bouton variante="danger" onClick={() => setConfirmation({ lignes: selection, vider })}>
            Supprimer ({selection.length})
          </Bouton>
        )}
      />
      <Modale
        ouverte={confirmation !== null}
        titre="Supprimer la sélection ?"
        onFermer={() => setConfirmation(null)}
        piedDePage={
          <>
            <Bouton variante="secondaire" onClick={() => setConfirmation(null)}>
              Annuler
            </Bouton>
            <Bouton variante="danger" onClick={supprimerSelection} disabled={suppressionEnCours}>
              {suppressionEnCours ? "Suppression…" : "Supprimer définitivement"}
            </Bouton>
          </>
        }
      >
        <p>
          {confirmation?.lignes.length === 1
            ? `Le dossier ${confirmation.lignes[0].reference} sera supprimé.`
            : `${confirmation?.lignes.length ?? 0} dossiers seront supprimés.`}{" "}
          Cette action est définitive.
        </p>
      </Modale>
    </>
  );
}
