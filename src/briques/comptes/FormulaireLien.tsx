"use client";

import { useActionState, useState } from "react";
import { Bouton, Champ } from "@/ui";
import { demanderLienAction, type EtatLien } from "./actions";
import { useCompteARebours } from "./FormulaireCode";

/*
 * La demande d'un lien de connexion : l'adresse, puis ce qu'il faut faire du
 * mail. Sur /connexion, et sur la page d'un lien expiré pour en recevoir un
 * nouveau. Un seul état, celui de la dernière réponse, comme pour le code.
 *
 * `message` : ce que la page dit avant le formulaire (le lien a expiré, déjà
 * servi…), une alerte quand c'est un refus.
 */
export function FormulaireLien({
  retour,
  dureeMinutes,
  message,
}: {
  retour: string;
  dureeMinutes: number;
  message?: { texte: string; alerte: boolean };
}) {
  const [cle, setCle] = useState(0);
  return (
    <Etapes
      key={cle}
      retour={retour}
      dureeMinutes={dureeMinutes}
      message={message}
      changerDAdresse={() => setCle((c) => c + 1)}
    />
  );
}

function Etapes({
  retour,
  dureeMinutes,
  message,
  changerDAdresse,
}: {
  retour: string;
  dureeMinutes: number;
  message?: { texte: string; alerte: boolean };
  changerDAdresse: () => void;
}) {
  const [etat, agir, enCours] = useActionState<EtatLien, FormData>(demanderLienAction, {});
  const restant = useCompteARebours(etat.envoyeLe);
  const erreur = etat.erreur && (
    <p className="sl-erreur-formulaire" role="alert">
      {etat.erreur}
    </p>
  );

  if (!etat.email) {
    return (
      <form action={agir} className="sl-formulaire">
        {message && (
          <p className={message.alerte ? "sl-erreur-formulaire" : "sl-note"} role={message.alerte ? "alert" : "status"}>
            {message.texte}
          </p>
        )}
        <input type="hidden" name="retour" value={retour} />
        <Champ label="Adresse e-mail" name="email" type="email" autoComplete="email" required autoFocus />
        {erreur}
        <div className="sl-rangee-actions">
          <Bouton type="submit" disabled={enCours}>
            {enCours ? "Envoi…" : "Recevoir un lien de connexion"}
          </Bouton>
        </div>
      </form>
    );
  }

  return (
    <form action={agir} className="sl-formulaire">
      {/* Conditionnel exprès : l'écran ne dit pas si l'adresse a un compte. */}
      <p className="sl-note" role="status">
        Si <b>{etat.email}</b> a accès à l&apos;appli, un lien de connexion vient d&apos;y être envoyé. Il est valable{" "}
        {dureeMinutes} minutes. Ouvrez-le sur l&apos;appareil où vous voulez être connecté.
      </p>
      <input type="hidden" name="email" value={etat.email} />
      <input type="hidden" name="retour" value={retour} />
      {erreur}
      <div className="sl-rangee-actions">
        <Bouton type="submit" variante="secondaire" disabled={enCours || restant > 0}>
          {restant > 0 ? `Renvoyer un lien (${restant} s)` : "Renvoyer un lien"}
        </Bouton>
        <Bouton type="button" variante="secondaire" onClick={changerDAdresse}>
          Changer d&apos;adresse
        </Bouton>
      </div>
    </form>
  );
}
