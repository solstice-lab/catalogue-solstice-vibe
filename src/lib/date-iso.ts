/*
 * Validation d'une date « aaaa-mm-jj », dans le socle parce que tous les
 * modules métier qui saisissent une date la partagent. Elle vivait dans le
 * domaine du premier module de test du catalogue : retirer ce module d'une
 * copie client cassait quatre fichiers qui n'avaient rien à voir avec lui.
 */

// « aaaa-mm-jj » ET présente au calendrier : un 31 juin passerait le motif,
// puis ferait planter l'enregistrement en base.
export function estDateIso(valeur: string): boolean {
  const correspondance = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
  if (!correspondance) return false;
  const [, annee, mois, jour] = correspondance.map(Number);
  const date = new Date(Date.UTC(annee, mois - 1, jour));
  return date.getUTCFullYear() === annee && date.getUTCMonth() === mois - 1 && date.getUTCDate() === jour;
}
