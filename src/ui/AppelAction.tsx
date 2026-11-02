import type { ReactNode } from "react";

/**
 * Bloc d'appel à l'action d'une page vitrine : une phrase, une ou deux
 * actions (`LienBouton`, le primaire d'abord). Un seul par écran, comme le
 * bouton primaire : deux appels côte à côte se disputent l'attention.
 * Sur téléphone, les actions s'empilent sur toute la largeur.
 */
export function AppelAction({ titre, texte, actions }: { titre: string; texte?: ReactNode; actions: ReactNode }) {
  return (
    <div className="sl-appel-action">
      <div className="sl-appel-action-texte">
        <p className="sl-appel-action-titre">{titre}</p>
        {texte && <p>{texte}</p>}
      </div>
      <div className="sl-appel-action-actions">{actions}</div>
    </div>
  );
}
