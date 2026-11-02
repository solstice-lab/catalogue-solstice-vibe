import type { Metadata } from "next";
import { Carte, EtatVide, LienBouton } from "@/ui";

// Next pose de lui-même noindex sur une réponse 404.
export const metadata: Metadata = { title: "Page introuvable" };

export default function PageIntrouvable() {
  return (
    <main className="sl-page sl-page-erreur">
      <Carte>
        <EtatVide
          titre="Page introuvable"
          description="L'adresse demandée ne correspond à aucune page de l'application."
          action={
            <LienBouton variante="secondaire" href="/">
              Retour à l&apos;accueil
            </LienBouton>
          }
        />
      </Carte>
    </main>
  );
}
