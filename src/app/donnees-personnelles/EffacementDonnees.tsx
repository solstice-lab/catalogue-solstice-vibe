"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Bouton, Carte, Champ, EtatVide, Modale, Tableau, type Colonne } from "@/ui";
import type { BilanEffacement } from "@/briques/rgpd/effacement";
import { apercevoirEffacementAction, effacerAction, type RetourEffacement } from "./actions";

/*
 * L'effacement des données d'une personne, en deux temps : l'aperçu, qui joue
 * l'effacement et l'annule (ce qu'il montre est ce que la confirmation fera,
 * refus compris), puis la Modale, où l'admin retape l'adresse. Saisir une
 * autre adresse efface l'aperçu : on ne confirme que ce qu'on a lu.
 */

type LigneSource = BilanEffacement["sources"][number];

const COLONNES: Colonne<LigneSource>[] = [
  { cle: "titre", titre: "Source" },
  { cle: "lignes", titre: "Lignes", chiffres: true },
  { cle: "effacement", titre: "Ce que l'effacement en fait" },
];

const total = (bilan: BilanEffacement) => bilan.sources.reduce((somme, source) => somme + source.lignes, 0);

function ResteAFaire({ bilan }: { bilan: BilanEffacement }) {
  return (
    <>
      {bilan.avertissements.length > 0 && (
        <>
          <p>À faire hors de l&apos;appli :</p>
          <ul className="sl-liste-simple">
            {bilan.avertissements.map((avertissement) => (
              <li key={avertissement}>{avertissement}</li>
            ))}
          </ul>
        </>
      )}
      <p>Ce que l&apos;effacement ne retrouve pas par l&apos;adresse, à chercher à la main :</p>
      <ul className="sl-liste-simple">
        {bilan.nonEffacees.map((donnee) => (
          <li key={donnee.quoi}>
            {donnee.quoi} : {donnee.pourquoi}
          </li>
        ))}
      </ul>
    </>
  );
}

export function EffacementDonnees() {
  const [adresse, setAdresse] = useState("");
  const [apercu, setApercu] = useState<BilanEffacement | null>(null);
  const [fait, setFait] = useState<BilanEffacement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [erreurModale, setErreurModale] = useState<string | null>(null);
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [enCours, demarrer] = useTransition();

  const recevoir = (retour: RetourEffacement, quandRefus: (message: string) => void) => {
    if ("erreur" in retour) {
      quandRefus(retour.erreur);
      return null;
    }
    return retour.bilan;
  };

  const apercevoir = (evenement: FormEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    setFait(null);
    setErreur(null);
    demarrer(async () => {
      setApercu(recevoir(await apercevoirEffacementAction(adresse), setErreur));
    });
  };

  const ouvrir = () => {
    setConfirmation("");
    setErreurModale(null);
    setModaleOuverte(true);
  };
  const fermer = () => setModaleOuverte(false);

  const effacer = () => {
    if (!apercu) return;
    demarrer(async () => {
      const bilan = recevoir(await effacerAction(apercu.adresse, confirmation), setErreurModale);
      if (!bilan) return;
      setModaleOuverte(false);
      setApercu(null);
      setAdresse("");
      setFait(bilan);
    });
  };

  const confirmee = apercu !== null && confirmation.trim().toLowerCase() === apercu.adresse;

  return (
    <Carte titre="Effacer les données d'une personne">
      <p>
        Pour répondre à une demande d&apos;effacement : ce que ce site garde sur l&apos;adresse est effacé ou anonymisé,
        source par source. Le compte n&apos;est pas supprimé : il est anonymisé et désactivé. Avant d&apos;effacer,
        s&apos;assurer que la demande vient bien de la personne, et lui envoyer l&apos;export de ses données si elle le
        souhaite : l&apos;effacement ne se rattrape pas.
      </p>
      <form className="sl-formulaire" onSubmit={apercevoir}>
        <Champ
          label="Adresse e-mail"
          name="adresse-a-effacer"
          type="email"
          required
          autoComplete="off"
          value={adresse}
          onChange={(evenement) => {
            setAdresse(evenement.target.value);
            setApercu(null);
          }}
        />
        {erreur && (
          <p className="sl-erreur-formulaire" role="alert">
            {erreur}
          </p>
        )}
        <div className="sl-rangee-actions">
          <Bouton type="submit" variante="secondaire" disabled={enCours}>
            Voir ce qui sera effacé
          </Bouton>
        </div>
      </form>

      {apercu && (
        <>
          <p>Aperçu pour {apercu.adresse} : rien n&apos;est encore effacé.</p>
          {total(apercu) === 0 ? (
            <EtatVide
              titre="Rien à effacer pour cette adresse"
              description="Ce site ne garde aucune ligne que cette adresse retrouve."
            />
          ) : (
            <Tableau
              id="rgpd-apercu-effacement"
              colonnes={COLONNES}
              lignes={apercu.sources}
              cleLigne={(source) => source.cle}
            />
          )}
          <ResteAFaire bilan={apercu} />
          {total(apercu) > 0 && (
            <div className="sl-rangee-actions">
              <Bouton variante="danger" disabled={enCours} onClick={ouvrir}>
                Effacer les données de cette adresse
              </Bouton>
            </div>
          )}
        </>
      )}

      {fait && (
        <div role="status">
          <p>
            Les données de {fait.adresse} sont effacées. Lignes concernées : {total(fait)}.
          </p>
          <ResteAFaire bilan={fait} />
        </div>
      )}

      <Modale
        ouverte={modaleOuverte}
        titre="Effacer les données de cette adresse ?"
        onFermer={fermer}
        piedDePage={
          <>
            <Bouton variante="secondaire" onClick={fermer}>
              Annuler
            </Bouton>
            <Bouton variante="danger" disabled={enCours || !confirmee} onClick={effacer}>
              Effacer définitivement
            </Bouton>
          </>
        }
      >
        <div className="sl-formulaire">
          <p>
            Cette action est définitive : les lignes de l&apos;aperçu sont effacées ou anonymisées, et le compte de{" "}
            {apercu?.adresse} ne pourra plus servir.
          </p>
          <Champ
            label="Retapez l'adresse pour confirmer"
            name="confirmation"
            type="email"
            autoComplete="off"
            autoFocus
            value={confirmation}
            onChange={(evenement) => setConfirmation(evenement.target.value)}
          />
          {erreurModale && (
            <p className="sl-erreur-formulaire" role="alert">
              {erreurModale}
            </p>
          )}
        </div>
      </Modale>
    </Carte>
  );
}
