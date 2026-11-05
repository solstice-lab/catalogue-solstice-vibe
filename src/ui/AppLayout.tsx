import type { ReactNode } from "react";
import { MenuNavigation } from "./MenuNavigation";
import { PiedDePage } from "./PiedDePage";

export type LienNavigation = {
  libelle: string;
  href: string;
  /**
   * Garde d'affichage : sans elle l'entrée est toujours proposée. Le kit ne
   * connaît aucune règle d'accès, il se contente d'appeler la fonction (c'est
   * l'appli qui la branche sur ses gardes). Une entrée masquée ne protège
   * rien : chaque page garde son propre garde.
   */
  visible?: () => boolean | Promise<boolean>;
};

/** Les entrées que la personne courante peut ouvrir, dans l'ordre d'origine. */
export async function liensVisibles(navigation: LienNavigation[]): Promise<LienNavigation[]> {
  const visibles = await Promise.all(navigation.map((lien) => (lien.visible ? lien.visible() : true)));
  return navigation.filter((_, index) => visibles[index]);
}

// Le filtre est asynchrone (il lit l'utilisateur) et un composant client ne
// peut pas l'être : une page vitrine cliente (`PageVitrine`) passe des liens sans garde et
// prend la voie synchrone de `MenuNavigation`. Seuls libellé et adresse lui
// sont passés : les fonctions `visible` ne traversent pas la frontière client.
async function MenuFiltre({ navigation }: { navigation: LienNavigation[] }) {
  const visibles = await liensVisibles(navigation);
  return <MenuNavigation liens={visibles.map(({ libelle, href }) => ({ libelle, href }))} />;
}

/**
 * Squelette de tout écran d'outil : en-tête à la charte, contenu, signature et
 * liens des mentions légales et de la confidentialité (PiedDePage). Pour les
 * pages publiques d'un site vitrine : `PageVitrine`.
 */
export function AppLayout({
  nom,
  sousTitre,
  badge,
  navigation = [],
  children,
}: {
  nom: string;
  sousTitre?: string;
  /** Contexte affiché à droite de l'en-tête, ex. « Prototype · Solstice Lab × Client » */
  badge?: string;
  navigation?: LienNavigation[];
  children: ReactNode;
}) {
  return (
    <>
      <header className="sl-entete">
        <div className="sl-entete-marque">
          <span className="sl-pastille" aria-hidden />
          <div>
            <div className="sl-entete-nom">{nom}</div>
            {sousTitre && <div className="sl-entete-sous-titre">{sousTitre}</div>}
          </div>
        </div>
        {navigation.some((lien) => lien.visible) ? (
          <MenuFiltre navigation={navigation} />
        ) : (
          <MenuNavigation liens={navigation.map(({ libelle, href }) => ({ libelle, href }))} />
        )}
        {badge && <span className="sl-entete-badge">{badge}</span>}
      </header>
      <main className="sl-page">{children}</main>
      <PiedDePage />
    </>
  );
}
