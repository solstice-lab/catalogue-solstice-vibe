import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Test-verrou des minutes de CI dépensées pour rien. Cas vécu sur le
 * catalogue, dépôt privé au forfait gratuit : environ 1 000 minutes en un
 * mois, dont une part pour des passages qu'un commit plus récent rendait
 * inutiles, et pour des brouillons que personne ne fusionnerait tels quels.
 *
 * La règle a deux bornes. Un passage de pull request remplacé s'annule, et
 * seulement par un commit de la même pull request. Un passage sur main ne
 * s'annule jamais et n'attend jamais derrière un autre : chaque commit de
 * main garde son propre résultat, et le job deployer de la brique déploiement
 * en dépend.
 */

const CI = fs.readFileSync(path.join(process.cwd(), ".github/workflows/ci.yml"), "utf-8").replace(/\r\n/g, "\n");

// Ce qui précède jobs: : déclencheurs, droits, concurrence du workflow.
const entete = (ci: string) => ci.slice(0, ci.indexOf("\njobs:"));

function jobVerifier(ci: string): string {
  const debut = ci.indexOf("\n  verifier:");
  if (debut === -1) throw new Error("ci.yml : job verifier introuvable");
  const suite = ci.slice(debut + 1).search(/\n {2}\S/);
  return suite === -1 ? ci.slice(debut) : ci.slice(debut, debut + 1 + suite);
}

function concurrence(ci: string): { groupe: string; annulation: string } | null {
  const bloc = entete(ci).match(/^concurrency:\n((?: {2}.*\n?)+)/m)?.[1];
  if (!bloc) return null;
  return {
    groupe: bloc.match(/^ {2}group: (.*)$/m)?.[1] ?? "",
    annulation: bloc.match(/^ {2}cancel-in-progress: (.*)$/m)?.[1] ?? "",
  };
}

// Un groupe par pull request (son numéro), et une annulation qui n'est pas
// coupée : deux commits de la même PR se remplacent, deux PR ne se touchent pas.
function annuleLesPassagesDePullRequestRemplaces(ci: string): boolean {
  const c = concurrence(ci);
  return (
    c !== null &&
    /github\.event\.pull_request\.number/.test(c.groupe) &&
    c.annulation !== "" &&
    c.annulation !== "false"
  );
}

// Hors pull request, un groupe propre à chaque passage (run_id) : sur main,
// aucun passage n'en annule ni n'en fait attendre un autre.
function laisseChaquePassageDeMainAller(ci: string): boolean {
  const c = concurrence(ci);
  return c === null || /github\.run_id/.test(c.groupe);
}

