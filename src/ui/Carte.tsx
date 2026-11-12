import type { ReactNode } from "react";

/** Bloc de contenu standard : carte sur la surface, bordée d'un filet, titre de section à puce jaune. */
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
