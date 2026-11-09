"use client";

import { useActionState } from "react";
import { Bouton } from "@/ui";
import { fermerMesAutresSessionsAction, type EtatAutresSessions } from "./actions";
import { RefusReconnexion } from "./RefusReconnexion";

const DEPART: EtatAutresSessions = {};

// Le bouton « Fermer mes autres sessions » de MesSessions, et ce que l'action
// répond : le nombre de sessions fermées, ou le refus faute de connexion
// récente, avec le lien pour se reconnecter.
export function FormulaireAutresSessions({ retour, autres }: { retour: string; autres: number }) {
  const [etat, envoyer, enCours] = useActionState(fermerMesAutresSessionsAction, DEPART);
  return (
    <>
      <form action={envoyer} className="sl-formulaire">
        <input type="hidden" name="retour" value={retour} />
        {etat.message && <p role="status">{etat.message}</p>}
        <div className="sl-rangee-actions">
          <Bouton type="submit" variante="secondaire" disabled={enCours || autres === 0}>
            Fermer mes autres sessions
          </Bouton>
        </div>
      </form>
      {/* Hors du formulaire : le refus porte le sien (« Se reconnecter »). */}
      {etat.erreur && <RefusReconnexion erreur={etat.erreur} reconnexion={etat.reconnexion} />}
    </>
  );
}
