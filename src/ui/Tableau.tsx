"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Saisie } from "./Champ";
import { exporterPng, exporterXlsx, preparerExport } from "./exporterTableau";
import { ecrireVue, lireVue, sAbonner, vueInitiale } from "./vueTableau";

export type Colonne<Ligne> = {
  cle: keyof Ligne & string;
  titre: string;
  /** Valeurs chiffrées : police à chasse fixe, alignées à droite. */
  chiffres?: boolean;
  /**
   * Rendu personnalisé de la cellule (badge, lien, montant formaté…).
   * Le tri et le filtre restent sur la valeur brute de `cle` : c'est ce qui
   * permet de trier un montant affiché « 12 500 € » comme un nombre.
   */
  rendu?: (ligne: Ligne) => ReactNode;
  /**
   * Texte sur lequel le filtre cherche, quand la valeur brute ne s'écrit pas
   * comme l'écran : une date triée en « 2026-10-14 » mais affichée
   * « 14/10/2026 » ne se trouvait pas en tapant « 14/10 ». Le tri reste sur
   * la valeur brute.
   */
  filtre?: (ligne: Ligne) => string;
  /**
   * « date » : la valeur brute (« aaaa-mm-jj », ou vide) sort en vraie date
   * dans l'export .xlsx, au format de l'écran. À déclarer sur toute colonne
   * dont l'écran formate une date (`date()`), sinon elle sort en texte ; une
   * colonne qui montre la date brute « aaaa-mm-jj » reste en texte, comme
   * l'écran.
   */
  format?: "date";
  /**
   * Valeur écrite dans l'export .xlsx quand elle diffère de la valeur brute :
   * le libellé qu'affiche l'écran plutôt que la clé interne d'un statut.
   */
  exporter?: (ligne: Ligne) => string | null;
  largeur?: string;
  /**
   * « droite » : la colonne reste visible à droite quand le tableau défile
   * horizontalement. Pour la colonne d'actions d'une file de décision
   * (Accepter, Refuser) : sur un écran étroit, sans cela elle demande de faire
   * défiler tout le tableau (relevé en recette). Une seule colonne par
   * tableau, la dernière ; sans défilement, aucun effet.
   */
  figee?: "droite";
};

/** Une ligne prête à l'affichage, hiérarchie aplatie. */
type LigneAplatie<Ligne> = {
  ligne: Ligne;
  cle: string;
  profondeur: number;
  aEnfants: boolean;
  depliee: boolean;
};

/**
 * LE tableau du kit : tri au clic sur l'en-tête (asc → desc → aucun) et
 * filtre par colonne intégrés d'office. Ne pas construire de <table> à la
 * main : ces deux comportements sont la règle Solstice, pas une option.
 *
 * La vue (tri, filtres, déplis) survit à la navigation dans l'onglet — voir
 * vueTableau.ts. C'est `id` qui la rattache au tableau : le choisir stable et
 * unique dans l'app (« dossiers », « pnl »…), jamais dérivé des données.
 */
