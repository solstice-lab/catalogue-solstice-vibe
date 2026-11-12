import type { ReactNode } from "react";

/**
 * Une section de page vitrine, sur toute la largeur, son contenu centré.
 * `principale` porte le titre de la page (h1, chapô agrandi) : une seule par
 * page, la première, pour que la page n'ait qu'un titre aux yeux d'un lecteur
 * d'écran et d'un moteur de recherche. Les autres sont des h2.
 */
export function SectionVitrine({
  titre,
  intro,
  id,
  principale = false,
  fond = "page",
  children,
}: {
  titre: string;
  /** Chapô sous le titre. */
  intro?: ReactNode;
  /** Ancre visée par un lien de l'en-tête (« #offre »). */
  id?: string;
  principale?: boolean;
  /** Alterner `page` et `surface` d'une section à l'autre rythme la page : par le fond quand
   *  le thème les distingue, par les filets de `surface` quand ils sont au même papier
   *  (thème par défaut). */
  fond?: "page" | "surface";
  /** Texte, `Carte`s dans `.sl-grille`, `.sl-liste-simple`, `AppelAction`. */
  children?: ReactNode;
}) {
  const Titre = principale ? "h1" : "h2";
  const classes = ["sl-vitrine-section", `sl-vitrine-section--${fond}`, principale && "sl-vitrine-section--principale"]
    .filter(Boolean)
    .join(" ");
  return (
    <section id={id} className={classes}>
      <div className="sl-vitrine-section-contenu">
        <Titre className="sl-vitrine-section-titre">{titre}</Titre>
        {intro && <p className="sl-vitrine-section-intro">{intro}</p>}
        {children}
      </div>
    </section>
  );
}
