import { NextResponse, type NextRequest } from "next/server";
import { nomDuCookie, verifierSignature } from "./jeton";
import { refuserLaDemoEnProduction } from "./methodes";

/*
 * Tout protégé par défaut, depuis src/proxy.ts, le seul proxy
 * de l'appli. Jamais un middleware.ts à côté : les deux ensemble font planter
 * Next en silence (cicatrice d'un projet précédent).
 *
 * Le proxy ne vérifie que la signature du cookie, sans lire la base : Next le
 * fait tourner sur chaque requête, préchargements compris (sa documentation,
 * « Optimistic checks with Proxy »). La vérification sûre (session en base,
 * compte actif, rôle) se fait à chaque page par exiger().
 */

// Les seules routes ouvertes sans session, chacune pour une raison :
// /connexion pour se connecter (et ses sous-chemins, ceux des méthodes),
// /sante pour la sonde de l'hébergeur, /mentions-legales et
// /confidentialite par obligation légale. Les quatre suivantes, pour les robots : un
// moteur ou un réseau social redirigé vers /connexion ne lirait ni les règles
// d'indexation, ni le plan du site, ni l'image de l'aperçu. Une page du
// sitemap (pagesPubliques de src/lib/referencement.ts) s'ajoute ici aussi, et
// à OUVERTS de tests/gardes-acces.test.ts.
// Une ligne par route : une brique qui en ouvre une l'ajoute, et l'assembleur
// la retire quand la brique part.
export const ROUTES_OUVERTES = [
  "/connexion",
  "/sante",
  "/mentions-legales",
  "/confidentialite",
  "/robots.txt",
  "/sitemap.xml",
  "/opengraph-image",
  "/twitter-image",
  // Brique contact : le formulaire public d'une vitrine.
  "/contact",
] as const;

export function estOuverte(chemin: string): boolean {
  return ROUTES_OUVERTES.some((ouverte) => chemin === ouverte || chemin.startsWith(`${ouverte}/`));
}

// La redirection vers /connexion, ou null quand la requête passe. Une
// redirection n'exécute aucun script : elle n'a pas besoin de la CSP.
export function protegerLaRoute(requete: NextRequest): NextResponse | null {
  refuserLaDemoEnProduction();
  if (estOuverte(requete.nextUrl.pathname)) return null;
  if (verifierSignature(requete.cookies.get(nomDuCookie())?.value)) return null;
  const connexion = new URL("/connexion", requete.url);
  const retour = requete.nextUrl.pathname + requete.nextUrl.search;
  if (retour !== "/") connexion.searchParams.set("retour", retour);
  return NextResponse.redirect(connexion);
}
