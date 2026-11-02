/*
 * Le chemin où revenir après la connexion (/connexion?retour=…). Piège repris
 * d'un projet précédent : un retour non filtré renvoie, une fois
 * connecté, vers un site tiers qui imite l'appli. Seul un chemin de l'appli
 * passe ; tout le reste renvoie à l'accueil.
 */

const CONTROLE = /[\u0000-\u001f\u007f]/;
const ORIGINE_FICTIVE = "http://origine.invalid";

export function cheminDeRetour(valeur: string | null | undefined): string {
  if (!valeur || CONTROLE.test(valeur) || valeur.includes("\\")) return "/";
  // « //site » et « /\site » sont des adresses d'un autre site pour un navigateur.
  if (!valeur.startsWith("/") || valeur.startsWith("//")) return "/";
  // La même chose, encodée : %2F%2F, %5C, %0A…
  let decode: string;
  try {
    decode = decodeURIComponent(valeur);
  } catch {
    return "/";
  }
  if (CONTROLE.test(decode) || decode.includes("\\") || decode.startsWith("//")) return "/";
  // Dernier rempart : résolue, l'adresse reste sur l'appli, et ne commence pas
  // par « // ». L'URL résout « . » et « .. » (y compris %2e) : « /.//site »
  // passait tout ce qui précède et devenait « //site ».
  const url = new URL(valeur, ORIGINE_FICTIVE);
  if (url.origin !== ORIGINE_FICTIVE || url.pathname.startsWith("//")) return "/";
  return url.pathname + url.search;
}
