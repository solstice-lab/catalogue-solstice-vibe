"use client";

import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent } from "react";

/**
 * Le menu de l'en-tête. Sur ordinateur, les liens restent à plat dans
 * l'en-tête ; sur téléphone ils se replient derrière un bouton « Menu »
 * (relevé en recette : quinze liens empilés occupaient presque tout le
 * premier écran et repoussaient le contenu tout en bas). Le bouton se cache et
 * les liens s'affichent d'office à partir de 721 px : seul le CSS décide, il
 * n'y a pas de version « téléphone » du balisage.
 */
export function MenuNavigation({ liens }: { liens: { libelle: string; href: string }[] }) {
  const [ouvert, setOuvert] = useState(false);
  const idListe = useId();
  const bouton = useRef<HTMLButtonElement>(null);
  if (liens.length === 0) return null;

  // Échap referme le menu et rend le focus au bouton, sans quoi le clavier
  // reste sur un lien devenu invisible.
  const auClavier = (evenement: KeyboardEvent) => {
    if (evenement.key !== "Escape" || !ouvert) return;
    setOuvert(false);
    bouton.current?.focus();
  };

  return (
    <>
      <button
        ref={bouton}
        type="button"
        className="sl-nav-bouton"
        aria-expanded={ouvert}
        aria-controls={idListe}
        onClick={() => setOuvert((valeur) => !valeur)}
        onKeyDown={auClavier}
      >
        Menu
      </button>
      <nav
        id={idListe}
        className="sl-nav"
        aria-label="Navigation principale"
        data-ouvert={ouvert ? "" : undefined}
        onKeyDown={auClavier}
      >
        {liens.map((lien) => (
          // Un lien suivi referme le menu : la page qui s'ouvre prend la place.
          <Link key={lien.href} href={lien.href} onClick={() => setOuvert(false)}>
            {lien.libelle}
          </Link>
        ))}
      </nav>
    </>
  );
}
