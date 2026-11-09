import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch, unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import config from "../next.config";
import { config as configProxy, proxy } from "../src/proxy";

/*
 * Le dépôt est publié en open source, et les en-têtes de
 * sécurité sont parmi les premières choses qu'un développeur ou un outil
 * d'audit regarde. Ces tests passent par ce que Next applique réellement
 * (réponse simulée par next/experimental/testing, réponse du proxy), sauf
 * X-Powered-By, que le serveur ajoute hors de tout utilitaire de test.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

// Le proxy tel qu'il tourne en production, chargé à neuf.
async function proxyEnProduction(): Promise<typeof proxy> {
  vi.stubEnv("NODE_ENV", "production");
  vi.resetModules();
  // Brique comptes : sa méthode démo refuse la production dès le proxy
  // (src/proxy.ts) ; la CSP de production se lit sur une appli sans démo, et
  // avec l'en-tête de l'adresse IP réglé, que la connexion exige en production.
  vi.stubEnv("IP_EN_TETE_CLIENT", "cf-connecting-ip");
  vi.doMock("../src/config/comptes", async (original) => ({
    ...(await original<typeof import("../src/config/comptes")>()),
    METHODES: [],
  }));
  // Fin de la brique comptes.
  return (await import("../src/proxy")).proxy;
}

async function enTetesDePage(chemin = "/une-page"): Promise<Headers> {
  const reponse = await unstable_getResponseFromNextConfig({
    url: `http://localhost${chemin}`,
    nextConfig: config,
  });
  return reponse.headers;
}

function directivesCsp(reponse: Response): Map<string, string[]> {
  const valeur = reponse.headers.get("content-security-policy");
  if (!valeur) throw new Error("aucune Content-Security-Policy sur la réponse");
  return new Map(
    valeur
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([nom]) => nom)
      .map(([nom, ...sources]) => [nom, sources])
  );
}

// Une route ouverte sans session dans toute appli : avec la brique comptes,
// une autre part vers /connexion, sans CSP.
function pageDemandee(chemin = "/mentions-legales"): NextRequest {
  return new NextRequest(`http://localhost${chemin}`);
}

describe("en-têtes de sécurité de next.config.ts", () => {
  it("envoie nosniff, une politique de référent et des permissions coupées sur toutes les routes : un audit les regarde en premier", async () => {
    for (const chemin of ["/", "/une-page/un-element/modifier", "/_next/static/chunks/x.js"]) {
      const enTetes = await enTetesDePage(chemin);
      expect(enTetes.get("x-content-type-options")).toBe("nosniff");
      expect(enTetes.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
      const permissions = enTetes.get("permissions-policy") ?? "";
      for (const fonction of ["camera", "microphone", "geolocation", "payment", "usb", "browsing-topics"]) {
        expect(permissions).toContain(`${fonction}=()`);
      }
    }
  });

  it("interdit l'affichage en cadre par X-Frame-Options : frame-ancestors de la CSP le dit aussi, mais les anciens navigateurs ne lisent que cet en-tête", async () => {
    expect((await enTetesDePage()).get("x-frame-options")).toBe("DENY");
  });

  it("n'envoie Strict-Transport-Security qu'en production : en local, le navigateur mémoriserait localhost comme HTTPS-only", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await enTetesDePage()).get("strict-transport-security")).toMatch(/^max-age=\d{8,}$/);

    vi.stubEnv("NODE_ENV", "development");
    expect((await enTetesDePage()).get("strict-transport-security")).toBeNull();
  });

  it("ne dit pas que l'appli tourne sous Next.js (X-Powered-By) : ça n'aide qu'à cibler une faille de version", () => {
    expect(config.poweredByHeader).toBe(false);
  });
});

describe("Content-Security-Policy posée par proxy.ts", () => {
  it("n'autorise que les scripts porteurs du nonce, jamais 'unsafe-inline' : Next écrit 8 à 13 scripts en ligne par page, les autoriser tous laisserait passer un script injecté", () => {
    const scripts = directivesCsp(proxy(pageDemandee())).get("script-src") ?? [];
    expect(scripts.some((source) => /^'nonce-[A-Za-z0-9+/=]{16,}'$/.test(source))).toBe(true);
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
  });

  it("transmet la CSP à Next dans la requête : c'est là qu'il lit le nonce pour l'apposer sur ses propres scripts, sans elle plus aucun script ne tourne", () => {
    const reponse = proxy(pageDemandee());
    // NextResponse.next({ request: { headers } }) transmet les en-têtes
    // modifiés de la requête sous ce préfixe : seule trace observable hors
    // d'un serveur.
    expect(reponse.headers.get("x-middleware-request-content-security-policy")).toBe(
      reponse.headers.get("content-security-policy")
    );
  });

  it("tire un nonce neuf à chaque requête : un nonce qui se répète se devine", () => {
    const nonce = () =>
      directivesCsp(proxy(pageDemandee()))
        .get("script-src")
        ?.find((source) => source.startsWith("'nonce-"));
    expect(nonce()).not.toBe(nonce());
  });

  it("n'autorise 'unsafe-eval' qu'en développement : React s'en sert pour ses traces d'erreur, la production n'en a pas besoin", async () => {
    expect(directivesCsp((await proxyEnProduction())(pageDemandee())).get("script-src")).not.toContain("'unsafe-eval'");

    vi.stubEnv("NODE_ENV", "development");
    expect(directivesCsp(proxy(pageDemandee())).get("script-src")).toContain("'unsafe-eval'");
  });

  it("ferme cadres, plugins, balise base et envois de formulaire vers l'extérieur", () => {
    const csp = directivesCsp(proxy(pageDemandee()));
    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'self'"]);
    expect(csp.get("form-action")).toEqual(["'self'"]);
  });

  it("n'ouvre aucune directive à tout le web (* ou schéma http:/https:) : une seule source large annule le nonce", () => {
    for (const [directive, sources] of directivesCsp(proxy(pageDemandee()))) {
      for (const source of sources) {
        expect(source, directive).not.toMatch(/^\*|^https?:$|^\*\./);
      }
    }
  });

  it("ne sert les styles et les polices que depuis l'appli : next/font les héberge sous _next/static/media", () => {
    const csp = directivesCsp(proxy(pageDemandee()));
    expect(csp.get("font-src")).toEqual(["'self'"]);
    expect(csp.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("garde les images data: et blob: : l'export PNG d'un Tableau fabrique une image data:", () => {
    const images = directivesCsp(proxy(pageDemandee())).get("img-src") ?? [];
    expect(images).toEqual(expect.arrayContaining(["'self'", "data:", "blob:"]));
  });

  it("passe sur les pages et leurs préchargements, pas sur les fichiers statiques : ils n'exécutent rien, un nonce y serait inutile", () => {
    const passe = (url: string, headers = {}) =>
      unstable_doesMiddlewareMatch({ config: configProxy, url, headers, nextConfig: config });
    expect(passe("/")).toBe(true);
    expect(passe("/une-page/un-element")).toBe(true);
    expect(passe("/_next/static/chunks/x.js")).toBe(false);
    expect(passe("/_next/image?url=x")).toBe(false);
    expect(passe("/favicon.ico")).toBe(false);
    // L'en-tête se pose à la main : le proxy ne doit pas se sauter sur sa foi.
    expect(passe("/une-page", { "next-router-prefetch": "1" })).toBe(true);
    expect(passe("/une-page", { purpose: "prefetch" })).toBe(true);
  });
});

/*
 * Le nonce n'existe que dans une page rendue à la requête. Une
 * page rendue au build n'en porte aucun, la CSP refuse alors tous ses scripts,
 * et rien ne le signale : ni le build, ni les tests, ni la console du serveur.
 * Une appli qui lit un cookie dans chaque page est dynamique d'elle-même ;
 * un site vitrine ne l'est que par le connection() du layout racine. Écarté
 * pour une vitrine : une CSP par hachages (experimental.sri, encore
 * expérimental) et 'unsafe-inline' (plus aucune protection contre un script
 * injecté).
 *
 * La forme exigée est stricte, à dessein : une fonction exportée par défaut,
 * et l'appel en instruction de premier niveau. Une autre écriture qui
 * marcherait aussi fait échouer le test, qui dit alors la forme attendue.
 */
