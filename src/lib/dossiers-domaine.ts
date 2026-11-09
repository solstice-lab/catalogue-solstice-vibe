/*
 * Domaine « dossiers » : types, statuts et conversions PURS — importables
 * aussi bien par les composants client que par le code serveur. L'accès à la
 * base vit dans db/dossiers.ts, qui tire le pilote pg : l'importer depuis un
 * composant client embarquerait pg dans le bundle navigateur.
 */

import { ENTIER_MAX } from "@/lib/db/bornes";

// Ce que l'on peut faire d'un dossier, déclaré sans parler de rôles : qui le
// peut se dit dans src/config/acces.ts. Une seule action pour lire et
// écrire : le patron est ouvert à qui y accède.
export const ACTIONS_DOSSIERS = ["dossiers.acceder"] as const;

export const STATUTS_DOSSIER = ["en_cours", "gagne", "perdu"] as const;
export type StatutDossier = (typeof STATUTS_DOSSIER)[number];

export const LIBELLES_STATUT_DOSSIER: Record<StatutDossier, string> = {
  en_cours: "En cours",
  gagne: "Gagné",
  perdu: "Perdu",
};

export type Dossier = {
  id: number;
  reference: string;
  client: string;
  montant_centimes: number;
  statut: StatutDossier;
  echeance: string | null;
  notes: string | null;
};

// Les BORNES du patron : ce que la base ne dit pas (un TEXT n'a pas de limite) ou
// dit en levant une erreur (INTEGER, DATE). Un module copié garde ce bloc et le règle
// sur ses champs : le formulaire pose les mêmes longueurs en maxLength, la
// validation serveur les refuse avec un message d'écran.
export const LONGUEUR_MAX_DOSSIER = { reference: 100, client: 200, notes: 5000 } as const;

// Un id lu dans une URL ou posté à la main : au-delà de l'INTEGER de la base, elle
// lèverait (« out of range ») au lieu de ne rien trouver.
export function estIdDossier(valeur: unknown): valeur is number {
  return typeof valeur === "number" && Number.isInteger(valeur) && valeur >= 1 && valeur <= ENTIER_MAX;
}

export function estStatutDossier(valeur: string): valeur is StatutDossier {
  return (STATUTS_DOSSIER as readonly string[]).includes(valeur);
}

// Saisie « 12 500,50 » ou « 12500.5 » -> 1250050 centimes. Les montants se
// STOCKENT en centimes entiers (voir schema.sql) ; la conversion vit ici pour
// être la même au formulaire et à l'import.
export function eurosSaisisVersCentimes(saisie: string): number | null {
  const normalisee = saisie.replace(/[\s ]/g, "").replace(",", ".");
  if (normalisee === "" || !/^-?\d+(\.\d{1,2})?$/.test(normalisee)) return null;
  return Math.round(parseFloat(normalisee) * 100);
}

export function centimesVersEurosSaisie(centimes: number): string {
  return (centimes / 100).toFixed(2).replace(".", ",");
}
