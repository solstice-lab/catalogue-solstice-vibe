import type { ReactNode } from "react";

/**
 * Toute liste ou zone potentiellement vide affiche un état vide explicite :
 * un blanc silencieux ressemble à un bug, pas à une absence de données.
 */
export function EtatVide({ titre, description, action }: { titre: string; description?: string; action?: ReactNode }) {
  return (
    <div className="sl-etat-vide">
      <span className="sl-etat-vide-titre">{titre}</span>
      {description && <span>{description}</span>}
      {action}
    </div>
  );
}
