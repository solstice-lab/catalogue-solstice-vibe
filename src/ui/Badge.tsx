import type { ReactNode } from "react";

/**
 * Les tons positif/negatif portent la sémantique des données (hausse/baisse,
 * ok/erreur) : ils viennent des tokens sémantiques, jamais de l'identité client.
 */
export function Badge({
  ton = "neutre",
  children,
}: {
  ton?: "neutre" | "accent" | "positif" | "negatif";
  children: ReactNode;
}) {
  return <span className={`sl-badge sl-badge--${ton}`}>{children}</span>;
}
