import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";

/**
 * Un lien à l'allure d'un bouton : aller vers /nouveau, revenir à la liste,
 * télécharger un fichier. Mêmes variantes que `Bouton`, qui reste pour les
 * gestes (envoyer, confirmer) : un lien se partage et s'ouvre dans un onglet.
 * Sans lui, chaque page recopiait les classes du bouton sur son lien.
 *
 * Un `Link` de Next par défaut. Un `<a>` simple avec `download` ou `natif` :
 * un fichier à télécharger ou une route qui redirige ailleurs (la connexion
 * Google) ne se précharge pas et ne se navigue pas côté client.
 */
export function LienBouton({
  variante = "primaire",
  natif = false,
  className,
  ...props
}: {
  variante?: "primaire" | "secondaire" | "danger";
  natif?: boolean;
  href: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const classes = ["sl-bouton", `sl-bouton--${variante}`, className].filter(Boolean).join(" ");
  const telechargement = props.download !== undefined && props.download !== false;
  if (natif || telechargement) return <a {...props} className={classes} />;
  return <Link {...props} className={classes} />;
}
