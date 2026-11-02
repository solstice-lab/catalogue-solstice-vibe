import { AppLayout, Carte } from "@/ui";
import { NAVIGATION, NOM_APP } from "@/lib/navigation";
import { metadonneesDePage } from "@/lib/referencement";
import { FormulaireContact } from "@/briques/contact/FormulaireContact";
import { heureDAffichage } from "@/briques/contact/filtres";

// Rendue à chaque requête : l'heure d'affichage écrite dans le formulaire sert
// au délai minimal (brique contact). Une page mise en cache la figerait.
export const dynamic = "force-dynamic";

// Page du sitemap (pagesPubliques de src/lib/referencement.ts) : son titre et
// son adresse canonique.
export function generateMetadata() {
  return metadonneesDePage({ titre: "Contact", chemin: "/contact" });
}

// Ouverte à tout visiteur, sans garde : un formulaire de contact s'adresse à
// qui n'a pas de compte. Comme /mentions-legales, la page ne lit pas la
// session (tests/contact-page.test.ts), et le menu ne garde que les entrées
// sans garde.
const NAVIGATION_PUBLIQUE = NAVIGATION.filter((lien) => !lien.visible);

export default function PageContact() {
  return (
    <AppLayout nom={NOM_APP} sousTitre="Contact" navigation={NAVIGATION_PUBLIQUE}>
      <Carte titre="Nous écrire">
        <FormulaireContact afficheLe={heureDAffichage()} />
      </Carte>
    </AppLayout>
  );
}
