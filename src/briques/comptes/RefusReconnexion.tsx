import { Bouton } from "@/ui";
import { seReconnecterAction } from "./actions";

/*
 * Le refus d'un geste, et, quand il vient faute de connexion récente
 * (exigerConnexionRecente de roles.ts), le bouton « Se reconnecter », qui
 * ferme la session et mène à /connexion, d'où l'on revient à l'écran du geste
 * (`reconnexion`). Un bouton plutôt qu'un lien : /connexion renvoie une
 * personne encore connectée vers son retour sans rien lui redemander. Un seul
 * rendu pour les trois écrans qui en ont besoin (/comptes,
 * /donnees-personnelles, « Mes sessions »).
 */
export function RefusReconnexion({ erreur, reconnexion }: { erreur: string; reconnexion?: string }) {
  return (
    <>
      <p className="sl-erreur-formulaire" role="alert">
        {erreur}
      </p>
      {reconnexion !== undefined && (
        <form action={seReconnecterAction} className="sl-rangee-actions">
          <input type="hidden" name="retour" value={reconnexion} />
          <Bouton type="submit" variante="secondaire">
            Se reconnecter
          </Bouton>
        </form>
      )}
    </>
  );
}
