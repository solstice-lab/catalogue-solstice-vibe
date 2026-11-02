import type { transaction } from "@/lib/db/client";

/*
 * Le branchement : ce que l'appli déclare pour poser la brique sur ses
 * propositions. La brique ne connaît aucune table métier ni aucun rôle ; tout
 * ce qu'elle sait d'un type de proposition passe par ici (voir README.md).
 */

// La personne qui décide, telle que la session de l'appli la donne. Un type
// structurel plutôt que `Utilisateur` de briques/comptes/roles.ts : la brique n'importe
// pas les rôles de l'appli. Seul l'e-mail est exigé ; les autres champs (le
// rôle) passent tels quels à `peutDecider` et aux applicateurs.
export type Decideur = { email: string };

// Le contenu d'une proposition est opaque pour la brique : elle vérifie
// seulement que c'est un objet, sa forme se vérifie côté appli (README,
// « Questions ouvertes »).
export type Contenu = Record<string, unknown>;

// Ce que reçoivent la revérification et l'applicateur : la transaction de
// l'acceptation, pour que l'effet et le changement de statut soient une seule
// écriture. Dérivé de `transaction()`, comme dans la brique journal : un
// client qui gagnerait une méthode la donne aussitôt aux applicateurs.
export type Transaction = Parameters<Parameters<typeof transaction>[0]>[0];

export type Reverification = { valide: true } | { valide: false; motif: string };

export type TypeProposition = {
  libelle: string;
  // Une ligne de texte pour la file (nom du contact, objet de la demande).
  rendu: (contenu: Contenu) => string;
  // Rejouée à CHAQUE acceptation : une proposition restée longtemps en
  // attente peut ne plus valoir (un « nouveau contact » créé entre-
  // temps l'aurait été en double). Obligatoire : un type sans appariement
  // répond `{ valide: true }` explicitement, il ne l'oublie pas.
  reverifier: (contenu: Contenu, tx: Transaction) => Promise<Reverification>;
  // L'effet de l'acceptation. S'il lève, la proposition reste en attente.
  appliquer: (contenu: Contenu, tx: Transaction, decideur: Decideur) => Promise<void>;
};

export type Branchement = {
  // Stable et unique dans l'appli.
  id: string;
  // Un type par sorte de proposition ; la clé est le `type` stocké en base.
  types: Record<string, TypeProposition>;
  // Clé de groupement : les propositions d'une même source se présentent
  // ensemble. Absente ou `null` : la proposition n'est dans aucun groupe.
  groupe?: (type: string, contenu: Contenu) => string | null;
  // Au-delà de ce nombre de propositions, une décision en lot exige une
  // confirmation explicite.
  seuilLot: number;
  // Seconde ligne de défense : le garde de la page et de la server action,
  // de briques/comptes/roles.ts, passe d'abord. La brique ne connaît aucun rôle. Peut
  // rendre une promesse : une appli qui relit le rôle en base à chaque
  // requête ne le connaît pas d'avance.
  peutDecider: (decideur: Decideur) => boolean | Promise<boolean>;
};

// Les noms de type entrent en clé de la file : seuls des identifiants simples
// passent, et une faute de frappe dans un branchement casse fort.
const IDENTIFIANT = /^[a-z_][a-z0-9_]*$/;

export function verifierBranchement(branchement: Branchement): void {
  const types = Object.keys(branchement.types);
  if (types.length === 0) {
    throw new Error(`Branchement « ${branchement.id} » : au moins un type de proposition est requis.`);
  }
  for (const type of types) {
    if (!IDENTIFIANT.test(type)) {
      throw new Error(`Branchement « ${branchement.id} » : « ${type} » n'est pas un identifiant simple.`);
    }
    const declaration = branchement.types[type];
    if (typeof declaration.reverifier !== "function" || typeof declaration.appliquer !== "function") {
      throw new Error(`Branchement « ${branchement.id} » : le type « ${type} » doit déclarer reverifier et appliquer.`);
    }
  }
  if (!Number.isInteger(branchement.seuilLot) || branchement.seuilLot < 1) {
    throw new Error(`Branchement « ${branchement.id} » : le seuil de lot doit être un nombre entier, au moins 1.`);
  }
  if (typeof branchement.peutDecider !== "function") {
    throw new Error(`Branchement « ${branchement.id} » : peutDecider est requis.`);
  }
}
