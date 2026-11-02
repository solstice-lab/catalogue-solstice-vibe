"use client";

import { useActionState, useEffect, useState } from "react";
import { Bouton, Champ } from "@/ui";
import { demanderCodeAction, verifierCodeAction, type EtatCode } from "./actions";

// Le serveur refuse une seconde demande dans la minute (code-email.ts) : le
// compte à rebours évite de proposer un bouton qui répondrait « trop de
// demandes ».
const DELAI_RENVOI_S = 60;

/*
 * La connexion par code : l'adresse, puis le code reçu, sur le même
 * écran. Une seule action, aiguillée par le bouton qui soumet : l'état affiché
 * est toujours celui de la DERNIÈRE réponse, renvoi compris. Deux états séparés
 * laissaient l'erreur d'un ancien code à côté du nouveau (projet précédent).
 *
 * « Changer d'adresse » remonte le composant (clé) : l'état repart à zéro sans
 * aller-retour serveur.
 */
export function FormulaireCode({ retour, dureeMinutes }: { retour: string; dureeMinutes: number }) {
  const [cle, setCle] = useState(0);
  return <Etapes key={cle} retour={retour} dureeMinutes={dureeMinutes} changerDAdresse={() => setCle((c) => c + 1)} />;
}

function Etapes({
  retour,
  dureeMinutes,
  changerDAdresse,
}: {
  retour: string;
  dureeMinutes: number;
  changerDAdresse: () => void;
}) {
  const [etat, agir, enCours] = useActionState<EtatCode, FormData>(
    (precedent, donnees) =>
      donnees.get("intention") === "verifier"
        ? verifierCodeAction(precedent, donnees)
        : demanderCodeAction(precedent, donnees),
    {}
  );
  const restant = useCompteARebours(etat.envoyeLe);

  if (!etat.email) {
    return (
      <form action={agir} className="sl-formulaire">
        <Champ label="Adresse e-mail" name="email" type="email" autoComplete="email" required autoFocus />
        {etat.erreur && (
          <p className="sl-erreur-formulaire" role="alert">
            {etat.erreur}
          </p>
        )}
        <div className="sl-rangee-actions">
          <Bouton type="submit" disabled={enCours}>
            {enCours ? "Envoi…" : "Recevoir un code"}
          </Bouton>
        </div>
      </form>
    );
  }

  return (
    <form action={agir} className="sl-formulaire">
      {/* Conditionnel exprès : l'écran ne dit pas si l'adresse a un compte. */}
      <p className="sl-note" role="status">
        Si <b>{etat.email}</b> a accès à l&apos;appli, un code vient d&apos;y être envoyé. Il est valable {dureeMinutes}{" "}
        minutes.
      </p>
      <input type="hidden" name="email" value={etat.email} />
      <input type="hidden" name="retour" value={retour} />
      <Champ
        label="Code reçu par e-mail"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={12}
        required
        autoFocus
      />
      {etat.erreur && (
        <p className="sl-erreur-formulaire" role="alert">
          {etat.erreur}
        </p>
      )}
      <div className="sl-rangee-actions">
        <Bouton type="submit" name="intention" value="verifier" disabled={enCours}>
          {enCours ? "Vérification…" : "Se connecter"}
        </Bouton>
        <Bouton
          type="submit"
          name="intention"
          value="renvoyer"
          variante="secondaire"
          formNoValidate
          disabled={enCours || restant > 0}
        >
          {restant > 0 ? `Renvoyer un code (${restant} s)` : "Renvoyer un code"}
        </Bouton>
        <Bouton type="button" variante="secondaire" onClick={changerDAdresse}>
          Changer d&apos;adresse
        </Bouton>
      </div>
    </form>
  );
}

// Les secondes avant de pouvoir redemander un code ; 0 sans demande.
function useCompteARebours(depuis: number | undefined): number {
  const [restant, setRestant] = useState(DELAI_RENVOI_S);
  useEffect(() => {
    if (!depuis) return;
    const mettreAJour = () => setRestant(Math.max(0, Math.ceil(DELAI_RENVOI_S - (Date.now() - depuis) / 1000)));
    const premier = setTimeout(mettreAJour, 0);
    const minuteur = setInterval(mettreAJour, 1000);
    return () => {
      clearTimeout(premier);
      clearInterval(minuteur);
    };
  }, [depuis]);
  return depuis ? restant : 0;
}
