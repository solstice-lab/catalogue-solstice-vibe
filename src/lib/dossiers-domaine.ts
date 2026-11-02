/*
 * Domaine « dossiers » : types, statuts et conversions PURS — importables
 * aussi bien par les composants client que par le code serveur. L'accès à la
 * base vit dans db/dossiers.ts, qui tire le pilote pg : l'importer depuis un
 * composant client embarquerait pg dans le bundle navigateur.
 */

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
