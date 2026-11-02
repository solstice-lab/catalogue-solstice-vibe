"use client";

import { useEffect, type ReactNode } from "react";

export function Modale({
  ouverte,
  titre,
  onFermer,
  piedDePage,
  children,
}: {
  ouverte: boolean;
  titre: string;
  onFermer: () => void;
  /** Boutons d'action, alignés à droite sous un séparateur. */
  piedDePage?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!ouverte) return;
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === "Escape") onFermer();
    };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [ouverte, onFermer]);

  if (!ouverte) return null;

  return (
    <div className="sl-modale-voile" onClick={onFermer} role="presentation">
      <div
        className="sl-modale"
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        onClick={(evenement) => evenement.stopPropagation()}
      >
        <div className="sl-modale-entete">
          <h2>{titre}</h2>
          <button type="button" className="sl-modale-fermer" onClick={onFermer} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="sl-modale-corps">{children}</div>
        {piedDePage && <div className="sl-modale-pied">{piedDePage}</div>}
      </div>
    </div>
  );
}