export function Tableau<Ligne extends Record<string, unknown>>({
  id,
  colonnes,
  lignes,
  cleLigne,
  messageVide = "Aucune ligne.",
  actionsLot,
  enfants,
  voletsFiges,
  auClicLigne,
  exports,
}: {
  /** Clé de conservation de la vue, stable et unique dans l'app. */
  id: string;
  colonnes: Colonne<Ligne>[];
  lignes: Ligne[];
  cleLigne?: (ligne: Ligne) => string;
  messageVide?: string;
  /**
   * Actions en lot : leur présence ajoute une colonne de sélection et une
   * barre d'actions dès qu'une ligne est cochée. Reçoit les lignes
   * sélectionnées et un rappel pour vider la sélection, à appeler une fois
   * l'action effectuée.
   */
  actionsLot?: (selection: Ligne[], viderSelection: () => void) => ReactNode;
  /**
   * Mode hiérarchique : rend les sous-lignes d'une ligne, dépliables depuis
   * la première colonne. Dans ce mode l'ordre des lignes est structurel :
   * PAS de tri, et le filtre MASQUE des lignes sans rien recalculer — les
   * agrégats affichés restent ceux des données fournies (règle arrêtée sur
   * un compte de résultat, où un tri aurait cassé la lecture comptable).
   * Fournir `cleLigne` : c'est elle qui rend les déplis stables d'une visite
   * à l'autre.
   */
  enfants?: (ligne: Ligne) => Ligne[] | undefined;
  /**
   * Volets figés : l'en-tête et la première colonne restent visibles pendant
   * le défilement (le tableau défile alors dans un cadre à hauteur bornée).
   * Pour les tableaux larges type croisée — inutile sur une liste courte.
   */
  voletsFiges?: boolean;
  /** Rend la ligne cliquable (détail, drill-down). Curseur et survol suivent. */
  auClicLigne?: (ligne: Ligne) => void;
  /**
   * Exports du tableau, en option (`xlsx`/`png` à false pour n'en garder
   * qu'un). L'export dit ce que l'écran montre : lignes filtrées, triées,
   * déplis compris. `nomFichier` sans extension ; `titre` ajoute un bandeau
   * au classeur.
   */
  exports?: {
    nomFichier: string;
    titre?: string;
    xlsx?: boolean;
    png?: boolean;
  };
}) {
  const refTable = useRef<HTMLTableElement>(null);
  const vue = useSyncExternalStore(
    useCallback((notifier) => sAbonner(id, notifier), [id]),
    useCallback(() => lireVue(id), [id]),
    vueInitiale
  );
  const { tri, filtres } = vue;
  const hierarchique = Boolean(enfants);
  // La sélection, elle, ne se conserve pas : cocher des lignes prépare une
  // action immédiate, la retrouver au retour surprendrait plus qu'elle
  // n'aiderait. Par référence d'objet : stable à travers filtres et tris.
  const [selection, setSelection] = useState<Set<Ligne>>(new Set());

  const basculerTri = (cle: string) =>
    ecrireVue(id, {
      tri: tri?.cle !== cle ? { cle, sens: 1 } : tri.sens === 1 ? { cle, sens: -1 } : null,
    });

  const deplis = useMemo(() => new Set(vue.deplis), [vue.deplis]);
  const basculerDepli = (cle: string) =>
    ecrireVue(id, {
      deplis: deplis.has(cle) ? vue.deplis.filter((connue) => connue !== cle) : [...vue.deplis, cle],
    });

  const lignesVisibles = useMemo<LigneAplatie<Ligne>[]>(() => {
    const correspond = (ligne: Ligne) =>
      colonnes.every((colonne) => {
        const filtre = filtres[colonne.cle]?.trim().toLowerCase();
        if (!filtre) return true;
        return (colonne.filtre ? colonne.filtre(ligne) : String(ligne[colonne.cle] ?? ""))
          .toLowerCase()
          .includes(filtre);
      });

    if (!enfants) {
      const filtrees = lignes.filter(correspond);
      const triees = !tri
        ? filtrees
        : [...filtrees].sort((a, b) => {
            const valeurA = a[tri.cle];
            const valeurB = b[tri.cle];
            if (typeof valeurA === "number" && typeof valeurB === "number") {
              return (valeurA - valeurB) * tri.sens;
            }
            return (
              String(valeurA ?? "").localeCompare(String(valeurB ?? ""), "fr", {
                numeric: true,
                sensitivity: "base",
              }) * tri.sens
            );
          });
      return triees.map((ligne, index) => ({
        ligne,
        cle: cleLigne ? cleLigne(ligne) : String(index),
        profondeur: 0,
        aEnfants: false,
        depliee: false,
      }));
    }

    // Mode hiérarchique. Filtre actif : une ligne reste visible si elle-même
    // ou un descendant correspond, chemin déplié d'office — sinon le résultat
    // serait caché sous un pli. Sans filtre : les déplis de la vue font foi.
    const filtreActif = colonnes.some((colonne) => filtres[colonne.cle]?.trim());
    const construire = (
      groupe: Ligne[],
      profondeur: number,
      prefixe: string
    ): { noeuds: LigneAplatie<Ligne>[]; correspondance: boolean } => {
      const noeuds: LigneAplatie<Ligne>[] = [];
      let correspondance = false;
      groupe.forEach((ligne, index) => {
        const cle = cleLigne ? cleLigne(ligne) : `${prefixe}${index}`;
        const gamins = enfants(ligne) ?? [];
        const sous = construire(gamins, profondeur + 1, `${cle}/`);
        const aEnfants = gamins.length > 0;
        if (filtreActif) {
          if (correspond(ligne) || sous.correspondance) {
            noeuds.push({ ligne, cle, profondeur, aEnfants, depliee: true });
            noeuds.push(...sous.noeuds);
            correspondance = true;
          }
        } else {
          const depliee = deplis.has(cle);
          noeuds.push({ ligne, cle, profondeur, aEnfants, depliee });
          if (depliee) noeuds.push(...sous.noeuds);
          correspondance = true;
        }
      });
      return { noeuds, correspondance };
    };
    return construire(lignes, 0, "").noeuds;
  }, [lignes, colonnes, filtres, tri, enfants, cleLigne, deplis]);

  const viderSelection = () => setSelection(new Set());
  const basculerLigne = (ligne: Ligne) =>
    setSelection((actuelle) => {
      const suivante = new Set(actuelle);
      if (suivante.has(ligne)) suivante.delete(ligne);
      else suivante.add(ligne);
      return suivante;
    });
  const toutVisible = lignesVisibles.length > 0 && lignesVisibles.every((noeud) => selection.has(noeud.ligne));
  const basculerTout = () => setSelection(toutVisible ? new Set() : new Set(lignesVisibles.map((n) => n.ligne)));

  // Recalculée depuis `lignes` pour écarter les références devenues obsolètes
  // si les données changent pendant qu'une sélection est en cours.
  const lignesSelectionnees = useMemo(() => lignes.filter((ligne) => selection.has(ligne)), [lignes, selection]);

  const nbColonnes = colonnes.length + (actionsLot ? 1 : 0);

  return (
    <div className="sl-tableau-bloc">
      {exports && (
        <div className="sl-tableau-outils">
          {exports.xlsx !== false && (
            <BoutonExport
              libelle="Exporter .xlsx"
              action={() =>
                exporterXlsx({
                  nomFichier: `${exports.nomFichier}.xlsx`,
                  titre: exports.titre,
                  ...preparerExport(colonnes, lignesVisibles),
                })
              }
            />
          )}
          {exports.png !== false && (
            <BoutonExport
              libelle="Exporter PNG"
              action={() => {
                // La cible est le <table> lui-même : sa largeur de mise en
                // page est la largeur totale. Capturer le conteneur
                // overflow-x rognerait l'image à la fenêtre visible (leçon
                // de l'export PNG d'un compte de résultat).
                const noeud = refTable.current;
                if (!noeud) return Promise.reject(new Error("table absente"));
                return exporterPng({
                  noeud,
                  nomFichier: `${exports.nomFichier}.png`,
                });
              }}
            />
          )}
        </div>
      )}
      <div className={voletsFiges ? "sl-tableau-defilement sl-tableau-defilement--volets" : "sl-tableau-defilement"}>
        {actionsLot && lignesSelectionnees.length > 0 && (
          <div className="sl-tableau-lot">
            <span className="sl-tableau-lot-compte">
              {lignesSelectionnees.length} ligne
              {lignesSelectionnees.length > 1 ? "s" : ""} sélectionnée
              {lignesSelectionnees.length > 1 ? "s" : ""}
            </span>
            <div className="sl-tableau-lot-actions">{actionsLot(lignesSelectionnees, viderSelection)}</div>
            <button type="button" className="sl-tableau-lot-vider" onClick={viderSelection}>
              Tout désélectionner
            </button>
          </div>
        )}
        <table className="sl-tableau" ref={refTable}>
          <thead>
            <tr>
              {actionsLot && (
                <th className="sl-tableau-case">
                  <input
                    type="checkbox"
                    checked={toutVisible}
                    onChange={basculerTout}
                    aria-label="Sélectionner toutes les lignes visibles"
                  />
                </th>
              )}
              {colonnes.map((colonne) => (
                <th
                  key={colonne.cle}
                  className={colonne.figee ? "sl-tableau-figee-droite" : undefined}
                  style={colonne.largeur ? { width: colonne.largeur } : undefined}
                  aria-sort={
                    !hierarchique && tri?.cle === colonne.cle
                      ? tri.sens === 1
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {hierarchique ? (
                    <span className="sl-tableau-entete-fixe">{colonne.titre}</span>
                  ) : (
                    <button type="button" className="sl-tableau-tri" onClick={() => basculerTri(colonne.cle)}>
                      {colonne.titre}
                      <span className="sl-tableau-fleche" aria-hidden>
                        {tri?.cle === colonne.cle ? (tri.sens === 1 ? "▲" : "▼") : ""}
                      </span>
                    </button>
                  )}
                  <Saisie
                    type="search"
                    classeEnveloppe="sl-tableau-filtre"
                    horsProchain
                    placeholder="Filtrer…"
                    value={filtres[colonne.cle] ?? ""}
                    onChange={(evenement) =>
                      ecrireVue(id, {
                        filtres: {
                          ...filtres,
                          [colonne.cle]: evenement.target.value,
                        },
                      })
                    }
                    aria-label={`Filtrer la colonne ${colonne.titre}`}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignesVisibles.length === 0 ? (
              <tr>
                <td className="sl-tableau-vide" colSpan={nbColonnes}>
                  {messageVide}
                </td>
              </tr>
            ) : (
              lignesVisibles.map((noeud) => (
                <tr
                  key={noeud.cle}
                  className={auClicLigne ? "sl-tableau-ligne-cliquable" : undefined}
                  onClick={auClicLigne ? () => auClicLigne(noeud.ligne) : undefined}
                >
                  {actionsLot && (
                    <td
                      className="sl-tableau-case"
                      // La coche ne doit pas déclencher le détail de la ligne.
                      onClick={(evenement) => evenement.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selection.has(noeud.ligne)}
                        onChange={() => basculerLigne(noeud.ligne)}
                        aria-label="Sélectionner la ligne"
                      />
                    </td>
                  )}
                  {colonnes.map((colonne, indexColonne) => {
                    const contenu = colonne.rendu ? colonne.rendu(noeud.ligne) : String(noeud.ligne[colonne.cle] ?? "");
                    return (
                      <td
                        key={colonne.cle}
                        className={
                          [colonne.chiffres && "sl-chiffres", colonne.figee && "sl-tableau-figee-droite"]
                            .filter(Boolean)
                            .join(" ") || undefined
                        }
                      >
                        {hierarchique && indexColonne === 0 ? (
                          <span className="sl-tableau-retrait" style={{ paddingLeft: noeud.profondeur * 18 }}>
                            {noeud.aEnfants ? (
                              <button
                                type="button"
                                className="sl-tableau-depli"
                                aria-expanded={noeud.depliee}
                                aria-label={noeud.depliee ? "Replier la ligne" : "Déplier la ligne"}
                                onClick={(evenement) => {
                                  evenement.stopPropagation();
                                  basculerDepli(noeud.cle);
                                }}
                              >
                                {noeud.depliee ? "▾" : "▸"}
                              </button>
                            ) : (
                              <span className="sl-tableau-depli sl-tableau-depli--vide" aria-hidden />
                            )}
                            {contenu}
                          </span>
                        ) : (
                          contenu
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type EtatExport = "repos" | "encours" | "erreur";

function BoutonExport({ libelle, action }: { libelle: string; action: () => Promise<void> }) {
  const [etat, setEtat] = useState<EtatExport>("repos");
  const lancer = async () => {
    setEtat("encours");
    try {
      await action();
      setEtat("repos");
    } catch {
      setEtat("erreur");
    }
  };
  return (
    <button
      type="button"
      className="sl-tableau-export"
      disabled={etat === "encours"}
      data-erreur={etat === "erreur" || undefined}
      onClick={lancer}
    >
      {etat === "encours" ? "Export en cours…" : etat === "erreur" ? `${libelle} — réessayer` : libelle}
    </button>
  );
}
