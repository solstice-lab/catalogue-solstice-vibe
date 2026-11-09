import { NextResponse, type NextRequest } from "next/server";
import { nomDuCookie, verifierSignature } from "./jeton";
import {
  refuserDesDureesDeSessionInvalides,
  refuserDesLimitesParReseauInvalides,
  refuserLaDemoEnProduction,
  refuserLaProductionSansEnTeteIp,
  refuserUneEntreeOuverteQuiAdministre,
} from "./methodes";

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

// Les routes que le catalogue sert pour lui-même et jamais en production : la
// vitrine du kit, sur des données fictives. Ses pages n'ont pas de garde par
// exiger(), et le proxy ne lit pas la base : un cookie bien signé dont la
// session était révoquée l'ouvrait en production, avec le menu entier de
// l'appli (audit du 2026-11-09). Elles répondent 404, comme si elles
// n'existaient pas, sans qu'on touche à leurs pages. L'assembleur retire la
// vitrine de toute appli, et sa ligne ici avec elle : la liste ne vaut que
// pour le catalogue hébergé.
const ROUTES_HORS_PRODUCTION: readonly string[] = [
  // La vitrine du kit et sa page de site vitrine.
  "/kit",
];

function correspond(chemin: string, routes: readonly string[]): boolean {
  return routes.some((route) => chemin === route || chemin.startsWith(`${route}/`));
}

// Le chemin tel que le routeur le lit : encodé, il échappait à la liste des
// routes hors production. Les routes ouvertes, elles, se comparent encodées :
// un chemin encodé n'y entre pas, il part vers /connexion, du côté sûr.
function decode(chemin: string): string {
  try {
    return decodeURIComponent(chemin);
  } catch {
    return chemin;
  }
}

export function estOuverte(chemin: string): boolean {
  return correspond(chemin, ROUTES_OUVERTES);
}

// La redirection vers /connexion (ou le 404 d'une route hors production), ou
// null quand la requête passe. Ni l'une ni l'autre n'exécute de script : elles
// n'ont pas besoin de la CSP.
export function protegerLaRoute(requete: NextRequest): NextResponse | null {
  refuserLaDemoEnProduction();
  refuserLaProductionSansEnTeteIp();
  refuserUneEntreeOuverteQuiAdministre();
  refuserDesLimitesParReseauInvalides();
  refuserDesDureesDeSessionInvalides();
  if (process.env.NODE_ENV === "production" && correspond(decode(requete.nextUrl.pathname), ROUTES_HORS_PRODUCTION)) {
    return new NextResponse(null, { status: 404 });
  }
  if (estOuverte(requete.nextUrl.pathname)) return null;
  if (verifierSignature(requete.cookies.get(nomDuCookie())?.value)) return null;
  const connexion = new URL("/connexion", requete.url);
  const retour = requete.nextUrl.pathname + requete.nextUrl.search;
  if (retour !== "/") connexion.searchParams.set("retour", retour);
  return NextResponse.redirect(connexion);
}
