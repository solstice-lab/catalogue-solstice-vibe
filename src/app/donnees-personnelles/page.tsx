import Link from "next/link";
import { AppLayout, Bouton, Carte, Champ } from "@/ui";
import { NAVIGATION, NOM_APP } from "@/lib/navigation";
import { exiger, peut } from "@/briques/comptes/roles";
import { EffacementDonnees } from "./EffacementDonnees";

// La session se lit à chaque requête : jamais prérendue.
export const dynamic = "force-dynamic";

// L'export pour une adresse donnée, par l'admin : un compte désactivé
// ne se connecte plus, et une personne sans compte (un responsable de
// contrat) a aussi des données. Un membre reçoit un 404.
//
// Le formulaire poste vers une route, pas vers une Server Action : la réponse
// est un fichier. L'adresse part dans le corps, jamais dans l'URL, qui
// finirait dans les journaux de l'hébergeur.
//
// L'effacement, sur la même page, a son propre droit (donnees.effacer) : une
// appli peut confier l'export sans confier un geste qui ne se rattrape pas.
export default async function PageDonneesPersonnelles() {
  const personne = await exiger("donnees.exporter");

  return (
    <AppLayout nom={NOM_APP} sousTitre="Données personnelles" navigation={NAVIGATION}>
      <Carte titre="Exporter les données d'une personne">
        <p>
          Pour répondre à une demande d&apos;accès ou de portabilité : un fichier JSON rassemble ce que ce site garde
          sur l&apos;adresse saisie, y compris celle d&apos;un compte désactivé ou d&apos;une personne sans compte.
          Avant de l&apos;envoyer, s&apos;assurer que la demande vient bien de la personne. Le détail des traitements
          est dans la <Link href="/confidentialite">politique de confidentialité</Link>.
        </p>
        <form className="sl-formulaire" method="post" action="/donnees-personnelles/export">
          <Champ label="Adresse e-mail" name="adresse" type="email" required autoComplete="off" />
          <div className="sl-rangee-actions">
            <Bouton type="submit">Télécharger (JSON)</Bouton>
          </div>
        </form>
      </Carte>
      {peut(personne, "donnees.effacer") && <EffacementDonnees />}
    </AppLayout>
  );
}
