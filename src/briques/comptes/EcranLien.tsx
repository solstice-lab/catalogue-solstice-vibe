import { notFound, redirect } from "next/navigation";
import { Bouton, Carte } from "@/ui";
import { METHODES } from "@/config/comptes";
import { connecterParLienAction } from "./actions";
import { FormulaireLien } from "./FormulaireLien";
import { adresseDuLien, DUREE_VALIDITE_LIEN_MINUTES } from "./lien-email";
import { utilisateurCourant } from "./roles";

/*
 * Le contenu de /connexion/lien, où mène le lien du mail. La page
 * (src/app/connexion/lien/page.tsx) l'entoure d'AppLayout.
 *
 * Son ouverture (GET) ne fait que LIRE si le lien vaut encore : les antivirus
 * de messagerie ouvrent les liens avant la personne, et un lien consommé là
 * était servi à la machine. Elle montre un bouton « Me connecter », dont
 * l'envoi (POST, connecterParLienAction) connecte et consomme. Rien ne le
 * soumet tout seul.
 *
 * Un lien qui ne vaut plus mène à la demande d'un nouveau, sans rien dire de
 * l'adresse : la page est la même pour un lien expiré, déjà servi, remplacé ou
 * inventé. `erreur` est le paramètre tel quel : seul un code connu donne un
 * message, fixe.
 */

const EXPIRE = "Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.";

const ERREURS: Record<string, { texte: string; alerte: boolean }> = {
  expire: { texte: EXPIRE, alerte: false },
  acces: { texte: "Cette adresse n'a pas accès à l'appli. Contacter l'équipe technique.", alerte: true },
  limite: { texte: "Trop d'essais depuis votre connexion. Réessayez dans une heure.", alerte: true },
};

export async function EcranLien({ jeton, retour, erreur }: { jeton?: string; retour: string; erreur?: string }) {
  // Une page s'ouvre sans passer par l'écran de connexion : la méthode absente
  // de METHODES n'existe pas.
  if (!METHODES.includes("lien-email")) notFound();
  // Déjà connecté : le lien n'est ni lu ni consommé, il reste valable.
  if (await utilisateurCourant()) redirect(retour);

  const adresse = jeton ? await adresseDuLien(jeton) : null;
  if (jeton && adresse) {
    return (
      <Carte titre="Connexion">
        <form action={connecterParLienAction} className="sl-formulaire">
          <input type="hidden" name="jeton" value={jeton} />
          <input type="hidden" name="retour" value={retour} />
          <p className="sl-note" role="status">
            Connexion avec l&apos;adresse <b>{adresse}</b>, sur cet appareil.
          </p>
          <div className="sl-rangee-actions">
            <Bouton type="submit">Me connecter</Bouton>
          </div>
        </form>
      </Carte>
    );
  }

  const message = (erreur !== undefined && Object.hasOwn(ERREURS, erreur) ? ERREURS[erreur] : undefined) ?? {
    texte: EXPIRE,
    alerte: false,
  };
  return (
    <Carte titre="Connexion">
      <FormulaireLien retour={retour} dureeMinutes={DUREE_VALIDITE_LIEN_MINUTES} message={message} />
    </Carte>
  );
}
