/*
 * Le code d'invitation d'un espace, en calcul pur : importable côté client.
 * Tirer un code se fait côté serveur (espaces.ts), au hasard de node:crypto.
 *
 * Il se dicte au téléphone et se recopie d'un écran : aucun caractère qui se
 * confond avec un autre (ni 0 ni O, ni 1, I ni L). La base refuse tout autre
 * caractère (contrainte espaces_code_check). Huit caractères parmi 31 : plus de
 * 850 milliards de codes, et les codes faux sont plafonnés par compte.
 */

export const ALPHABET_CODE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const LONGUEUR_CODE = 8;

const CODE = new RegExp(`^[${ALPHABET_CODE}]{${LONGUEUR_CODE}}$`);

// La saisie, sans casse, espaces ni tirets ; null si ce n'est pas un code. Rien
// n'est deviné : un « O » ne devient pas un « 0 », aucun des deux n'existe.
export function normaliserCode(saisie: string): string | null {
  const code = saisie.toUpperCase().replace(/[\s-]/g, "");
  return CODE.test(code) ? code : null;
}

// « ABCD-EFGH » : deux groupes se lisent et se recopient mieux qu'un bloc.
export function afficherCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

// Le lien qui ouvre « Créer ou rejoindre » avec le code prérempli.
export function lienPourRejoindre(site: URL, code: string): string {
  const lien = new URL("/espace/rejoindre", site);
  lien.searchParams.set("code", afficherCode(code));
  return lien.href;
}
