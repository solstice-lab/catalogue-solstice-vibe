"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useState, type KeyboardEvent } from "react";

/**
 * L'entrée qui mène à la page ouverte, ou à la rubrique qui la contient (la
 * fiche d'un dossier reste dans « Dossiers »). L'accueil ne l'est que sur
 * lui-même : sinon il préfixerait toutes les pages.
 */
function estActif(href: string, chemin: string | null): boolean {
  if (chemin === null) return false;
  return href === chemin || (href !== "/" && chemin.startsWith(`${href}/`));
}

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
  // L'entrée active passe en jaune (charte « registre ») : aria-current la
  // donne au CSS et aux lecteurs d'écran à la fois.
  const chemin = usePathname();
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
          <Link
            key={lien.href}
            href={lien.href}
            aria-current={estActif(lien.href, chemin) ? "page" : undefined}
            onClick={() => setOuvert(false)}
          >
            {lien.libelle}
          </Link>
        ))}
      </nav>
    </>
  );
}
