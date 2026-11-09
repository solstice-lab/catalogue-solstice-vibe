import { Carte } from "@/ui";
import { DUREES_DE_SESSION } from "@/config/comptes";
import { FormulaireAutresSessions } from "./FormulaireAutresSessions";
import { autresSessionsOuvertes } from "./session";

/*
 * « Mes sessions » : où le compte de la personne connectée est encore ouvert,
 * et le bouton qui ferme tout sauf ce navigateur (un poste partagé, un
 * téléphone perdu, un cookie volé). Posée sur son écran personnel,
 * /mes-donnees, le seul que tout rôle ouvre ; elle vit ici parce que seule la
 * brique comptes lit les sessions. `retour` : le chemin de l'écran qui la pose,
 * où ramène le lien de reconnexion.
 */
export async function MesSessions({ retour }: { retour: string }) {
  const autres = await autresSessionsOuvertes();
  const { maximumJours, inactiviteJours, connexionRecenteMinutes } = DUREES_DE_SESSION;
  const s = autres > 1 ? "s" : "";

  return (
    <Carte titre="Mes sessions">
      <p>
        {autres === 0
          ? "Votre compte n'est ouvert dans aucun autre navigateur."
          : `Votre compte est encore ouvert dans ${autres} autre${s} navigateur${s} ou appareil${s}.`}{" "}
        Une session se ferme après {inactiviteJours} jours sans visite, et {maximumJours} jours au plus après la
        connexion. Fermer vos autres sessions demande une connexion de moins de {connexionRecenteMinutes} minutes.
      </p>
      <FormulaireAutresSessions retour={retour} autres={autres} />
    </Carte>
  );
}
