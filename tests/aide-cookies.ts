/*
 * Cookies d'une requête simulée. Le code qui lit un cookie (la session de la
 * brique comptes) passe par `cookies()` de next/headers, qui n'existe que dans une
 * requête : hors requête, les tests qui appellent une server action
 * plantaient tous. tests/setup.ts simule next/headers sur ce stockage, et un
 * test qui joue un autre rôle l'écrit ici.
 */
export const cookiesDeTest = new Map<string, string>();

// Les attributs avec lesquels chaque cookie a été posé ou retiré (HttpOnly,
// Secure, SameSite, chemin, durée) : l'audit du 2026-11-09 a relevé que rien
// ne les vérifiait, alors qu'un navigateur refuse un cookie __Host- sans Secure.
export const attributsDesCookiesDeTest = new Map<string, Record<string, unknown>>();

// Les en-têtes de la même requête simulée (`headers()`), vides par défaut :
// la connexion par code y lit l'adresse IP du visiteur.
export const enTetesDeTest = new Headers();
