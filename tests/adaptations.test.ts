import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { adaptations, ErreurAdaptations, rapport } from "../outils/adaptations.mjs";
import { assembler } from "../outils/assembler.mjs";
import { lireDesObjets } from "../outils/manifeste.mjs";
import { mettreAJour } from "../outils/mettre-a-jour.mjs";
import {
  assemblerEnTemporaire,
  dossierTemporaireVide,
  gitDans,
  nettoyerLesAssemblages,
  SOURCE,
} from "./aide-assemblage";

/*
 * outils/adaptations.mjs : ce qu'une appli assemblée a retouché des fichiers
 * venus du catalogue. Le 2026-11-05, sur l'appli d'essai tours-de-coloc, trois
 * retouches de ce genre (/kit et les écrans du patron retirés, l'accueil livré
 * vide rempli, l'onglet de la coloc) ne sont remontées au catalogue qu'une fois
 * vues à l'écran. L'outil les liste depuis le manifeste.
 */

const ENTIER = 240_000;
const MANIFESTE = "catalogue.empreintes.json";

afterAll(nettoyerLesAssemblages, 120_000);

// Une copie de l'appli assemblée, avec son historique : chaque test la retouche à sa façon.
function copieDeLAppli(assemble: string) {
  const dossier = dossierTemporaireVide();
  execFileSync("git", ["clone", "-q", assemble, dossier]);
  return dossier;
}

const ecrire = (dossier: string, chemin: string, transformer: (texte: string) => string) => {
  const fichier = path.join(dossier, chemin);
  fs.writeFileSync(fichier, transformer(fs.readFileSync(fichier, "utf-8")));
};

const commiter = (dossier: string, message: string) => {
  gitDans(dossier, "add", "-A");
  gitDans(dossier, "commit", "-q", "-m", message);
};

/*
 * Le catalogue de travail, fichiers non commités compris, en un commit A d'un
 * dépôt neuf : le rejeu demande un commit, et la CI ne clone pas l'historique.
 * node_modules est emprunté par un lien (même Prettier : pas de npm ci), que
 * nettoyerLesAssemblages retire avant le dossier.
 */
function copieDuCatalogue() {
  const dossier = dossierTemporaireVide();
  const fichiers = gitDans(SOURCE, "ls-files", "-z", "--cached", "--others", "--exclude-standard")
    .split("\0")
    .filter((chemin) => chemin && fs.existsSync(path.join(SOURCE, chemin)));
  for (const chemin of new Set(fichiers)) {
    fs.mkdirSync(path.dirname(path.join(dossier, chemin)), { recursive: true });
    fs.copyFileSync(path.join(SOURCE, chemin), path.join(dossier, chemin));
  }
  gitDans(dossier, "init", "-q", "-b", "main");
  commiter(dossier, "Catalogue d'essai : commit A");
  fs.symlinkSync(path.join(SOURCE, "node_modules"), path.join(dossier, "node_modules"), "junction");
  // Un lien n'est pas visé par le motif « node_modules/ » de .gitignore.
  fs.appendFileSync(path.join(dossier, ".git", "info", "exclude"), "node_modules\n");
  return dossier;
}

const NOTE = [
  "",
  "## 2026-11-05",
  "- Fichiers : `src/app/page.tsx`, `docs/`",
  "- Ce qui change : l'accueil livré vide affiche les tours de la semaine ; les notes du catalogue sont retirées.",
  "- Pourquoi : l'accueil disait « Page d'accueil à écrire ».",
  "- Nature : défaut du catalogue",
  "",
].join("\n");

