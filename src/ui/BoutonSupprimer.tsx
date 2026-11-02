"use client";

import { useState } from "react";
import { Bouton } from "./Bouton";
import { Modale } from "./Modale";

/**
 * Suppression individuelle depuis une fiche, toujours confirmée dans une
 * Modale. Dans le kit plutôt que recopiée par module : chaque copie devait
 * reprendre la même confirmation, et une correction de son comportement
 * aurait dû se refaire partout.
 *
 * Une suppression peut être refusée (une fiche qui a encore des éléments
 * rattachés) : l'action renvoie alors `{ erreur }`, affichée dans la
 * Modale à la place de la page d'erreur.
 *
 * La Modale dit par défaut « Cette action est définitive. ». Quand la
 * suppression a des effets que la personne doit connaître (ce qu'elle retire,
 * ce qu'elle laisse), `explication` remplace ce texte : elle doit alors redire
 * que l'action est définitive.
 */
export function BoutonSupprimer({
  titre,
  action,
  explication = "Cette action est définitive.",
}: {
  /** Question de la Modale, ex. « Supprimer le fournisseur Atelier Morvan ? » */
  titre: string;
  /** Server action de suppression ; elle redirige en cas de succès, ou renvoie `{ erreur }` si elle est refusée. */
  action: () => Promise<void | { erreur?: string }>;
  /** Texte de la Modale, à la place de « Cette action est définitive. » ; facultatif. */
  explication?: string;
}) {
  const [ouverte, setOuverte] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const ouvrir = () => {
    setErreur(null);
    setOuverte(true);
  };

  const supprimer = async () => {
    setEnCours(true);
    try {
      const resultat = await action();
      if (resultat?.erreur) setErreur(resultat.erreur);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <>
      <Bouton variante="danger" onClick={ouvrir}>
        Supprimer
      </Bouton>
      <Modale
        ouverte={ouverte}
        titre={titre}
        onFermer={() => setOuverte(false)}
        piedDePage={
          <>
            <Bouton variante="secondaire" onClick={() => setOuverte(false)}>
              {erreur ? "Fermer" : "Annuler"}
            </Bouton>
            {!erreur && (
              <Bouton variante="danger" onClick={supprimer} disabled={enCours}>
                {enCours ? "Suppression…" : "Supprimer définitivement"}
              </Bouton>
            )}
          </>
        }
      >
        {erreur ? <p className="sl-erreur-formulaire">{erreur}</p> : <p>{explication}</p>}
      </Modale>
    </>
  );
}
