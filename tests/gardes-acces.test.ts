import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/*
 * Test-verrou : chaque page, chaque fichier d'actions serveur et
 * chaque route de src/app commence par le garde de briques/comptes/roles.ts. La règle ne
 * tient que par convention, et une action serveur se poste sans passer par
 * l'écran : un oubli ne se verrait à aucun comportement tant que le rôle joué
 * a le droit, seulement ici.
 *
 * Le code se lit avec le compilateur TypeScript : « première instruction » est
 * une notion de syntaxe, et un commentaire ou une signature sur plusieurs
 * lignes ne doivent tromper le verrou ni dans un sens ni dans l'autre.
 *
 * Ce fichier est copié dans toute appli : il ne nomme aucun module. Il prouve
 * aussi sa propre sensibilité sur des sources fautives (cicatrice d'un projet
 * précédent : un test de garde qui ne voyait aucun fichier passait au vert).
 */

const APP = path.resolve(__dirname, "../src/app");

// Les seuls fichiers ouverts sans garde, chacun avec sa raison. Tout ajout se
// justifie ici, à la relecture ; une entrée dont le fichier a disparu fait
// échouer le test, pour que la liste ne garde pas d'ouverture fantôme.
const OUVERTS: Record<string, string> = {
  "page.tsx":
    "l'accueil de départ : nom, description et lien d'entrée, sans donnée de la base (avec espaces, le lien dépend seulement de l'adhésion de la personne)",
  "kit/page.tsx": "la vitrine du kit, sur des données fictives",
  "kit/site-vitrine/page.tsx": "les composants de site vitrine du kit, sur un texte fictif",
  "mentions-legales/page.tsx": "obligation légale, lisible sans connexion",
  "confidentialite/page.tsx":
    "obligation légale d'informer toute personne dont le site traite les données, compte ou pas",
  "connexion/page.tsx": "la page où l'on se connecte : aucune session ne peut la précéder",
  "sante/route.ts": "la sonde de l'hébergeur, interrogée sans session",
  "connexion/google/route.ts": "le départ de la connexion avec Google : aucune session ne peut la précéder",
  "connexion/google/retour/route.ts": "le retour de Google, qui ouvre la session",
  "connexion/microsoft/route.ts": "le départ de la connexion avec Microsoft : aucune session ne peut la précéder",
  "connexion/microsoft/retour/route.ts": "le retour de Microsoft, qui ouvre la session",
  "connexion/lien/page.tsx": "la page où mène le lien de connexion du mail : aucune session ne peut la précéder",
  "contact/page.tsx": "le formulaire de contact public, protégé par ses filtres anti-spam (brique contact)",
};

type Sorte = "page-ou-action" | "route";

// L'en-tête des sources fautives des cas de sensibilité ci-dessous.
const IMPORT_EXIGER = 'import { exiger } from "@/briques/comptes/roles";\n';

const estAppelA = (noeud: ts.Node | undefined, nom: string): noeud is ts.CallExpression =>
  noeud !== undefined &&
  ts.isCallExpression(noeud) &&
  ts.isIdentifier(noeud.expression) &&
  noeud.expression.text === nom;

// `await exiger("objet.verbe", …)`, avec des chaînes écrites en toutes lettres :
// l'action se lit à la relecture, sans remonter une variable.
function estExigerAttendu(expression: ts.Expression | undefined): boolean {
  if (!expression || !ts.isAwaitExpression(expression) || !estAppelA(expression.expression, "exiger")) return false;
  const actions = expression.expression.arguments;
  return actions.length > 0 && actions.every((action) => ts.isStringLiteral(action));
}

// Page ou action serveur : `await exiger(…)`, éventuellement rangé dans une
// constante (l'utilisateur que rend le garde).
function estGardePageOuAction(instruction: ts.Statement | undefined): boolean {
  if (!instruction) return false;
  if (ts.isExpressionStatement(instruction)) return estExigerAttendu(instruction.expression);
  if (ts.isVariableStatement(instruction)) {
    const declarations = instruction.declarationList.declarations;
    return declarations.length === 1 && estExigerAttendu(declarations[0].initializer);
  }
  return false;
}

// Une route n'a pas de page à qui rendre `notFound()` : elle consulte
// `peut(await utilisateurCourant(), "objet.verbe")` et répond elle-même.
function estGardeRoute(instruction: ts.Statement | undefined): boolean {
  if (!instruction || !ts.isIfStatement(instruction) || !ts.isReturnStatement(instruction.thenStatement)) return false;
  const condition = instruction.expression;
  if (!ts.isPrefixUnaryExpression(condition) || condition.operator !== ts.SyntaxKind.ExclamationToken) return false;
  if (!estAppelA(condition.operand, "peut")) return false;
  const [qui, action] = condition.operand.arguments;
  return (
    qui !== undefined &&
    ts.isAwaitExpression(qui) &&
    estAppelA(qui.expression, "utilisateurCourant") &&
    action !== undefined &&
    ts.isStringLiteral(action)
  );
}

