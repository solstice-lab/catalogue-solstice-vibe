import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  appliquerRetrait,
  assembler,
  briquesEntrainees,
  ErreurAssemblage,
  estUnSecret,
  planifier,
  retirerLesDependances,
} from "../outils/assembler.mjs";
import { ADRESSE_IP, BRIQUES, DONNEES, EXCLUS_DU_CATALOGUE, PATRON_DOSSIERS } from "../outils/modules.mjs";
import { nomsDesBases } from "../scripts/lib/bases-locales";
import {
  assemblerEnTemporaire,
  COMMIT_DE_TEST,
  dossierTemporaireVide,
  existeAssemble,
  fichiersAssembles,
  gitDans,
  importsDeBriquesNonDeclares,
  importsInvalides,
  lireAssemble,
  memeDossier,
  migrationsSurBaseNeuve,
  nettoyerLesAssemblages,
  referencesA,
  renvoisAuCatalogue,
  SOURCE,
  miseEnForme,
  typecheck,
  verifierSansBase,
} from "./aide-assemblage";

/*
 * Test-verrou de l'assembleur. Ce qu'il prouve, par assemblage
 * dans un dossier temporaire de combinaisons de briques, la vide comprise :
 *   - les fichiers présents et absents sont ceux que la combinaison demande ;
 *   - aucun import ne mène à un fichier retiré, aucun code ne nomme une brique
 *     retirée ;
 *   - chaque extrait de la liste de retrait existe encore dans le catalogue ;
 *   - l'appli assemblée passe la vérification de mise en forme de sa CI
 *     (prettier --check avec les réglages copiés), le typecheck et, avec la base, rejoue ses
 *     migrations sur une base vide, deux fois ;
 *   - sans la brique données, elle passe lint, typecheck et tests sans DATABASE_URL
 *     (son build est prouvé par .github/workflows/assemblage.yml) ;
 *   - elle est un dépôt git local à elle, d'un seul commit, sans remote.
 * Ce qu'il ne prouve pas : lint, tests et build des autres combinaisons
 * (lourds ; lancés à la main).
 *
 * Il dure plus de 10 minutes : npm test l'écarte, npm run test:assembleur le
 * lance seul, et la CI du catalogue (assemblage.yml) : un échantillon sur
 * chaque pull request (ECHANTILLON), le tout la nuit si main a changé ;
 * tests/assemblage-ci.test.ts le verrouille.
 */

// Un délai à part : chaque variante laisse plusieurs dossiers temporaires, et
// Windows met plus que les 10 s par défaut à les supprimer (constaté avec la
// variante « socle seul + comptes »).
afterAll(nettoyerLesAssemblages, 120_000);

const ENTIER = 120_000;

const MANIFESTE = "catalogue.empreintes.json";

// Des fichiers qui disent à eux seuls si une unité est présente.
const TEMOINS: Record<string, string[]> = {
  echeances: ["src/briques/echeances/calcul.ts", "tests/echeances-calcul.test.ts", "tests/echeances-requete.test.ts"],
  calendrier: ["src/briques/calendrier/calcul.ts", "tests/calendrier-calcul.test.ts"],
  validation: ["src/briques/validation/cycle.ts", "tests/validation-cycle.test.ts"],
  "import-lot": ["src/briques/import-lot/lot.ts", "tests/import-lot.test.ts"],
  // La base, la couche données du patron dossiers et
  // l'outillage des données.
  donnees: [
    "src/lib/db/client.ts",
    "src/lib/db/migrations.ts",
    "src/lib/db/schema.sql",
    "src/lib/dossiers-domaine.ts",
    "src/lib/slug.ts",
    "scripts/lib/cli.ts",
    "scripts/bases-locales.ts",
    "docker-compose.yml",
    ".claude/skills/solstice-donnees/SKILL.md",
    ".claude/agents/relecteur-migrations.md",
    "tests/migrations.test.ts",
    "tests/slug.test.ts",
    "src/lib/db/sante.ts",
    "tests/sante-base.test.ts",
  ],
  // Les écrans du patron appellent exiger, ils suivent comptes.
  "patron-dossiers": ["src/app/dossiers/page.tsx", "tests/navigation.test.ts"],
  mails: ["src/briques/mails/envoi.ts", "tests/mails.test.ts"],
  notifications: ["src/briques/notifications/envoi.ts", "tests/notifications.test.ts"],
  contact: ["src/briques/contact/contact.ts", "src/app/contact/page.tsx", "tests/contact.test.ts"],
  // L'adresse IP du visiteur : seules la connexion par code et la limite
  // d'envois du formulaire de contact la lisent.
  "adresse-ip": ["src/lib/adresse-ip.ts", "tests/adresse-ip.test.ts"],
  journal: [
    "src/briques/journal/journal.ts",
    "src/app/journal/page.tsx",
    "tests/journal.test.ts",
    "tests/journal-dossiers.test.ts",
  ],
  deploiement: ["render.yaml", "src/briques/deploiement/README.md", "tests/deploiement.test.ts"],
  // Les droits et la démo. acces.ts reste à l'appli, mais part
  // avec la brique, dont il importe les types.
  comptes: [
    "src/briques/comptes/roles.ts",
    "src/briques/comptes/session.ts",
    "src/briques/comptes/BandeauSession.tsx",
    "src/app/connexion/page.tsx",
    "src/config/acces.ts",
    "src/config/comptes.ts",
    "tests/roles.test.ts",
    "tests/gardes-acces.test.ts",
    "tests/comptes-isolement.test.ts",
    "tests/comptes-session.test.ts",
    "tests/comptes-proxy.test.ts",
    "tests/comptes-administration.test.ts",
    // Le registre des effets d'un compte désactivé, réactivé ou effacé.
    "src/briques/comptes/effets.ts",
    "src/config/effets-comptes.ts",
    "tests/comptes-effets.test.ts",
    // Les cookies et en-têtes simulés de tous les tests, et le rôle qu'ils
    // jouent : seul le code de la brique lit un cookie.
    "tests/setup.ts",
    "tests/aide-cookies.ts",
  ],
  // L'export des données d'une personne et son registre.
  rgpd: [
    "src/briques/rgpd/export.ts",
    "src/config/donnees-personnelles.ts",
    "src/app/mes-donnees/page.tsx",
    "tests/rgpd-export.test.ts",
  ],
  // L'écran d'administration des comptes, optionnel.
  "gestion-comptes": [
    "src/briques/gestion-comptes/EcranComptes.tsx",
    "src/app/comptes/page.tsx",
    "tests/gestion-comptes.test.ts",
  ],
};

// Le socle, que toute copie garde, quelles que soient les briques choisies.
const SOCLE = [
  "CLAUDE.md",
  ".env.example",
  ".gitignore",
  "package.json",
  "tsconfig.json",
  "vitest.config.ts",
  ".claude/skills/solstice-ui/SKILL.md",
  ".claude/hooks/gardes.mjs",
  ".github/workflows/ci.yml",
  // ci.yml vérifie la mise en forme : sans ses réglages, Prettier prendrait
  // ses défauts et refuserait tout le code de l'appli.
  "prettier.config.mjs",
  ".prettierignore",
  ".editorconfig",
  // Verrouille la concurrence et les brouillons de ci.yml : il le suit dans chaque copie.
  "tests/ci.test.ts",
  // ci.yml lance le script, qui lit les exceptions : l'un sans l'autre, la CI
  // de l'appli assemblée échoue.
  "exceptions-audit.json",
  "scripts/verifier-audit.mjs",
  "tests/verifier-audit.test.ts",
  "src/ui/index.ts",
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/proxy.ts",
  "src/app/mentions-legales/page.tsx",
  "src/lib/mentions-legales.ts",
  "tests/mentions-legales.test.ts",
  // La politique de confidentialité : tout site en ligne a au moins
  // un hébergeur, qui reçoit l'adresse IP de ses visiteurs.
  "src/app/confidentialite/page.tsx",
  "src/lib/confidentialite.ts",
  "tests/confidentialite.test.ts",
  // Référencement et aperçu au partage : un site vitrine en a besoin,
  // un outil interne aussi (titres, noindex).
  "src/lib/referencement.ts",
  "src/lib/image-partage.ts",
  "src/app/robots.ts",
  "src/app/sitemap.ts",
  "src/app/opengraph-image.tsx",
  "src/app/twitter-image.tsx",
  "tests/referencement.test.ts",
  "src/app/sante/route.ts",
  "tests/sante.test.ts",
  "src/lib/date-iso.ts",
  "src/lib/navigation.ts",
  "tests/date-iso.test.ts",
  // Les polices du thème, servies par next/font/local : sans les woff2 le
  // build de l'appli échoue, sans la licence OFL leur redistribution est
  // irrégulière, et le test interdit le retour à next/font/google.
  "src/ui/theme/polices/IBMPlexSans-Light-Latin1.woff2",
  "src/ui/theme/polices/IBMPlexSans-Regular-Latin1.woff2",
  "src/ui/theme/polices/IBMPlexSans-Medium-Latin1.woff2",
  "src/ui/theme/polices/IBMPlexSans-SemiBold-Latin1.woff2",
  "src/ui/theme/polices/IBMPlexSans-Bold-Latin1.woff2",
  "src/ui/theme/polices/IBMPlexMono-Regular-Latin1.woff2",
  "src/ui/theme/polices/IBMPlexMono-Medium-Latin1.woff2",
  "src/ui/theme/polices/IBMPlexMono-SemiBold-Latin1.woff2",
  "src/ui/theme/polices/LICENCE-OFL.txt",
  "tests/polices-locales.test.ts",
];

// La vie du catalogue, qu'aucune copie ne reçoit.
const CATALOGUE = [
  "README.md",
  "outils/assembler.mjs",
  "outils/modules.mjs",
  "tests/assembleur.test.ts",
  "tests/aide-assemblage.ts",
  "tests/assemblage-ci.test.ts",
  // Prouve le build du socle sans base et lance ce test-ci : une copie n'a
  // ni l'assembleur ni de quoi le lancer.
  ".github/workflows/assemblage.yml",
  // La licence et les fichiers de communauté du dépôt public : une appli
  // client est livrée sous le contrat du client, pas sous la MIT du catalogue
  // (dont l'avis part dans le NOTICE que l'assembleur écrit).
  "LICENSE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  ".github/ISSUE_TEMPLATE/anomalie.md",
  ".github/ISSUE_TEMPLATE/demande.md",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/pull_request_template.md",
];

// La base suit ce qui la demande : une brique gardée qui la déclare dans `exige`.
const gardeDonnees = (briques: string[]) =>
  briques.some((nom) => (BRIQUES[nom as keyof typeof BRIQUES].exige as string[]).includes("donnees"));

// Le socle seul, sans base : ce qu'une copie peut demander de plus petit.
const SOCLE_SEUL = { nom: "socle seul", briques: [] };

// La brique mails ne lit pas la base ; un site sans base la garde, et passe
// ses vérifications sans DATABASE_URL.
const AVEC_MAILS_SANS_BASE = { nom: "socle seul + mails", briques: ["mails"] };

// Une vitrine sans base se met en ligne ; render.yaml perd la base
// payante et les variables mails, et son test-verrou passe dans la copie.
const AVEC_DEPLOIEMENT_SANS_BASE = { nom: "socle seul + déploiement", briques: ["deploiement"] };

// La brique comptes se branche sur le socle. Elle garde la base et son patron
// dossiers : le point de départ d'une appli sur mesure, connexion comprise.
const AVEC_COMPTES = { nom: "comptes (rgpd d'office)", briques: ["comptes", "mails"] };

// La vitrine avec son formulaire de contact. La base vient pour
// la limite d'envois, sans connexion ni écrans du patron dossiers, et avec le
// déploiement, pour que render.yaml perde la variable du contact quand il part.
const AVEC_CONTACT = { nom: "mails + contact + déploiement", briques: ["mails", "contact", "deploiement"] };

// L'export garde son registre ; chaque unité absente y retire sa ligne. Avec
// les seules comptes (rgpd y vient d'office), il ne reste que ses sources ;
// avec echeances, les sources des autres briques partent.
const AVEC_ECHEANCES_ET_RGPD = {
  nom: "comptes + echeances + rgpd",
  briques: ["comptes", "mails", "echeances", "rgpd"],
};
// Le journal d'audit se branche sur le patron dossiers, que la brique comptes
// garde. Les variantes sans lui prouvent que les dossiers retrouvent leurs
// simples requêtes. Avec rgpd : le registre de l'export garde la source du
// journal, que les variantes rgpd sans lui retirent.
const AVEC_JOURNAL = { nom: "comptes + rgpd + journal", briques: ["mails", "comptes", "rgpd", "journal"] };
// Les notifications arrivent à brancher sur le module métier de l'appli ;
// avec echeances, dont la liaison applique les règles de calcul, et rgpd, dont
// le registre garde leur source.
const AVEC_NOTIFICATIONS = {
  nom: "comptes + echeances + notifications + rgpd",
  briques: ["comptes", "mails", "echeances", "rgpd", "notifications"],
};
// Le niveau 3 des droits, l'écran /comptes.
const AVEC_GESTION_COMPTES = { nom: "comptes + gestion-comptes", briques: ["comptes", "mails", "gestion-comptes"] };

