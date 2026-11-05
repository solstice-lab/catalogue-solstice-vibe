import { readdirSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it, vi } from "vitest";
import config from "../next.config";
import { nomDuCookie, nouveauJeton, signer } from "../src/briques/comptes/jeton";
import { estOuverte, ROUTES_OUVERTES } from "../src/briques/comptes/protection";
import { config as configProxy, proxy } from "../src/proxy";
import { poserLesMethodes } from "./aide-comptes";

/*
 * Tout est protégé par défaut : sans session valable, chaque
 * route de src/app part vers /connexion, sauf la liste ouverte, explicite. Le
 * test parcourt les routes telles qu'elles existent : une page ajoutée demain
 * est protégée sans qu'on y pense, et une entrée de la liste ouverte qui ne
 * mène plus à rien fait échouer le test.
 *
 * Le proxy ne vérifie que la signature du cookie, sans lire la base (Next le
 * fait tourner aussi sur chaque préchargement) ; la session elle-même se
 * vérifie en base à chaque page, par exiger (tests/comptes-session.test.ts).
 */

const APP = path.resolve(__dirname, "../src/app");

// Les fichiers de métadonnées de Next servent eux aussi une adresse.
const METADONNEES: Record<string, string> = {
  "robots.ts": "robots.txt",
  "sitemap.ts": "sitemap.xml",
  "opengraph-image.tsx": "opengraph-image",
  "twitter-image.tsx": "twitter-image",
};

// Les adresses de src/app : chaque page.tsx et route.ts, et chaque fichier de
// métadonnées, segments dynamiques remplis, groupes « (nom) » retirés.
function routes(dossier = APP, prefixe = ""): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    if (entree.isDirectory()) {
      const segment = /^\(.*\)$/.test(entree.name) ? "" : `/${entree.name.replace(/^\[.*\]$/, "exemple")}`;
      return routes(path.join(dossier, entree.name), prefixe + segment);
    }
    if (Object.hasOwn(METADONNEES, entree.name)) return [`${prefixe}/${METADONNEES[entree.name]}`];
    return /^(page\.tsx|route\.ts)$/.test(entree.name) ? [prefixe || "/"] : [];
  });
}

