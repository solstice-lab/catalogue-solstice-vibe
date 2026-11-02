import { notFound } from "next/navigation";
import { AppLayout, Carte } from "@/ui";
import { lireDossierParIdentifiant } from "@/lib/db/dossiers";
import { NAVIGATION, NOM_APP } from "@/lib/navigation";
import { exiger } from "@/briques/comptes/roles";
import { cheminDossier } from "@/lib/slug";
import { modifierDossierAction } from "../../actions";
import { FormulaireDossier } from "../../FormulaireDossier";

// Voir dossiers/page.tsx : aucune page du module ne se prérend.
export const dynamic = "force-dynamic";

export default async function PageModifierDossier({ params }: { params: Promise<{ slug: string }> }) {
  await exiger("dossiers.acceder");
  const { slug } = await params;
  const dossier = await lireDossierParIdentifiant(slug);
  if (!dossier) notFound();

  return (
    <AppLayout nom={NOM_APP} sousTitre="Dossiers" navigation={NAVIGATION}>
      <Carte titre={`Modifier le dossier ${dossier.reference}`}>
        <FormulaireDossier
          action={modifierDossierAction.bind(null, dossier.id)}
          initial={dossier}
          cheminRetour={cheminDossier(dossier)}
        />
      </Carte>
    </AppLayout>
  );
}
