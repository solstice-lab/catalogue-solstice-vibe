import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "./Badge";

/**
 * Indicateur de tête d'écran : libellé, valeur en chasse fixe, variation
 * optionnelle. Se pose en rangée dans une grille (`.sl-grille--serree`).
 * Avec `href`, la tuile entière mène à l'écran qui détaille le chiffre.
 */
export function TuileKPI({
  libelle,
  valeur,
  variation,
  aide,
  href,
}: {
  libelle: string;
  valeur: ReactNode;
  variation?: { texte: string; ton?: "positif" | "negatif" | "neutre" };
  aide?: string;
  href?: string;
}) {
  const contenu = (
    <>
      <span className="sl-tuile-kpi-libelle">{libelle}</span>
      <span className="sl-tuile-kpi-valeur">{valeur}</span>
      {(variation || aide) && (
        <span className="sl-tuile-kpi-pied">
          {variation && <Badge ton={variation.ton ?? "neutre"}>{variation.texte}</Badge>}
          {aide && <span className="sl-tuile-kpi-aide">{aide}</span>}
        </span>
      )}
    </>
  );
  if (href) {
    return (
      <Link className="sl-tuile-kpi sl-tuile-kpi--lien" href={href}>
        {contenu}
      </Link>
    );
  }
  return <div className="sl-tuile-kpi">{contenu}</div>;
}
