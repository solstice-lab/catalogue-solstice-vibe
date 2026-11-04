import { AppLayout, Carte, PageVitrine, SectionVitrine } from "@/ui";
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

// Un menu à gardes n'existe qu'avec la brique comptes (lib/navigation.ts ne
// branche une entrée sur visiblePour que par elle) : c'est le seul signal de
// « cette appli a des écrans d'outil » que la page lit sans importer la brique,
// qu'une appli assemblée sans elle n'a plus. Sans comptes, l'appli est un site
// public : le formulaire prend le squelette de ses pages, pas celui d'un écran
// de gestion (cas d'origine : une vitrine mails + contact).
const SITE_PUBLIC = !NAVIGATION.some((lien) => lien.visible);

export default function PageContact() {
  const formulaire = <FormulaireContact afficheLe={heureDAffichage()} />;
  if (SITE_PUBLIC) {
    // La marque de l'en-tête mène déjà à l'accueil.
    const liens = NAVIGATION_PUBLIQUE.filter((lien) => lien.href !== "/");
    return (
      <PageVitrine nom={NOM_APP} liens={liens}>
        <SectionVitrine titre="Contact" principale>
          <Carte titre="Nous écrire">{formulaire}</Carte>
        </SectionVitrine>
      </PageVitrine>
    );
  }
  return (
    <AppLayout nom={NOM_APP} sousTitre="Contact" navigation={NAVIGATION_PUBLIQUE}>
      <Carte titre="Nous écrire">{formulaire}</Carte>
    </AppLayout>
  );
}
