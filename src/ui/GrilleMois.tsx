import Link from "next/link";

export type CelluleMois<Element> = {
  /** « aaaa-mm-jj ». */
  date: string;
  /** Faux pour les jours des mois voisins qui complètent la première et la dernière semaine. */
  dansLeMois: boolean;
  aujourdhui: boolean;
  elements: Element[];
};

/**
 * Un mois en grille : une ligne par semaine, une colonne par jour, et dans
 * chaque jour ses éléments, chacun menant à sa fiche. Le composant ne calcule
 * aucune date : il reçoit les semaines déjà construites (`semaines`, du
 * lundi au dimanche pour la brique calendrier), ce qui le garde sans règle
 * de calendrier ni de fuseau.
 *
 * Réservée à l'ordinateur : sept colonnes de quelques éléments chacune sont
 * illisibles à 375 px. Sur téléphone, une `ListeCartes` prend le relais
 * (`.sl-seulement-ordinateur` / `.sl-seulement-telephone`).
 */
export function GrilleMois<Element>({
  titre,
  entetes,
  semaines,
  cle,
  libelle,
  lien,
}: {
  /** Nom accessible de la grille (« interventions : octobre 2026 »). */
  titre: string;
  /** Les sept noms de jours, dans l'ordre des colonnes. */
  entetes: string[];
  semaines: CelluleMois<Element>[][];
  cle: (element: Element) => string;
  libelle: (element: Element) => string;
  lien: (element: Element) => string;
}) {
  return (
    <div className="sl-grille-mois" role="table" aria-label={titre}>
      <div className="sl-grille-mois-ligne" role="row">
        {entetes.map((entete) => (
          <span key={entete} className="sl-grille-mois-entete" role="columnheader">
            {entete}
          </span>
        ))}
      </div>
      {semaines.map((semaine) => (
        <div key={semaine[0].date} className="sl-grille-mois-ligne" role="row">
          {semaine.map((cellule) => (
            <div
              key={cellule.date}
              className={["sl-grille-mois-jour", !cellule.dansLeMois && "sl-grille-mois-jour--hors-mois"]
                .filter(Boolean)
                .join(" ")}
              role="cell"
              aria-current={cellule.aujourdhui ? "date" : undefined}
            >
              <span
                className={["sl-grille-mois-numero", cellule.aujourdhui && "sl-grille-mois-numero--aujourdhui"]
                  .filter(Boolean)
                  .join(" ")}
              >
                {Number(cellule.date.slice(8))}
              </span>
              {cellule.elements.length > 0 && (
                <ul className="sl-grille-mois-elements">
                  {cellule.elements.map((element, rang) => (
                    // Le rang complète la clé : deux éléments du même jour peuvent
                    // mener à la même fiche (lien d'un parent), et une clé en double
                    // fait omettre ou dupliquer un élément à la mise à jour.
                    <li key={`${cle(element)}#${rang}`}>
                      {/* Le libellé est tronqué par ellipsis (ui.css) : le title
                          garde le texte complet lisible. */}
                      <Link className="sl-grille-mois-element" href={lien(element)} title={libelle(element)}>
                        {libelle(element)}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