const estExporte = (noeud: ts.Node) =>
  ts.canHaveModifiers(noeud) && (ts.getModifiers(noeud) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

// Les fonctions exportées dont la première instruction n'est pas le garde, et
// les exports que ce contrôle ne saurait pas lire (une fonction fléchée
// exportée, un `export { … }`). `dynamic` (réglage de Next) et les types ne
// portent aucune logique.
function exportsSansGarde(source: string, sorte: Sorte): string[] {
  const garde = sorte === "route" ? estGardeRoute : estGardePageOuAction;
  const fichier = ts.createSourceFile("source.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fautifs: string[] = [];
  // Le garde se reconnaît à son nom : encore faut-il que ce nom soit celui de
  // briques/comptes/roles.ts, importé sans renommage, et non une fonction locale homonyme.
  const importes = new Set(
    fichier.statements.flatMap((instruction) => {
      if (!ts.isImportDeclaration(instruction) || !ts.isStringLiteral(instruction.moduleSpecifier)) return [];
      if (instruction.moduleSpecifier.text !== "@/briques/comptes/roles") return [];
      const nommes = instruction.importClause?.namedBindings;
      if (!nommes || !ts.isNamedImports(nommes)) return [];
      return nommes.elements
        .filter((element) => !element.propertyName && !element.isTypeOnly)
        .map((element) => element.name.text);
    })
  );
  const requis = sorte === "route" ? ["peut", "utilisateurCourant"] : ["exiger"];
  const aGarder = fichier.statements.some(
    (instruction) => ts.isFunctionDeclaration(instruction) && estExporte(instruction)
  );
  if (aGarder) {
    for (const nom of requis) if (!importes.has(nom)) fautifs.push(`${nom} non importé de @/briques/comptes/roles`);
  }
  const locaux = fichier.statements.some(
    (instruction) =>
      (ts.isFunctionDeclaration(instruction) && requis.includes(instruction.name?.text ?? "")) ||
      (ts.isVariableStatement(instruction) &&
        instruction.declarationList.declarations.some((declaration) =>
          requis.includes(declaration.name.getText(fichier))
        ))
  );
  if (locaux) fautifs.push(`${requis.join(", ")} redéclaré dans le fichier`);
  for (const instruction of fichier.statements) {
    if (ts.isFunctionDeclaration(instruction) && estExporte(instruction)) {
      if (!garde(instruction.body?.statements[0])) fautifs.push(instruction.name?.text ?? "export default");
    } else if (ts.isVariableStatement(instruction) && estExporte(instruction)) {
      for (const declaration of instruction.declarationList.declarations) {
        if (declaration.name.getText(fichier) !== "dynamic") fautifs.push(declaration.name.getText(fichier));
      }
    } else if (ts.isExportAssignment(instruction) || ts.isExportDeclaration(instruction)) {
      fautifs.push(instruction.getText(fichier));
    }
  }
  return fautifs;
}

// Un fichier « use server » se poste de l'extérieur quel que soit son nom.
const estActionsServeur = (source: string) => /["']use server["']/.test(source);

function fichiers(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = path.join(dossier, entree.name);
    return entree.isDirectory() ? fichiers(chemin) : [chemin];
  });
}

const relatif = (chemin: string) => path.relative(APP, chemin).split(path.sep).join("/");

// Ce que le verrou relit : pages, routes, et tout fichier « use server ».
function aVerifier(): { fichier: string; sorte: Sorte }[] {
  return fichiers(APP).flatMap((chemin): { fichier: string; sorte: Sorte }[] => {
    const nom = path.basename(chemin);
    if (nom === "route.ts") return [{ fichier: relatif(chemin), sorte: "route" }];
    if (nom === "page.tsx" || (/\.tsx?$/.test(nom) && estActionsServeur(readFileSync(chemin, "utf-8")))) {
      return [{ fichier: relatif(chemin), sorte: "page-ou-action" }];
    }
    return [];
  });
}

describe("garde d'accès en première ligne de chaque page, action serveur et route", () => {
  it("ouvre chaque page, chaque action serveur et chaque route par le garde, hors la liste des fichiers ouverts", () => {
    const fautes = aVerifier()
      .filter(({ fichier }) => !Object.hasOwn(OUVERTS, fichier))
      .flatMap(({ fichier, sorte }) =>
        exportsSansGarde(readFileSync(path.join(APP, fichier), "utf-8"), sorte).map((nom) => `${fichier} : ${nom}`)
      );
    expect(fautes).toEqual([]);
  });

  it("voit les fichiers qu'il doit voir : chaque fichier ouvert existe et fait partie de ceux que le verrou relit", () => {
    const relus = aVerifier().map(({ fichier }) => fichier);
    for (const fichier of Object.keys(OUVERTS)) {
      expect(existsSync(path.join(APP, fichier)), fichier).toBe(true);
      expect(relus, fichier).toContain(fichier);
    }
  });

  it("laisse passer le garde seul, rangé dans une constante ou déstructuré, sur une signature de plusieurs lignes", () => {
    const page = (corps: string) =>
      `${IMPORT_EXIGER}export default async function Page({\n  params,\n}: {\n  params: Promise<{ slug: string }>;\n}) {\n${corps}\n}\n`;
    expect(exportsSansGarde(page('  await exiger("exemple.consulter");'), "page-ou-action")).toEqual([]);
    expect(
      exportsSansGarde(page('  const u = await exiger("exemple.consulter", "exemple.gerer");'), "page-ou-action")
    ).toEqual([]);
    expect(exportsSansGarde(page('  const { email } = await exiger("exemple.consulter");'), "page-ou-action")).toEqual(
      []
    );
    expect(
      exportsSansGarde('export const dynamic = "force-dynamic";\nexport type Etat = {};', "page-ou-action")
    ).toEqual([]);
  });

  it("attrape une page sans garde, un garde en deuxième ligne, non attendu, en commentaire ou sur une action en variable (cas fautifs que le verrou doit attraper)", () => {
    const page = (corps: string) => `${IMPORT_EXIGER}export default async function Page() {\n${corps}\n}\n`;
    for (const corps of [
      "  const x = 1;",
      '  const x = 1;\n  await exiger("exemple.consulter");',
      '  exiger("exemple.consulter");',
      '  // await exiger("exemple.consulter");\n  const x = 1;',
      "  await exiger(ACTION);",
      "  await exiger();",
      "",
    ]) {
      expect(exportsSansGarde(page(corps), "page-ou-action"), corps).toEqual(["Page"]);
    }
  });

  it("attrape une action serveur exportée en fonction fléchée ou par un export groupé, que le contrôle des fonctions ne verrait pas", () => {
    const source = '"use server";\n\nexport const supprimerTout = async (ids: number[]) => {\n  void ids;\n};\n';
    expect(estActionsServeur(source)).toBe(true);
    expect(exportsSansGarde(source, "page-ou-action")).toEqual(["supprimerTout"]);
    expect(exportsSansGarde("async function f() {}\nexport { f };", "page-ou-action")).toEqual(["export { f };"]);
  });

  it("attrape un garde qui ne vient pas de briques/comptes/roles.ts : import absent, renommé, d'un autre fichier, ou fonction locale homonyme", () => {
    const corps = 'export default async function Page() {\n  await exiger("exemple.consulter");\n}\n';
    const nonImporte = ["exiger non importé de @/briques/comptes/roles"];
    expect(exportsSansGarde(corps, "page-ou-action")).toEqual(nonImporte);
    expect(
      exportsSansGarde(`import { autre as exiger } from "@/briques/comptes/roles";\n${corps}`, "page-ou-action")
    ).toEqual(nonImporte);
    expect(exportsSansGarde(`import { exiger } from "./faux";\n${corps}`, "page-ou-action")).toEqual(nonImporte);
    expect(exportsSansGarde(`${IMPORT_EXIGER}async function exiger() {}\n${corps}`, "page-ou-action")).toEqual([
      "exiger redéclaré dans le fichier",
    ]);
  });

  it("attrape une route qui répond avant de consulter peut()", () => {
    const route = (corps: string) =>
      `import { peut, utilisateurCourant } from "@/briques/comptes/roles";\nexport async function POST(request: Request): Promise<Response> {\n${corps}\n}\n`;
    const garde =
      '  if (!peut(await utilisateurCourant(), "exemple.gerer")) return new Response(null, { status: 404 });';
    expect(exportsSansGarde(route(garde), "route")).toEqual([]);
    expect(exportsSansGarde(route("  return new Response(null);"), "route")).toEqual(["POST"]);
    expect(exportsSansGarde(route(`  const x = 1;\n${garde}`), "route")).toEqual(["POST"]);
  });
});
