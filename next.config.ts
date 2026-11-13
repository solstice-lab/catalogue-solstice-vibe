import type { NextConfig } from "next";
import { originesDuCodespace } from "./src/lib/codespaces";

/*
 * En-têtes de sécurité de toutes les routes. La
 * Content-Security-Policy n'est pas ici : elle porte un nonce tiré à chaque
 * requête, que seul src/proxy.ts peut produire.
 */
const config: NextConfig = {
  // X-Powered-By n'apprend rien à l'utilisateur, seulement à qui cherche une
  // faille connue d'une version de Next.js.
  poweredByHeader: false,

  // Vide partout, sauf dans un Codespace hors production : son proxy transmet
  // une origine que Next refusait, et aucun formulaire ne passait (essai du
  // 2026-11-13, src/lib/codespaces.ts).
  experimental: {
    serverActions: { allowedOrigins: originesDuCodespace() },
  },

  async headers() {
    const enTetes = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        // Fonctions du navigateur dont l'appli n'a pas l'usage. Une brique
        // qui en a besoin (paiement, par exemple) rouvre la sienne ici.
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
      },
      // Doublon voulu de frame-ancestors 'none' (CSP) : les anciens
      // navigateurs ne lisent que celui-ci.
      { key: "X-Frame-Options", value: "DENY" },
    ];
    // Production seulement : en local, le navigateur retiendrait localhost
    // comme HTTPS-only pendant deux ans. Ni includeSubDomains ni preload :
    // servie à la racine du domaine du client, l'appli imposerait HTTPS à
    // tous ses sous-domaines, qu'elle ne connaît pas. À lui d'en décider.
    if (process.env.NODE_ENV === "production") {
      enTetes.push({ key: "Strict-Transport-Security", value: "max-age=63072000" });
    }
    return [{ source: "/(.*)", headers: enTetes }];
  },
};

export default config;