// La brique import-lot porte ses écrans ; une copie la demande seule, pour la
// brancher ensuite sur sa propre entité.
const AVEC_IMPORT_LOT = { nom: "comptes + import-lot", briques: ["comptes", "mails", "import-lot"] };

// Les briques à brancher, sans la brique comptes : elles lisent la base et
// rien d'autre, et une copie qui les prend sans connexion doit compiler.
const A_BRANCHER_SANS_COMPTES = {
  nom: "echeances + calendrier + validation + import-lot",
  briques: ["echeances", "calendrier", "validation", "import-lot"],
};

// Les briques optionnelles ensemble, sans les briques à brancher.
const AVEC_BRIQUES_OPTIONNELLES = {
  nom: "comptes + notifications + journal + gestion-comptes + contact",
  briques: ["comptes", "mails", "notifications", "journal", "gestion-comptes", "contact"],
};

// Le catalogue entier, qui a aussi son propre bloc (« assemblage de tout le catalogue »).
const TOUTES_LES_BRIQUES = { nom: "toutes les briques", briques: Object.keys(BRIQUES) };

const PARTAGEES = ["patron-dossiers", "adresse-ip"];

const TOUTES_LES_COMBINAISONS = [
  SOCLE_SEUL,
  AVEC_MAILS_SANS_BASE,
  AVEC_DEPLOIEMENT_SANS_BASE,
  AVEC_COMPTES,
  AVEC_CONTACT,
  AVEC_ECHEANCES_ET_RGPD,
  AVEC_JOURNAL,
  AVEC_NOTIFICATIONS,
  AVEC_GESTION_COMPTES,
  AVEC_IMPORT_LOT,
  A_BRANCHER_SANS_COMPTES,
  AVEC_BRIQUES_OPTIONNELLES,
  TOUTES_LES_BRIQUES,
];

// Les unités gardées : les briques choisies, et rgpd d'office avec comptes.
type Choix = { briques: string[] };
const gardeesPar = ({ briques }: Choix) => [...briques, ...(briques.includes("comptes") ? ["rgpd"] : [])];
const tailleDe = (choix: Choix) => new Set(gardeesPar(choix)).size;

// L'échantillon des pull requests (ASSEMBLEUR_ECHANTILLON non vide, posé par le
// job assembleur de .github/workflows/assemblage.yml) ; le test complet passe
// la nuit. Le test complet coûtait environ 219 s à chaque passage, quand il
// assemblait chaque combinaison de trois modules de test. Trois combinaisons
// suffisent à garder chaque brique au moins une fois :
//   - le socle seul avec le déploiement, sans base : presque tout y est retiré ;
//   - la plus grosse, toutes les briques (le catalogue entier a son propre
//     bloc, qui tourne toujours) ;
//   - les briques à brancher sans la brique comptes : c'est la copie qu'un
//     import de comptes glissé dans une de ces briques casserait.
// tests/assemblage-ci.test.ts verrouille le job ; le verrou ci-dessous, la couverture.
const PLUS_GROSSE = TOUTES_LES_COMBINAISONS.reduce((a, b) => (tailleDe(b) > tailleDe(a) ? b : a));
const ECHANTILLON = [AVEC_DEPLOIEMENT_SANS_BASE, PLUS_GROSSE, A_BRANCHER_SANS_COMPTES];
const COMBINAISONS = process.env.ASSEMBLEUR_ECHANTILLON ? ECHANTILLON : TOUTES_LES_COMBINAISONS;

// Ce que l'échantillon doit garder pour valoir le test complet sur une pull
// request : chaque brique au moins une fois, une combinaison sans base, la
// plus grosse, et les briques à brancher sans comptes.
function couvreLeCatalogue(echantillon: Choix[]): boolean {
  const gardes = new Set(echantillon.flatMap(gardeesPar));
  return (
    Object.keys(BRIQUES).every((nom) => gardes.has(nom)) &&
    echantillon.some(({ briques }) => !gardeDonnees(briques)) &&
    echantillon.includes(PLUS_GROSSE) &&
    echantillon.includes(A_BRANCHER_SANS_COMPTES)
  );
}

describe("échantillon des pull requests (le test complet passe la nuit)", () => {
  it("garde chaque brique au moins une fois, une combinaison sans base, la plus grosse et les briques à brancher sans comptes", () => {
    expect(PLUS_GROSSE).toBe(TOUTES_LES_BRIQUES);
    expect(couvreLeCatalogue(ECHANTILLON)).toBe(true);
    // Cas fautifs : il manque la combinaison sans base ; il manque les briques
    // à brancher sans comptes ; il manque la plus grosse, même quand toutes
    // les autres couvrent chaque brique.
    expect(couvreLeCatalogue([...ECHANTILLON.filter((c) => c !== AVEC_DEPLOIEMENT_SANS_BASE), AVEC_CONTACT])).toBe(
      false
    );
    expect(couvreLeCatalogue([...ECHANTILLON.filter((c) => c !== A_BRANCHER_SANS_COMPTES), AVEC_IMPORT_LOT])).toBe(
      false
    );
    const sansLaPlusGrosse = TOUTES_LES_COMBINAISONS.filter((c) => c !== PLUS_GROSSE);
    expect(Object.keys(BRIQUES).every((nom) => sansLaPlusGrosse.flatMap(gardeesPar).includes(nom))).toBe(true);
    expect(couvreLeCatalogue(sansLaPlusGrosse)).toBe(false);
  });
});