function sauteLesBrouillons(ci: string): boolean {
  const types = entete(ci).match(/^ {2}pull_request:\n(?: {4}#.*\n)* {4}types: \[(.*)\]$/m)?.[1] ?? "";
  const si = jobVerifier(ci).match(/^ {4}if: (.*)$/m)?.[1] ?? "";
  return (
    types
      .split(",")
      .map((t) => t.trim())
      .includes("ready_for_review") && /github\.event\.pull_request\.draft/.test(si)
  );
}

// Les étapes du job verifier, chacune de son tiret à la suivante.
const etapes = (ci: string) => jobVerifier(ci).split(/\n(?= {6}- )/);

// npm ci n'est sauté que sur un node_modules retrouvé pour le même lockfile
// et la même ABI de Node : les modules natifs y sont compilés pour elle. Pas
// le numéro complet : il change d'un runner à l'autre (24.21.0 et 24.22.1 le
// même jour), et le cache de main ne servait plus aux pull requests.
function sauteNpmCiSeulementSurUnCacheExact(ci: string): boolean {
  const liste = etapes(ci);
  const rangAbi = liste.findIndex((e) => /^ {8}id: abi$/m.test(e));
  const rangCache = liste.findIndex((e) => /^ {8}id: node-modules$/m.test(e));
  const abi = liste[rangAbi] ?? "";
  const cache = liste[rangCache] ?? "";
  const cle = cache.match(/^ {10}key: (.*)$/m)?.[1] ?? "";
  const installation = liste.find((e) => /^ {8}run: npm ci$/m.test(e)) ?? "";
  return (
    // Écrite en sortie, avant le cache : sinon la clé la perd sans bruit.
    rangAbi !== -1 &&
    rangAbi < rangCache &&
    /^ {8}run: echo "abi=\$\(node -p process\.versions\.modules\)" >> "\$GITHUB_OUTPUT"$/m.test(abi) &&
    /uses: actions\/cache@/.test(cache) &&
    /hashFiles\('package-lock\.json'\)/.test(cle) &&
    /steps\.abi\.outputs\.abi/.test(cle) &&
    !/node-version/.test(cle) &&
    /^ {8}if: steps\.node-modules\.outputs\.cache-hit != 'true'$/m.test(installation)
  );
}

// Le cache des outils (ESLint, tsbuildinfo, .next/cache) ne dépend pas de la
// version de Node : ESLint invalide le sien quand elle change, tsc et Next
// n'en dépendent pas. Dans la clé, elle le faisait rater d'un runner à l'autre.
function cleDesOutilsSansVersionDeNode(ci: string): boolean {
  const cache = etapes(ci).find((e) => /^ {8}id: outils$/m.test(e)) ?? "";
  const cles = [...cache.matchAll(/^ {10}(?:key|restore-keys): (.*)$/gm)].map((m) => m[1]);
  return cles.length === 2 && cles.every((cle) => cle.startsWith("outils-") && !/node-version|abi/.test(cle));
}

describe("ci.yml : pas de minutes pour un passage inutile (1 000 minutes en un mois sur un dépôt privé)", () => {
  it("annule le passage d'une pull request quand un commit plus récent arrive sur la même pull request", () => {
    expect(annuleLesPassagesDePullRequestRemplaces(CI)).toBe(true);
    // Cas fautifs : pas de concurrence ; un groupe sans numéro de PR (rien ne
    // se remplace, ou toutes les PR s'annulent entre elles) ; annulation coupée.
    expect(annuleLesPassagesDePullRequestRemplaces(CI.replace(/^concurrency:\n(?: {2}.*\n)+/m, ""))).toBe(false);
    expect(
      annuleLesPassagesDePullRequestRemplaces(
        CI.replace(/^( {2}group: ).*$/m, "$1${{ github.workflow }}-${{ github.run_id }}")
      )
    ).toBe(false);
    expect(annuleLesPassagesDePullRequestRemplaces(CI.replace(/^( {2}cancel-in-progress: ).*$/m, "$1false"))).toBe(
      false
    );
  });

  it("n'annule ni ne fait attendre un passage sur main : chaque commit de main garde son résultat, dont dépend le déploiement", () => {
    expect(laisseChaquePassageDeMainAller(CI)).toBe(true);
    // Cas fautif : un groupe commun à toute la branche met les fusions rapprochées en file, ou les annule.
    expect(
      laisseChaquePassageDeMainAller(CI.replace(/^( {2}group: ).*$/m, "$1${{ github.workflow }}-${{ github.ref }}"))
    ).toBe(false);
  });

  it("ne vérifie pas une pull request en brouillon, et la vérifie dès qu'elle passe prête à relire", () => {
    expect(sauteLesBrouillons(CI)).toBe(true);
    // Cas fautifs : le job tourne sur les brouillons, ou le passage en « prête » ne relance rien.
    expect(sauteLesBrouillons(CI.replace(/^ {4}if: .*draft.*\n/m, ""))).toBe(false);
    expect(sauteLesBrouillons(CI.replace(/^( {4}types: \[.*)ready_for_review/m, "$1edited"))).toBe(false);
  });
});

describe("ci.yml : rien de refait à l'identique d'un passage à l'autre (5 minutes facturées pour 4 min 47)", () => {
  it("ne saute npm ci que sur un node_modules retrouvé pour le même lockfile et la même ABI de Node, pas son numéro complet, qui changeait d'un runner à l'autre", () => {
    expect(sauteNpmCiSeulementSurUnCacheExact(CI)).toBe(true);
    // Cas fautifs : clé sans lockfile ; clé sans ABI ; clé sur le numéro
    // complet (le cache de main ratait les PR) ; npm ci lancé sans condition.
    expect(sauteNpmCiSeulementSurUnCacheExact(CI.replace(/-\$\{\{ hashFiles\('package-lock\.json'\) \}\}/, ""))).toBe(
      false
    );
    expect(sauteNpmCiSeulementSurUnCacheExact(CI.replace(/-abi\$\{\{ steps\.abi\.outputs\.abi \}\}/, ""))).toBe(false);
    expect(
      sauteNpmCiSeulementSurUnCacheExact(
        CI.replace(/-abi\$\{\{ steps\.abi\.outputs\.abi \}\}/, "-node${{ steps.node.outputs.node-version }}")
      )
    ).toBe(false);
    expect(sauteNpmCiSeulementSurUnCacheExact(CI.replace(/^ {8}if: steps\.node-modules.*\n/m, ""))).toBe(false);
    // Cas fautif : l'ABI calculée sans être écrite en sortie, la clé la perdrait.
    expect(
      sauteNpmCiSeulementSurUnCacheExact(
        CI.replace(
          /^( {8}run: )echo "abi=\$\(node -p process\.versions\.modules\)" >> "\$GITHUB_OUTPUT"$/m,
          "$1node -p process.versions.modules"
        )
      )
    ).toBe(false);
  });

  it("retrouve le cache de lint, typecheck et build quelle que soit la version de Node du runner (24.21.0 sur main, 24.22.1 sur une PR le même jour)", () => {
    expect(cleDesOutilsSansVersionDeNode(CI)).toBe(true);
    // Cas fautif : la version de Node dans la clé et le repli, comme à l'origine.
    expect(
      cleDesOutilsSansVersionDeNode(
        CI.replace(
          /outils-\$\{\{ runner\.os \}\}-/g,
          "outils-${{ runner.os }}-node${{ steps.node.outputs.node-version }}-"
        )
      )
    ).toBe(false);
  });
});

/*
 * Le cas d'origine (audit du 2026-11-09) : `allowScripts` de package.json
 * (esbuild et unrs-resolver refusés) n'est lu que par npm 11.16 ou plus. Avec
 * un npm plus ancien, `engines` n'est qu'un avertissement et les scripts
 * d'installation de ces deux paquets tournent sans un mot. Deux verrous :
 * `engine-strict` dans .npmrc (poste et CI), et une étape qui échoue sur un npm
 * trop ancien avant tout `npm ci`.
 */
const NPMRC = fs.readFileSync(path.join(process.cwd(), ".npmrc"), "utf-8").replace(/\r\n/g, "\n");

// Les étapes de chaque job qui lance `npm ci`, chacune de son tiret à la suivante.
function etapesDesJobsAvecNpmCi(workflow: string): string[][] {
  const jobs = workflow.slice(workflow.indexOf("\njobs:") + 1).split(/\n(?= {2}\S)/);
  return jobs
    .map((bloc) => bloc.split(/\n(?= {6}- )/))
    .filter((liste) => liste.some((etape) => /^ {8}run: npm ci$/m.test(etape)));
}

// Avant le premier npm ci de chaque job : une étape qui lit `npm --version` et
// compare à 11.16, et qui sort en erreur.
function refuseUnNpmTropAncienAvantNpmCi(workflow: string): boolean {
  const jobs = etapesDesJobsAvecNpmCi(workflow);
  return (
    jobs.length > 0 &&
    jobs.every((liste) => {
      const rangNpmCi = liste.findIndex((etape) => /^ {8}run: npm ci$/m.test(etape));
      const rangVersion = liste.findIndex((etape) => /npm --version/.test(etape) && /11\.16/.test(etape));
      return rangVersion !== -1 && rangVersion < rangNpmCi && /exit 1/.test(liste[rangVersion]);
    })
  );
}

describe("npm 11.16 ou plus, seul à lire allowScripts : un npm plus ancien lancerait en silence les scripts d'installation refusés", () => {
  it("ne laisse npm installer qu'avec engine-strict, au poste comme en CI : engines devient un refus et non un avertissement", () => {
    expect(NPMRC).toMatch(/^engine-strict=true$/m);
    expect(JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")).engines.npm).toBe(">=11.16");
  });

  it("échoue sur un npm de moins de 11.16, par une étape placée avant tout npm ci de ci.yml", () => {
    expect(refuseUnNpmTropAncienAvantNpmCi(CI)).toBe(true);
    // Cas fautifs : pas d'étape ; un npm ci avant elle ; elle ne sort pas en erreur.
    expect(refuseUnNpmTropAncienAvantNpmCi(CI.replace(/ {6}- name: Version de npm\n(?: {8}.*\n)+/, ""))).toBe(false);
    expect(
      refuseUnNpmTropAncienAvantNpmCi(
        CI.replace(
          "      - name: Version de npm\n",
          "      - name: Trop tôt\n        run: npm ci\n      - name: Version de npm\n"
        )
      )
    ).toBe(false);
    expect(refuseUnNpmTropAncienAvantNpmCi(CI.replace(/exit 1/g, "exit 0"))).toBe(false);
  });
});
