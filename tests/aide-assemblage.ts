import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assembler } from "../outils/assembler.mjs";
import { query } from "../src/lib/db/client";

/*
 * Aides de tests/assembleur.test.ts : assembler dans un dossier temporaire,
 * relire ce qui en sort, vérifier l'appli assemblée (imports, références,
 * typecheck, migrations sur une base vide).
 *
 * Rien ici ne touche autre chose que des dossiers temporaires et des bases
 * créées puis supprimées sur le serveur LOCAL que vitest.config.ts impose.
 */

export const SOURCE = process.cwd();
export const COMMIT_DE_TEST = "0123abc";

// L'assembleur fait le premier commit de l'appli et refuse sans
// identité git : le runner de la CI n'en a aucune, et un poste de développement
// ne doit pas signer les commits de test de son propre nom. Les variables
// d'environnement passent avant la configuration de git.
process.env.GIT_AUTHOR_NAME = "Assembleur (test)";
process.env.GIT_AUTHOR_EMAIL = "assembleur@test.invalid";
process.env.GIT_COMMITTER_NAME = "Assembleur (test)";
process.env.GIT_COMMITTER_EMAIL = "assembleur@test.invalid";

// Une combinaison de briques à assembler. La base ne se nomme pas dans
// --briques : l'assembleur la garde d'office avec une brique qui la lit.
export type Variante = { nom: string; briques: string[] };

const dossiersATraiter: string[] = [];

// Un lien vers node_modules du catalogue : jonction sous Windows (sans droit
// d'administrateur), lien symbolique ailleurs.
function lierNodeModules(dossier: string) {
  fs.symlinkSync(path.join(SOURCE, "node_modules"), path.join(dossier, "node_modules"), "junction");
}

type Assemblage = { dossier: string; fichiers: string[]; retires: string[]; commitInitial: string };
const dejaAssembles = new Map<string, Assemblage>();

// Sans blueprint donnée, un assemblage ne dépend que de ses briques : les
// fichiers de test qui en relisent un le partagent plutôt que de le refaire.
export function assemblerEnTemporaire(
  variante: Pick<Variante, "briques">,
  options: { blueprint?: string; fiche?: string; dependabot?: boolean } = {}
): Assemblage {
  const cle = JSON.stringify(variante.briques);
  const parDefaut = !options.blueprint && !options.fiche && !options.dependabot;
  if (parDefaut && dejaAssembles.has(cle)) return dejaAssembles.get(cle) as Assemblage;
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "assemblage-"));
  dossiersATraiter.push(dossier);
  const resultat = {
    dossier,
    ...assembler({ source: SOURCE, sortie: dossier, commit: COMMIT_DE_TEST, ...variante, ...options }),
  };
  if (parDefaut) dejaAssembles.set(cle, resultat);
  return resultat;
}

// git dans un dossier donné, sortie sans le saut de ligne final.
export function gitDans(dossier: string, ...args: string[]): string {
  return execFileSync("git", ["-C", dossier, ...args], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).replace(/\n$/, "");
}

// Deux écritures d'un même dossier (git rend « C:/… », un dossier temporaire
// peut passer par un lien ou un nom court sous Windows).
export function memeDossier(a: string, b: string): boolean {
  return fs.realpathSync.native(a) === fs.realpathSync.native(b);
}

export function dossierTemporaireVide() {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "assemblage-"));
  dossiersATraiter.push(dossier);
  return dossier;
}

// Les vérifications qui écrivent dans l'appli assemblée (typecheck : tsbuildinfo et
// lien node_modules ; migrations : un script) travaillent sur une COPIE : un
// assemblage mémoïsé reste tel que l'assembleur l'a écrit, quel que soit l'ordre
// des tests.
function copieDeTravail(dossier: string): string {
  const copie = fs.mkdtempSync(path.join(os.tmpdir(), "assemblage-"));
  dossiersATraiter.push(copie);
  fs.cpSync(dossier, copie, { recursive: true });
  lierNodeModules(copie);
  return copie;
}

// À appeler en afterAll. Le lien vers node_modules se retire AVANT le dossier :
// un nettoyage récursif qui le suivrait viderait le vrai node_modules.
export function nettoyerLesAssemblages() {
  dejaAssembles.clear();
  for (const dossier of dossiersATraiter.splice(0)) {
    const lien = path.join(dossier, "node_modules");
    if (fs.existsSync(lien)) {
      try {
        fs.unlinkSync(lien);
      } catch {
        fs.rmdirSync(lien);
      }
    }
    fs.rmSync(dossier, { recursive: true, force: true });
  }
}

