import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import type { Branchement } from "./branchement";
import { ErreurLot, confirmerLot, ignorerLot, lireLot, supprimerLot, type Lot } from "./lot";
import { cheminDe, estIdentifiantDeLot, textesDe, type RetourGeste } from "./presentation";

/*
 * Le corps des gestes sur un lot, que l'appli enveloppe dans ses server
 * actions APRÈS son garde de droits (briques/comptes/roles.ts) : la brique ne connaît pas
 * les droits, et une server action se poste sans passer par l'écran. Chaque
 * geste nomme le branchement : un identifiant de lot d'une autre entité n'est
 * pas reconnu. Serveur seulement.
 */

const LOT_INTROUVABLE: RetourGeste = { reussite: false, message: "Lot introuvable." };

// Ce que l'écran doit dire d'un refus de la brique ou de l'appli : un message.
// Le reste remonte. `chemins` : ce que le geste change, et rien d'autre. Un
// chemin de trop coûte une page rendue pour rien ; surtout, revalider la page
// d'un lot qu'on vient de supprimer la fait rendre en 404 avant la redirection
// de l'écran.
async function enRetour(
  branchement: Branchement,
  chemins: string[],
  operation: () => Promise<string>
): Promise<RetourGeste> {
  try {
    const message = await operation();
    for (const chemin of chemins) revalidatePath(chemin);
    return { reussite: true, message };
  } catch (erreur) {
    // Les messages de la brique disent eux-mêmes ce qu'il en est du lot
    // (« déjà confirmé », « rien n'a été écrit ») ; ceux de l'appli passent
    // par sa traduction (fournisseur introuvable, référence prise au même instant).
    if (erreur instanceof ErreurLot) return { reussite: false, message: erreur.message };
    const message = branchement.ecran?.refus?.(erreur) ?? null;
    if (message !== null) return { reussite: false, message };
    throw erreur;
  }
}

export async function actionConfirmer(branchement: Branchement, lotId: number): Promise<RetourGeste> {
  if (!estIdentifiantDeLot(String(lotId))) return LOT_INTROUVABLE;
  const chemin = cheminDe(branchement);
  const { rapport: phrase } = textesDe(branchement);
  // Seule la confirmation écrit dans l'entité : ses pages se revalident aussi.
  const chemins = [chemin, `${chemin}/${lotId}`, ...(branchement.ecran?.cheminsEcrits ?? [])];
  return enRetour(branchement, chemins, async () => {
    const { dejaConfirme, rapport } = await confirmerLot(branchement, lotId);
    return dejaConfirme
      ? `Ce lot était déjà confirmé : rien n'a été écrit de plus. ${phrase(rapport)}.`
      : `Lot confirmé : ${phrase(rapport)}.`;
  });
}

export async function actionIgnorer(branchement: Branchement, lotId: number): Promise<RetourGeste> {
  if (!estIdentifiantDeLot(String(lotId))) return LOT_INTROUVABLE;
  const chemin = cheminDe(branchement);
  return enRetour(branchement, [chemin, `${chemin}/${lotId}`], async () => {
    await ignorerLot(lotId, branchement.id);
    return `Lot ignoré : ${textesDe(branchement).rienEcrit}.`;
  });
}

// Supprime le lot et ses lignes, jamais ce qu'il a écrit : le retirer est un
// geste de la liste de l'entité, pas de l'import (leçon d'une appli livrée).
export async function actionSupprimer(branchement: Branchement, lotId: number): Promise<RetourGeste> {
  if (!estIdentifiantDeLot(String(lotId))) return LOT_INTROUVABLE;
  return enRetour(branchement, [cheminDe(branchement)], async () => {
    await supprimerLot(lotId, branchement.id);
    return `Lot supprimé. ${textesDe(branchement).ecritsRestent}`;
  });
}

// Le lot de la page `${chemin}/<id>`, ou un 404 : pour un identifiant
// illisible, un lot qui n'existe pas ou celui d'une autre entité (lireLot
// nomme le branchement), comme pour un membre que le garde de l'appli refuse.
export async function lotDeLaPage(branchement: Branchement, id: string): Promise<Lot> {
  if (!estIdentifiantDeLot(id)) notFound();
  const lot = await lireLot(Number(id), branchement.id);
  if (!lot) notFound();
  return lot;
}
