import { AppLayout, Carte } from "@/ui";
import { NAVIGATION, NOM_APP } from "@/lib/navigation";
import { exiger } from "@/briques/comptes/roles";
import { creerDossierAction } from "../actions";
import { FormulaireDossier } from "../FormulaireDossier";

// Voir dossiers/page.tsx : aucune page du module ne se prérend.
export const dynamic = "force-dynamic";

export default async function PageNouveauDossier() {
  await exiger("dossiers.acceder");

  return (
    <AppLayout nom={NOM_APP} sousTitre="Dossiers" navigation={NAVIGATION}>
      <Carte titre="Nouveau dossier">
        <FormulaireDossier action={creerDossierAction} cheminRetour="/dossiers" />
      </Carte>
    </AppLayout>
  );
}
