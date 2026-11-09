import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Test-verrou du test de l'assembleur, lancé à part. tests/assembleur.test.ts
 * dure plus de 10 minutes : npm test l'écarte, et seul le job assembleur de
 * .github/workflows/assemblage.yml le lance encore, avec tests/mettre-a-jour.test.ts
 * (celui de l'outil de mise à jour, qui rejoue des assemblages). Ce verrou tourne dans
 * npm test : placé dans le fichier qu'il garde, il ne tournait que dans le
 * job qu'il devait garder, et la disparition du job serait passée inaperçue.
 *
 * Le job assembleur coûtait environ 219 s à chaque pull request et à chaque
 * arrivée sur main, la moitié des minutes facturées du 27 au 29 octobre (dépôt
 * privé). Il ne lance plus qu'un échantillon sur une pull request, et le test
 * complet la nuit, seulement si main a changé, ou à la main.
 *
 * Catalogue seulement (EXCLUS_DU_CATALOGUE) : une copie n'a ni l'assembleur
 * ni ce workflow.
 */

const lire = (chemin: string) => fs.readFileSync(path.join(process.cwd(), chemin), "utf-8").replace(/\r\n/g, "\n");

const WORKFLOW = lire(".github/workflows/assemblage.yml");
const CI = lire(".github/workflows/ci.yml");

// Le bloc d'un job, de son nom au job suivant.
function job(workflow: string, nom: string): string {
  const debut = workflow.indexOf(`\n  ${nom}:\n`);
  if (debut === -1) return "";
  const suite = workflow.slice(debut + 1).search(/\n {2}\S/);
  return suite === -1 ? workflow.slice(debut) : workflow.slice(debut, debut + 1 + suite);
}

const entete = (workflow: string) => workflow.slice(0, workflow.indexOf("\njobs:"));
const condition = (bloc: string) => bloc.match(/^ {4}if: (.*)$/m)?.[1] ?? "";

// Une pull request prête à relire lance l'échantillon ; la nuit (si main a
// changé) et la main lancent le complet ; un push sur main ne le lance plus.
function lanceLeTestDeLAssembleur(workflow: string): boolean {
  const types = (entete(workflow).match(/^ {2}pull_request:\n(?: {4}#.*\n)* {4}types: \[(.*)\]$/m)?.[1] ?? "")
    .split(",")
    .map((t) => t.trim());
  const bloc = job(workflow, "assembleur");
  return (
    ["opened", "synchronize", "reopened", "ready_for_review"].every((type) => types.includes(type)) &&
    /^ {2}schedule:\n(?: {4}#.*\n)* {4}- cron: ".+"$/m.test(entete(workflow)) &&
    /^ {2}workflow_dispatch:$/m.test(entete(workflow)) &&
    /^ {4}needs: main-a-change$/m.test(bloc) &&
    condition(bloc) ===
      "${{ !cancelled() && ((github.event_name == 'pull_request' && !github.event.pull_request.draft) || github.event_name == 'workflow_dispatch' || needs.main-a-change.outputs.reponse == 'oui') }}" &&
    /^ {6}ASSEMBLEUR_ECHANTILLON: \$\{\{ github\.event_name == 'pull_request' && 'oui' \|\| '' \}\}$/m.test(bloc) &&
    /^ {8}run: npm run test:assembleur$/m.test(bloc)
  );
}

// La nuit, le complet ne repart que si main a changé depuis le dernier passage
// complet réussi, de nuit ou à la main : un passage sur push réussi n'a pas
// lancé le complet, s'y comparer sauterait une nuit à tort.
function neRelanceLaNuitQueSiMainAChange(workflow: string): boolean {
  const bloc = job(workflow, "main-a-change");
  return (
    condition(bloc) === "github.event_name == 'schedule'" &&
    // actions: read et rien d'autre.
    /^ {4}permissions:\n {6}actions: read\n(?! {6}\S)/m.test(bloc) &&
    /^ {6}reponse: \$\{\{ steps\.comparer\.outputs\.reponse \}\}$/m.test(bloc) &&
    /^ {8}id: comparer$/m.test(bloc) &&
    /actions\/workflows\/assemblage\.yml\/runs\?branch=main&status=success/.test(bloc) &&
    /select\(\.event == "schedule" or \.event == "workflow_dispatch"\)\]\[0\]\.head_sha/.test(bloc) &&
    /if \[ "\$dernier" = "\$GITHUB_SHA" \]; then\n\s+echo "reponse=non" >> "\$GITHUB_OUTPUT"\n\s+else\n\s+echo "reponse=oui" >> "\$GITHUB_OUTPUT"/.test(
      bloc
    )
  );
}

describe("test de l'assembleur, lancé à part (plus de 10 minutes à chaque npm test)", () => {
  it("sort de npm test et se lance par npm run test:assembleur", () => {
    const { scripts } = JSON.parse(lire("package.json"));
    expect(scripts.test).toBe("vitest run --exclude tests/assembleur.test.ts --exclude tests/mettre-a-jour.test.ts");
    expect(scripts["test:assembleur"]).toBe(
      "vitest run --no-file-parallelism tests/assembleur.test.ts tests/mettre-a-jour.test.ts"
    );
  });

  it("est lancé par le job assembleur : échantillon sur une pull request prête à relire, complet la nuit et à la main, plus sur main (219 s par passage)", () => {
    expect(lanceLeTestDeLAssembleur(WORKFLOW)).toBe(true);
    const bloc = job(WORKFLOW, "assembleur");
    const avec = (avant: string | RegExp, apres: string) => WORKFLOW.replace(bloc, bloc.replace(avant, apres));
    // Cas fautifs : le job disparaît (ou change de nom) ; il tourne de nouveau
    // sur chaque push de main ; l'échantillon vaut partout (le complet ne passe
    // plus jamais) ; son étape part dans un autre job ; plus de nuit.
    expect(lanceLeTestDeLAssembleur(WORKFLOW.replace("\n  assembleur:\n", "\n  autre:\n"))).toBe(false);
    expect(
      lanceLeTestDeLAssembleur(
        avec(/^( {4}if: ).*$/m, "$1github.event_name != 'pull_request' || !github.event.pull_request.draft")
      )
    ).toBe(false);
    expect(lanceLeTestDeLAssembleur(avec(/(ASSEMBLEUR_ECHANTILLON: ).*$/m, "$1oui"))).toBe(false);
    expect(lanceLeTestDeLAssembleur(avec("run: npm run test:assembleur", "run: npm test"))).toBe(false);
    expect(lanceLeTestDeLAssembleur(WORKFLOW.replace(/^ {2}schedule:\n(?: {4}.*\n)+/m, ""))).toBe(false);
  });

  it("ne relance la nuit le test complet que si main a changé depuis le dernier passage complet réussi : une nuit sans changement ne coûte que la comparaison", () => {
    expect(neRelanceLaNuitQueSiMainAChange(WORKFLOW)).toBe(true);
    const bloc = job(WORKFLOW, "main-a-change");
    const avec = (avant: string | RegExp, apres: string) => WORKFLOW.replace(bloc, bloc.replace(avant, apres));
    // Cas fautifs : comparé à tout passage réussi (un push sur main ferait
    // sauter la nuit) ; sans le droit de lire les passages, ou avec un droit
    // de plus ; jamais comparé ; réponses inversées ; réponse jamais sortie du job.
    expect(neRelanceLaNuitQueSiMainAChange(avec(/select\(.*?\)/, "select(.)"))).toBe(false);
    expect(neRelanceLaNuitQueSiMainAChange(avec(/^ {4}permissions:\n {6}actions: read\n/m, ""))).toBe(false);
    expect(neRelanceLaNuitQueSiMainAChange(avec("actions: read\n", "actions: read\n      contents: write\n"))).toBe(
      false
    );
    expect(neRelanceLaNuitQueSiMainAChange(avec('[ "$dernier" = "$GITHUB_SHA" ]', "false"))).toBe(false);
    expect(
      neRelanceLaNuitQueSiMainAChange(avec("reponse=non", "reponse=X").replace("reponse=oui", "reponse=non"))
    ).toBe(false);
    expect(neRelanceLaNuitQueSiMainAChange(avec(/^( {6}reponse: ).*$/m, "$1''"))).toBe(false);
  });

  // tests/mettre-a-jour.test.ts y rejoue les étapes qu'une mise à jour reporte dans une
  // appli : sans base, vitest.config.ts refuserait le lancement, et rien d'autre ne les rejoue.
  it("donne au job assembleur un Postgres démarré avant le test et une DATABASE_URL locale : les migrations reportées par une mise à jour s'y rejouent", () => {
    const aSaBase = (bloc: string) =>
      /^ {6}DATABASE_URL: postgresql:\/\/[^@\s]+@localhost:5432\/\w+_test$/m.test(bloc) &&
      bloc.indexOf("- name: Démarrer Postgres") > -1 &&
      bloc.indexOf("- name: Démarrer Postgres") < bloc.indexOf("run: npm run test:assembleur");
    const bloc = job(WORKFLOW, "assembleur");
    expect(aSaBase(bloc)).toBe(true);
    // Cas fautifs : plus de base, ou Postgres démarré après le test.
    expect(aSaBase(bloc.replace(/^ {6}DATABASE_URL: .*\n/m, ""))).toBe(false);
    expect(aSaBase(bloc.replace("- name: Démarrer Postgres", "- name: Autre chose"))).toBe(false);
  });

  // Audit du 2026-11-09 : l'image se tirait par étiquette. Épinglée par digest
  // (tests/bases-locales.test.ts le vérifie pour ci.yml et le compose), elle
  // ne se renouvelle que par la PR de Dependabot sur le compose, où ce test et
  // le sien disent de recopier le digest dans les deux workflows.
  it("tire dans le job assembleur l'image Postgres de ci.yml, épinglée par digest, que Dependabot renouvelle depuis le compose", () => {
    const image = (texte: string) => texte.match(/^\s*IMAGE:\s*(\S+)/m)?.[1];
    expect(image(job(WORKFLOW, "assembleur"))).toMatch(/^postgres:\d+@sha256:[0-9a-f]{64}$/);
    expect(image(job(WORKFLOW, "assembleur"))).toBe(image(CI));
    expect(image(lire("docker-compose.yml").replace(/image:/, "IMAGE:"))).toBe(image(CI));
    const dependabot = lire(".github/dependabot.yml");
    expect(dependabot).toMatch(/- package-ecosystem: "docker-compose"\n\s+directory: "\/"\n/);
  });

  it("ne lance le job socle-seul ni la nuit ni à la main : main l'a déjà passé à son arrivée", () => {
    expect(condition(job(WORKFLOW, "socle-seul"))).toBe(
      "github.event_name == 'push' || (github.event_name == 'pull_request' && !github.event.pull_request.draft)"
    );
  });

  it("retrouve node_modules par la même clé que le job verifier de ci.yml : un cache plus large ferait tester d'autres dépendances", () => {
    const cle = (texte: string) => texte.match(/^ {10}key: (node-modules-.*)$/m)?.[1];
    const abi = (texte: string) => texte.match(/^ {8}run: (echo "abi=.*)$/m)?.[1];
    const bloc = job(WORKFLOW, "assembleur");
    expect(cle(bloc)).toBeDefined();
    expect(cle(bloc)).toBe(cle(CI));
    expect(abi(bloc)).toBe(abi(CI));
  });
});

/*
 * Le même verrou que tests/ci.test.ts, pour les deux jobs d'assemblage.yml qui
 * lancent npm ci (audit du 2026-11-09) : `allowScripts` de package.json n'est
 * lu que par npm 11.16 ou plus, et un npm plus ancien lancerait en silence les
 * scripts d'installation d'esbuild et d'unrs-resolver. ci.test.ts est copié
 * dans l'appli, qui n'a pas ce workflow : celui-ci reste au catalogue.
 */
function refuseUnNpmTropAncienAvantNpmCi(workflow: string): boolean {
  const jobs = workflow
    .slice(workflow.indexOf("\njobs:") + 1)
    .split(/\n(?= {2}\S)/)
    .map((bloc) => bloc.split(/\n(?= {6}- )/))
    .filter((liste) => liste.some((etape) => /^ {8}run: npm ci$/m.test(etape)));
  return (
    jobs.length === 2 &&
    jobs.every((liste) => {
      const rangNpmCi = liste.findIndex((etape) => /^ {8}run: npm ci$/m.test(etape));
      const rangVersion = liste.findIndex((etape) => /npm --version/.test(etape) && /11\.16/.test(etape));
      return rangVersion !== -1 && rangVersion < rangNpmCi && /exit 1/.test(liste[rangVersion]);
    })
  );
}

describe("assemblage.yml : un npm de moins de 11.16 échoue avant tout npm ci", () => {
  it("place l'étape de version avant le premier npm ci de chacun de ses deux jobs", () => {
    expect(refuseUnNpmTropAncienAvantNpmCi(WORKFLOW)).toBe(true);
    // Cas fautifs : pas d'étape ; un npm ci avant elle ; elle ne sort pas en erreur.
    expect(refuseUnNpmTropAncienAvantNpmCi(WORKFLOW.replace(/ {6}- name: Version de npm\n(?: {8}.*\n)+/, ""))).toBe(
      false
    );
    expect(
      refuseUnNpmTropAncienAvantNpmCi(
        WORKFLOW.replace(
          "      - name: Version de npm\n",
          "      - name: Trop tôt\n        run: npm ci\n      - name: Version de npm\n"
        )
      )
    ).toBe(false);
    expect(refuseUnNpmTropAncienAvantNpmCi(WORKFLOW.replace(/exit 1/g, "exit 0"))).toBe(false);
  });
});
