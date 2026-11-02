"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Bouton, Champ, ChampPiege, ChampTexteLong } from "@/ui";
import { envoyerMessageContact } from "./actions";
import { CHAMPS, LONGUEUR_MAX, type EtatContact } from "./champs";

/*
 * Le formulaire de contact public. `afficheLe` : l'heure où la
 * page a été rendue, relue par le serveur pour le délai minimal. Après une
 * erreur, la saisie revient dans les champs : le visiteur ne retape pas son
 * message.
 */
export function FormulaireContact({ afficheLe }: { afficheLe: number }) {
  const [etat, soumettre, enCours] = useActionState<EtatContact, FormData>(envoyerMessageContact, {});

  if (etat.envoye) {
    return (
      <p className="sl-note" role="status">
        <b>Votre message est envoyé.</b> La réponse arrivera à l'adresse indiquée.
      </p>
    );
  }

  return (
    <form action={soumettre} className="sl-formulaire">
      <Champ
        label="Nom"
        name={CHAMPS.nom}
        autoComplete="name"
        maxLength={LONGUEUR_MAX.nom}
        defaultValue={etat.valeurs?.nom}
        required
      />
      <Champ
        label="Adresse e-mail"
        name={CHAMPS.adresse}
        type="email"
        autoComplete="email"
        maxLength={LONGUEUR_MAX.adresse}
        defaultValue={etat.valeurs?.adresse}
        aide="La réponse arrivera à cette adresse."
        required
      />
      <ChampTexteLong
        label="Message"
        name={CHAMPS.message}
        rows={6}
        maxLength={LONGUEUR_MAX.message}
        defaultValue={etat.valeurs?.message}
        required
      />
      <ChampPiege name={CHAMPS.piege} />
      <input type="hidden" name={CHAMPS.afficheLe} defaultValue={afficheLe} />
      {etat.erreur && (
        <p className="sl-erreur-formulaire" role="alert">
          {etat.erreur}
        </p>
      )}
      <div className="sl-rangee-actions">
        <Bouton type="submit" disabled={enCours}>
          {enCours ? "Envoi…" : "Envoyer"}
        </Bouton>
      </div>
      {/* Mention d'information (RGPD art. 13) : l'essentiel ici, le détail
          (base légale, durée, sous-traitants, droits) sur /confidentialite, que
          décrit confidentialite.ts de la brique. */}
      <p className="sl-note">
        Vos nom, adresse et message servent uniquement à vous répondre. Ils sont transmis par e-mail et ne sont pas
        conservés sur ce site. Pour limiter les abus, une empreinte de votre adresse IP est conservée, puis effacée au
        premier message reçu après une heure. Vos droits : voir la{" "}
        <Link href="/confidentialite">politique de confidentialité</Link>.
      </p>
    </form>
  );
}
