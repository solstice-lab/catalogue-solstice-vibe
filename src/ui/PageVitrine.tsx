import Link from "next/link";
import type { ReactNode } from "react";
import { MenuNavigation } from "./MenuNavigation";
import { PiedDePage } from "./PiedDePage";
import { MARQUE } from "./theme/Marque";

/**
 * Squelette d'une page publique de site vitrine : en-tête horizontal (nom du
 * site vers l'accueil, liens, action facultative), sections, puis le même
 * pied que les écrans d'outil (signature Solstice Lab, mentions légales,
 * confidentialité). `AppLayout` reste le squelette des écrans d'un outil :
 * son sous-titre d'écran et son badge de contexte n'ont pas de sens pour un
 * visiteur, et un site vitrine assemblé sans module n'avait aucun composant
 * pour ses pages.
 *
 * Les liens sont publics (ancres de la page, pages du site) : pas de garde
 * d'affichage comme dans la navigation d'`AppLayout`. Ils se replient derrière
 * « Menu » sur téléphone (`MenuNavigation`, le même que celui des outils).
 */
export function PageVitrine({
  nom,
  liens = [],
  action,
  children,
}: {
  nom: string;
  liens?: { libelle: string; href: string }[];
  /** Un `LienBouton variante="secondaire"` (« Nous contacter ») : le primaire revient à l'appel à l'action de la page, un seul par écran. */
  action?: ReactNode;
  /** Des `SectionVitrine`, la première `principale`. */
  children: ReactNode;
}) {
  return (
    <>
      {/* Les cellules de l'en-tête d'AppLayout ; la marque du thème et le nom
          forment ici un seul lien vers l'accueil. Sans marque
          (theme/Marque.tsx), le nom seul. */}
      <header className="sl-entete sl-vitrine-entete">
        <div className="sl-entete-feuille">
          <Link href="/" className="sl-vitrine-marque">
            {MARQUE && <span className="sl-entete-marque">{MARQUE}</span>}
            <span className="sl-entete-nom">{nom}</span>
          </Link>
          <MenuNavigation liens={liens} />
          {action && <div className="sl-vitrine-entete-action">{action}</div>}
        </div>
      </header>
      <main className="sl-vitrine">{children}</main>
      <PiedDePage />
    </>
  );
}
