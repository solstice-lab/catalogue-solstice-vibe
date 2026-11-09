"use client";

import { useActionState } from "react";
import { Bouton, Champ, ChampSelect, ChampTexteLong, LienBouton } from "@/ui";
import {
  centimesVersEurosSaisie,
  LIBELLES_STATUT_DOSSIER,
  LONGUEUR_MAX_DOSSIER,
  STATUTS_DOSSIER,
  type Dossier,
} from "@/lib/dossiers-domaine";
import type { EtatFormulaireDossier } from "./actions";

/*
 * LE formulaire du dossier, partagé par /nouveau et /modifier : c'est ce
 * partage qui rend la parité fiche/formulaire mécanique — un champ ajouté ici
 * apparaît aux deux endroits, et la fiche doit afficher exactement ces champs.
 */
export function FormulaireDossier({
  action,
  initial,
  cheminRetour,
}: {
  action: (etat: EtatFormulaireDossier, formData: FormData) => Promise<EtatFormulaireDossier>;
  initial?: Dossier;
  cheminRetour: string;
}) {
  const [etat, soumettre, enCours] = useActionState(action, {});

  return (
    <form action={soumettre} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Champ
        label="Référence"
        name="reference"
        defaultValue={initial?.reference}
        placeholder="Ex. DOS-021"
        maxLength={LONGUEUR_MAX_DOSSIER.reference}
        aide="Unique — c'est elle qui identifie le dossier, y compris pour les imports."
        required
      />
      <Champ
        label="Client"
        name="client"
        defaultValue={initial?.client}
        maxLength={LONGUEUR_MAX_DOSSIER.client}
        required
      />
      <Champ
        label="Montant"
        name="montant"
        inputMode="decimal"
        defaultValue={initial ? centimesVersEurosSaisie(initial.montant_centimes) : ""}
        placeholder="Ex. 12 500,50"
      />
      <ChampSelect
        label="Statut"
        name="statut"
        defaultValue={initial?.statut ?? "en_cours"}
        options={STATUTS_DOSSIER.map((statut) => ({
          valeur: statut,
          libelle: LIBELLES_STATUT_DOSSIER[statut],
        }))}
      />
      <Champ label="Échéance" name="echeance" type="date" defaultValue={initial?.echeance ?? ""} />
      <ChampTexteLong
        label="Notes"
        name="notes"
        defaultValue={initial?.notes ?? ""}
        placeholder="Contexte, décisions, prochaines étapes…"
        maxLength={LONGUEUR_MAX_DOSSIER.notes}
      />
      {etat.erreur && <p className="sl-erreur-formulaire">{etat.erreur}</p>}
      <div style={{ display: "flex", gap: 10 }}>
        <Bouton type="submit" disabled={enCours}>
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </Bouton>
        <LienBouton variante="secondaire" href={cheminRetour}>
          Annuler
        </LienBouton>
      </div>
    </form>
  );
}
