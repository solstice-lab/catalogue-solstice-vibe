import type { ReactNode } from "react";

/**
 * Bloc de contenu standard, un panneau du registre : sans cadre propre, ce sont
 * les filets de la page ou de la grille qui le bordent ; titre en petites
 * capitales mono précédé d'un carré, filet dessous.
 */
export function Carte({
  titre,
  actions,
  children,
}: {
  titre?: string;
  /** Petits contrôles alignés à droite du titre (mini-boutons, badge…) */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="sl-carte">
      {titre && (
        <h3 className="sl-carte-titre">
          <span className="sl-tick" aria-hidden />
          {titre}
          {actions && <span className="sl-carte-actions">{actions}</span>}
        </h3>
      )}
      {children}
    </section>
  );
}
