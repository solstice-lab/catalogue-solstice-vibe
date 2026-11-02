"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Bouton, Champ } from "@/ui";

/*
 * L'envoi du fichier : un POST vers le Route Handler de l'appli
 * (`${chemin}/envoi`, voir envoi.ts), pas une Server Action, qui refuse tout
 * corps de plus de 1 Mo. La réponse est un identifiant de lot, que l'écran
 * suit ; ou un message, affiché sous le champ (.xls, colonne absente, fichier
 * trop gros) : un fichier refusé ne doit pas mener à la page d'erreur.
 */
export function FormulaireEnvoi({
  chemin,
  libelle,
  megaOctetsMax,
}: {
  chemin: string;
  libelle: string;
  megaOctetsMax: number;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const envoyer = async (evenement: FormEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    const donnees = new FormData(evenement.currentTarget);
    if (!(donnees.get("fichier") instanceof File) || (donnees.get("fichier") as File).size === 0) {
      setMessage("Choisir un fichier .xlsx ou CSV.");
      return;
    }
    setEnCours(true);
    setMessage(null);
    try {
      const reponse = await fetch(`${chemin}/envoi`, { method: "POST", body: donnees });
      if (reponse.status === 201) {
        const { lotId } = (await reponse.json()) as { lotId: number };
        router.push(`${chemin}/${lotId}`);
        return;
      }
      // Les refus de l'envoi portent un message fait pour la personne ; un
      // autre statut (proxy, panne) n'en a pas.
      const corps = (await reponse.json().catch(() => null)) as { message?: string } | null;
      setMessage(
        corps?.message ?? "L'envoi a échoué : réessayer, puis prévenir l'équipe technique si cela se reproduit."
      );
    } catch {
      setMessage("L'envoi a échoué : la connexion a été interrompue. Réessayer.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form className="sl-formulaire" onSubmit={envoyer}>
      <Champ
        label={libelle}
        aide={`Un classeur .xlsx ou un CSV (UTF-8), ${megaOctetsMax} Mo au plus. Le fichier est lu en entier et montré avant que quoi que ce soit s'écrive.`}
        type="file"
        name="fichier"
        accept=".xlsx,.csv"
      />
      {message && <p className="sl-erreur-formulaire">{message}</p>}
      <div className="sl-rangee-actions">
        <Bouton type="submit" disabled={enCours}>
          {enCours ? "Lecture du fichier…" : "Lire le fichier"}
        </Bouton>
      </div>
    </form>
  );
}
