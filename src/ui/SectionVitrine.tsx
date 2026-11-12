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
  /** Fond de la bande, à faire alterner pour que chaque partie se distingue d'un coup
   *  d'œil (charte « registre ») : `page` (le papier), `secondaire` (`--fond-secondaire`),
   *  `structure` (la couleur de structure, réservée aux temps forts : synthèse, chiffres
   *  clés, appel principal ; jamais deux à la suite). `surface`, l'ancien nom de
   *  `secondaire`, reste lu de la même façon. */
  fond?: "page" | "secondaire" | "structure" | "surface";
  /** Texte, `Carte`s dans `.sl-grille`, `.sl-liste-simple`, `AppelAction`. */
  children?: ReactNode;
}) {
  const Titre = principale ? "h1" : "h2";
  // `surface` désignait la bande qui se détache du papier : une appli qui l'emploie
  // garde le même rendu sans retoucher ses pages.
  const bande = fond === "surface" ? "secondaire" : fond;
  const classes = ["sl-vitrine-section", `sl-vitrine-section--${bande}`, principale && "sl-vitrine-section--principale"]
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
