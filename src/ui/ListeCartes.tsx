import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { EtatVide } from "./EtatVide";

export type ChampCarte<Element> = {
  libelle: string;
  valeur: (element: Element) => ReactNode;
  /** Valeurs chiffrées : police à chasse fixe. */
  chiffres?: boolean;
};

/**
 * Une liste en cartes empilées, pour le téléphone : un tableau de cinq
 * colonnes y défile de côté et cache ce qui compte (vue « À
 * venir »). Chaque carte porte un titre, un badge facultatif et quelques
 * champs ; avec `lien`, la carte entière mène à la fiche.
 *
 * Pas de tri ni de filtre : réservée aux listes courtes déjà ordonnées.
 * Une liste à explorer reste un `Tableau`.
 */
export function ListeCartes<Element>({
  elements,
  cle,
  titre,
  badge,
  champs = [],
  lien,
  messageVide = "Aucun élément.",
}: {
  elements: Element[];
  cle: (element: Element) => string;
  titre: (element: Element) => ReactNode;
  badge?: (element: Element) => ReactNode;
  champs?: ChampCarte<Element>[];
  lien?: (element: Element) => string;
  messageVide?: string;
}) {
  if (elements.length === 0) return <EtatVide titre={messageVide} />;

  return (
    <ul className="sl-liste-cartes">
      {elements.map((element) => {
        // Un champ vide ne s'affiche pas : un libellé suivi de rien ressemble
        // à un bogue d'affichage.
        const remplis = champs
          .map((champ) => ({ champ, valeur: champ.valeur(element) }))
          .filter(({ valeur }) => valeur !== null && valeur !== undefined && valeur !== "");
        const contenu = (
          <>
            <span className="sl-liste-carte-entete">
              <span className="sl-liste-carte-titre">{titre(element)}</span>
              {badge?.(element)}
            </span>
            {remplis.length > 0 && (
              <dl className="sl-liste-carte-champs">
                {remplis.map(({ champ, valeur }) => (
                  <Fragment key={champ.libelle}>
                    <dt>{champ.libelle}</dt>
                    <dd className={champ.chiffres ? "sl-chiffres" : undefined}>{valeur}</dd>
                  </Fragment>
                ))}
              </dl>
            )}
          </>
        );
        return (
          <li key={cle(element)}>
            {lien ? (
              <Link className="sl-liste-carte sl-liste-carte--lien" href={lien(element)}>
                {contenu}
              </Link>
            ) : (
              <div className="sl-liste-carte">{contenu}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
