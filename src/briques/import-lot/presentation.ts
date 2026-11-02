import { ENTIER_MAX } from "@/lib/db/bornes";
import { date } from "@/lib/format";
import type { Branchement, ColonneEcran, TextesEcran } from "./branchement";
import type { Lot, RapportConfirmation } from "./lot";

/*
 * Ce que les écrans de la brique montrent, en calcul pur : importable par les
 * composants client comme par le serveur. Les fonctions du branchement
 * (`affichage`, `rapport`) s'appellent ici, sur le serveur : elles ne
 * traversent pas la frontière client, seules les chaînes qu'elles rendent.
 */

// Ce que les gestes rendent à l'écran : un message, pas la page d'erreur. Le
// reste (base indisponible…) est une vraie panne et remonte.
export type RetourGeste = { reussite: boolean; message: string };

const TIRET = "—";

// Un identifiant posté à la main au-delà de l'INTEGER ferait planter la
// requête : il vaut « Lot introuvable », comme un lot qui n'existe pas.
export function estIdentifiantDeLot(saisie: string): boolean {
  return /^\d+$/.test(saisie) && Number(saisie) <= ENTIER_MAX;
}

// Sans `ecran`, un geste saurait écrire mais pas quelles pages revalider :
// mieux vaut casser fort que laisser une liste périmée (verifierEcran le dit
// à la première page ouverte).
export function cheminDe(branchement: Branchement): string {
  if (!branchement.ecran)
    throw new Error(`Branchement « ${branchement.id} » : réglage « ecran » absent, chemin inconnu.`);
  return branchement.ecran.chemin;
}

function nombreDe(nombre: number, singulier: string, pluriel: string): string {
  return `${nombre} ${nombre > 1 ? pluriel : singulier}`;
}

// Neutres : ils parlent de lignes, jamais d'une entité qu'ils ne connaissent pas.
const TEXTES_PAR_DEFAUT: TextesEcran = {
  fichier: "Fichier à importer",
  dansLEntite: "dans l'application",
  ecriture: "créées ou mises à jour.",
  ecritsRestent: "Ce qu'il a déjà écrit reste en place.",
  rienEcrit: "rien n'a été écrit",
  aucuneFusion: "Aucune ligne du fichier n'a été fusionnée avec une autre.",
  rapport: (rapport: RapportConfirmation) =>
    [
      nombreDe(rapport.creees, "ligne créée", "lignes créées"),
      nombreDe(rapport.mises_a_jour, "mise à jour", "mises à jour"),
      nombreDe(rapport.inchangees, "inchangée", "inchangées"),
    ].join(", "),
};

export function textesDe(branchement: Branchement): TextesEcran {
  return { ...TEXTES_PAR_DEFAUT, ...branchement.ecran?.textes };
}

// Le statut d'un lot (en attente, confirmé, ignoré) tel que l'écran le dit. Un
// statut que la brique n'a pas prévu s'affiche tel quel, en rouge : il ne doit
// jamais passer pour un état sain.
export function libelleStatutLot(statut: string): {
  libelle: string;
  ton: "accent" | "positif" | "neutre" | "negatif";
} {
  if (statut === "en_attente") return { libelle: "En attente", ton: "accent" };
  if (statut === "confirme") return { libelle: "Confirmé", ton: "positif" };
  if (statut === "ignore") return { libelle: "Ignoré", ton: "neutre" };
  return { libelle: statut, ton: "negatif" };
}

// Ce que la fenêtre de confirmation dit des lignes écartées. L'accord doit
// suivre le nombre jusqu'au bout de la phrase : « 1 ligne écartée … elles
// restent » a été relevé en recette.
export function phraseLignesEcartees(nombre: number): string {
  return nombre > 1
    ? `${nombre} lignes écartées ne seront pas importées : elles restent listées sur cette page.`
    : `${nombre} ligne écartée ne sera pas importée : elle reste listée sur cette page.`;
}

/** Une colonne des lignes retenues, telle que le tableau (côté client) la reçoit. */
export type ColonneAffichee = { cle: string; titre: string; chiffres: boolean; largeur?: string };

/**
 * Une ligne retenue telle que le tableau la reçoit : `v:<champ>` porte la
 * valeur du lot (le tri), `a:<champ>` ce que l'écran montre (la cellule et le
 * filtre). Préfixés pour qu'un champ nommé « id » ou « ligne » ne recouvre pas
 * les colonnes de la brique.
 */
export type LigneAffichee = Record<string, string | number | null>;

export type FusionAffichee = { cle: string; lignes: string; conflits: string };

function colonnesDeclarees(branchement: Branchement) {
  const declarees: ColonneEcran[] =
    branchement.ecran?.colonnes ?? branchement.champs.map((champ) => ({ champ: champ.champ }));
  return declarees.map((colonne) => ({
    ...colonne,
    definition: branchement.champs.find((c) => c.champ === colonne.champ)!,
  }));
}

export function colonnesRetenues(branchement: Branchement): ColonneAffichee[] {
  return colonnesDeclarees(branchement).map(({ champ, titre, largeur, definition }) => ({
    cle: `v:${champ}`,
    titre: titre ?? definition.entetes[0],
    // Une date « aaaa-mm-jj » et un nombre s'alignent en chiffres.
    chiffres: definition.type !== "texte",
    ...(largeur ? { largeur } : {}),
  }));
}

export function lignesRetenues(branchement: Branchement, lot: Lot): LigneAffichee[] {
  const colonnes = colonnesDeclarees(branchement);
  return lot.lignes.map((ligne) => {
    // Une ligne fusionnée porte tous ses numéros : aucun ne disparaît.
    const affichee: LigneAffichee = { id: ligne.id, ligne: ligne.numeros.join(", "), numero: ligne.numero };
    for (const { champ, affichage, definition } of colonnes) {
      const valeur = ligne.valeurs[champ] ?? null;
      affichee[`v:${champ}`] = valeur;
      affichee[`a:${champ}`] =
        valeur === null || valeur === ""
          ? TIRET
          : affichage
            ? affichage(valeur)
            : definition.type === "date"
              ? date(String(valeur))
              : String(valeur);
    }
    return affichee;
  });
}

// Le titre de la colonne des clés fusionnées : celui de la colonne de la clé
// (« Référence »), ou de ses colonnes s'il y en a plusieurs.
export function titreDeLaCle(branchement: Branchement): string {
  const titres = colonnesRetenues(branchement);
  return (branchement.cle ?? [])
    .map(
      (champ) =>
        titres.find((colonne) => colonne.cle === `v:${champ}`)?.titre ??
        branchement.champs.find((c) => c.champ === champ)!.entetes[0]
    )
    .join(" / ");
}

export function fusionsAffichees(lot: Lot): FusionAffichee[] {
  return lot.fusions.map((fusion) => ({
    cle: fusion.cle,
    lignes: fusion.numeros.join(", "),
    conflits:
      fusion.conflits.length === 0
        ? TIRET
        : fusion.conflits.map((c) => `${c.champ} : ${c.retenue} / ${c.ecartee}`).join(" ; "),
  }));
}