export function lireAssemble(dossier: string, chemin: string): string {
  return fs.readFileSync(path.join(dossier, chemin), "utf-8").replace(/\r\n/g, "\n");
}

export function existeAssemble(dossier: string, chemin: string): boolean {
  return fs.existsSync(path.join(dossier, chemin));
}

// Tous les fichiers (chemins relatifs, séparateur « / ») d'un dossier assemblé,
// hors .git : le dépôt que l'assembleur crée n'est pas un fichier de l'appli.
export function fichiersAssembles(dossier: string, sousDossier = ""): string[] {
  return fs.readdirSync(path.join(dossier, sousDossier), { withFileTypes: true }).flatMap((entree) => {
    const chemin = sousDossier === "" ? entree.name : `${sousDossier}/${entree.name}`;
    if (chemin === "node_modules" || chemin === ".git") return [];
    return entree.isDirectory() ? fichiersAssembles(dossier, chemin) : [chemin];
  });
}

// ---------------------------------------------------------------- code lu

const EXTENSIONS_DE_CODE = /\.(ts|tsx|mjs)$/;

// Les tests d'isolement écrivent, en chaînes de caractères, des imports fautifs
// vers les modules pour prouver que leur verrou les attrape : rien n'y est
// importé pour de vrai, ils ne comptent pas comme références.
const FIXTURES_D_ISOLEMENT = /^tests\/[a-z-]+-isolement\.test\.ts$/;

