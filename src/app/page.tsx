import { AccueilDeDepart } from "@/lib/accueil";
import { NAVIGATION } from "@/lib/navigation";
import { metadonneesDePage } from "@/lib/referencement";
import { entreeDeLEspace } from "@/briques/espaces/accueil";

// Brique espaces : l'espace de la personne se lit en base à chaque requête.
export const dynamic = "force-dynamic";
// Fin de la brique espaces.

// Le nom du site seul pour titre (src/lib/referencement.ts).
export function generateMetadata() {
  return metadonneesDePage({ chemin: "/" });
}

// L'accueil de départ : le nom, la description et l'entrée de l'appli, lus de
// la blueprint (src/lib/accueil.tsx). Une appli le remplace par son accueil
// métier, qui prend la place de cette page ; pour un site vitrine, la page se
// construit avec PageVitrine, SectionVitrine et AppelAction (skill solstice-ui).
export default async function PageAccueil() {
  // Brique espaces : l'entrée de l'appli est son espace, ou le moyen d'en créer un.
  const entree = await entreeDeLEspace();
  // Fin de la brique espaces.
  return <AccueilDeDepart navigation={NAVIGATION} entree={entree} />;
}
