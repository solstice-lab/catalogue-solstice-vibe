"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bouton, BoutonSupprimer, Modale } from "@/ui";
import { phraseLignesEcartees, type RetourGeste } from "./presentation";

/** Les server actions de l'appli, chacune gardée par ses droits, puis appelant gestes.ts. */
export type ActionsDuLot = {
  confirmer: (lotId: number) => Promise<RetourGeste>;
  ignorer: (lotId: number) => Promise<RetourGeste>;
  supprimer: (lotId: number) => Promise<RetourGeste>;
};

/*
 * Les gestes sur un lot. Confirmer et ignorer ne se proposent que tant que le
 * lot est en attente ; supprimer reste possible (il ne retire jamais ce que le
 * lot a déjà écrit). Confirmer est une écriture dans l'entité : la Modale dit
 * ce qui va s'écrire et ce qui ne le sera pas, et le résultat, ou le refus
 * avec son motif (fournisseur introuvable…), se lit dans une Modale plutôt que
 * dans la page d'erreur.
 */
export function ActionsLot({
  lotId,
  enAttente,
  lignesRetenues,
  lignesEcartees,
  chemin,
  textes,
  actions,
}: {
  lotId: number;
  enAttente: boolean;
  lignesRetenues: number;
  lignesEcartees: number;
  chemin: string;
  textes: { dansLEntite: string; ecriture: string; ecritsRestent: string };
  actions: ActionsDuLot;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [aConfirmer, setAConfirmer] = useState(false);
  const [retour, setRetour] = useState<RetourGeste | null>(null);

  const lancer = (operation: () => Promise<RetourGeste>) =>
    demarrer(async () => {
      setRetour(await operation());
    });

  const confirmer = () => {
    setAConfirmer(false);
    lancer(() => actions.confirmer(lotId));
  };

  return (
    <>
      <div className="sl-rangee-actions">
        {enAttente && (
          <>
            <Bouton disabled={enCours || lignesRetenues === 0} onClick={() => setAConfirmer(true)}>
              Confirmer le lot
            </Bouton>
            <Bouton variante="secondaire" disabled={enCours} onClick={() => lancer(() => actions.ignorer(lotId))}>
              Ignorer le lot
            </Bouton>
          </>
        )}
        <BoutonSupprimer
          titre="Supprimer ce lot ?"
          explication={`Le lot et la liste de ses lignes sont supprimés. ${textes.ecritsRestent} Cette action est définitive.`}
          action={async () => {
            const resultat = await actions.supprimer(lotId);
            if (!resultat.reussite) return { erreur: resultat.message };
            router.push(chemin);
          }}
        />
      </div>
      <Modale
        ouverte={aConfirmer}
        titre="Confirmer ce lot ?"
        onFermer={() => setAConfirmer(false)}
        piedDePage={
          <>
            <Bouton variante="secondaire" onClick={() => setAConfirmer(false)}>
              Annuler
            </Bouton>
            <Bouton onClick={confirmer}>Confirmer</Bouton>
          </>
        }
      >
        <p>
          {lignesRetenues} {lignesRetenues > 1 ? "lignes seront écrites" : "ligne sera écrite"} {textes.dansLEntite} :{" "}
          {textes.ecriture} Tout ou rien : si une ligne ne peut pas s&apos;écrire, aucune ne l&apos;est.
        </p>
        {lignesEcartees > 0 && <p>{phraseLignesEcartees(lignesEcartees)}</p>}
      </Modale>
      <Modale
        ouverte={retour !== null}
        titre={retour?.reussite ? "Fait" : "Non appliqué"}
        onFermer={() => setRetour(null)}
        piedDePage={<Bouton onClick={() => setRetour(null)}>Fermer</Bouton>}
      >
        <p>{retour?.message}</p>
      </Modale>
    </>
  );
}
