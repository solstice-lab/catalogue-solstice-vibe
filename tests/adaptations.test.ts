import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { adaptations, ErreurAdaptations, rapport } from "../outils/adaptations.mjs";
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
