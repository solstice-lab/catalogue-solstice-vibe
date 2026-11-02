import { AppLayout, Carte, EtatVide } from "@/ui";
import { NAVIGATION, NOM_APP } from "@/lib/navigation";
import { metadonneesDePage } from "@/lib/referencement";

// Le nom du site seul pour titre (src/lib/referencement.ts).
export function generateMetadata() {
  return metadonneesDePage({ chemin: "/" });
}

// L'accueil d'une appli dont le module métier reste à écrire : son contenu
// prend la place de cette carte. Elle dit qu'il manque, plutôt qu'une page blanche qui
// ressemblerait à une panne. Pour un site vitrine, la page se construit avec
// PageVitrine, SectionVitrine et AppelAction (skill solstice-ui).
export default function PageAccueil() {
  return (
    <AppLayout nom={NOM_APP} sousTitre="Accueil" navigation={NAVIGATION}>
      <Carte titre="Accueil">
        <EtatVide titre="Page d'accueil à écrire" description="Le contenu de cette page n'est pas encore écrit." />
      </Carte>
    </AppLayout>
  );
}