function codeALire(dossier: string): { chemin: string; source: string }[] {
  return fichiersAssembles(dossier)
    .filter((chemin) => EXTENSIONS_DE_CODE.test(chemin) && !FIXTURES_D_ISOLEMENT.test(chemin))
    .filter((chemin) => /^(src|scripts|tests)\//.test(chemin))
    .map((chemin) => ({ chemin, source: lireAssemble(dossier, chemin) }));
}

// Les commentaires ne sont pas des références : un commentaire peut nommer une
// unité retirée sans rien casser, quand il cite le cas d'origine d'une règle.
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const MOTIF_IMPORT =
  /(?:^|[\s;])(?:import|export)\s[^"'`;]*?from\s*["'`]([^"'`]+)["'`]|(?:^|[\s;])import\s*["'`]([^"'`]+)["'`]|import\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

const SUFFIXES = ["", ".ts", ".tsx", ".mjs", ".css", ".json", "/index.ts", "/index.tsx"];

// Les imports internes (relatifs ou « @/ ») qui ne mènent à aucun fichier de
// l'appli assemblée : ce qu'une liste de retrait trop gourmande laisse derrière elle.
export function importsInvalides(dossier: string): string[] {
  const manquants: string[] = [];
  for (const { chemin, source } of codeALire(dossier)) {
    for (const correspondance of sansCommentaires(source).matchAll(MOTIF_IMPORT)) {
      const specifieur = correspondance[1] ?? correspondance[2] ?? correspondance[3];
      const base = specifieur.startsWith("@/")
        ? `src/${specifieur.slice(2)}`
        : specifieur.startsWith(".")
          ? path.posix.normalize(path.posix.join(path.posix.dirname(chemin), specifieur))
          : null;
      if (base === null) continue;
      const existe = SUFFIXES.some((suffixe) => {
        const cible = path.join(dossier, base + suffixe);
        return fs.existsSync(cible) && fs.statSync(cible).isFile();
      });
      if (!existe) manquants.push(`${chemin} importe « ${specifieur} » qui n'existe pas dans l'appli assemblée`);
    }
  }
  return manquants;
}

// Les imports, et les require : une brique ne s'en sert pas aujourd'hui, mais
// un require ne doit pas faire passer en douce une dépendance entre briques.
const MOTIF_IMPORT_OU_REQUIRE = new RegExp(
  `${MOTIF_IMPORT.source}|require\\s*\\(\\s*["'\`]([^"'\`]+)["'\`]\\s*\\)`,
  "g"
);

// Une brique n'importe une autre brique que si elle la déclare
// dans `exige` (outils/modules.mjs). Sinon, une copie qui garde l'une sans
// l'autre ne compile plus, et l'assembleur ne saurait pas la refuser avant.
// Rend chaque import fautif, en nommant les deux briques.
export function importsDeBriquesNonDeclares(
  fichiers: { chemin: string; source: string }[],
  briques: Record<string, { exige: readonly string[] }>
): string[] {
  const fautifs: string[] = [];
  for (const { chemin, source } of fichiers) {
    const proprietaire = /^src\/briques\/([^/]+)\//.exec(chemin)?.[1];
    if (!proprietaire) continue;
    const exigees = Object.hasOwn(briques, proprietaire) ? briques[proprietaire].exige : [];
    for (const correspondance of sansCommentaires(source).matchAll(MOTIF_IMPORT_OU_REQUIRE)) {
      const specifieur = correspondance[1] ?? correspondance[2] ?? correspondance[3] ?? correspondance[4];
      const cible = specifieur.startsWith("@/")
        ? `src/${specifieur.slice(2)}`
        : specifieur.startsWith(".")
          ? path.posix.normalize(path.posix.join(path.posix.dirname(chemin), specifieur))
          : null;
      const visee = cible === null ? undefined : /^src\/briques\/([^/]+)/.exec(cible)?.[1];
      if (visee === undefined || visee === proprietaire || exigees.includes(visee)) continue;
      fautifs.push(`${chemin} importe « ${specifieur} » : la brique ${proprietaire} n'exige pas la brique ${visee}`);
    }
  }
  return fautifs;
}

// Ce qui, dans le code d'une appli, désigne une unité : ses chemins d'import,
// ses routes, ses tables, ses gardes. Une unité retirée ne doit plus apparaître.
export const REFERENCES: Record<string, RegExp> = {
  validation: /briques\/validation|\b(FROM|JOIN|INTO|UPDATE|TABLE)\s+propositions\b/,
  "import-lot": /briques\/import-lot|\b(FROM|JOIN|INTO|UPDATE|TABLE)\s+import_lots?\b|import_lot_lignes/,
  calendrier: /briques\/calendrier/,
  echeances: /briques\/echeances/,
  // La base : son client, ses scripts et son patron dossiers, le paquet pg, les
  // variables qui la désignent et le Postgres de la CI.
  donnees:
    /lib\/db\/|from\s*["'`]pg["'`]|scripts\/lib\/cli|bases-locales|cle-rapprochement|import-fusion|dossiers-domaine|dossiers\.acceder|ACTIONS_DOSSIERS|["'`]\/dossiers|DATABASE_URL|PGSSLMODE|\bpostgres\b/,
  mails: /briques\/mails|MAILS_FOURNISSEUR|MAILS_EXPEDITEUR|RESEND_API_KEY/,
  // Les notifications : sa brique, sa table, ses variables, sa description de
  // traitement et sa source de l'export des données.
  notifications:
    /briques\/notifications|notifications_(envois|lancements)|NOTIFICATIONS_(SECRET|ADRESSES_ESSAI)|TRAITEMENTS_NOTIFICATIONS|SOURCES_NOTIFICATIONS/,
  // Le job deployer de ci.yml et ses noms ; COMMIT_DEPLOYE est au socle (/sante).
  deploiement: /briques\/deploiement|render\.yaml|DEPLOIEMENT_URL|DEPLOIEMENT_DECLENCHEUR|\bdeployer:/,
  // Les écrans du patron dossiers ; sa couche données reste avec la base.
  "patron-dossiers": /app\/dossiers\b/,
  // Le formulaire de contact : sa page, sa table et sa variable. Pas la
  // chaîne « /contact » : tests/referencement.test.ts s'en sert comme exemple ;
  // une route ou une page publique restée sans sa page fait échouer
  // tests/comptes-proxy.test.ts et tests/referencement.test.ts.
  contact: /briques\/contact|app\/contact|contact_envois|CONTACT_DESTINATAIRE/,
  // L'adresse IP du visiteur : son fichier, ses fonctions et la variable qui
  // nomme l'en-tête où la lire.
  "adresse-ip": /lib\/adresse-ip|adresseDuVisiteur|\bempreinteDe\b|IP_EN_TETE_CLIENT/,
  // Le journal d'audit : sa page, sa table, son droit, ses fonctions,
  // sa description de traitement et sa source de l'export des données.
  journal:
    /briques\/journal|app\/journal|journal_audit|journal\.consulter|ACTIONS_JOURNAL|TRAITEMENTS_JOURNAL|SOURCES_JOURNAL|\bjournaliser\b|["'`]\/journal\b/,
  // Les droits, la session et la connexion : sans la brique,
  // plus aucune page ne se garde, et rien ne doit encore appeler ses gardes.
  comptes:
    /briques\/comptes|config\/(acces|comptes)|\b(exiger|visiblePour|utilisateurCourant|utilisateurDeLEmail)\b|UTILISATEURS_DEMO|BandeauSession|bandeau-session|aide-session|AUTH_SECRET|COMPTES_PREMIER_ADMIN|["'`]\/connexion|\b(FROM|JOIN|INTO|UPDATE|TABLE)\s+(utilisateurs|sessions|codes_connexion|codes_connexion_essais|domaines_admis)\b/,
  // L'export et l'effacement des données d'une personne : ses pages, ses
  // droits et son registre. Les sources que chaque unité décrit chez elle ne la nomment pas.
  rgpd: /briques\/rgpd|config\/donnees-personnelles|ACTIONS_RGPD|["'`]\/(mes-donnees|donnees-personnelles)\b|\b(mes-donnees\.exporter|donnees\.(exporter|effacer))\b/,
  // L'écran /comptes : sa brique, sa page, son droit. Les règles et
  // leurs tables restent avec comptes.
  "gestion-comptes":
    /briques\/gestion-comptes|app\/comptes|comptes\.administrer|ACTIONS_GESTION_COMPTES|["'`]\/comptes\b/,
};

// Ce que le code n'importe pas mais qui nomme quand même des fichiers ou des
// tables : le schéma, les scripts npm, la CI, les réglages de Claude, les règles
// d'octets de git. Lus tels quels (le JSON, le YAML et le SQL n'ont pas de
// commentaire que sansCommentaires saurait retirer sans les abîmer).
const FICHIERS_DE_CONFIGURATION = [
  "src/lib/db/schema.sql",
  "package.json",
  "tsconfig.json",
  "eslint.config.mjs",
  "next.config.ts",
  "vitest.config.ts",
  ".gitattributes",
  ".gitignore",
  ".github/workflows/ci.yml",
  ".claude/settings.json",
];

export function referencesA(dossier: string, unite: string): string[] {
  const motif = REFERENCES[unite];
  const dansLeCode = codeALire(dossier).flatMap(({ chemin, source }) => {
    const trouve = motif.exec(sansCommentaires(source));
    return trouve ? [`${chemin} mentionne « ${trouve[0]} »`] : [];
  });
  const dansLaConfiguration = FICHIERS_DE_CONFIGURATION.filter((chemin) => existeAssemble(dossier, chemin)).flatMap(
    (chemin) => {
      // Les fichiers TypeScript et JavaScript, eux, perdent leurs commentaires
      // comme le code : celui de vitest.config.ts dit « l'exiger ici », et une
      // copie qui garde la base sans la brique comptes (brique contact)
      // y voyait une garde de comptes.
      const source = lireAssemble(dossier, chemin);
      const trouve = motif.exec(/\.(ts|mjs)$/.test(chemin) ? sansCommentaires(source) : source);
      return trouve ? [`${chemin} mentionne « ${trouve[0]} »`] : [];
    }
  );
  return [...dansLeCode, ...dansLaConfiguration];
}

// ---------------------------------------------------------------- renvois morts

// Un chemin à la racine vers ce que l'assembleur ne copie pas : l'outillage du
// catalogue. Le préfixe écarte « src/outils/ » : seul le dossier de la racine
// est retiré, qu'il soit cité depuis la racine (outils/x) ou en relatif
// (../outils/x).
const RENVOI_AU_CATALOGUE = /(?<![\w./-])(?:\.{1,2}\/)*outils\/[\w./-]*/i;

// Constaté à un essai d'assemblage : l'appli assemblée citait, dans des
// commentaires, un document du catalogue que personne chez le client ne peut
// ouvrir. Tout fichier, commentaire ou documentation compris, est lu : le
// renvoi mort est surtout là. blueprint.md, que le script écrit pour l'humain,
// est le seul exclu.
export function renvoisAuCatalogue(dossier: string): string[] {
  return fichiersAssembles(dossier)
    .filter((chemin) => chemin !== "blueprint.md")
    .flatMap((chemin) =>
      lireAssemble(dossier, chemin)
        .split("\n")
        .flatMap((ligne, rang) => {
          const trouve = RENVOI_AU_CATALOGUE.exec(ligne);
          return trouve ? [`${chemin}:${rang + 1} cite « ${trouve[0]} »`] : [];
        })
    );
}

// ---------------------------------------------------------------- appli assemblée

// Au plus un processus par cœur : vitest lance jusqu'à 5 tests concurrents,
// et le runner de la CI n'a que deux cœurs.
const PLAFOND = os.availableParallelism();
let actifs = 0;
const enAttente: (() => void)[] = [];

// Sous le délai d'un test (120 s) : un processus qui dépasse est arrêté avant
// que afterAll ne supprime le dossier où il tourne.
const DELAI_PROCESSUS = 100_000;

// Un outil du catalogue (prettier, tsc, eslint, vitest) lancé dans une appli assemblée.
// Asynchrone : tests/assembleur.test.ts en fait tourner plusieurs à la fois.
async function lancerDans(
  dossier: string,
  args: string[],
  env?: NodeJS.ProcessEnv
): Promise<{ code: number; sortie: string }> {
  // Celui qui finit cède sa place au premier en attente, sans la rendre :
  // un nouveau venu ne peut pas s'y glisser entre les deux.
  if (actifs < PLAFOND) actifs++;
  else await new Promise<void>((reprendre) => enAttente.push(reprendre));
  try {
    return await new Promise((resoudre) => {
      execFile(
        process.execPath,
        args,
        { cwd: dossier, encoding: "utf-8", env, timeout: DELAI_PROCESSUS },
        (erreur, stdout, stderr) => {
          if (!erreur) return resoudre({ code: 0, sortie: stdout });
          const arret = erreur.killed ? `\narrêté après ${DELAI_PROCESSUS / 1000} s` : "";
          resoudre({ code: typeof erreur.code === "number" ? erreur.code : 1, sortie: `${stdout}${stderr}${arret}` });
        }
      );
    });
  } finally {
    const suivant = enAttente.shift();
    if (suivant) suivant();
    else actifs--;
  }
}

export async function typecheck(assemble: string): Promise<{ code: number; sortie: string }> {
  const resultat = await lancerDans(copieDeTravail(assemble), [
    path.join(SOURCE, "node_modules", "typescript", "bin", "tsc"),
    "--noEmit",
  ]);
  return resultat.code === 0 ? { code: 0, sortie: "" } : resultat;
}

// Ce que vérifie l'étape « Mise en forme » de la CI de l'appli (npm run
// format:check), avec les réglages copiés dans l'appli.
export async function miseEnForme(assemble: string): Promise<{ code: number; sortie: string }> {
  return lancerDans(copieDeTravail(assemble), [
    path.join(SOURCE, "node_modules", "prettier", "bin", "prettier.cjs"),
    "--check",
    ".",
  ]);
}

// Sans les variables qui désignent une base, ni celles par lesquelles le
// vitest du catalogue se signale à ses processus : le vitest lancé dans
// l'appli assemblée les croirait siennes.
function environnementSansBase(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const nom of Object.keys(env)) {
    if (/^(DATABASE_URL|PG\w+|VITEST\w*|TEST)$/i.test(nom)) delete env[nom];
  }
  return env;
}

// Lint, typecheck et tests d'une appli assemblée, lancés dans une copie, sans
// aucune variable de base (un site sans base passe les
// vérifications de son CLAUDE.md sans DATABASE_URL). Le build n'y est pas :
// Turbopack refuse un node_modules qui pointe hors du projet, et la copie
// emprunte celui du catalogue. Le job socle-seul de
// .github/workflows/assemblage.yml le lance, lui, après un vrai npm ci.
export async function verifierSansBase(assemble: string): Promise<{ etape: string; code: number; sortie: string }[]> {
  const dossier = copieDeTravail(assemble);
  const etapes: [string, string[]][] = [
    ["lint", [path.join(SOURCE, "node_modules", "eslint", "bin", "eslint.js")]],
    ["typecheck", [path.join(SOURCE, "node_modules", "typescript", "bin", "tsc"), "--noEmit"]],
    ["test", [path.join(SOURCE, "node_modules", "vitest", "vitest.mjs"), "run"]],
  ];
  const resultats = [];
  for (const [etape, args] of etapes)
    resultats.push({ etape, ...(await lancerDans(dossier, args, environnementSansBase())) });
  return resultats;
}

const SCRIPT_DES_MIGRATIONS = `
import { appliquerSchemaEtMigrations, query } from "./src/lib/db/client";

async function main() {
  // Deux fois : chaque démarrage rejoue le schéma et les migrations.
  await appliquerSchemaEtMigrations();
  await appliquerSchemaEtMigrations();
  const objets = await query<{ nom: string }>(
    \`SELECT c.relname AS nom FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'S') AND c.relname !~ '_id_seq$' ORDER BY 1\`
  );
  console.log("OBJETS:" + JSON.stringify(objets.map((objet) => objet.nom)));
  process.exit(0);
}

main().catch((erreur) => {
  console.error(erreur);
  process.exit(1);
});
`;

// Lance un script TypeScript dans une copie de l'appli assemblée, contre une
// base NEUVE créée sur le serveur local de DATABASE_URL puis supprimée, quoi
// qu'il arrive.
async function surBaseNeuve(assemble: string, script: string): Promise<{ code: number; sortie: string }> {
  const dossier = copieDeTravail(assemble);
  const nomBase = `asm_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const adresse = new URL(process.env.DATABASE_URL as string);
  adresse.pathname = `/${nomBase}`;
  await query(`CREATE DATABASE ${nomBase}`);
  try {
    fs.writeFileSync(path.join(dossier, "verifier-sur-base.mts"), script);
    try {
      const sortie = execFileSync(
        process.execPath,
        [path.join(SOURCE, "node_modules", "tsx", "dist", "cli.mjs"), "verifier-sur-base.mts"],
        { cwd: dossier, encoding: "utf-8", stdio: "pipe", env: { ...process.env, DATABASE_URL: adresse.toString() } }
      );
      return { code: 0, sortie };
    } catch (erreur) {
      const e = erreur as { status?: number; stdout?: string; stderr?: string };
      return { code: e.status ?? 1, sortie: `${e.stdout ?? ""}${e.stderr ?? ""}` };
    }
  } finally {
    await query(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
  }
}

// Rejoue schéma et migrations de l'appli assemblée sur une base NEUVE, deux fois,
// puis rend ce qu'elle contient (tables, vues, séquences).
export async function migrationsSurBaseNeuve(
  assemble: string
): Promise<{ code: number; objets: string[]; sortie: string }> {
  const { code, sortie } = await surBaseNeuve(assemble, SCRIPT_DES_MIGRATIONS);
  const ligne = sortie.split("\n").find((l) => l.startsWith("OBJETS:"));
  return { code, objets: code === 0 && ligne ? JSON.parse(ligne.slice("OBJETS:".length)) : [], sortie };
}

const SCRIPT_DE_L_ENTREE = (adresse: string) => `
import { appliquerSchemaEtMigrations } from "./src/lib/db/client";
import { admettre } from "./src/briques/comptes/entree";

async function main() {
  await appliquerSchemaEtMigrations();
  const compte = await admettre(${JSON.stringify(adresse)});
  console.log("COMPTE:" + JSON.stringify(compte));
  process.exit(0);
}

main().catch((erreur) => {
  console.error(erreur);
  process.exit(1);
});
`;

// Ce que l'appli assemblée fait d'une adresse que personne n'a listée : admise
// avec son rôle, ou refusée (compte: null). Par le vrai code de la brique
// comptes, sur une base neuve : la configuration écrite par l'assembleur est
// celle qui décide, pas une copie de ses règles.
export async function connexionDUneAdresseInconnue(
  assemble: string,
  adresse: string
): Promise<{ code: number; compte: { email: string; role: string } | null; sortie: string }> {
  const { code, sortie } = await surBaseNeuve(assemble, SCRIPT_DE_L_ENTREE(adresse));
  const ligne = sortie.split("\n").find((l) => l.startsWith("COMPTE:"));
  return { code, compte: code === 0 && ligne ? JSON.parse(ligne.slice("COMPTE:".length)) : null, sortie };
}
