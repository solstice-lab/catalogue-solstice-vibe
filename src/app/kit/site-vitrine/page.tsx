import type { Metadata } from "next";
import { NOM_APP } from "@/lib/navigation";
import { AppelAction, Carte, LienBouton, PageVitrine, SectionVitrine } from "@/ui";

// Jamais indexée, comme /kit : texte fictif, pour l'équipe seulement.
export const metadata: Metadata = { title: "Kit UI : site vitrine", robots: { index: false, follow: false } };

// Les composants d'un site vitrine montrés sur une page entière : leur en-tête
// et leur pied ne s'imbriquent pas dans l'AppLayout de /kit. Les liens ne
// mènent qu'aux ancres de la page et au kit, pour ne jamais tomber sur une
// page qu'une appli assemblée n'aurait pas (le formulaire de contact part
// avec sa brique).
export default function PageKitSiteVitrine() {
  return (
    <PageVitrine
      nom={NOM_APP}
      liens={[
        { libelle: "Offre", href: "#offre" },
        { libelle: "Méthode", href: "#methode" },
        { libelle: "Contact", href: "#contact" },
      ]}
      action={
        <LienBouton variante="secondaire" href="#contact">
          Nous écrire
        </LienBouton>
      }
    >
      <SectionVitrine
        principale
        titre="L'organisation des ateliers de production, pour les PME industrielles"
        intro="Texte fictif. Cette page montre les composants d'un site vitrine et sert de vérification visuelle après thématisation."
      >
        <p>
          Un cabinet imaginaire présente son activité : une section principale qui porte le titre de la page, des
          sections en bandes alternées (papier, fond secondaire), un appel à l&apos;action dans la bande de structure
          réservée au temps fort, puis le pied de page commun à toute appli, avec la signature Solstice Lab et les liens
          légaux.
        </p>
      </SectionVitrine>

      <SectionVitrine id="offre" titre="Offre" intro="Trois façons de travailler ensemble." fond="secondaire">
        <div className="sl-grille">
          <Carte titre="Diagnostic">
            <p>Deux jours sur site pour relever les flux, les attentes et les points de blocage.</p>
          </Carte>
          <Carte titre="Accompagnement">
            <p>Un suivi mensuel des indicateurs choisis ensemble, sur six mois.</p>
          </Carte>
          <Carte titre="Formation">
            <p>Des sessions courtes pour les chefs d&apos;équipe, dans l&apos;atelier.</p>
          </Carte>
        </div>
      </SectionVitrine>

      <SectionVitrine id="methode" titre="Méthode">
        <ul className="sl-liste-simple">
          <li>Partir de ce que l&apos;atelier mesure déjà.</li>
          <li>Changer une chose à la fois, et en mesurer l&apos;effet.</li>
          <li>Laisser l&apos;équipe autonome à la fin de la mission.</li>
        </ul>
      </SectionVitrine>

      <SectionVitrine id="contact" titre="Contact" fond="structure">
        <AppelAction
          titre="Un projet à cadrer ?"
          texte="Un premier échange de trente minutes, pour voir si nous pouvons vous aider."
          actions={
            <>
              <LienBouton href="#contact">Prendre rendez-vous</LienBouton>
              <LienBouton variante="secondaire" href="/kit">
                Revenir au kit
              </LienBouton>
            </>
          }
        />
      </SectionVitrine>
    </PageVitrine>
  );
}
