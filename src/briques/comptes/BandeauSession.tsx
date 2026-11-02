import { Bouton } from "@/ui";
import { ROLES } from "@/config/acces";
import { entrerEnDemoAction, seDeconnecterAction } from "./actions";
import { demoProposee, UTILISATEURS_DEMO } from "./demo";
import { utilisateurCourant } from "./roles";

/*
 * Au-dessus de l'en-tête de toutes les pages (src/app/layout.tsx) : qui est
 * connecté, « Se déconnecter » et, en démo, le choix du rôle joué. Dans le
 * layout racine plutôt que dans AppLayout : aucune des trente pages à
 * retoucher, et le kit n'apprend rien d'une règle propre à cette appli.
 * Rien à afficher sans session (la page de connexion, les pages ouvertes).
 */
export async function BandeauSession() {
  // Avant tout : en production, la démo refuse de démarrer, sur toute page.
  const demo = demoProposee();
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) return null;

  return (
    <div className="bandeau-session">
      <span>
        {demo ? "Démo — vous jouez " : "Connecté : "}
        <strong>{utilisateur.email}</strong> ({utilisateur.role})
      </span>
      <span className="bandeau-session-actions">
        {demo && (
          <form action={entrerEnDemoAction} className="bandeau-session-actions">
            {ROLES.map((role) => (
              <Bouton
                key={role}
                type="submit"
                name="role"
                value={role}
                variante="secondaire"
                disabled={role === utilisateur.role}
                aria-pressed={role === utilisateur.role}
                title={UTILISATEURS_DEMO[role].email}
              >
                Jouer {role}
              </Bouton>
            ))}
          </form>
        )}
        <form action={seDeconnecterAction}>
          <Bouton type="submit" variante="secondaire">
            Se déconnecter
          </Bouton>
        </form>
      </span>
    </div>
  );
}