describe.each(COMBINAISONS)("assemblage « $nom »", ({ briques: choisies }) => {
  // Les briques gardées : les choisies, et rgpd, d'office avec comptes. Écrit
  // en toutes lettres, pas recalculé par briquesEntrainees : le test ne doit
  // pas redire la fonction qu'il vérifie. L'assemblage ne reçoit que les choisies.
  const briques = choisies.includes("comptes") && !choisies.includes("rgpd") ? [...choisies, "rgpd"] : choisies;
  const unites = [...PARTAGEES, ...Object.keys(BRIQUES), "donnees"];
  const gardee = (unite: string) =>
    unite === "patron-dossiers"
      ? briques.includes("comptes")
      : unite === "adresse-ip"
        ? ADRESSE_IP.conserveSiUneDe.some((nom: string) => briques.includes(nom))
        : unite === "donnees"
          ? gardeDonnees(briques)
          : briques.includes(unite);
  const assemble = assemblerEnTemporaire({ briques: choisies });

  it("garde le socle et les unités choisies, et rien des autres ni du catalogue (fichiers présents et absents)", () => {
    for (const chemin of SOCLE) expect(existeAssemble(assemble.dossier, chemin), chemin).toBe(true);
    for (const chemin of CATALOGUE) expect(existeAssemble(assemble.dossier, chemin), chemin).toBe(false);
    for (const [unite, temoins] of Object.entries(TEMOINS)) {
      for (const chemin of temoins)
        expect(existeAssemble(assemble.dossier, chemin), `${unite} : ${chemin}`).toBe(gardee(unite));
    }
    for (const unite of unites) {
      const listee = assemble.retires.includes(`${PARTAGEES.includes(unite) ? "partagée" : "brique"} ${unite}`);
      expect(listee, `${unite} listé comme retiré`).toBe(!gardee(unite));
    }
  });

  it("ne copie ni secret, ni dossier de dépendances ou de build, ni worktree", () => {
    for (const chemin of fichiersAssembles(assemble.dossier)) {
      expect(chemin, chemin).not.toMatch(/(^|\/)(\.env(\.(?!example$).+)?|node_modules|\.next|worktrees)(\/|$)/);
    }
  });

  // Constaté à un essai de creer-appli : le git init
  // était laissé à l'humain, et tant qu'il n'était pas fait, git remontait
  // jusqu'à un dépôt parent (le dossier de profil) où un `git add -A` aurait
  // versé toute l'appli.
  it("est un dépôt git dont la racine est le dossier de sortie : branche main, un seul commit, arbre propre, aucun remote", () => {
    const { dossier } = assemble;
    expect(memeDossier(gitDans(dossier, "rev-parse", "--show-toplevel"), dossier)).toBe(true);
    expect(gitDans(dossier, "symbolic-ref", "--short", "HEAD")).toBe("main");
    expect(gitDans(dossier, "rev-list", "--count", "HEAD")).toBe("1");
    expect(gitDans(dossier, "rev-parse", "HEAD")).toBe(assemble.commitInitial);
    expect(gitDans(dossier, "status", "--porcelain")).toBe("");
    expect(gitDans(dossier, "remote")).toBe("");
    // Un fichier du catalogue que le .gitignore viserait serait copié mais
    // jamais commité, sans un mot : tout ce qui est écrit est suivi.
    expect(gitDans(dossier, "ls-files", "-z").split("\0").filter(Boolean).sort()).toEqual(
      fichiersAssembles(dossier).sort()
    );
  });

  it("nomme dans son premier commit le commit du catalogue, ce qui est gardé et ce qui est retiré", () => {
    const [sujet, ...corps] = gitDans(assemble.dossier, "log", "-1", "--format=%B").split("\n");
    expect(sujet).toBe(`Socle : appli assemblée depuis le catalogue au commit ${COMMIT_DE_TEST}`);
    const texte = corps.join("\n");
    for (const nom of briques) expect(texte, nom).toMatch(new RegExp(`^Gardé : .*\\b${nom}\\b`, "m"));
    for (const retire of assemble.retires) expect(texte, retire).toMatch(new RegExp(`^Retiré : .*${retire}`, "m"));
    expect(texte).toMatch(/^Dependabot : retiré.$/m);
  });

  it("ignore .env.local dès le premier commit, par le .gitignore copié (pas celui du poste)", () => {
    // -v nomme la règle qui ignore : elle doit venir du .gitignore de l'appli.
    expect(gitDans(assemble.dossier, "check-ignore", "-v", ".env.local")).toMatch(/^\.gitignore:\d+:/);
  });

  it("note le commit de référence du catalogue dans la blueprint", () => {
    const blueprint = lireAssemble(assemble.dossier, "blueprint.md");
    expect(blueprint).toMatch(new RegExp(`^commit_reference: ${COMMIT_DE_TEST}$`, "m"));
    expect(blueprint).toContain(`briques_assemblees: [${briques.join(", ")}]`);
    expect(blueprint).not.toContain("modules_assembles");
  });

  // Empreinte prise sur le fichier tel que l'appli le reçoit, sinon chaque
  // fichier retouché par l'assembleur paraîtrait modifié par l'appli ; et sur
  // le fichier commité, pas sur le disque, dont les fins de ligne peuvent
  // différer de ce que git enregistre.
  // Un git show par fichier : plus que les 5 s par défaut sous Windows.
  it(
    "écrit dans son premier commit un manifeste d'empreintes : chaque fichier venu du catalogue, son unité et l'empreinte du fichier commité",
    { timeout: ENTIER },
    () => {
      const { dossier } = assemble;
      expect(gitDans(dossier, "ls-files", MANIFESTE)).toBe(MANIFESTE);
      const manifeste = JSON.parse(lireAssemble(dossier, MANIFESTE));
      expect(manifeste.format).toBe(1);
      expect(manifeste.note).toMatch(/Ne pas le retoucher/);
      expect(manifeste.catalogue).toEqual({
        version: JSON.parse(fs.readFileSync(path.join(SOURCE, "package.json"), "utf-8")).version,
        commit: COMMIT_DE_TEST,
      });
      const ecritsParLAssembleur = ["blueprint.md", "NOTICE", MANIFESTE];
      const venusDuCatalogue = fichiersAssembles(dossier)
        .filter((chemin) => !ecritsParLAssembleur.includes(chemin))
        .sort();
      expect(Object.keys(manifeste.fichiers)).toEqual(venusDuCatalogue);
      for (const chemin of venusDuCatalogue) {
        const { unite, sha256 } = manifeste.fichiers[chemin];
        const commite = execFileSync("git", ["-C", dossier, "show", `HEAD:${chemin}`], { maxBuffer: 1 << 30 });
        expect(sha256, chemin).toBe(createHash("sha256").update(commite).digest("hex"));
        const brique = /^src\/briques\/([^/]+)\//.exec(chemin)?.[1];
        if (brique) expect(unite, chemin).toBe(brique);
      }
      // Les témoins de chaque unité gardée, partagées et base comprises.
      for (const [unite, temoins] of Object.entries(TEMOINS)) {
        if (!gardee(unite)) continue;
        for (const chemin of temoins) expect(manifeste.fichiers[chemin]?.unite, chemin).toBe(unite);
      }
      expect(manifeste.fichiers["package.json"].unite).toBe("socle");
    }
  );

  it("ne laisse aucun import vers un fichier retiré (aucune référence pendante)", () => {
    expect(importsInvalides(assemble.dossier)).toEqual([]);
  });

  it("ne nomme, dans son code, aucune brique retirée (routes, tables, gardes, chemins)", () => {
    for (const unite of unites) {
      if (gardee(unite)) continue;
      expect(referencesA(assemble.dossier, unite), `références à ${unite}`).toEqual([]);
    }
  });

  // .env.example est au socle, mais une copie sans la brique mails
  // ne doit pas réclamer une clé Resend qui ne sert à rien.
  it("ne garde les variables de la brique mails dans .env.example que si la brique est gardée", () => {
    const modele = lireAssemble(assemble.dossier, ".env.example");
    expect(/MAILS_FOURNISSEUR|MAILS_EXPEDITEUR|RESEND_API_KEY|brique mails/.test(modele)).toBe(gardee("mails"));
    expect(modele).toContain("Modèle des variables d'environnement");
    expect(/CONTACT_DESTINATAIRE|brique contact/.test(modele), "contact").toBe(gardee("contact"));
    expect(/NOTIFICATIONS_|brique notifications/.test(modele), "notifications").toBe(gardee("notifications"));
    // Sans quoi Render demanderait une clé Resend à la création.
    if (gardee("deploiement")) {
      const blueprint = lireAssemble(assemble.dossier, "render.yaml");
      expect(/MAILS_|RESEND_API_KEY|brique mails/.test(blueprint), "render.yaml").toBe(gardee("mails"));
      expect(/DATABASE_URL|^databases:/m.test(blueprint), "render.yaml").toBe(gardee("donnees"));
      // Sans quoi Render demanderait une adresse de contact pour rien.
      expect(/CONTACT_DESTINATAIRE|brique contact/.test(blueprint), "render.yaml").toBe(gardee("contact"));
      expect(/NOTIFICATIONS_|brique notifications/.test(blueprint), "render.yaml").toBe(gardee("notifications"));
    }
  });

  // src/proxy.ts est au socle (la CSP) ; la brique comptes y
  // branche la protection des routes, et la retire avec elle.
  it("ne garde la protection des routes dans proxy.ts, et les variables de la brique comptes, que si la brique est gardée", () => {
    const proxy = lireAssemble(assemble.dossier, "src/proxy.ts");
    expect(proxy).toContain("Content-Security-Policy");
    expect(proxy.includes("protegerLaRoute")).toBe(gardee("comptes"));
    expect(/AUTH_SECRET|COMPTES_PREMIER_ADMIN/.test(lireAssemble(assemble.dossier, ".env.example"))).toBe(
      gardee("comptes")
    );
    if (gardee("deploiement")) {
      expect(/AUTH_SECRET|COMPTES_PREMIER_ADMIN/.test(lireAssemble(assemble.dossier, "render.yaml"))).toBe(
        gardee("comptes")
      );
    }
  });

  // Chaque brique décrit ses traitements dans la politique de
  // confidentialité (socle), et l'assembleur retire la description, ses choix
  // à remplir et ses sous-traitants avec elle. Une brique retirée qui resterait
  // décrite publierait un traitement que l'appli ne fait pas.
  it("ne décrit, dans la politique de confidentialité, que les traitements des briques gardées", () => {
    const politique = lireAssemble(assemble.dossier, "src/lib/confidentialite.ts");
    expect(politique).toContain('cle: "hebergement"');
    expect(/TRAITEMENTS_COMPTES|^\s+comptes: \{|"connexion-code"|"connexion-google"/m.test(politique), "comptes").toBe(
      gardee("comptes")
    );
    expect(/TRAITEMENTS_MAILS|^\s+mails: \{|^\s+resend:/m.test(politique), "mails").toBe(gardee("mails"));
    expect(/TRAITEMENTS_CONTACT|^\s+contact: \{ baseLegale/m.test(politique), "contact").toBe(gardee("contact"));
    expect(/LIEUX_DEPLOIEMENT|brique déploiement/.test(politique), "déploiement").toBe(gardee("deploiement"));
    expect(/TRAITEMENTS_JOURNAL|^s+journal: {/m.test(politique), "journal").toBe(gardee("journal"));
    expect(/TRAITEMENTS_NOTIFICATIONS|^\s+notifications: \{/m.test(politique), "notifications").toBe(
      gardee("notifications")
    );
  });

  // Le registre de l'export ne nomme que les unités gardées. Le
  // verrou des tables (tests/rgpd-export.test.ts) le prouve dans le catalogue ;
  // ici, chaque assemblage, sans base à interroger.
  it.runIf(gardee("rgpd"))(
    "ne déclare, dans le registre de l'export, que les sources et tables des unités gardées",
    () => {
      const registre = lireAssemble(assemble.dossier, "src/config/donnees-personnelles.ts");
      // Sans virgule ni retour à la ligne : seule source restante, Prettier
      // remet la liste sur une ligne.
      expect(registre).toMatch(/\.\.\.SOURCES_COMPTES\b/);
      expect(registre.includes("SOURCES_VALIDATION"), "validation").toBe(gardee("validation"));
      expect(registre.includes("SOURCES_IMPORT_LOT"), "import-lot").toBe(gardee("import-lot"));
      expect(registre.includes("SOURCES_JOURNAL"), "journal").toBe(gardee("journal"));
      expect(registre.includes("SOURCES_NOTIFICATIONS"), "notifications").toBe(gardee("notifications"));
      expect(registre.includes('quoi: "E-mails envoyés"'), "mails").toBe(gardee("mails"));
      expect(registre.includes('quoi: "Messages du formulaire de contact"'), "contact").toBe(gardee("contact"));
    }
  );

  // Le registre des effets de comptes ne nomme que les unités gardées : sans
  // la brique journal, son entrée part, et une désactivation ne se trace
  // plus. Le verrou de la transaction (tests/comptes-effets.test.ts) joue
  // ces effets dans le catalogue ; ici, chaque assemblage.
  it.runIf(gardee("comptes"))(
    "ne déclare, dans le registre des effets de comptes, que les effets des unités gardées",
    () => {
      const registre = lireAssemble(assemble.dossier, "src/config/effets-comptes.ts");
      expect(registre).toContain("export const EFFETS_COMPTES: EffetsDeCompte[] = [");
      expect(registre.includes("EFFETS_JOURNAL"), "journal").toBe(gardee("journal"));
    }
  );

  // Constaté à un essai d'assemblage : l'appli assemblée citait, dans un
  // commentaire et un test, un document du catalogue que l'assembleur ne
  // copie pas.
  it("ne renvoie à aucun fichier d'outils/, que le client n'a pas (blueprint.md excepté)", () => {
    expect(renvoisAuCatalogue(assemble.dossier)).toEqual([]);
  });

  it.runIf(gardee("donnees"))(
    "rejoue son schéma et ses migrations deux fois sur une base vide, et ne crée que les tables de ce qu'il garde",
    { timeout: ENTIER },
    async () => {
      const resultat = await migrationsSurBaseNeuve(assemble.dossier);
      expect(resultat.sortie.includes("OBJETS:") ? "" : resultat.sortie).toBe("");
      expect(resultat.code).toBe(0);
      const tablesParUnite: Record<string, string[]> = {
        validation: ["propositions"],
        "import-lot": ["import_lots", "import_lot_lignes"],
        comptes: ["utilisateurs", "sessions", "codes_connexion", "codes_connexion_essais"],
        contact: ["contact_envois"],
        journal: ["journal_audit"],
        notifications: ["notifications_envois", "notifications_lancements"],
      };
      expect(resultat.objets).toContain("dossiers");
      for (const [unite, objets] of Object.entries(tablesParUnite)) {
        for (const objet of objets) expect(resultat.objets.includes(objet), `${unite} : ${objet}`).toBe(gardee(unite));
      }
    }
  );
});

// Ce qui lance prettier, tsc, eslint ou vitest dans l'appli assemblée tourne en même
// temps, un processus par cœur (lancerDans, tests/aide-assemblage.ts) : en
// série, les seuls typechecks prenaient 80 s des 4 min 30 de la CI. Chaque
// vérification a sa copie de travail et son processus ; l'expect du contexte
// rattache chaque échec à son test.
describe("appli assemblée, vérifiée par ses propres outils", () => {
  it.concurrent.for(COMBINAISONS)(
    "« $nom » passe le typecheck, tel qu'assemblé",
    { timeout: ENTIER },
    async (variante, { expect }) => {
      const resultat = await typecheck(assemblerEnTemporaire(variante).dossier);
      expect(resultat.sortie).toBe("");
      expect(resultat.code).toBe(0);
    }
  );

  // Un retrait laisse parfois une forme que Prettier écrirait autrement : une
  // condition de plusieurs lignes qui tient de nouveau sur une seule, un appel
  // raccourci. La CI de l'appli refuserait alors son tout premier commit.
  it.concurrent.for(COMBINAISONS)(
    "« $nom » passe la vérification de mise en forme de sa CI, tel qu'assemblé",
    { timeout: ENTIER },
    async (variante, { expect }) => {
      const resultat = await miseEnForme(assemblerEnTemporaire(variante).dossier);
      expect(resultat.code, resultat.sortie).toBe(0);
    }
  );

  // Un site sans base (le socle ne
  // suppose ni base ni connexion) passe les vérifications de son CLAUDE.md
  // sans DATABASE_URL. Le build se prouve dans le job socle-seul de .github/workflows/assemblage.yml.
  it.concurrent.for(COMBINAISONS.filter(({ briques }) => !gardeDonnees(briques)))(
    "« $nom », sans la brique données, n'a ni src/lib/db/ ni pg importé, et passe lint, typecheck et tests sans DATABASE_URL",
    { timeout: 4 * ENTIER },
    async (variante, { expect }) => {
      const assemble = assemblerEnTemporaire(variante);
      expect(fichiersAssembles(assemble.dossier).filter((chemin) => chemin.startsWith("src/lib/db/"))).toEqual([]);
      for (const { etape, code, sortie } of await verifierSansBase(assemble.dossier)) {
        expect(code, `${etape} :\n${sortie}`).toBe(0);
        if (etape === "lint") expect(sortie.trim(), "lint sans avertissement").toBe("");
      }
    }
  );
});

// Le verrou ci-dessus ne vaut que s'il attrape un renvoi fautif : on en écrit
// un dans un petit arbre, et on vérifie aussi ce qu'il laisse passer.
describe("verrou des renvois à outils/", () => {
  // Un arbre écrit à la main, pour que ces cas ne dépendent pas de l'état du
  // catalogue : ils prouvent le verrou, ils ne le rejouent pas sur le dépôt.
  function arbre(fichiers: Record<string, string>): string {
    const dossier = dossierTemporaireVide();
    for (const [chemin, contenu] of Object.entries(fichiers)) {
      fs.mkdirSync(path.dirname(path.join(dossier, chemin)), { recursive: true });
      fs.writeFileSync(path.join(dossier, chemin), contenu);
    }
    return dossier;
  }

  it("attrape un renvoi à outils/ dans un commentaire, un test ou un .md", () => {
    const dossier = arbre({
      "src/lib/date-iso.ts": "// voir outils/modules.mjs, point 3\n",
      "tests/slug.test.ts": "// lancé par outils/assembler.mjs\n",
      "src/lib/format.ts": "// voir ../../Outils/assembler.mjs\n",
      "src/briques/echeances/README.md": "# Brique\n\nVoir `outils/modules.mjs`.\n",
    });
    expect(renvoisAuCatalogue(dossier).sort()).toEqual([
      "src/briques/echeances/README.md:3 cite « outils/modules.mjs »",
      "src/lib/date-iso.ts:1 cite « outils/modules.mjs »",
      "src/lib/format.ts:1 cite « ../../Outils/assembler.mjs »",
      "tests/slug.test.ts:1 cite « outils/assembler.mjs »",
    ]);
  });

  it("laisse passer blueprint.md (écrite par le script) et les dossiers de même nom plus bas dans l'arbre", () => {
    const dossier = arbre({
      "blueprint.md": "Catalogue : outils/assembler.mjs\n",
      "src/app/outils/page.tsx": 'import { x } from "@/app/outils/x";\n// src/outils/ n\'est pas celui du catalogue\n',
    });
    expect(renvoisAuCatalogue(dossier)).toEqual([]);
  });
});

describe("garde des secrets", () => {
  it("écarte tout .env, où qu'il soit, même suivi par erreur, et laisse passer .env.example", () => {
    for (const secret of [".env", ".env.local", ".env.production", "sous/dossier/.env", "sous/.env.test"]) {
      expect(estUnSecret(secret), secret).toBe(true);
    }
    for (const sain of [
      ".env.example",
      "sous/.env.example",
      "src/lib/environnement.ts",
      ".gitignore",
      "scripts/env.ts",
    ]) {
      expect(estUnSecret(sain), sain).toBe(false);
    }
  });
});

// Les fichiers qui portent le nom et la licence du paquet : npm les recopie à la racine du verrou.
const CHEMINS_DU_PAQUET = ["package.json", "package-lock.json"];

// Ce qui lance ce fichier-ci : une copie ne l'a pas (EXCLUS_DU_CATALOGUE),
// la ligne part de package.json et de CLAUDE.md.
const lanceLeTestDeLAssembleur = (ligne: string) => ligne.includes("test:assembleur");

// Les champs de package.json qui décrivent le dépôt public du catalogue.
const CHAMPS_DU_DEPOT = ["description", "repository", "homepage", "bugs"];

// Les lignes de package.json sans celles des champs du dépôt, qui se suivent
// de « description » à la fermeture de « bugs » (un seul champ, url).
function sansLesChampsDuDepot(lignes: string[]) {
  const debut = lignes.findIndex((ligne) => ligne.startsWith('  "description": '));
  const fin = lignes.findIndex((ligne) => ligne.startsWith('  "bugs": {')) + 2;
  expect(debut, "champs du dépôt dans package.json").toBeGreaterThan(-1);
  expect(fin, "« bugs » après « description »").toBeGreaterThan(debut);
  return lignes.filter((_, rang) => rang < debut || rang > fin);
}

describe("assemblage de tout le catalogue", () => {
  // Avec Dependabot : sans l'option, son fichier est retiré par défaut.
  const tout = assemblerEnTemporaire({ briques: Object.keys(BRIQUES) }, { dependabot: true });

  it("ne retire et ne retouche rien : chaque fichier du catalogue hors vie du catalogue est copié à l'identique", () => {
    expect(tout.retires).toEqual([]);
    const copies = new Set(fichiersAssembles(tout.dossier));
    let comptes = 0;
    for (const chemin of fichiersDuCatalogue()) {
      if (
        EXCLUS_DU_CATALOGUE.some((exclu: string) => (exclu.endsWith("/") ? chemin.startsWith(exclu) : chemin === exclu))
      ) {
        expect(copies.has(chemin), `${chemin} ne devrait pas être copié`).toBe(false);
        continue;
      }
      expect(copies.has(chemin), `${chemin} manque`).toBe(true);
      const original = fs.readFileSync(path.join(SOURCE, chemin));
      const copie = fs.readFileSync(path.join(tout.dossier, chemin));
      // Seules exceptions : le paquet (nom, licence, script de test, champs du
      // dépôt) et la ligne de CLAUDE.md qui lance le test de l'assembleur,
      // retouchés dans tous les assemblages (verrouillés par les tests suivants).
      if (![...CHEMINS_DU_PAQUET, "CLAUDE.md"].includes(chemin)) {
        // Les fins de ligne sont celles du fichier d'origine, octet pour octet.
        expect(copie.equals(original), `${chemin} diffère`).toBe(true);
      }
      comptes++;
    }
    // La blueprint, l'avis NOTICE et le manifeste d'empreintes sont les seuls
    // fichiers que le catalogue n'a pas.
    expect(copies.size).toBe(comptes + 3);
  });

  // Le catalogue est publié sous MIT ; le code d'une appli client ne l'est
  // pas : une copie qui dirait « MIT » serait fausse dès le premier assemblage.
  // Rien d'autre que le nom (verrouillé par « nom de l'appli assemblée »), le
  // lancement du test de l'assembleur et les champs du dépôt (test suivant) ne
  // change dans ces deux fichiers, sinon une dépendance ou une version
  // bougerait avec la licence.
  it("pose « UNLICENSED » comme licence de l'appli, sans rien changer d'autre que le nom, le script de test et les champs du dépôt à package.json, ni que le nom à package-lock.json", () => {
    const catalogue = JSON.parse(fs.readFileSync(path.join(SOURCE, "package.json"), "utf-8"));
    expect(catalogue.license).toBe("MIT");
    const nom = `"name": "${JSON.parse(lireAssemble(tout.dossier, "package.json")).name}",`;
    const attendues = {
      "package.json": [nom, '"license": "UNLICENSED",', '"test": "vitest run"'],
      "package-lock.json": [nom, nom, '"license": "UNLICENSED",'],
    };
    for (const chemin of CHEMINS_DU_PAQUET) {
      // Le script qui lance le test de l'assembleur part : la copie n'a pas le fichier.
      const sansLeTest = lireAssemble(SOURCE, chemin)
        .split("\n")
        .filter((ligne) => !lanceLeTestDeLAssembleur(ligne));
      const lignesOriginales = chemin === "package.json" ? sansLesChampsDuDepot(sansLeTest) : sansLeTest;
      const lignesCopiees = lireAssemble(tout.dossier, chemin).split("\n");
      expect(lignesCopiees.length, `${chemin} : nombre de lignes`).toBe(lignesOriginales.length);
      const differentes = lignesCopiees.filter((ligne, rang) => ligne !== lignesOriginales[rang]);
      expect(
        differentes.map((ligne) => ligne.trim()),
        chemin
      ).toEqual(attendues[chemin as keyof typeof attendues]);
    }
    const copie = JSON.parse(lireAssemble(tout.dossier, "package.json"));
    expect(copie.license).toBe("UNLICENSED");
    expect(JSON.stringify(copie.scripts)).not.toContain("assembleur");
    const verrou = JSON.parse(lireAssemble(tout.dossier, "package-lock.json"));
    expect(verrou.packages[""].license).toBe("UNLICENSED");
  });

  // Le catalogue y décrit son dépôt public : copiés, ces champs donnaient à
  // l'appli la description du catalogue et envoyaient ses anomalies vers les
  // tickets du catalogue. engines reste : l'appli tourne sur la même CI.
  it("retire de package.json la description et les adresses du dépôt du catalogue, et garde engines", () => {
    const catalogue = JSON.parse(fs.readFileSync(path.join(SOURCE, "package.json"), "utf-8"));
    const copie = JSON.parse(lireAssemble(tout.dossier, "package.json"));
    for (const champ of CHAMPS_DU_DEPOT) {
      expect(catalogue[champ], `${champ} au catalogue`).toBeDefined();
      expect(copie[champ], `${champ} dans la copie`).toBeUndefined();
    }
    expect(copie.engines).toEqual(catalogue.engines);
    // npm n'en recopie rien dans le verrou aujourd'hui ; ce test le tient.
    const verrou = lireAssemble(tout.dossier, "package-lock.json");
    for (const adresse of [catalogue.repository.url, catalogue.homepage, catalogue.bugs.url]) {
      expect(verrou).not.toContain(adresse);
    }
  });

  it("retire de CLAUDE.md la seule ligne qui lance le test de l'assembleur, que la copie n'a pas", () => {
    // Texte brut, fins de ligne comprises : CLAUDE.md sort de la comparaison
    // octet pour octet du premier test.
    const original = fs.readFileSync(path.join(SOURCE, "CLAUDE.md"), "utf-8").split(/(?<=\n)/);
    const sansLaLigne = original.filter((ligne) => !lanceLeTestDeLAssembleur(ligne));
    expect(sansLaLigne).toHaveLength(original.length - 1);
    expect(fs.readFileSync(path.join(tout.dossier, "CLAUDE.md"), "utf-8")).toBe(sansLaLigne.join(""));
  });

  // Avec Dependabot, que les combinaisons n'ont pas : le verrou des renvois le lit aussi.
  it("ne renvoie à aucun fichier d'outils/, que le client n'a pas (blueprint.md excepté)", () => {
    expect(renvoisAuCatalogue(tout.dossier)).toEqual([]);
  });

  // Le client reçoit un dépôt, pas l'outil : la skill creer-appli nomme outils/assembler.mjs,
  // que l'appli assemblée n'a pas, et mènerait à rien chez lui. Les autres
  // skills du harnais, elles, restent.
  it("ne donne pas la skill creer-appli au client, et lui laisse celles du harnais", () => {
    const copies = fichiersAssembles(tout.dossier);
    expect(copies.filter((chemin) => chemin.startsWith(".claude/skills/creer-appli/"))).toEqual([]);
    expect(copies).toContain(".claude/skills/solstice-livrer/SKILL.md");
  });
});

// Les fichiers que git suit : la même source que l'assembleur, qui ne regarde pas
// le disque (un dossier ignoré mais présent ne doit pas fausser la comparaison).
function fichiersDuCatalogue(): string[] {
  return execFileSync("git", ["-C", SOURCE, "ls-files", "-z"], { encoding: "utf-8" })
    .split("\0")
    .filter((chemin) => chemin !== "" && fs.existsSync(path.join(SOURCE, chemin)));
}

describe("refus de l'assembleur", () => {
  const variante = { briques: ["echeances", "comptes", "mails"] };

  it("refuse un dossier de sortie qui n'est pas vide (il n'écrit jamais dans un dossier qui a déjà du contenu)", () => {
    const dossier = dossierTemporaireVide();
    fs.writeFileSync(path.join(dossier, "existant.txt"), "à moi");
    expect(() => assembler({ source: SOURCE, sortie: dossier, commit: COMMIT_DE_TEST, ...variante })).toThrow(
      /n'est pas vide/
    );
    expect(fs.readdirSync(dossier)).toEqual(["existant.txt"]);
  });

  it("refuse un dossier de sortie dans le catalogue lui-même", () => {
    expect(() =>
      assembler({ source: SOURCE, sortie: path.join(SOURCE, "sortie-fautive"), commit: COMMIT_DE_TEST, ...variante })
    ).toThrow(/dans le catalogue/);
    expect(fs.existsSync(path.join(SOURCE, "sortie-fautive"))).toBe(false);
  });

  it("refuse une brique inconnue, en listant celles qui existent", () => {
    expect(() =>
      assembler({
        source: SOURCE,
        sortie: dossierTemporaireVide(),
        commit: COMMIT_DE_TEST,
        briques: ["echeances", "comptes", "mails", "radar"],
      })
    ).toThrow(/Brique inconnue « radar »\. Briques : echeances, /);
  });

  // La connexion par code envoie son code par la brique mails.
  it("refuse la brique comptes sans la brique mails, en nommant les deux et l'option", () => {
    expect(() => planifier({ briques: ["comptes"] })).toThrow(
      "La brique « comptes » exige la ou les briques mails, qui ne sont pas choisies. Les ajouter à --briques."
    );
    expect(() =>
      assembler({
        source: SOURCE,
        sortie: dossierTemporaireVide(),
        commit: COMMIT_DE_TEST,
        briques: ["echeances", "comptes"],
      })
    ).toThrow(/comptes.*mails.*--briques/s);
  });

  // L'écran d'administration n'a rien à administrer sans comptes.
  it("refuse la brique gestion-comptes sans la brique comptes, en nommant les deux et l'option", () => {
    expect(() => planifier({ briques: ["mails", "gestion-comptes"] })).toThrow(
      "La brique « gestion-comptes » exige la ou les briques comptes, qui ne sont pas choisies. Les ajouter à --briques."
    );
  });

  // Un catalogue écrit pour le cas prouve le refus sans dépendre
  // des briques réelles.
  it("refuse une brique choisie sans une brique qu'elle exige, en nommant les deux et l'option, sans l'ajouter en silence", () => {
    const catalogue = {
      BRIQUES: {
        connexion: { exige: ["donnees", "envoi"], fichiers: [], retraits: [] },
        envoi: { exige: [], fichiers: [], retraits: [] },
      },
    };
    expect(() => planifier({ briques: ["connexion"] }, catalogue)).toThrow(
      "La brique « connexion » exige la ou les briques envoi, qui ne sont pas choisies. Les ajouter à --briques."
    );
    const gardees = planifier({ briques: ["connexion", "envoi"] }, catalogue)
      .filter((unite: { gardee: boolean }) => unite.gardee)
      .map((unite: { nom: string }) => unite.nom);
    expect(gardees).toEqual(["connexion", "envoi", "donnees"]);
  });

  // Une appli à comptes doit pouvoir répondre à une demande d'accès ou
  // d'effacement de données personnelles : la brique rgpd suit comptes
  // d'office. Ajoutée, jamais en silence : le premier commit le dit.
  it("garde la brique rgpd avec la brique comptes sans qu'on la choisisse, et le dit dans le premier commit", () => {
    const gardees = planifier({ briques: ["comptes", "mails"] })
      .filter((unite: { gardee: boolean }) => unite.gardee)
      .map((unite: { nom: string }) => unite.nom);
    expect(gardees).toContain("rgpd");
    expect(briquesEntrainees(["comptes", "mails"])).toEqual([{ nom: "rgpd", par: "comptes" }]);
    expect(briquesEntrainees(["comptes", "mails", "rgpd"])).toEqual([]);

    const { dossier } = assemblerEnTemporaire(AVEC_COMPTES);
    expect(existeAssemble(dossier, "src/briques/rgpd/effacement.ts")).toBe(true);
    expect(gitDans(dossier, "log", "-1", "--format=%B")).toMatch(/^Ajouté d'office : rgpd \(avec comptes\)\.$/m);
  });

  // Un catalogue écrit pour le cas prouve le mécanisme sans dépendre des
  // briques réelles : la brique entraînée se déclare sur celle qui l'entraîne,
  // et ses propres exigences se vérifient comme celles d'une brique choisie.
  it("ajoute d'office la brique qu'une brique choisie entraîne, et refuse en le disant celle dont une exigence manque", () => {
    const catalogue = {
      BRIQUES: {
        connexion: { exige: ["donnees"], entraine: ["registre"], fichiers: [], retraits: [] },
        registre: { exige: ["donnees", "connexion", "envoi"], fichiers: [], retraits: [] },
        envoi: { exige: [], fichiers: [], retraits: [] },
      },
    };
    expect(() => planifier({ briques: ["connexion"] }, catalogue)).toThrow(
      "La brique « registre » (ajoutée d'office avec connexion) exige la ou les briques envoi, qui ne sont pas choisies. Les ajouter à --briques."
    );
    const gardees = planifier({ briques: ["connexion", "envoi"] }, catalogue)
      .filter((unite: { gardee: boolean }) => unite.gardee)
      .map((unite: { nom: string }) => unite.nom);
    expect(gardees).toEqual(["connexion", "registre", "envoi", "donnees"]);
    expect(briquesEntrainees(["connexion", "envoi"], catalogue)).toEqual([{ nom: "registre", par: "connexion" }]);

    const fautif = {
      BRIQUES: { connexion: { exige: [], entraine: ["fantome"], fichiers: [], retraits: [] } },
    };
    expect(() => planifier({ briques: ["connexion"] }, fautif)).toThrow(
      "La brique « connexion » entraîne « fantome », inconnue : outils/modules.mjs est fautif."
    );
  });

  // La première brique du catalogue qui en exige une autre.
  it("refuse la brique contact sans la brique mails, en nommant les deux et l'option", () => {
    expect(() =>
      assembler({
        source: SOURCE,
        sortie: dossierTemporaireVide(),
        commit: COMMIT_DE_TEST,
        briques: ["contact"],
      })
    ).toThrow(
      "La brique « contact » exige la ou les briques mails, qui ne sont pas choisies. Les ajouter à --briques."
    );
  });

  // Les notifications partent par la brique mails.
  it("refuse la brique notifications sans la brique mails, en le disant", () => {
    expect(() => planifier({ briques: ["echeances", "comptes", "notifications"] })).toThrow(
      /« comptes » exige la ou les briques mails|« notifications » exige la ou les briques mails/
    );
  });

  // Une brique qui lit la base se garde seule, avec la base : l'appli la
  // branche sur son module métier. Le refus d'avant (« aucun module choisi »)
  // tenait aux modules de test, sortis du catalogue.
  it("garde, seule, une brique qui lit la base, et la base avec elle", () => {
    const gardees = planifier({ briques: ["echeances"] })
      .filter((unite: { gardee: boolean }) => unite.gardee)
      .map((unite: { nom: string }) => unite.nom);
    expect(gardees).toEqual(["echeances", "donnees"]);
  });

  it("refuse « donnees » dans --briques en disant qu'elle vient d'office (elle ne se choisit pas)", () => {
    expect(() =>
      assembler({
        source: SOURCE,
        sortie: dossierTemporaireVide(),
        commit: COMMIT_DE_TEST,
        briques: ["echeances", "comptes", "mails", "donnees"],
      })
    ).toThrow(/ne se choisit pas/);
  });

  it("refuse un dossier de sortie qui est un fichier, par un message et non une pile d'appels", () => {
    const fichier = path.join(dossierTemporaireVide(), "fichier.txt");
    fs.writeFileSync(fichier, "à moi");
    expect(() => assembler({ source: SOURCE, sortie: fichier, commit: COMMIT_DE_TEST, ...variante })).toThrow(
      ErreurAssemblage
    );
    expect(fs.readFileSync(fichier, "utf-8")).toBe("à moi");
  });

  it("n'écrit rien quand il refuse", () => {
    const dossier = dossierTemporaireVide();
    expect(() =>
      assembler({ source: SOURCE, sortie: dossier, commit: COMMIT_DE_TEST, briques: ["gestion-comptes"] })
    ).toThrow(ErreurAssemblage);
    expect(fs.readdirSync(dossier)).toEqual([]);
  });
});

describe("blueprint donnée à l'assembleur", () => {
  const variante = { briques: ["echeances", "comptes", "mails"] };

  function blueprintDe(contenu: string): string {
    const fichier = path.join(dossierTemporaireVide(), "blueprint-source.md");
    fs.writeFileSync(fichier, contenu);
    return fichier;
  }

  it("remplace le commit de référence de son en-tête et garde le reste tel quel", () => {
    const blueprint = blueprintDe("---\nformat: 1\nappli: x\ncommit_reference: ancien\n---\n\n# Corps\n\nTexte.\n");
    const { dossier } = assemblerEnTemporaire(variante, { blueprint });
    expect(lireAssemble(dossier, "blueprint.md")).toBe(
      `---\nformat: 1\nappli: x\ncommit_reference: ${COMMIT_DE_TEST}\n---\n\n# Corps\n\nTexte.\n`
    );
  });

  it("ajoute le commit de référence à un en-tête qui n'en avait pas", () => {
    const blueprint = blueprintDe("---\nformat: 1\nappli: x\n---\n\n# Corps\n");
    const { dossier } = assemblerEnTemporaire(variante, { blueprint });
    expect(lireAssemble(dossier, "blueprint.md")).toBe(
      `---\nformat: 1\nappli: x\ncommit_reference: ${COMMIT_DE_TEST}\n---\n\n# Corps\n`
    );
  });

  it("refuse une blueprint sans en-tête plutôt que de noter le commit au hasard, et sans rien écrire (la sortie reste vide, le prochain essai n'est pas refusé comme « pas vide »)", () => {
    const blueprint = blueprintDe("# Corps sans en-tête\n");
    const dossier = dossierTemporaireVide();
    expect(() =>
      assembler({ source: SOURCE, sortie: dossier, commit: COMMIT_DE_TEST, ...variante, blueprint })
    ).toThrow(/en-tête YAML/);
    expect(fs.readdirSync(dossier)).toEqual([]);
  });

  // Constaté à un essai d'assemblage : un chemin de blueprint faux
  // sortait en erreur Node brute (ENOENT et sa pile) alors que tout autre refus
  // est un « Assemblage refusé : … ». Rien n'était écrit, seul le message était mauvais.
  it("refuse une blueprint absente en nommant le chemin donné, sans créer le dossier de sortie", () => {
    const blueprint = path.join(dossierTemporaireVide(), "blueprint-absente.md");
    const sortie = path.join(dossierTemporaireVide(), "appli");
    let erreur: unknown;
    try {
      assembler({ source: SOURCE, sortie, commit: COMMIT_DE_TEST, ...variante, blueprint });
    } catch (e) {
      erreur = e;
    }
    expect(erreur).toBeInstanceOf(ErreurAssemblage);
    expect((erreur as Error).message).toContain(blueprint);
    expect(fs.existsSync(sortie)).toBe(false);
  });

  it("refuse de même une blueprint illisible (un dossier à la place du fichier)", () => {
    const blueprint = dossierTemporaireVide();
    const sortie = dossierTemporaireVide();
    expect(() => assembler({ source: SOURCE, sortie, commit: COMMIT_DE_TEST, ...variante, blueprint })).toThrow(
      ErreurAssemblage
    );
    expect(fs.readdirSync(sortie)).toEqual([]);
  });

  it("en ligne de commande, affiche « Assemblage refusé : … » et sort en code 1, sans pile", () => {
    const blueprint = path.join(dossierTemporaireVide(), "blueprint-absente.md");
    const sortie = path.join(dossierTemporaireVide(), "appli");
    const resultat = spawnSync(
      process.execPath,
      [
        path.join(SOURCE, "outils", "assembler.mjs"),
        sortie,
        "--briques",
        "comptes,echeances,mails",
        "--blueprint",
        blueprint,
        "--tolerer-arbre-modifie",
      ],
      { encoding: "utf-8" }
    );
    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toContain("Assemblage refusé : ");
    expect(resultat.stderr).toContain(blueprint);
    expect(resultat.stderr).not.toMatch(/ENOENT|\n\s+at /);
    expect(fs.existsSync(sortie)).toBe(false);
  });

  it("accepte un en-tête dont la fermeture finit le fichier, sans saut de ligne", () => {
    const blueprint = blueprintDe("---\nformat: 1\nappli: x\n---");
    const { dossier } = assemblerEnTemporaire(variante, { blueprint });
    expect(lireAssemble(dossier, "blueprint.md")).toBe(
      `---\nformat: 1\nappli: x\ncommit_reference: ${COMMIT_DE_TEST}\n---\n`
    );
  });
});

// L'appli reste UNLICENSED, livrée sous le contrat du client, mais elle
// contient le code du catalogue, publié sous MIT : la licence exige que son
// avis et son texte accompagnent toute copie. Sans eux, redistribuer une appli
// qui contient la contribution d'une personne extérieure enfreindrait la
// licence de cette contribution. Même chose pour l'avis OFL des polices du kit.
describe("avis de licence de l'appli assemblée", () => {
  const { dossier } = assemblerEnTemporaire({ briques: [] });
  const lf = (texte: string) => texte.replace(/\r\n/g, "\n");

  it("écrit un NOTICE qui porte, mot pour mot, l'avis de droit d'auteur et le texte MIT du catalogue", () => {
    expect(existeAssemble(dossier, "NOTICE")).toBe(true);
    const licence = lf(fs.readFileSync(path.join(SOURCE, "LICENSE"), "utf-8")).trim();
    expect(licence).toMatch(/^MIT License\n\nCopyright \(c\) /);
    expect(lf(lireAssemble(dossier, "NOTICE"))).toContain(licence);
  });

  it("y joint l'avis OFL 1.1 des polices IBM Plex et renvoie au texte complet, présent dans l'appli", () => {
    const ofl = lf(fs.readFileSync(path.join(SOURCE, "src/ui/theme/polices/LICENCE-OFL.txt"), "utf-8"));
    const [droitDAuteur, licence] = ofl.trim().split(/\n\s*\n/);
    expect(droitDAuteur).toMatch(/^Copyright .*IBM/);
    expect(licence).toMatch(/SIL Open Font License, Version 1\.1/);
    const notice = lf(lireAssemble(dossier, "NOTICE"));
    expect(notice).toContain(`${droitDAuteur}\n\n${licence}\n`);
    // « copied below » ne vaut que dans le fichier complet.
    expect(notice).not.toMatch(/copied below/i);
    expect(notice).toContain("src/ui/theme/polices/LICENCE-OFL.txt");
    expect(existeAssemble(dossier, "src/ui/theme/polices/LICENCE-OFL.txt")).toBe(true);
  });

  it("ne change pas les droits de l'appli : pas de LICENSE, paquet UNLICENSED, et le NOTICE le dit", () => {
    expect(existeAssemble(dossier, "LICENSE")).toBe(false);
    expect(JSON.parse(lireAssemble(dossier, "package.json")).license).toBe("UNLICENSED");
    const notice = lf(lireAssemble(dossier, "NOTICE"));
    expect(notice).toContain("ne lui donne aucune licence");
    expect(notice).toContain("« UNLICENSED »");
  });

  it("le commite dès le premier commit", () => {
    expect(gitDans(dossier, "ls-files", "NOTICE")).toBe("NOTICE");
  });
});

type Verrou = { packages: Record<string, Record<string, unknown>> };

// Les entrées du verrou qu'atteint sa racine, résolues comme Node : le
// node_modules le plus proche, en remontant. Écrit ici, à part de
// l'assembleur, pour ne pas vérifier son élagage par lui-même.
function entreesAtteintes(verrou: Verrou): Set<string> {
  const paquets = verrou.packages;
  const resoudre = (depuis: string, nom: string): string | undefined => {
    for (
      let base = depuis;
      ;
      base = base.includes("/node_modules/") ? base.replace(/\/node_modules\/[^/]+(\/[^/]+)?$/, "") : ""
    ) {
      const cle = `${base ? `${base}/` : ""}node_modules/${nom}`;
      if (paquets[cle]) return cle;
      if (!base) return undefined;
    }
  };
  const atteintes = new Set([""]);
  const aVoir = [""];
  while (aVoir.length > 0) {
    const cle = aVoir.pop() as string;
    const paquet = paquets[cle] as Record<string, Record<string, string> | undefined>;
    const noms = [
      ...Object.keys(paquet.dependencies ?? {}),
      ...Object.keys(paquet.optionalDependencies ?? {}),
      ...Object.keys(paquet.peerDependencies ?? {}),
      ...(cle === "" ? Object.keys(paquet.devDependencies ?? {}) : []),
    ];
    for (const nom of noms) {
      const atteinte = resoudre(cle, nom);
      if (atteinte && !atteintes.has(atteinte)) {
        atteintes.add(atteinte);
        aVoir.push(atteinte);
      }
    }
  }
  return atteintes;
}

// Relevé par l'inventaire du socle seul : une appli assemblée sans brique
// gardait des fichiers et des dépendances qu'aucun de ses fichiers
// n'utilisait, et un commentaire qui renvoyait à un fichier de la brique
// comptes, qu'elle n'a pas.
describe("socle seul : rien de ce que seules la base ou une brique utilisent", () => {
  const { dossier } = assemblerEnTemporaire({ briques: [] });
  const paquet = JSON.parse(lireAssemble(dossier, "package.json"));
  const verrou = JSON.parse(lireAssemble(dossier, "package-lock.json"));

  it("retire pg et @types/pg du paquet et du verrou : seule la base les importe", () => {
    for (const nom of ["pg", "@types/pg"]) {
      expect(paquet.dependencies[nom], nom).toBeUndefined();
      expect(paquet.devDependencies[nom], nom).toBeUndefined();
      expect(verrou.packages[`node_modules/${nom}`], nom).toBeUndefined();
    }
  });

  // npm ci refuse un verrou dont la racine ne dit pas les dépendances de
  // package.json : c'est ce qui avait fait garder pg dans toute appli.
  it("garde un verrou que npm ci accepte : sa racine dit les dépendances de package.json, et chaque entrée est atteinte depuis elle", () => {
    expect(verrou.packages[""].dependencies).toEqual(paquet.dependencies);
    expect(verrou.packages[""].devDependencies).toEqual(paquet.devDependencies);
    const atteintes = entreesAtteintes(verrou);
    expect(Object.keys(verrou.packages).filter((cle) => !atteintes.has(cle))).toEqual([]);
    // Le verrou du catalogue sert de témoin : la résolution ci-dessus n'y
    // trouve aucune entrée orpheline non plus.
    const duCatalogue = JSON.parse(fs.readFileSync(path.join(SOURCE, "package-lock.json"), "utf-8"));
    expect(Object.keys(duCatalogue.packages).filter((cle) => !entreesAtteintes(duCatalogue).has(cle))).toEqual([]);
  });

  // Le code seul : la documentation (fiche d'une brique à venir, registre
  // docs/cicatrices.md) cite des briques que l'appli n'a pas.
  it("ne renvoie, ni dans son code ni dans ses commentaires, à un fichier de brique (src/ et tests/)", () => {
    const renvois = fichiersAssembles(dossier)
      .filter((chemin) => /^(src|tests)\/.*\.(ts|tsx|mjs|css)$/.test(chemin))
      .flatMap((chemin) => {
        const trouve = /briques\/[a-z-]+\//.exec(lireAssemble(dossier, chemin));
        return trouve ? [`${chemin} cite « ${trouve[0]} »`] : [];
      });
    expect(renvois).toEqual([]);
  });

  // Hors docs/cicatrices.md, le registre des règles du catalogue, qui cite le
  // test de chaque brique.
  it("ne nomme l'adresse IP du visiteur ni sa variable, que seules les briques comptes et contact lisent", () => {
    const mentions = fichiersAssembles(dossier)
      .filter((chemin) => chemin !== "docs/cicatrices.md")
      .filter((chemin) => /adresse-ip|IP_EN_TETE_CLIENT/.test(lireAssemble(dossier, chemin)));
    expect(mentions).toEqual([]);
  });
});

// Le retrait des dépendances d'une unité, sur un verrou réduit à ce qui compte :
// l'appli assemblée n'appelle pas npm (pas de réseau à l'assemblage), mais son
// verrou doit rester celui que npm écrirait, sinon npm ci le refuse.
describe("retrait des dépendances d'une unité retirée", () => {
  const PAQUET = {
    name: "essai",
    dependencies: { gardee: "^1.0.0", retiree: "^1.0.0" },
    devDependencies: { "@types/retiree": "^1.0.0" },
  };
  const VERROU: Verrou & { name: string; lockfileVersion: number } = {
    name: "essai",
    lockfileVersion: 3,
    packages: {
      "": { ...PAQUET },
      "node_modules/gardee": { version: "1.0.0", dependencies: { commune: "^1.0.0" } },
      "node_modules/retiree": {
        version: "1.0.0",
        dependencies: { commune: "^1.0.0", propre: "^1.0.0", imbriquee: "^2.0.0" },
      },
      "node_modules/retiree/node_modules/imbriquee": { version: "2.0.0" },
      "node_modules/@types/retiree": { version: "1.0.0", dev: true, dependencies: { propre: "^1.0.0" } },
      "node_modules/commune": { version: "1.0.0" },
      "node_modules/propre": { version: "1.0.0" },
    },
  };

  it("retire la dépendance du paquet et de la racine du verrou, et ce que seule elle atteignait ; garde ce qu'une autre atteint", () => {
    const { paquet, verrou } = retirerLesDependances(structuredClone(PAQUET), structuredClone(VERROU), [
      "retiree",
      "@types/retiree",
    ]);
    expect(paquet).toEqual({ name: "essai", dependencies: { gardee: "^1.0.0" }, devDependencies: {} });
    expect(verrou.packages[""]).toEqual({ name: "essai", ...paquet });
    expect(Object.keys(verrou.packages)).toEqual(["", "node_modules/gardee", "node_modules/commune"]);
  });

  it("suit la résolution de Node : une version imbriquée sert son parent, et celle de la racine part quand plus rien d'autre ne la lit", () => {
    const paquet = { name: "essai", dependencies: { a: "^1.0.0", b: "^1.0.0" } };
    const verrou: Verrou = {
      packages: {
        "": { ...paquet },
        "node_modules/a": { version: "1.0.0", dependencies: { c: "^2.0.0" } },
        "node_modules/a/node_modules/c": { version: "2.0.0" },
        "node_modules/b": { version: "1.0.0", dependencies: { c: "^1.0.0" } },
        "node_modules/c": { version: "1.0.0" },
      },
    };
    const { verrou: elague } = retirerLesDependances(structuredClone(paquet), verrou, ["b"]);
    expect(Object.keys(elague.packages)).toEqual(["", "node_modules/a", "node_modules/a/node_modules/c"]);
  });

  it("refuse une dépendance que package.json n'a pas : la liste de outils/modules.mjs n'est plus à jour", () => {
    expect(() => retirerLesDependances(structuredClone(PAQUET), structuredClone(VERROU), ["absente"])).toThrow(
      ErreurAssemblage
    );
  });

  // npm marque « dev » un paquet que seules les dépendances de développement
  // atteignent. Le retrait d'une dépendance qui le rendrait tel demanderait de
  // réécrire ces marques : plutôt que d'en deviner les règles, l'assembleur
  // s'arrête et dit de régénérer le verrou avec npm.
  it("s'arrête quand un paquet gardé ne serait plus atteint que par les dépendances de développement", () => {
    const verrou = structuredClone(VERROU);
    verrou.packages["node_modules/@types/retiree"].dependencies = { commune: "^1.0.0" };
    expect(() => retirerLesDependances(structuredClone(PAQUET), verrou, ["gardee", "retiree"])).toThrow(/npm install/);
  });
});

// Le nom du paquet nomme aussi les bases locales de l'appli
// (scripts/bases-locales.ts) : quand l'assembleur laissait celui du catalogue,
// deux applis assemblées sur un même poste partageaient leurs bases tant que
// personne ne renommait package.json à la main.
describe("nom de l'appli assemblée", () => {
  const socleSeul = { briques: [] };
  const catalogue = JSON.parse(fs.readFileSync(path.join(SOURCE, "package.json"), "utf-8")).name;

  function nomsDuPaquet(dossier: string): string[] {
    const paquet = JSON.parse(lireAssemble(dossier, "package.json"));
    const verrou = JSON.parse(lireAssemble(dossier, "package-lock.json"));
    return [paquet.name, verrou.name, verrou.packages[""].name];
  }

  function blueprintDe(contenu: string): string {
    const fichier = path.join(dossierTemporaireVide(), "blueprint-source.md");
    fs.writeFileSync(fichier, contenu);
    return fichier;
  }

  it(
    "nomme le paquet d'après le dossier de sortie par défaut, jamais du nom du catalogue (deux applis d'un poste partageaient leurs bases locales)",
    { timeout: ENTIER },
    () => {
      const { dossier } = assemblerEnTemporaire(socleSeul);
      const attendu = path.basename(dossier).toLowerCase();
      expect(nomsDuPaquet(dossier)).toEqual([attendu, attendu, attendu]);
      expect(nomsDesBases(attendu).dev).not.toBe(nomsDesBases(catalogue).dev);
    }
  );

  it(
    "prend le champ appli de la blueprint, ramené à un nom de paquet (minuscules, sans accent ni commentaire, tirets)",
    { timeout: ENTIER },
    () => {
      const blueprint = blueprintDe("---\nformat: 1\nappli: Œuvres d'été # nom provisoire\n---\n\n# Corps\n");
      const { dossier } = assemblerEnTemporaire(socleSeul, { blueprint });
      expect(nomsDuPaquet(dossier)).toEqual(["oeuvres-d-ete", "oeuvres-d-ete", "oeuvres-d-ete"]);
    }
  );

  it("donne la priorité à --nom sur la blueprint et sur le dossier", { timeout: ENTIER }, () => {
    const blueprint = blueprintDe("---\nformat: 1\nappli: depuis-la-blueprint\n---\n");
    const sortie = dossierTemporaireVide();
    assembler({ source: SOURCE, sortie, commit: COMMIT_DE_TEST, ...socleSeul, blueprint, nom: "suivi-chantiers" });
    expect(nomsDuPaquet(sortie)).toEqual(["suivi-chantiers", "suivi-chantiers", "suivi-chantiers"]);
  });

  it("refuse, sans rien écrire, un nom qui ne commence pas par une lettre, trop long pour ses bases ou qui est celui du catalogue", () => {
    for (const nom of ["2026-appli", "---", "a".repeat(59), catalogue]) {
      const sortie = dossierTemporaireVide();
      expect(() => assembler({ source: SOURCE, sortie, commit: COMMIT_DE_TEST, ...socleSeul, nom }), nom).toThrow(
        ErreurAssemblage
      );
      expect(fs.readdirSync(sortie), nom).toEqual([]);
    }
    const sortie = dossierTemporaireVide();
    const blueprint = blueprintDe("---\nformat: 1\nappli: 2026\n---\n");
    expect(() => assembler({ source: SOURCE, sortie, commit: COMMIT_DE_TEST, ...socleSeul, blueprint })).toThrow(
      /« 2026 »/
    );
    expect(fs.readdirSync(sortie)).toEqual([]);
  });
});

// Le versionnement que l'humain tapait à la main est fait par
// l'assembleur, en local seulement.
describe("versionnement de l'appli assemblée", () => {
  const variante = { briques: ["echeances", "comptes", "mails"] };

  function depotParent(): { dossier: string; head: string } {
    const dossier = dossierTemporaireVide();
    gitDans(dossier, "init", "-q", "-b", "main");
    fs.writeFileSync(path.join(dossier, "a-moi.txt"), "à moi\n");
    gitDans(dossier, "add", "a-moi.txt");
    gitDans(dossier, "commit", "-q", "-m", "Dépôt parent");
    return { dossier, head: gitDans(dossier, "rev-parse", "HEAD") };
  }

  function parentIntact(parent: { dossier: string; head: string }) {
    expect(gitDans(parent.dossier, "rev-parse", "HEAD")).toBe(parent.head);
    expect(gitDans(parent.dossier, "rev-list", "--count", "--all")).toBe("1");
    expect(gitDans(parent.dossier, "ls-files")).toBe("a-moi.txt");
  }

  // Le temps d'un appel, des variables d'environnement changées (undefined :
  // retirée), puis rendues telles qu'elles étaient.
  function avecEnvironnement<T>(valeurs: Record<string, string | undefined>, faire: () => T): T {
    const avant = Object.fromEntries(Object.keys(valeurs).map((nom) => [nom, process.env[nom]]));
    const appliquer = (v: Record<string, string | undefined>) => {
      for (const [nom, valeur] of Object.entries(v)) {
        if (valeur === undefined) delete process.env[nom];
        else process.env[nom] = valeur;
      }
    };
    appliquer(valeurs);
    try {
      return faire();
    } finally {
      appliquer(avant);
    }
  }

  // Le cas d'un essai : le dossier de profil était lui-même un dépôt.
  it(
    "dans un dossier situé à l'intérieur d'un autre dépôt git, crée son propre dépôt et ne touche pas au dépôt parent",
    { timeout: ENTIER },
    () => {
      const parent = depotParent();
      const sortie = path.join(parent.dossier, "clients", "appli");
      assembler({ source: SOURCE, sortie, commit: COMMIT_DE_TEST, ...variante });
      expect(memeDossier(gitDans(sortie, "rev-parse", "--show-toplevel"), sortie)).toBe(true);
      expect(gitDans(sortie, "rev-list", "--count", "HEAD")).toBe("1");
      parentIntact(parent);
    }
  );

  // Un hook git exporte GIT_DIR : lancé depuis là, git écrirait dans ce dépôt-là
  // quel que soit le dossier de travail. Le catalogue se lit de même à sa place.
  it("ignore un GIT_DIR hérité de l'environnement, qui viserait un autre dépôt", { timeout: ENTIER }, () => {
    const parent = depotParent();
    const sortie = path.join(dossierTemporaireVide(), "appli");
    avecEnvironnement({ GIT_DIR: path.join(parent.dossier, ".git") }, () =>
      assembler({ source: SOURCE, sortie, commit: COMMIT_DE_TEST, ...variante })
    );
    expect(memeDossier(gitDans(sortie, "rev-parse", "--show-toplevel"), sortie)).toBe(true);
    expect(existeAssemble(sortie, "src/briques/echeances/calcul.ts")).toBe(true);
    parentIntact(parent);
  });

  // Sans identité, refuser plutôt que laisser un dossier sans commit, l'état
  // à moitié fait qu'un essai avait laissé. Une identité devinée par git (utilisateur@MACHINE) ne compte pas : la
  // configuration globale est remplacée par un fichier vide, rien d'autre ne
  // donne d'identité.
  it("refuse sans identité git configurée, en disant quoi taper, et laisse le dossier de sortie tel qu'il était", () => {
    const configVide = path.join(dossierTemporaireVide(), "gitconfig");
    fs.writeFileSync(configVide, "");
    const sansIdentite = {
      GIT_CONFIG_GLOBAL: configVide,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: undefined,
      GIT_AUTHOR_EMAIL: undefined,
      GIT_COMMITTER_NAME: undefined,
      GIT_COMMITTER_EMAIL: undefined,
      EMAIL: undefined,
    };
    const vide = dossierTemporaireVide();
    const absent = path.join(dossierTemporaireVide(), "clients", "appli");
    avecEnvironnement(sansIdentite, () => {
      expect(() => assembler({ source: SOURCE, sortie: vide, commit: COMMIT_DE_TEST, ...variante })).toThrow(
        ErreurAssemblage
      );
      expect(() => assembler({ source: SOURCE, sortie: absent, commit: COMMIT_DE_TEST, ...variante })).toThrow(
        /git config --global user\.email/
      );
    });
    expect(fs.readdirSync(vide)).toEqual([]);
    expect(fs.existsSync(path.dirname(absent))).toBe(false);
  });

  // Le gitignore global d'un poste (.claude/, .vscode/…) ne s'applique pas à
  // ce que l'appli contient : sinon un fichier copié resterait hors du commit,
  // avec un arbre qui se dit propre.
  it("commite tout ce qu'il copie, même ce que le gitignore global du poste exclurait", { timeout: ENTIER }, () => {
    const dossier = dossierTemporaireVide();
    const exclus = path.join(dossier, "exclus-globaux");
    fs.writeFileSync(exclus, ".claude/\nCLAUDE.md\n");
    const config = path.join(dossier, "gitconfig");
    fs.writeFileSync(config, `[core]\n\texcludesFile = ${exclus.replace(/\\/g, "/")}\n`);
    const sortie = path.join(dossierTemporaireVide(), "appli");
    avecEnvironnement({ GIT_CONFIG_GLOBAL: config }, () =>
      assembler({ source: SOURCE, sortie, commit: COMMIT_DE_TEST, ...variante })
    );
    const suivis = gitDans(sortie, "ls-files", "-z").split("\0");
    expect(suivis).toContain("CLAUDE.md");
    expect(suivis).toContain(".claude/hooks/gardes.mjs");
  });

  it(
    "en ligne de commande, prend la fiche et dit que le dépôt local est créé et qu'il n'a pas de remote",
    { timeout: ENTIER },
    () => {
      const fiche = path.join(dossierTemporaireVide(), "appli-projet.md");
      fs.writeFileSync(fiche, "# Fiche projet\n");
      const sortie = path.join(dossierTemporaireVide(), "appli");
      const resultat = spawnSync(
        process.execPath,
        [
          path.join(SOURCE, "outils", "assembler.mjs"),
          sortie,
          "--briques",
          "comptes,echeances,mails",
          "--fiche",
          fiche,
          "--tolerer-arbre-modifie",
        ],
        { encoding: "utf-8" }
      );
      expect(resultat.stderr).toBe("");
      expect(resultat.status).toBe(0);
      expect(gitDans(sortie, "ls-files", "PROJET.md")).toBe("PROJET.md");
      const suite = resultat.stdout.split("\n").find((ligne) => ligne.startsWith("Suite : "));
      expect(suite).toContain("dépôt git local");
      expect(suite).toContain(gitDans(sortie, "rev-parse", "HEAD").slice(0, 7));
      expect(suite).toContain("aucun remote");
    }
  );

  // À un essai, la suite ne disait pas comment
  // obtenir une base locale, et l'humain devait la chercher dans une skill.
  it(
    "en ligne de commande, cite les commandes de la base locale quand l'appli a la brique données",
    { timeout: ENTIER },
    () => {
      const sortie = path.join(dossierTemporaireVide(), "appli");
      const resultat = spawnSync(
        process.execPath,
        [
          path.join(SOURCE, "outils", "assembler.mjs"),
          sortie,
          "--briques",
          "comptes,echeances,mails",
          "--tolerer-arbre-modifie",
        ],
        { encoding: "utf-8" }
      );
      expect(resultat.status).toBe(0);
      const suite = resultat.stdout.split("\n").find((ligne) => ligne.startsWith("Suite : "));
      expect(suite).toContain("docker compose up -d --wait");
      expect(suite).toContain("npx tsx scripts/bases-locales.ts");
    }
  );

  it(
    "en ligne de commande, ne cite aucune commande de base pour une appli sans brique qui lit la base (elle n'a pas de base)",
    { timeout: ENTIER },
    () => {
      const sortie = path.join(dossierTemporaireVide(), "appli");
      const resultat = spawnSync(
        process.execPath,
        [path.join(SOURCE, "outils", "assembler.mjs"), sortie, "--tolerer-arbre-modifie"],
        { encoding: "utf-8" }
      );
      expect(resultat.status).toBe(0);
      const suite = resultat.stdout.split("\n").find((ligne) => ligne.startsWith("Suite : "));
      expect(suite).toContain("aucun remote");
      expect(suite).not.toContain("docker compose");
      expect(suite).not.toContain("bases-locales");
      expect(suite).not.toContain("base locale");
    }
  );
});

// Une appli livrée que personne n'entretient recevait une PR de
// mise à jour par semaine, que personne ne fusionnait. Dependabot est donc
// retiré par défaut, et gardé sur une option explicite quand quelqu'un
// entretient l'appli après la livraison.
describe("Dependabot : retiré par défaut, gardé sur option", () => {
  const FICHIER = ".github/dependabot.yml";
  const variante = { briques: [] };

  it("n'est pas dans l'appli assemblée sans l'option, alors que le catalogue le garde", () => {
    expect(fs.existsSync(path.join(SOURCE, FICHIER)), "le catalogue garde son Dependabot").toBe(true);
    expect(existeAssemble(assemblerEnTemporaire(variante).dossier, FICHIER)).toBe(false);
  });

  it("est dans l'appli assemblée avec l'option, identique à celui du catalogue", () => {
    const avec = assemblerEnTemporaire(variante, { dependabot: true });
    expect(fs.readFileSync(path.join(avec.dossier, FICHIER)).equals(fs.readFileSync(path.join(SOURCE, FICHIER)))).toBe(
      true
    );
    expect(gitDans(avec.dossier, "ls-files", FICHIER)).toBe(FICHIER);
    expect(gitDans(avec.dossier, "log", "-1", "--format=%B")).toMatch(/^Dependabot : gardé.$/m);
  });

  it("ne change rien d'autre à l'appli : le reste des fichiers est le même avec et sans l'option", () => {
    const sans = fichiersAssembles(assemblerEnTemporaire(variante).dossier);
    const avec = fichiersAssembles(assemblerEnTemporaire(variante, { dependabot: true }).dossier);
    expect(avec.filter((chemin) => !sans.includes(chemin))).toEqual([FICHIER]);
    expect(sans.filter((chemin) => !avec.includes(chemin))).toEqual([]);
  });

  it(
    "en ligne de commande, retire Dependabot sans --dependabot, le garde avec, et le dit dans sa sortie",
    { timeout: ENTIER },
    () => {
      const assemblerEnLigne = (...options: string[]) => {
        const sortie = path.join(dossierTemporaireVide(), "appli");
        const resultat = spawnSync(
          process.execPath,
          [path.join(SOURCE, "outils", "assembler.mjs"), sortie, "--tolerer-arbre-modifie", ...options],
          { encoding: "utf-8" }
        );
        expect(resultat.stderr).toBe("");
        expect(resultat.status).toBe(0);
        const ligne = resultat.stdout.split("\n").find((l) => l.startsWith("Dependabot : "));
        return { sortie, ligne };
      };
      const sans = assemblerEnLigne();
      expect(existeAssemble(sans.sortie, FICHIER)).toBe(false);
      expect(sans.ligne).toContain("retiré");
      expect(sans.ligne).toContain("--dependabot");
      const avec = assemblerEnLigne("--dependabot");
      expect(existeAssemble(avec.sortie, FICHIER)).toBe(true);
      expect(avec.ligne).toContain("gardé");
    }
  );
});

// PROJET.md part dans le premier commit, passé à
// l'assembleur comme la blueprint, plutôt que dans un deuxième commit à faire
// à la main.
describe("fiche projet donnée à l'assembleur", () => {
  const variante = { briques: ["echeances", "comptes", "mails"] };

  it("la copie telle quelle en PROJET.md à la racine, dans le premier et seul commit", { timeout: ENTIER }, () => {
    const fiche = path.join(dossierTemporaireVide(), "suivi-projet.md");
    const contenu = "# Fiche projet\r\n\r\nLe besoin, les décisions.\r\n";
    fs.writeFileSync(fiche, contenu);
    const { dossier, fichiers } = assemblerEnTemporaire(variante, { fiche });
    expect(fs.readFileSync(path.join(dossier, "PROJET.md"), "utf-8")).toBe(contenu);
    expect(fichiers).toContain("PROJET.md");
    expect(gitDans(dossier, "ls-files", "PROJET.md")).toBe("PROJET.md");
    expect(gitDans(dossier, "rev-list", "--count", "HEAD")).toBe("1");
    expect(gitDans(dossier, "status", "--porcelain")).toBe("");
    // La fiche ne vient pas du catalogue : le manifeste d'empreintes ne la compte pas.
    expect(Object.keys(JSON.parse(lireAssemble(dossier, MANIFESTE)).fichiers)).not.toContain("PROJET.md");
  });

  it("sans fiche, n'écrit aucun PROJET.md", () => {
    const { dossier } = assemblerEnTemporaire(variante);
    expect(existeAssemble(dossier, "PROJET.md")).toBe(false);
  });

  it("refuse une fiche absente en nommant le chemin donné, sans créer le dossier de sortie", () => {
    const fiche = path.join(dossierTemporaireVide(), "fiche-absente.md");
    const sortie = path.join(dossierTemporaireVide(), "appli");
    let erreur: unknown;
    try {
      assembler({ source: SOURCE, sortie, commit: COMMIT_DE_TEST, ...variante, fiche });
    } catch (e) {
      erreur = e;
    }
    expect(erreur).toBeInstanceOf(ErreurAssemblage);
    expect((erreur as Error).message).toContain(fiche);
    expect(fs.existsSync(sortie)).toBe(false);
  });
});

describe("liste de retrait : les droits ne se retouchent que dans src/config/acces.ts", () => {
  it("ne vise jamais src/briques/comptes/roles.ts ni tests/roles.test.ts : le mécanisme des droits ne nomme aucune brique", () => {
    // Les retraits n'ont pas tous la même forme (ligne, bloc, remplace) : seul
    // le fichier visé compte ici.
    const listes: { fichier: string }[][] = [
      ...Object.values(BRIQUES).map((unite) => unite.retraits),
      PATRON_DOSSIERS.retraits,
      ADRESSE_IP.retraits,
      DONNEES.retraits,
    ];
    const retraits = listes.flat();
    expect(retraits.length).toBeGreaterThan(0);
    const fichiers = retraits.map((retrait) => retrait.fichier);
    expect(fichiers).toContain("src/config/acces.ts");
    expect(
      fichiers.filter((fichier) => ["src/briques/comptes/roles.ts", "tests/roles.test.ts"].includes(fichier))
    ).toEqual([]);
  });

  // Une page publique qu'une unité emporte (la page de contact)
  // figure dans OUVERTS de tests/gardes-acces.test.ts, qui refuse une entrée
  // dont le fichier a disparu. Partie avec son unité, elle doit donc sortir de
  // la liste. Seul ce geste est permis : retirer la ligne de SA page. Ajouter,
  // remplacer ou retirer autre chose dans le verrou des gardes reste refusé.
  it("ne touche tests/gardes-acces.test.ts que pour retirer de OUVERTS une page que l'unité emporte", () => {
    const unites = [...Object.values(BRIQUES), PATRON_DOSSIERS, ADRESSE_IP, DONNEES] as {
      fichiers: string[];
      retraits: { geste: string; fichier: string; extrait?: string }[];
    }[];
    const fautes = unites.flatMap((unite) =>
      unite.retraits
        .filter((retrait) => retrait.fichier === "tests/gardes-acces.test.ts")
        .filter((retrait) => {
          const ouvert = retrait.geste === "ligne" ? /^"([^"]+)": "[^"]*",$/.exec(retrait.extrait ?? "") : null;
          if (!ouvert) return true;
          const page = `src/app/${ouvert[1]}`;
          return !unite.fichiers.some((entree) => (entree.endsWith("/") ? page.startsWith(entree) : page === entree));
        })
        .map((retrait) => `${retrait.geste} : ${retrait.extrait ?? ""}`)
    );
    expect(fautes).toEqual([]);
  });
});

describe("liste de retrait : ce qui la fait échouer fort plutôt que de fausser une copie", () => {
  const TEXTE = ["alpha", "beta", "début", "milieu", "fin", "beta", "omega", ""].join("\n");
  const fichier = "src/exemple.ts";

  it("retire une ligne, un bloc, remplace un extrait, et rend le texte retouché", () => {
    expect(appliquerRetrait(TEXTE, { geste: "ligne", fichier, extrait: "début" })).toBe(
      ["alpha", "beta", "milieu", "fin", "beta", "omega", ""].join("\n")
    );
    expect(appliquerRetrait(TEXTE, { geste: "bloc", fichier, de: "début", a: "fin" })).toBe(
      ["alpha", "beta", "beta", "omega", ""].join("\n")
    );
    expect(appliquerRetrait(TEXTE, { geste: "bloc", fichier, de: "début", a: "fin", par: "ici" })).toBe(
      ["alpha", "beta", "ici", "beta", "omega", ""].join("\n")
    );
    expect(appliquerRetrait(TEXTE, { geste: "remplace", fichier, extrait: "milieu", par: "centre" })).toContain(
      "centre"
    );
  });

  it("refuse un extrait qui a disparu du fichier (une ligne reformatée ou renommée)", () => {
    expect(() => appliquerRetrait(TEXTE, { geste: "ligne", fichier, extrait: "renommé" })).toThrow(/introuvable/);
    expect(() => appliquerRetrait(TEXTE, { geste: "remplace", fichier, extrait: "renommé", par: "x" })).toThrow(
      /introuvable/
    );
    expect(() => appliquerRetrait(TEXTE, { geste: "bloc", fichier, de: "renommé", a: "fin" })).toThrow(/introuvable/);
  });

  it("refuse un extrait « ligne » qui n'est qu'un morceau de sa ligne : il retirerait aussi le reste", () => {
    const texte = ['import { a, b } from "x";', "autre", ""].join("\n");
    expect(() => appliquerRetrait(texte, { geste: "ligne", fichier, extrait: "import { a" })).toThrow(
      /morceau de sa ligne/
    );
    // L'indentation ne compte pas : la ligne entière, sans ses espaces de tête, passe.
    expect(appliquerRetrait("  garde\n  retire\n", { geste: "ligne", fichier, extrait: "retire" })).toBe("  garde\n");
  });

  it("refuse un extrait qui apparaît plusieurs fois : il ne dirait pas lequel retirer", () => {
    expect(() => appliquerRetrait(TEXTE, { geste: "ligne", fichier, extrait: "beta" })).toThrow(/2 fois/);
    expect(() => appliquerRetrait(TEXTE, { geste: "bloc", fichier, de: "beta", a: "fin" })).toThrow(/2 fois/);
  });

  it("refuse un bloc dont la fin n'existe plus après son début", () => {
    expect(() => appliquerRetrait(TEXTE, { geste: "bloc", fichier, de: "début", a: "absente" })).toThrow(/fin du bloc/);
    // « a » existe, mais avant le début : le bloc ne se refermerait jamais.
    expect(() => appliquerRetrait(TEXTE, { geste: "bloc", fichier, de: "milieu", a: "début" })).toThrow(/fin du bloc/);
  });
});

// La base n'est plus dans le socle. Une brique qui la lit la reçoit sans
// qu'on la nomme, et une appli qui garde une telle brique reste celle d'avant.
describe("brique données, gardée d'office", () => {
  // Avec mails, contact, notifications et déploiement : sinon .env.example,
  // ci.yml et render.yaml perdent leurs blocs, et la
  // comparaison ci-dessous mesurerait ces briques, pas la base.
  const avecBase = assemblerEnTemporaire({
    briques: ["echeances", "comptes", "mails", "contact", "notifications", "deploiement"],
  });

  it("vient avec une brique qui la lit sans être nommée, et n'est pas listée comme retirée", () => {
    for (const chemin of fichiersDuCatalogue()) {
      if (
        !DONNEES.fichiers.some((entree: string) =>
          entree.endsWith("/") ? chemin.startsWith(entree) : chemin === entree
        )
      )
        continue;
      expect(existeAssemble(avecBase.dossier, chemin), chemin).toBe(true);
    }
    expect(avecBase.retires.join(", ")).not.toContain("donnees");
  });

  it("garde à l'identique, avec la base, ce que le socle sans base retouche (configuration de vitest, CI, modèle des variables)", () => {
    for (const chemin of [
      "vitest.config.ts",
      ".github/workflows/ci.yml",
      ".env.example",
      ".gitignore",
      "src/app/page.tsx",
      "render.yaml",
    ]) {
      const original = fs.readFileSync(path.join(SOURCE, chemin));
      expect(fs.readFileSync(path.join(avecBase.dossier, chemin)).equals(original), chemin).toBe(true);
    }
  });

  it("est déclarée par chaque brique qui lit la base, et chaque exigence nomme une brique connue ou la base", () => {
    for (const nom of ["echeances", "calendrier", "validation", "import-lot", "notifications", "comptes"] as const)
      expect(BRIQUES[nom].exige, nom).toContain("donnees");
    // Le code de connexion part par la brique mails.
    expect(BRIQUES.comptes.exige).toContain("mails");
    expect(BRIQUES.mails.exige).not.toContain("donnees");
    expect(BRIQUES.deploiement.exige).not.toContain("donnees");
    // La limite d'envois vit en base, le message part par mails.
    expect(BRIQUES.contact.exige).toEqual(["donnees", "mails"]);
    for (const unite of Object.values(BRIQUES)) {
      for (const exigee of unite.exige as string[])
        expect(exigee === "donnees" || exigee in BRIQUES, exigee).toBe(true);
    }
  });
});

// Une brique peut en importer une autre, à condition de la
// déclarer dans `exige`, que l'assembleur fait respecter. Les tests
// d'isolement de chaque brique restent des listes blanches ; ce verrou-ci
// garantit qu'une liste blanche n'ouvre jamais une brique non exigée. Il vit
// ici, et non dans les tests d'isolement copiés chez le client : il lit
// outils/modules.mjs, que la copie n'a pas.
describe("dépendances entre briques : une brique n'importe que celles qu'elle exige", () => {
  it("aucune brique du catalogue n'importe une brique qu'elle ne déclare pas dans exige", () => {
    const fichiers = fichiersDuCatalogue()
      .filter((chemin) => chemin.startsWith("src/briques/") && /\.(ts|tsx|mjs)$/.test(chemin))
      .map((chemin) => ({ chemin, source: fs.readFileSync(path.join(SOURCE, chemin), "utf-8") }));
    // Sans fichier, le verrou passerait sans rien vérifier.
    expect(fichiers.length).toBeGreaterThan(0);
    expect(importsDeBriquesNonDeclares(fichiers, BRIQUES)).toEqual([]);
  });

  it("attrape un import non déclaré, absolu, relatif, dynamique ou par require, et laisse passer la brique exigée, la brique elle-même et un commentaire", () => {
    const briques = { connexion: { exige: ["donnees", "envoi"] }, envoi: { exige: [] } };
    const fichiers = [
      {
        chemin: "src/briques/envoi/envoi.ts",
        source: [
          'import { ouvrir } from "@/briques/connexion/session";',
          "import {",
          "  lire,",
          '} from "../connexion/lire";',
          'const module = await import("@/briques/connexion");',
          'const autre = require("../connexion/autre");',
          'import { gabarit } from "./gabarit";',
          '// import { x } from "@/briques/connexion/commentaire";',
        ].join("\n"),
      },
      {
        chemin: "src/briques/connexion/code.ts",
        source:
          'import { envoyer } from "@/briques/envoi/envoi";\nimport { query } from "@/lib/db/client";\nimport { a } from "./a";',
      },
    ];
    expect(importsDeBriquesNonDeclares(fichiers, briques)).toEqual([
      "src/briques/envoi/envoi.ts importe « @/briques/connexion/session » : la brique envoi n'exige pas la brique connexion",
      "src/briques/envoi/envoi.ts importe « ../connexion/lire » : la brique envoi n'exige pas la brique connexion",
      "src/briques/envoi/envoi.ts importe « @/briques/connexion » : la brique envoi n'exige pas la brique connexion",
      "src/briques/envoi/envoi.ts importe « ../connexion/autre » : la brique envoi n'exige pas la brique connexion",
    ]);
  });
});

describe("liste de retrait : chaque fichier et chaque extrait cités existent au catalogue", () => {
  const catalogue = new Set(fichiersDuCatalogue());
  const unites = [PATRON_DOSSIERS, ADRESSE_IP, ...Object.values(BRIQUES), DONNEES] as {
    fichiers: string[];
    retraits: { fichier: string; extrait?: string; de?: string; a?: string }[];
  }[];

  it("ne cite que des fichiers propres qui existent (un dossier : au moins un fichier dedans)", () => {
    for (const unite of unites) {
      for (const entree of unite.fichiers) {
        const existe = entree.endsWith("/")
          ? [...catalogue].some((chemin) => chemin.startsWith(entree))
          : catalogue.has(entree);
        expect(existe, entree).toBe(true);
      }
    }
  });

  it("retrouve chaque extrait de chaque retrait dans son fichier du catalogue, indépendamment des combinaisons (un retrait d'une unité qui part avec son fichier n'est pas validé par l'assemblage)", () => {
    for (const unite of unites) {
      for (const retrait of unite.retraits) {
        const texte = fs.readFileSync(path.join(SOURCE, retrait.fichier), "utf-8").replace(/\r\n/g, "\n");
        // Lève si l'extrait manque, se répète, ou n'est qu'un morceau de sa ligne.
        expect(() => appliquerRetrait(texte, retrait as never), `${retrait.fichier}`).not.toThrow();
      }
    }
  });

  it("n'attribue aucun fichier à deux unités", () => {
    const proprietaire = new Map<string, string>();
    for (const [index, unite] of unites.entries()) {
      for (const chemin of catalogue) {
        if (!unite.fichiers.some((entree) => (entree.endsWith("/") ? chemin.startsWith(entree) : chemin === entree)))
          continue;
        expect(
          proprietaire.has(chemin),
          `${chemin} appartient aux unités ${proprietaire.get(chemin)} et ${index}`
        ).toBe(false);
        proprietaire.set(chemin, String(index));
      }
    }
  });

  it("ne retouche que des fichiers du catalogue, et jamais un fichier propre à sa propre unité (il part entier avec elle)", () => {
    for (const unite of unites) {
      for (const retrait of unite.retraits) {
        expect(catalogue.has(retrait.fichier), `${retrait.fichier} introuvable`).toBe(true);
        const proprePourElle = unite.fichiers.some((entree) =>
          entree.endsWith("/") ? retrait.fichier.startsWith(entree) : retrait.fichier === entree
        );
        expect(proprePourElle, `${retrait.fichier} est propre à l'unité qui le retouche : il part entier`).toBe(false);
      }
    }
  });
});
