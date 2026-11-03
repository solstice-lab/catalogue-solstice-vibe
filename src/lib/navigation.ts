import type { LienNavigation } from "@/ui";
import { visiblePour } from "@/briques/comptes/roles";
import { majuscule } from "@/briques/espaces/reglages";
import { ESPACES } from "@/config/espaces";

// Le garde d'affichage d'une entrée : la MÊME action que celle que la page
// exige en première ligne (briques/comptes/roles.ts), jamais une règle recopiée ici — un
// menu et une page qui divergent, c'est un lien qui mène à « Page
// introuvable » (relevé en recette : un membre voyait « Demandes à décider »
// et « Importer »). Resserrer DROITS dans src/config/acces.ts retire l'entrée
// du menu sans autre changement.
//
// La navigation vit en UN seul endroit : chaque écran d'outil la passe à
// AppLayout, qui ne propose que les entrées dont le garde ouvre à la personne
// courante (une page vitrine a ses propres liens, publics et sans garde). Une
// entrée masquée ne protège rien (voir briques/comptes/roles.ts) — retirer un lien n'est
// jamais une mesure de sécurité, seulement de lisibilité. Toute entrée, hors
// l'accueil, déclare son garde (tests/navigation.test.ts le verrouille).
export const NAVIGATION: LienNavigation[] = [
  { libelle: "Accueil", href: "/" },
  { libelle: "Dossiers", href: "/dossiers", visible: visiblePour("dossiers.acceder") },
  { libelle: "Mes données", href: "/mes-donnees", visible: visiblePour("mes-donnees.exporter") },
  { libelle: "Données personnelles", href: "/donnees-personnelles", visible: visiblePour("donnees.exporter") },
  { libelle: "Journal", href: "/journal", visible: visiblePour("journal.consulter") },
  { libelle: "Comptes", href: "/comptes", visible: visiblePour("comptes.administrer") },
  { libelle: majuscule(ESPACES.vocabulaire.mon), href: "/espace", visible: visiblePour("espaces.participer") },
];

export const NOM_APP = "NOM_APP"; // à remplacer à la mise en route du projet
