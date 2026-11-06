import { ESPACES } from "@/config/espaces";
import { monEspace } from "./acces";
import { majuscule } from "./reglages";

/*
 * L'entrée de l'accueil d'une appli à espaces : l'espace de la personne
 * (« Ma coloc ») si elle en a un, sinon le moyen d'en créer ou d'en rejoindre
 * un. Cas d'origine : l'essai tours-de-coloc a montré son onglet « Ma coloc » à
 * côté d'un accueil vide, et une personne qui arrive sans espace ne sait pas
 * qu'il faut commencer par là. Serveur seulement : l'espace se relit en base.
 */

export type EntreeEspace = { libelle: string; href: string };

export async function entreeDeLEspace(): Promise<EntreeEspace> {
  if (await monEspace()) return { libelle: majuscule(ESPACES.vocabulaire.mon), href: "/espace" };
  return { libelle: "Créer ou rejoindre", href: "/espace/rejoindre" };
}
