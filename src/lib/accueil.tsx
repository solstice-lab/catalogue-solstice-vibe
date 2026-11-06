import {
  AppLayout,
  Carte,
  EtatVide,
  LienBouton,
  liensVisibles,
  PageVitrine,
  SectionVitrine,
  type LienNavigation,
} from "@/ui";
import { nomRenseigne, REFERENCEMENT, type Referencement } from "@/lib/referencement";

/*
 * L'accueil de départ d'une appli assemblée : son nom, sa description et un
 * appel à l'action, lus de ce que la blueprint a déjà fait écrire dans
 * NOM_APP et REFERENCEMENT (outils/assembler.mjs). Le 2026-11-05, l'essai
 * tours-de-coloc montrait un onglet « Ma coloc » à côté d'un accueil qui disait
 * « Page d'accueil à écrire » : la première page qu'on voit disait qu'il
 * manquait quelque chose, alors que la blueprint savait déjà par où entrer.
 *
 * Lu à l'exécution plutôt qu'écrit par l'assembleur : il n'y a rien de plus à
 * remplir, et le texte reste du code relu, typé et testé dans le catalogue.
 * L'appli remplace src/app/page.tsx par son accueil métier ; ce fichier n'est
 * lu que par cette page.
 */

export type EntreeAccueil = { libelle: string; href: string };

/**
 * Où envoyer qui arrive sans brique qui dise mieux : le premier onglet que la
 * personne peut ouvrir, hors l'accueil. Sans onglet, rien : un lien vers la
 * page où l'on est serait une impasse.
 */
export async function premiereEntree(navigation: LienNavigation[]): Promise<EntreeAccueil | undefined> {
  const lien = (await liensVisibles(navigation)).find((candidat) => candidat.href !== "/");
  return lien && { libelle: lien.libelle, href: lien.href };
}

/**
 * Le contenu de l'accueil, sous le squelette que l'appli a : un menu à gardes
 * n'existe qu'avec la brique comptes (le même signal que src/app/contact/page.tsx
 * lit, sans importer la brique) ; sans elle, l'appli est un site public et
 * prend `PageVitrine`. Sans nom renseigné (le catalogue, ou une blueprint sans
 * `nom_affiche`), l'état vide d'origine : « NOM_APP » ne doit pas s'afficher
 * comme un nom.
 */
export function AccueilDeDepart({
  navigation,
  entree,
  config = REFERENCEMENT,
}: {
  navigation: LienNavigation[];
  /** L'appel à l'action : sans lui, nom et description seuls. */
  entree?: EntreeAccueil;
  config?: Referencement;
}) {
  if (!nomRenseigne(config)) {
    return (
      <AppLayout nom={config.nom} sousTitre="Accueil" navigation={navigation}>
        <Carte titre="Accueil">
          <EtatVide titre="Page d'accueil à écrire" description="Le contenu de cette page n'est pas encore écrit." />
        </Carte>
      </AppLayout>
    );
  }
  const nom = config.nom.trim();
  const description = config.description.trim();
  const action = entree && (
    <div className="sl-rangee-actions">
      <LienBouton href={entree.href}>{entree.libelle}</LienBouton>
    </div>
  );

  if (!navigation.some((lien) => lien.visible)) {
    // La marque de l'en-tête mène déjà à l'accueil.
    return (
      <PageVitrine nom={nom} liens={navigation.filter((lien) => lien.href !== "/")}>
        <SectionVitrine titre={nom} intro={description || undefined} principale>
          {action}
        </SectionVitrine>
      </PageVitrine>
    );
  }
  return (
    <AppLayout nom={nom} sousTitre="Accueil" navigation={navigation}>
      <Carte titre={nom}>
        <div className="sl-formulaire">
          {description && <p>{description}</p>}
          {action}
        </div>
      </Carte>
    </AppLayout>
  );
}