describe("outils/adaptations.mjs", { timeout: ENTIER }, () => {
  const { dossier: assemble } = assemblerEnTemporaire({ briques: [] });

  it("liste les fichiers du catalogue retouchés ou supprimés, avec le diff et la note, jamais un fichier intact ni un fichier de l'appli", () => {
    const appli = copieDeLAppli(assemble);
    ecrire(appli, "src/lib/navigation.ts", (texte) => `${texte}// Retouche de l'appli, sans note.\n`);
    ecrire(appli, "src/app/page.tsx", (texte) => `${texte}// L'accueil de l'appli.\n`);
    fs.rmSync(path.join(appli, "docs", "cicatrices.md"));
    fs.writeFileSync(path.join(appli, "src", "app", "propre-a-l-appli.ts"), "export const x = 1;\n");
    ecrire(appli, "ADAPTATIONS.md", (texte) => texte + NOTE);
    commiter(appli, "Appli : trois adaptations");
    const head = gitDans(appli, "rev-parse", "HEAD");

    const resultat = adaptations({ catalogue: SOURCE, appli });

    expect(resultat.adaptations.map(({ chemin, etat }) => [chemin, etat])).toEqual([
      ["docs/cicatrices.md", "supprimé"],
      ["src/app/page.tsx", "retouché"],
      ["src/lib/navigation.ts", "retouché"],
    ]);
    const [docs, accueil, navigation] = resultat.adaptations;

    // Le diff part du fichier tel que l'assemblage l'a donné, retrouvé dans l'historique de l'appli.
    expect(navigation.origine).toMatchObject({ source: "appli" });
    expect(navigation.diff).toContain("--- catalogue/src/lib/navigation.ts");
    expect(navigation.diff).toContain("+++ appli/src/lib/navigation.ts");
    expect(navigation.diff).toContain("+// Retouche de l'appli, sans note.");
    expect(navigation.note).toBeNull();

    expect(accueil.diff).toContain("+// L'accueil de l'appli.");
    expect(accueil.note).toMatchObject({ titre: "2026-11-05", nature: "défaut du catalogue" });
    expect(accueil.note?.texte).toContain("Page d'accueil à écrire");
    // Un dossier cité avec sa barre finale couvre ses fichiers ; un supprimé n'a pas de diff.
    expect(docs.note).toMatchObject({ titre: "2026-11-05" });
    expect(docs.diff).toBeNull();
    expect(docs.unite).toBe("socle");

    const texte = rapport(resultat);
    expect(texte).toMatch(/## src\/lib\/navigation\.ts[^\n]*\n\nSans note/);
    expect(texte).toMatch(/## src\/app\/page\.tsx[^\n]*\n\nNote « 2026-11-05 », défaut du catalogue/);
    expect(texte).toMatch(/## Supprimés\n\n- `docs\/cicatrices\.md` \(socle\) : note « 2026-11-05 »/);
    // Le texte de la note, cité une fois pour les deux fichiers qu'elle couvre.
    expect(texte.split("Page d'accueil à écrire").length - 1).toBe(1);
    expect(texte).toContain("+// Retouche de l'appli, sans note.");

    // Lecture seule : ni commit, ni fichier écrit ou retouché.
    expect(gitDans(appli, "rev-parse", "HEAD")).toBe(head);
    expect(gitDans(appli, "status", "--porcelain", "--untracked-files=all")).toBe("");
  });

  it("donne avec --json ce que rend la fonction, pour les outils suivants", () => {
    const appli = copieDeLAppli(assemble);
    ecrire(appli, "src/lib/navigation.ts", (texte) => `${texte}// Retouche.\n`);
    commiter(appli, "Appli : une adaptation");

    const sortie = spawnSync(process.execPath, [path.join(SOURCE, "outils", "adaptations.mjs"), appli, "--json"], {
      encoding: "utf-8",
    });
    expect(sortie.stderr).toBe("");
    expect(sortie.status).toBe(0);
    const json = JSON.parse(sortie.stdout);
    expect(json).toEqual(JSON.parse(JSON.stringify(adaptations({ catalogue: SOURCE, appli }))));
    expect(json.adaptations).toHaveLength(1);
    expect(json.adaptations[0]).toMatchObject({ chemin: "src/lib/navigation.ts", etat: "retouché", note: null });
  });

  // Sur tours-de-coloc, les quatre fichiers retouchés avaient été fusionnés par
  // une mise à jour : leur origine exacte n'était dans aucun commit de l'appli.
  it("sans l'origine dans l'historique de l'appli, la prend au catalogue au commit noté : exacte si l'empreinte y est, approchée sinon", () => {
    const appli = copieDeLAppli(assemble);
    // Copié tel quel du catalogue : le commit noté le redonne.
    ecrire(appli, "src/lib/format.ts", (texte) => `${texte}// Retouche.\n`);
    // Retouché par l'assembleur (nom du paquet, licence) : le catalogue en a une autre empreinte.
    ecrire(appli, "package.json", (texte) => texte.replace('"private": true', '"private": false'));
    // Un historique repris de zéro : l'assemblage d'origine n'y est plus.
    gitDans(appli, "checkout", "-q", "--orphan", "reprise");
    commiter(appli, "Appli : historique repris");

    const resultat = adaptations({ catalogue: SOURCE, appli });
    const parChemin = Object.fromEntries(resultat.adaptations.map((adaptation) => [adaptation.chemin, adaptation]));
    expect(Object.keys(parChemin)).toEqual(["package.json", "src/lib/format.ts"]);
    expect(parChemin["src/lib/format.ts"].origine).toMatchObject({ source: "catalogue", exacte: true });
    expect(parChemin["src/lib/format.ts"].diff).toContain("+// Retouche.");
    expect(parChemin["package.json"].origine).toMatchObject({ source: "catalogue", exacte: false });
    expect(parChemin["package.json"].diff).toContain('+  "private": false');
    expect(rapport(resultat)).toMatch(/## package\.json[^\n]*\n[\s\S]*?Diff approché/);

    // Sans catalogue où chercher, l'outil le dit plutôt que de donner un diff.
    const sansCatalogue = adaptations({ appli });
    expect(sansCatalogue.adaptations.map(({ origine, diff }) => [origine, diff])).toEqual([
      [null, null],
      [null, null],
    ]);
    expect(rapport(sansCatalogue)).toMatch(/package\.json[\s\S]*origine introuvable/);
  });

  it("lit le HEAD et dit qu'une modification non commitée n'est pas lue", () => {
    const appli = copieDeLAppli(assemble);
    ecrire(appli, "src/lib/navigation.ts", (texte) => `${texte}// Pas encore commité.\n`);

    const resultat = adaptations({ catalogue: SOURCE, appli });
    expect(resultat.adaptations).toEqual([]);
    expect(resultat.avertissements.join("\n")).toMatch(/non commitées/);
  });

  // git répond « <nom demandé> missing », et un chemin peut contenir une espace :
  // découpé par espace, l'en-tête donnait une taille NaN et un contenu vide pris
  // pour l'origine, d'où un diff qui montrait tout le fichier comme ajouté.
  it("lit un objet absent comme absent, même nommé par un chemin à espaces, sans décaler les suivants", () => {
    const lus = lireDesObjets(SOURCE, ["HEAD:pas là/un fichier.ts", "HEAD:package.json"]);
    expect(lus[0]).toBeUndefined();
    expect(lus[1]?.toString("utf-8")).toBe(gitDans(SOURCE, "show", "HEAD:package.json") + "\n");
  });

  // Le cas de tours-de-coloc (2026-11-05) : quatre fichiers fusionnés par une
  // mise à jour, dont l'origine exacte n'était dans aucun commit de l'appli, et
  // un diff approché de plus de 300 lignes pour migrations.ts, presque toutes
  // dues aux étapes que l'assembleur retire. Une vraie mise à jour ici : le
  // rejeu demande un commit du catalogue, que l'assemblage de test n'a pas.
  it(
    "avec --rejouer, donne le diff exact d'un fichier fusionné par une mise à jour, que l'historique de l'appli n'a jamais eu",
    { timeout: 900_000 },
    () => {
      const catalogue = copieDuCatalogue();
      const commitA = gitDans(catalogue, "rev-parse", "--short", "HEAD");
      const appli = path.join(dossierTemporaireVide(), "essai-rejeu");
      assembler({ source: catalogue, sortie: appli, commit: commitA, briques: [] });
      const NAVIGATION = "src/lib/navigation.ts";
      ecrire(appli, NAVIGATION, (texte) => `${texte}// Retouche de l'appli.\n`);
      commiter(appli, "Appli : une retouche du menu");
      gitDans(appli, "update-ref", "refs/remotes/origin/main", "HEAD");

      ecrire(catalogue, NAVIGATION, (texte) => `// Évolution du catalogue, en tête.\n${texte}`);
      commiter(catalogue, "Catalogue d'essai : commit A'");
      gitDans(catalogue, "update-ref", "refs/remotes/origin/main", "HEAD");
      const vers = gitDans(catalogue, "rev-parse", "--short", "HEAD");
      const reporte = mettreAJour({ catalogue, appli, vers, branche: "feature/reporter-catalogue" });
      expect(reporte.fichiers.fusionnes).toEqual([NAVIGATION]);
      commiter(appli, "Catalogue : report");

      // Sans le rejeu : depuis le fichier du catalogue, que l'assembleur retouche (briques absentes).
      const approche = adaptations({ catalogue, appli }).adaptations;
      expect(approche.map(({ chemin }) => chemin)).toEqual([NAVIGATION]);
      expect(approche[0].origine).toMatchObject({ source: "catalogue", exacte: false });

      const resultat = adaptations({ catalogue, appli, rejouer: true });
      expect(resultat.avertissements).toEqual([]);
      const [navigation] = resultat.adaptations;
      expect(navigation.origine).toMatchObject({ source: "rejeu", exacte: true });
      // Le diff exact n'a que la retouche de l'appli : ni l'évolution du catalogue, fusionnée, ni les retraits de l'assembleur.
      const lignesChangees = (navigation.diff ?? "")
        .split("\n")
        .filter((ligne) => /^[+-]/.test(ligne) && !/^(\+\+\+|---) /.test(ligne));
      expect(lignesChangees).toEqual(["+// Retouche de l'appli."]);
      expect(rapport(resultat)).toMatch(/Origine prise dans l'assemblage rejoué au commit/);
      expect(approche[0].diff?.split("\n").length).toBeGreaterThan(navigation.diff?.split("\n").length ?? 0);

      // Lecture seule : l'appli reste à son HEAD, et le worktree du rejeu est retiré du catalogue.
      expect(gitDans(appli, "status", "--porcelain")).toBe("");
      expect(gitDans(catalogue, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
    }
  );

  it("avec --rejouer, dit en avertissement un rejeu qui échoue et garde les diffs approchés", () => {
    const appli = copieDeLAppli(assemble);
    ecrire(appli, "package.json", (texte) => texte.replace('"private": true', '"private": false'));
    gitDans(appli, "checkout", "-q", "--orphan", "reprise");
    commiter(appli, "Appli : historique repris");

    // L'assemblage de test note un commit inventé (COMMIT_DE_TEST) : le rejeu le refuse.
    const resultat = adaptations({ catalogue: SOURCE, appli, rejouer: true });
    expect(resultat.avertissements.join("\n")).toMatch(
      /rejeu de l'assemblage a échoué, les diffs restent approchés : /
    );
    expect(resultat.adaptations[0].origine).toMatchObject({ source: "catalogue", exacte: false });
    // Le rapport ne conseille pas l'option qui vient d'échouer.
    expect(rapport(resultat)).toMatch(/Diff approché/);
    expect(rapport(resultat)).not.toMatch(/--rejouer donne/);
    expect(rapport(adaptations({ catalogue: SOURCE, appli }))).toMatch(/--rejouer donne l'origine exacte/);

    expect(() => adaptations({ appli, rejouer: true })).toThrow(ErreurAdaptations);
  });

  it("refuse en le disant un dossier qui n'est pas une appli assemblée", () => {
    const vide = dossierTemporaireVide();
    expect(() => adaptations({ catalogue: SOURCE, appli: path.join(vide, "absent") })).toThrow(ErreurAdaptations);
    expect(() => adaptations({ catalogue: SOURCE, appli: vide })).toThrow(/pas un dépôt git/);
    gitDans(vide, "init", "-q");
    fs.writeFileSync(path.join(vide, "README.md"), "# Pas une appli assemblée\n");
    commiter(vide, "Départ");
    expect(() => adaptations({ catalogue: SOURCE, appli: vide })).toThrow(new RegExp(MANIFESTE.replace(".", "\\.")));
  });
});
