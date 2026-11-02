"use client";

// Sans cette page, une erreur de rendu en prod affiche une page blanche avec
// un digest cryptique (vécu sur un projet précédent). Le digest reste affiché : c'est lui
// qu'on cherche ensuite dans les logs du serveur.

import { Bouton, Carte, LienBouton } from "@/ui";

export default function Erreur({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="sl-page sl-page-erreur">
      <Carte titre="Une erreur est survenue">
        <p>
          La page n&apos;a pas pu s&apos;afficher. Réessayer suffit souvent ; si l&apos;erreur persiste, prévenir
          l&apos;équipe technique.
        </p>
        {error.digest && (
          <p className="sl-erreur-reference">
            Référence à transmettre : <code className="sl-erreur-digest">{error.digest}</code>
          </p>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <Bouton onClick={reset}>Réessayer</Bouton>
          <LienBouton variante="secondaire" href="/">
            Retour à l&apos;accueil
          </LienBouton>
        </div>
      </Carte>
    </main>
  );
}
