"use client";

// Remplace TOUT le layout quand l'erreur vient du layout racine lui-même :
// cette page doit donc porter ses propres <html> et <body>, et réimporter
// les styles puisque ceux du layout ne sont plus là.

import "./globals.css";

export default function ErreurGlobale({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body>
        <main className="sl-page sl-page-erreur">
          <div className="sl-carte">
            <h3 className="sl-carte-titre">
              <span className="sl-tick" aria-hidden />
              Une erreur est survenue
            </h3>
            <p>
              L&apos;application n&apos;a pas pu s&apos;afficher. Réessayer suffit souvent ; si l&apos;erreur persiste,
              prévenir l&apos;équipe technique.
            </p>
            {error.digest && (
              <p className="sl-erreur-reference">
                Référence à transmettre : <code className="sl-erreur-digest">{error.digest}</code>
              </p>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button type="button" className="sl-bouton sl-bouton--primaire" onClick={reset}>
                Réessayer
              </button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