function attendLaRequeteAvantLeRendu(source: string): boolean {
  const fichier = ts.createSourceFile("layout.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  // Le nom local de connection, renommé ou non à l'import.
  let nomLocal: string | undefined;
  for (const instruction of fichier.statements) {
    if (!ts.isImportDeclaration(instruction) || !ts.isStringLiteral(instruction.moduleSpecifier)) continue;
    const noms = instruction.importClause?.namedBindings;
    if (instruction.moduleSpecifier.text !== "next/server" || !noms || !ts.isNamedImports(noms)) continue;
    const element = noms.elements.find((nom) => (nom.propertyName ?? nom.name).text === "connection");
    if (element) nomLocal = element.name.text;
  }
  const racine = fichier.statements.find(
    (instruction): instruction is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(instruction) &&
      (ts.getCombinedModifierFlags(instruction) & ts.ModifierFlags.ExportDefault) === ts.ModifierFlags.ExportDefault
  );
  if (!nomLocal || !racine?.body) return false;

  // Un return, même dans un if, rend la page sans attendre la requête. Ceux
  // des fonctions imbriquées ne rendent pas la page, ils ne comptent pas.
  const contientUnReturn = (noeud: ts.Node): boolean =>
    ts.isReturnStatement(noeud) || (!ts.isFunctionLike(noeud) && ts.forEachChild(noeud, contientUnReturn) === true);

  // Au premier niveau du corps et avant tout return : sous une condition,
  // l'appel ne vaudrait plus pour chaque requête.
  for (const instruction of racine.body.statements) {
    const expression = ts.isExpressionStatement(instruction) ? instruction.expression : undefined;
    if (
      expression &&
      ts.isAwaitExpression(expression) &&
      ts.isCallExpression(expression.expression) &&
      ts.isIdentifier(expression.expression.expression) &&
      expression.expression.expression.text === nomLocal
    ) {
      return true;
    }
    if (contientUnReturn(instruction)) return false;
  }
  return false;
}

describe("rendu à la demande, sans quoi la CSP à nonce bloque tous les scripts", () => {
  it("le layout racine attend connection() avant de rendre : une page rendue au build n'a pas de nonce, et ses scripts ne tourneraient pas, sans aucune erreur", () => {
    const layout = readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf-8");
    expect(attendLaRequeteAvantLeRendu(layout)).toBe(true);
  });

  it("attrape un layout sans l'appel, avec l'appel sous condition, sans await, après un rendu même conditionnel, ou un connection qui ne vient pas de Next", () => {
    const layout = (importe: string, corps: string) =>
      `${importe}\nexport default async function RacineLayout({ children }: { children: React.ReactNode }) {\n${corps}\n}`;
    const deNext = 'import { connection } from "next/server";';
    const rendu = "  return <html><body>{children}</body></html>;";

    expect(attendLaRequeteAvantLeRendu(layout(deNext, `  await connection();\n${rendu}`))).toBe(true);
    expect(
      attendLaRequeteAvantLeRendu(
        layout('import { connection as attendre } from "next/server";', `  await attendre();\n${rendu}`)
      )
    ).toBe(true);
    expect(
      attendLaRequeteAvantLeRendu(
        layout(deNext, `  const titre = () => { return "x"; };\n  await connection();\n${rendu}`)
      )
    ).toBe(true);
    for (const [importe, corps] of [
      [deNext, rendu],
      [deNext, `  if (process.env.VITRINE) await connection();\n${rendu}`],
      [deNext, `  connection();\n${rendu}`],
      [deNext, `${rendu}\n  await connection();`],
      [deNext, `  if (!children) ${rendu.trim()}\n  await connection();\n${rendu}`],
      ['import { connection } from "./connexion";', `  await connection();\n${rendu}`],
    ]) {
      expect(attendLaRequeteAvantLeRendu(layout(importe, corps)), corps).toBe(false);
    }
  });
});