function requete(chemin: string, enTetes: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost${chemin}`, { headers: enTetes });
}

function avecCookie(valeur: string, enTetes: Record<string, string> = {}): Record<string, string> {
  return { ...enTetes, cookie: `${nomDuCookie()}=${valeur}` };
}

function versLaConnexion(reponse: Response): string | null {
  const vers = reponse.headers.get("location");
  return vers && new URL(vers).pathname === "/connexion" ? vers : null;
}

describe("accès protégé par défaut, dans proxy.ts", () => {
  const toutes = routes();

  it("trouve les routes de l'appli (sans quoi le test passerait sur du vide)", () => {
    expect(toutes).toContain("/");
    expect(toutes).toContain("/connexion");
    expect(toutes.length).toBeGreaterThan(3);
  });

  it("n'ouvre sans session que les routes de la liste ouverte, et chacune existe", () => {
    for (const ouverte of ROUTES_OUVERTES) expect(toutes, ouverte).toContain(ouverte);
    for (const chemin of toutes) {
      const reponse = proxy(requete(chemin));
      if (estOuverte(chemin)) {
        expect(versLaConnexion(reponse), chemin).toBeNull();
        expect(reponse.headers.get("content-security-policy"), chemin).toBeTruthy();
      } else {
        expect(versLaConnexion(reponse), chemin).not.toBeNull();
      }
    }
  });

  // Brique contact : un visiteur sans compte écrit depuis /contact, et
  // son formulaire poste sa server action sur la même adresse.
  it("laisse passer sans session la page de contact et l'envoi de son formulaire", () => {
    const affichage = proxy(requete("/contact"));
    const envoi = proxy(
      new NextRequest("http://localhost/contact", { method: "POST", headers: { "next-action": "envoi" } })
    );
    for (const reponse of [affichage, envoi]) {
      expect(versLaConnexion(reponse)).toBeNull();
      expect(reponse.headers.get("content-security-policy")).toBeTruthy();
    }
  });
  // Fin de la brique contact.

  it("redirige un cookie forgé, tronqué ou d'un autre secret comme une absence de session", () => {
    const jeton = nouveauJeton();
    for (const fautif of ["x", jeton, `${jeton}.faux`, signer(jeton).slice(0, -2), signer(jeton, "z".repeat(40))]) {
      expect(versLaConnexion(proxy(requete("/une-page", avecCookie(fautif)))), fautif).not.toBeNull();
    }
  });

  it("laisse passer un cookie bien signé, avec la CSP sur la réponse ET dans la requête : sans elle, plus aucun script ne tourne", () => {
    const reponse = proxy(requete("/une-page", avecCookie(signer(nouveauJeton()))));
    expect(versLaConnexion(reponse)).toBeNull();
    expect(reponse.headers.get("content-security-policy")).toBeTruthy();
    expect(reponse.headers.get("x-middleware-request-content-security-policy")).toBe(
      reponse.headers.get("content-security-policy")
    );
  });

  it("garde le chemin demandé pour y revenir après la connexion", () => {
    const vers = versLaConnexion(proxy(requete("/une-page?statut=actif")));
    expect(new URL(vers!).searchParams.get("retour")).toBe("/une-page?statut=actif");
    expect(new URL(versLaConnexion(proxy(requete("/")))!).searchParams.has("retour")).toBe(false);
  });

  it("protège aussi une requête marquée « préchargement » : l'en-tête se pose à la main, et le proxy sautait ces requêtes", () => {
    const prechargements: Record<string, string>[] = [{ "next-router-prefetch": "1" }, { purpose: "prefetch" }];
    for (const enTetes of prechargements) {
      expect(
        unstable_doesMiddlewareMatch({ config: configProxy, url: "/une-page", headers: enTetes, nextConfig: config })
      ).toBe(true);
      expect(versLaConnexion(proxy(requete("/une-page", enTetes)))).not.toBeNull();
    }
  });

  it("refuse de servir quoi que ce soit en production tant que la démo est une méthode, /sante comprise : l'hébergeur voit l'échec au déploiement", () => {
    vi.stubEnv("NODE_ENV", "production");
    poserLesMethodes(["code-email", "demo"]);
    try {
      for (const chemin of ["/", "/sante", "/connexion", "/mentions-legales"]) {
        expect(() => proxy(requete(chemin)), chemin).toThrow(/démo.*production/);
      }
    } finally {
      vi.unstubAllEnvs();
      poserLesMethodes(null);
    }
  });

  it("sert /sante en production une fois la démo retirée des méthodes : le geste d'avant la mise en ligne suffit", () => {
    vi.stubEnv("NODE_ENV", "production");
    poserLesMethodes(["code-email"]);
    try {
      const reponse = proxy(requete("/sante"));
      expect(versLaConnexion(reponse)).toBeNull();
      expect(reponse.headers.get("content-security-policy")).toBeTruthy();
    } finally {
      vi.unstubAllEnvs();
      poserLesMethodes(null);
    }
  });

  it("n'ouvre pas une route qui ne fait que commencer comme une route ouverte", () => {
    for (const chemin of [
      "/connexionx",
      "/santex",
      "/mentions-legales-bis",
      "/confidentialites",
      "/connexion%2F..%2Fkit",
    ]) {
      expect(estOuverte(chemin), chemin).toBe(false);
    }
    expect(estOuverte("/connexion/code")).toBe(true);
    // Google et Microsoft reviennent ici sans session : redirigé vers
    // /connexion, le retour perdrait son code et la connexion n'aboutirait
    // jamais.
    expect(estOuverte("/connexion/google/retour")).toBe(true);
    expect(estOuverte("/connexion/microsoft/retour")).toBe(true);
    // Le lien de connexion du mail s'ouvre sans session : c'est lui qui l'ouvre.
    expect(estOuverte("/connexion/lien")).toBe(true);
  });
});
