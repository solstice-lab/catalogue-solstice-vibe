/*
 * Cookies d'une requête simulée. Le code qui lit un cookie (la session de la
 * brique comptes) passe par `cookies()` de next/headers, qui n'existe que dans une
 * requête : hors requête, les tests qui appellent une server action
 * plantaient tous. tests/setup.ts simule next/headers sur ce stockage, et un
 * test qui joue un autre rôle l'écrit ici.
 */
export const cookiesDeTest = new Map<string, string>();

// Les en-têtes de la même requête simulée (`headers()`), vides par défaut :
// la connexion par code y lit l'adresse IP du visiteur.
export const enTetesDeTest = new Headers();
