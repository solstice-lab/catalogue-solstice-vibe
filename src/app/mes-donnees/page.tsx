import Link from "next/link";
import { AppLayout, Carte, LienBouton } from "@/ui";
import { NAVIGATION, NOM_APP } from "@/lib/navigation";
import { exiger } from "@/briques/comptes/roles";

// La session se lit à chaque requête : jamais prérendue.
export const dynamic = "force-dynamic";

// La personne télécharge elle-même ce que l'appli garde sur elle (RGPD
// art. 15 et 20) : la demande courante se règle sans passer par l'admin.
export default async function PageMesDonnees() {
  const utilisateur = await exiger("mes-donnees.exporter");

  return (
    <AppLayout nom={NOM_APP} sousTitre="Mes données" navigation={NAVIGATION}>
      <Carte titre="Télécharger mes données">
        <p>
          Un fichier JSON rassemble ce que ce site garde sur l&apos;adresse {utilisateur.email}, source par source. Ce
          qu&apos;il ne peut pas rattacher à une adresse y est nommé, avec la raison. Le détail des traitements est dans
          la <Link href="/confidentialite">politique de confidentialité</Link>.
        </p>
        <div className="sl-rangee-actions">
          <LienBouton href="/mes-donnees/export" download>
            Télécharger (JSON)
          </LienBouton>
        </div>
      </Carte>
    </AppLayout>
  );
}
