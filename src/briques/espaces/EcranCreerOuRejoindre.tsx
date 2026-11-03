"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Bouton, Carte, Champ } from "@/ui";
import { ESPACES } from "@/config/espaces";
import type { RetourEspace } from "./domaine";

/*
 * « Créer ou rejoindre » (/espace/rejoindre) : une personne sans espace y
 * arrive depuis toute page d'un module rattaché à un espace, et le lien
 * d'invitation y mène avec le code prérempli. Rejoindre vient d'abord : on
 * arrive le plus souvent avec un code.
 *
 * Un geste réussi part vers « Mon espace » (redirection de la server action) ;
 * un refus s'affiche sous son formulaire.
 */

export type ActionsCreerOuRejoindre = {
  creer: (nom: string, prenom: string) => Promise<RetourEspace>;
  rejoindre: (code: string, prenom: string) => Promise<RetourEspace>;
};

type Formulaire = "creer" | "rejoindre";

const AIDE_PRENOM = "Les autres membres ne voient que ce prénom, jamais votre adresse e-mail.";

export function EcranCreerOuRejoindre({
  codeInitial,
  actions,
}: {
  codeInitial: string;
  actions: ActionsCreerOuRejoindre;
}) {
  const [erreurs, setErreurs] = useState<Partial<Record<Formulaire, string>>>({});
  const [enCours, demarrer] = useTransition();
  const v = ESPACES.vocabulaire;

  const soumettre = (formulaire: Formulaire) => (evenement: FormEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    const donnees = new FormData(evenement.currentTarget);
    const texte = (nom: string) => String(donnees.get(nom) ?? "");
    demarrer(async () => {
      const retour =
        formulaire === "creer"
          ? await actions.creer(texte("nom"), texte("prenom"))
          : await actions.rejoindre(texte("code"), texte("prenom"));
      setErreurs({ [formulaire]: retour.erreur });
    });
  };

  return (
    <>
      <Carte titre={`Rejoindre ${v.un}`}>
        <form className="sl-formulaire" onSubmit={soumettre("rejoindre")}>
          <Champ
            label="Code d'invitation"
            name="code"
            defaultValue={codeInitial}
            placeholder="ABCD-EFGH"
            autoComplete="off"
            autoCapitalize="characters"
            required
            aide="Le code qu'un membre vous a donné, ou celui du mail d'invitation."
          />
          <Champ label={`Votre prénom dans ${v.le}`} name="prenom" maxLength={40} required aide={AIDE_PRENOM} />
          {erreurs.rejoindre && <p className="sl-erreur-formulaire">{erreurs.rejoindre}</p>}
          <div className="sl-rangee-actions">
            <Bouton type="submit" disabled={enCours}>
              Rejoindre
            </Bouton>
          </div>
        </form>
      </Carte>

      <Carte titre={`Créer ${v.un}`}>
        <form className="sl-formulaire" onSubmit={soumettre("creer")}>
          <Champ label="Nom" name="nom" maxLength={80} required />
          <Champ label={`Votre prénom dans ${v.le}`} name="prenom" maxLength={40} required aide={AIDE_PRENOM} />
          {erreurs.creer && <p className="sl-erreur-formulaire">{erreurs.creer}</p>}
          <div className="sl-rangee-actions">
            <Bouton type="submit" variante="secondaire" disabled={enCours}>
              Créer
            </Bouton>
          </div>
        </form>
      </Carte>
    </>
  );
}
