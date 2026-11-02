"use client";

import { useState } from "react";
import { Bouton, Modale } from "@/ui";
import { supprimerDossierAction } from "../actions";

/** Suppression individuelle, action annexe de la fiche — toujours confirmée. */
export function BoutonSupprimerDossier({ id, reference }: { id: number; reference: string }) {
  const [ouverte, setOuverte] = useState(false);
  const [enCours, setEnCours] = useState(false);

  const supprimer = async () => {
    setEnCours(true);
    try {
      // L'action redirige vers /dossiers en cas de succès.
      await supprimerDossierAction(id);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <>
      <Bouton variante="danger" onClick={() => setOuverte(true)}>
        Supprimer
      </Bouton>
      <Modale
        ouverte={ouverte}
        titre={`Supprimer le dossier ${reference} ?`}
        onFermer={() => setOuverte(false)}
        piedDePage={
          <>
            <Bouton variante="secondaire" onClick={() => setOuverte(false)}>
              Annuler
            </Bouton>
            <Bouton variante="danger" onClick={supprimer} disabled={enCours}>
              {enCours ? "Suppression…" : "Supprimer définitivement"}
            </Bouton>
          </>
        }
      >
        <p>Cette action est définitive.</p>
      </Modale>
    </>
  );
}
