import { NextResponse, type NextRequest } from "next/server";
import { protegerLaRoute } from "@/briques/comptes/protection";

/*
 * Content-Security-Policy à nonce. Mesure faite sur un build
 * Next 16 : chaque page porte 8 à 13 scripts en ligne (données du rendu
 * serveur, streaming React). Sans nonce, il faudrait 'unsafe-inline' pour les
 * scripts, et un script injecté s'exécuterait comme ceux de Next. Next lit le
 * nonce dans la CSP de la REQUÊTE et l'appose lui-même sur ses scripts ; il
 * faut pour cela que la page soit rendue à chaque requête (voir connection()
 * dans app/layout.tsx).
 */
function politiqueDeContenu(nonce: string): string {
  // React se sert d'eval en développement pour reconstituer les traces
  // d'erreur du serveur ; la production n'en a pas besoin.
  const evalDeDeveloppement = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${evalDeDeveloppement}`,
    // 'unsafe-inline' gardé pour les styles : le HTML rendu porte des
    // attributs style="" (largeur des colonnes de Tableau, kit, pages
    // d'erreur), qu'un nonce ne couvre pas. Une injection de style ne lance
    // pas de code.
    "style-src 'self' 'unsafe-inline'",
    // data: et blob: : l'export PNG d'un Tableau fabrique une image data:,
    // l'export xlsx se télécharge par une URL blob:.
    "img-src 'self' data: blob:",
    // next/font/local sert les polices du dépôt depuis l'appli elle-même
    // (_next/static/media) : aucune requête vers Google, au build comme à la visite.
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Pas d'upgrade-insecure-requests : toutes les ressources viennent de
    // l'appli, HSTS couvre la production, et la directive casserait
    // `npm start` servi en http://localhost.
  ].join("; ");
}

export function proxy(requete: NextRequest): NextResponse {
  // Brique comptes : sans session, la requête part vers /connexion. Une
  // redirection n'exécute aucun script, elle n'a pas besoin de la CSP.
  const refus = protegerLaRoute(requete);
  if (refus) return refus;
  // Fin de la brique comptes.
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const csp = politiqueDeContenu(nonce);

  const enTetesRequete = new Headers(requete.headers);
  enTetesRequete.set("Content-Security-Policy", csp);
  const reponse = NextResponse.next({ request: { headers: enTetesRequete } });
  reponse.headers.set("Content-Security-Policy", csp);
  return reponse;
}

// Les fichiers statiques n'exécutent aucun script de la page : un nonce n'y
// servirait à rien. Les préchargements de next/link passent, eux, par le
// proxy : ils étaient sautés sur la foi d'un en-tête que n'importe qui pose à
// la main, et une protection des routes branchée ici ne doit pas l'être.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
