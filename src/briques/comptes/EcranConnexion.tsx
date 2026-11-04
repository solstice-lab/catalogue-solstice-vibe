import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Bouton, Carte, EtatVide, LienBouton } from "@/ui";
import { ROLES } from "@/config/acces";
import { METHODES } from "@/config/comptes";
import { entrerEnDemoAction } from "./actions";
import { DUREE_VALIDITE_MINUTES } from "./code-email";
import { demoProposee, UTILISATEURS_DEMO } from "./demo";
import { FormulaireCode } from "./FormulaireCode";
import { FormulaireLien } from "./FormulaireLien";
import { etatDeGoogle, messageDeRefusGoogle } from "./google";
import { adresseDesLiens, DUREE_VALIDITE_LIEN_MINUTES } from "./lien-email";
import type { MethodeDeConnexion } from "./methodes";
import { etatDeMicrosoft, messageDeRefusMicrosoft } from "./microsoft";
import { utilisateurCourant } from "./roles";

/*
 * Le contenu de /connexion : un bloc par méthode de src/config/comptes.ts,
 * dans leur ordre. La page (src/app/connexion/page.tsx) l'entoure de
 * AppLayout, que la brique ne connaît pas. `retour` arrive déjà filtré
 * (cheminDeRetour). `erreur` est le paramètre tel quel : seul un code connu
 * donne un message, fixe, et rien n'en est recopié à l'écran.
 */
export async function EcranConnexion({ retour, erreur }: { retour: string; erreur?: string }) {
  // Avant tout : en production, la démo refuse de démarrer, même devant
  // quelqu'un de déjà connecté.
  demoProposee();
  if (await utilisateurCourant()) redirect(retour);

  if (METHODES.length === 0) {
    return (
      <Carte titre="Connexion">
        <EtatVide
          titre="Aucune méthode de connexion"
          description="Cette appli ne propose encore aucune façon de se connecter. Contacter l'équipe technique."
        />
      </Carte>
    );
  }

  const erreurGoogle = messageDeRefusGoogle(erreur);
  const google = etatDeGoogle();
  const erreurMicrosoft = messageDeRefusMicrosoft(erreur);
  const microsoft = etatDeMicrosoft();
  // En production, le lien ne part qu'avec URL_PUBLIQUE (lien-email.ts).
  const liensConfigures = !METHODES.includes("lien-email") || adresseDesLiens(await headers()) !== null;

  const blocs: Record<MethodeDeConnexion, () => ReactNode> = {
    "code-email": () => (
      <Carte key="code-email" titre="Connexion">
        <FormulaireCode retour={retour} dureeMinutes={DUREE_VALIDITE_MINUTES} />
      </Carte>
    ),
    "lien-email": () => (
      // « Connexion » seule, comme le code ; à côté de lui, le titre les distingue.
      <Carte key="lien-email" titre={METHODES.includes("code-email") ? "Lien par e-mail" : "Connexion"}>
        {liensConfigures ? (
          <FormulaireLien retour={retour} dureeMinutes={DUREE_VALIDITE_LIEN_MINUTES} />
        ) : (
          <p className="sl-erreur-formulaire" role="alert">
            Connexion par lien non configurée : URL_PUBLIQUE manque (voir le README de la brique comptes).
          </p>
        )}
      </Carte>
    ),
    google: () => (
      <Carte key="google" titre="Google">
        <div className="sl-formulaire">
          {erreurGoogle && (
            <p className="sl-erreur-formulaire" role="alert">
              {erreurGoogle}
            </p>
          )}
          {google.configure ? (
            <div className="sl-rangee-actions">
              {/* Un lien, pas un formulaire : la CSP (form-action 'self')
                  bloquerait la redirection vers Google qui suit un envoi. Un
                  <a> et non un Link (natif) : rien ne se précharge. */}
              <LienBouton
                natif
                variante={METHODES[0] === "google" ? "primaire" : "secondaire"}
                href={`/connexion/google?retour=${encodeURIComponent(retour)}`}
              >
                Se connecter avec Google
              </LienBouton>
            </div>
          ) : (
            <p className="sl-erreur-formulaire" role="alert">
              Connexion avec Google non configurée : {google.manquantes.join(" et ")}{" "}
              {google.manquantes.length > 1 ? "manquent" : "manque"} (voir le README de la brique comptes).
            </p>
          )}
        </div>
      </Carte>
    ),
    microsoft: () => (
      <Carte key="microsoft" titre="Microsoft">
        <div className="sl-formulaire">
          {erreurMicrosoft && (
            <p className="sl-erreur-formulaire" role="alert">
              {erreurMicrosoft}
            </p>
          )}
          {microsoft.configure ? (
            <div className="sl-rangee-actions">
              {/* Un lien natif, comme pour Google : la CSP (form-action
                  'self') bloquerait la redirection qui suit un envoi, et
                  rien ne se précharge. */}
              <LienBouton
                natif
                variante={METHODES[0] === "microsoft" ? "primaire" : "secondaire"}
                href={`/connexion/microsoft?retour=${encodeURIComponent(retour)}`}
              >
                Se connecter avec Microsoft
              </LienBouton>
            </div>
          ) : (
            <p className="sl-erreur-formulaire" role="alert">
              Connexion avec Microsoft non configurée : {microsoft.manquantes.join(", ")} à renseigner (voir le README
              de la brique comptes).
            </p>
          )}
        </div>
      </Carte>
    ),
    demo: () => (
      <Carte key="demo" titre="Démo">
        <form action={entrerEnDemoAction} className="sl-formulaire">
          <input type="hidden" name="retour" value={retour} />
          <p className="sl-note" role="status">
            Démo : choisir le rôle à jouer. Aucune identité n&apos;est vérifiée ; cette méthode est refusée en
            production.
          </p>
          <div className="sl-rangee-actions">
            {ROLES.map((role, rang) => (
              <Bouton
                key={role}
                type="submit"
                name="role"
                value={role}
                variante={rang === 0 && METHODES[0] === "demo" ? "primaire" : "secondaire"}
                title={UTILISATEURS_DEMO[role].email}
              >
                Jouer {role}
              </Bouton>
            ))}
          </div>
        </form>
      </Carte>
    ),
  };

  // Les cartes à la suite, espacées par la page du kit (sl-page).
  return <>{METHODES.map((methode) => blocs[methode]())}</>;
}
