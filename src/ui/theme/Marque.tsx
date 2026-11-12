import type { ReactNode } from "react";
import { Embleme } from "../Embleme";

/*
 * La marque de l'en-tête — partie du contrat de thème, comme tokens.css.
 *
 * C'est la seule chose à changer pour mettre le logo du client en tête de
 * l'en-tête (AppLayout et PageVitrine la lisent ici, aucun composant ne se
 * retouche). Elle s'affiche dans une cellule sur l'aplat --couleur-accent,
 * haute de 26 px, qui passe en --couleur-structure au survol.
 *
 * - Par défaut : l'emblème Solstice Lab, pour les applis de l'agence et les
 *   clients sans charte. Il prend la couleur du texte (currentColor), donc
 *   celles des tokens.
 * - Un logo client en SVG : coller son <svg> à la place, avec
 *   fill="currentColor" pour qu'il suive les couleurs du thème (au survol
 *   compris), ou ses propres couleurs.
 * - Un logo client en image : le déposer dans public/ et écrire
 *   <img src="/logo.svg" alt="" /> (alt vide : le lien qui l'entoure porte
 *   déjà son nom). Une image garde ses couleurs, même sur la cellule
 *   survolée.
 * - Aucune marque : écrire `null`. La cellule disparaît, le nom de l'appli
 *   ouvre l'en-tête.
 *
 * La signature Solstice Lab du pied de page ne dépend pas de ce fichier : elle
 * garde l'emblème de l'agence (CLAUDE.md §1, et sa propre procédure de retrait
 * dans la skill creer-appli).
 */
export const MARQUE: ReactNode = <Embleme />;
