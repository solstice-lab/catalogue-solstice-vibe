import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assembler } from "../outils/assembler.mjs";
import { ErreurMiseAJour, examiner, rapport } from "../outils/mettre-a-jour.mjs";

/*
 * Test-verrou de outils/mettre-a-jour.mjs, première tranche (--a-blanc) :
 * retrouver ce qu'une appli a reçu du catalogue en rejouant l'assembleur de
 * son commit, et dire ce qu'elle en a retouché (outils/mise-a-jour.md).
 *
 * La CI ne clone pas l'historique du catalogue : le test construit le sien,
 * une copie du catalogue de travail en un commit A, puis un commit qui monte
 * Prettier. Les applis d'essai sont assemblées à A.
 *
 * Il rejoue plusieurs assemblages et lance un vrai npm ci : sorti de npm test
 * comme celui de l'assembleur, il tourne avec lui (npm run test:assembleur, job
 * assembleur de .github/workflows/assemblage.yml). Catalogue seulement
 * (EXCLUS_DU_CATALOGUE) : une appli n'a pas l'outil.
 */

// L'assembleur fait le premier commit de chaque appli d'essai : le runner de la
// CI n'a pas d'identité git (voir tests/aide-assemblage.ts).
process.env.GIT_AUTHOR_NAME = "Mise à jour (test)";
process.env.GIT_AUTHOR_EMAIL = "mise-a-jour@test.invalid";
process.env.GIT_COMMITTER_NAME = "Mise à jour (test)";
process.env.GIT_COMMITTER_EMAIL = "mise-a-jour@test.invalid";

const SOURCE = process.cwd();
const REJEU = 300_000;
const MANIFESTE = "catalogue.empreintes.json";
const PRETTIER_DU_CATALOGUE = JSON.parse(fs.readFileSync(path.join(SOURCE, "package-lock.json"), "utf-8")).packages[
  "node_modules/prettier"
].version;

const aNettoyer: string[] = [];

function dossierTemporaire(prefixe: string): string {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), prefixe));
  aNettoyer.push(dossier);
  return dossier;
}

function git(dossier: string, ...args: string[]): string {
  return execFileSync("git", ["-C", dossier, ...args], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).replace(/\n$/, "");
}

// Jonction sous Windows (sans droit d'administrateur), lien symbolique ailleurs.
function lierNodeModules(catalogue: string) {
  fs.symlinkSync(path.join(SOURCE, "node_modules"), path.join(catalogue, "node_modules"), "junction");
}

function delierNodeModules(catalogue: string) {
  const lien = path.join(catalogue, "node_modules");
  if (!fs.lstatSync(lien, { throwIfNoEntry: false })?.isSymbolicLink()) return;
  try {
    fs.unlinkSync(lien);
  } catch {
    fs.rmdirSync(lien);
  }
}

afterAll(() => {
  for (const dossier of aNettoyer.splice(0)) {
    delierNodeModules(dossier);
    fs.rmSync(dossier, { recursive: true, force: true });
  }
}, 120_000);

// Le catalogue de travail, fichiers non commités compris : le test vérifie le
// code tel qu'il est, pas le dernier commit.
function copierLeCatalogue(): string {
  const dossier = dossierTemporaire("catalogue-essai-");
  const fichiers = git(SOURCE, "ls-files", "-z", "--cached", "--others", "--exclude-standard")
    .split("\0")
    .filter((chemin) => chemin && fs.existsSync(path.join(SOURCE, chemin)));
  for (const chemin of new Set(fichiers)) {
    fs.mkdirSync(path.dirname(path.join(dossier, chemin)), { recursive: true });
    fs.copyFileSync(path.join(SOURCE, chemin), path.join(dossier, chemin));
  }
  git(dossier, "init", "-q", "-b", "main");
  git(dossier, "add", "-A");
  git(dossier, "commit", "-q", "-m", "Catalogue d'essai : commit A");
  return dossier;
}

function blueprint(entete: string): string {
  const fichier = path.join(dossierTemporaire("blueprint-"), "blueprint.md");
  fs.writeFileSync(fichier, `---\nformat: 1\n${entete}\n---\n\n# Corps\n`);
  return fichier;
}

let catalogue: string;
let commitA: string;
let appli: string;

beforeAll(() => {
  catalogue = copierLeCatalogue();
  commitA = git(catalogue, "rev-parse", "--short", "HEAD");
  lierNodeModules(catalogue);
  // Les réglages qui changent des fichiers : briques dont une ajoutée d'office
  // (rgpd avec comptes), champs de l'en-tête, Dependabot.
  appli = path.join(dossierTemporaire("appli-"), "essai-coloc");
  assembler({
    source: catalogue,
    sortie: appli,
    commit: commitA,
    briques: ["comptes", "mails"],
    dependabot: true,
    blueprint: blueprint(
      'appli: Essai de coloc\nnom_affiche: "Essai # de coloc"\nsite: public\nentree: ouverte\nmethodes: [code-email]'
    ),
  });
}, REJEU);

// Une copie de l'appli d'essai, retouchée et commitée.
function appliRetouchee(retoucher: (dossier: string) => void): string {
  const dossier = path.join(dossierTemporaire("appli-retouchee-"), "appli");
  git(path.dirname(dossier), "clone", "-q", appli, dossier);
  retoucher(dossier);
  git(dossier, "add", "-A");
  git(dossier, "commit", "-q", "--allow-empty", "-m", "Retouche de l'appli");
  return dossier;
}

type Manifeste = {
  format: number;
  note: string;
  catalogue: { version: string; commit: string; commitComplet?: string };
  fichiers: Record<string, { unite: string; sha256: string }>;
};

function reecrireLeManifeste(dossier: string, changer: (manifeste: Manifeste) => Manifeste | void) {
  const fichier = path.join(dossier, MANIFESTE);
  const manifeste: Manifeste = JSON.parse(fs.readFileSync(fichier, "utf-8"));
  fs.writeFileSync(fichier, `${JSON.stringify(changer(manifeste) ?? manifeste, null, 2)}\n`);
}

// Ce que l'outil laisse : ni l'appli ni le catalogue ne gardent trace du rejeu.
function rienNEstEcrit(dossier: string, head: string) {
  expect(git(dossier, "status", "--porcelain")).toBe("");
  expect(git(dossier, "rev-parse", "HEAD")).toBe(head);
  expect(git(catalogue, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
}

describe("mettre-a-jour --a-blanc : l'origine d'une appli rejouée au commit de son manifeste", () => {
  it("reproduit sans écart l'origine d'une appli fraîchement assemblée, et ne liste rien", { timeout: REJEU }, () => {
    const head = git(appli, "rev-parse", "HEAD");
    const resultat = examiner({ catalogue, appli });
    expect(resultat).toMatchObject({
      format: 2,
      commit: commitA,
      briques: ["comptes", "mails"],
      deduits: false,
      paquet: "essai-de-coloc",
      dependabot: true,
      prettier: { provenance: "emprunté au catalogue" },
      retouches: [],
      supprimes: [],
      avertissements: [],
    });
    expect(resultat.fichiers).toBe(
      Object.keys(JSON.parse(fs.readFileSync(path.join(appli, MANIFESTE), "utf-8")).fichiers).length
    );
    expect(rapport(resultat)).toMatch(/^Rien n'est retouché ni supprimé/m);
    rienNEstEcrit(appli, head);
  });

  it(
    "liste les fichiers retouchés et supprimés par l'appli, NOTICE compris, jamais ceux qu'elle a créés",
    { timeout: REJEU },
    () => {
      const dossier = appliRetouchee((d) => {
        fs.appendFileSync(path.join(d, "src/lib/navigation.ts"), "// retouche de l'appli\n");
        fs.appendFileSync(path.join(d, "NOTICE"), "Avis de l'appli.\n");
        fs.rmSync(path.join(d, "src/briques/mails/README.md"));
        fs.mkdirSync(path.join(d, "src/app/coloc"), { recursive: true });
        fs.writeFileSync(path.join(d, "src/app/coloc/page.tsx"), "export default function Page() {}\n");
      });
      const head = git(dossier, "rev-parse", "HEAD");
      const resultat = examiner({ catalogue, appli: dossier });
      expect(resultat.retouches).toEqual(["NOTICE", "src/lib/navigation.ts"]);
      expect(resultat.supprimes).toEqual(["src/briques/mails/README.md"]);
      const texte = rapport(resultat);
      expect(texte).toMatch(/^Retouchés par l'appli \(2\) :\n- NOTICE\n- src\/lib\/navigation\.ts$/m);
      expect(texte).toMatch(/^Supprimés par l'appli \(1\) :\n- src\/briques\/mails\/README\.md$/m);
      expect(texte).not.toContain("src/app/coloc");
      rienNEstEcrit(dossier, head);
    }
  );

  it(
    "lit encore le format 1, en déduisant briques, nom du paquet, Dependabot et en-tête de la blueprint",
    { timeout: REJEU },
    () => {
      const dossier = appliRetouchee((d) =>
        reecrireLeManifeste(d, ({ note, catalogue: { version, commit }, fichiers }) => ({
          format: 1,
          note,
          catalogue: { version, commit },
          fichiers,
        }))
      );
      const resultat = examiner({ catalogue, appli: dossier });
      // rgpd, ajoutée d'office, se lit comme une brique choisie : elle donne les mêmes fichiers.
      expect([...resultat.briques].sort()).toEqual(["comptes", "mails", "rgpd"]);
      expect(resultat).toMatchObject({
        format: 1,
        deduits: true,
        paquet: "essai-de-coloc",
        dependabot: true,
        retouches: [],
        supprimes: [],
      });
    }
  );

  it(
    "refuse un manifeste faussé, en nommant les fichiers dont l'empreinte ne se retrouve pas",
    { timeout: REJEU },
    () => {
      const dossier = appliRetouchee((d) =>
        reecrireLeManifeste(d, (manifeste) => {
          manifeste.fichiers["src/lib/navigation.ts"].sha256 = "0".repeat(64);
          manifeste.fichiers["src/briques/mails/envoi.ts"].unite = "socle";
        })
      );
      const refus = (() => {
        try {
          examiner({ catalogue, appli: dossier });
        } catch (erreur) {
          return erreur;
        }
      })();
      expect(refus).toBeInstanceOf(ErreurMiseAJour);
      expect((refus as Error).message).toMatch(/ne redonne pas les empreintes du manifeste/);
      expect((refus as Error).message).toMatch(/^ {2}- src\/lib\/navigation\.ts : empreinte différente$/m);
      expect((refus as Error).message).toMatch(
        /^ {2}- src\/briques\/mails\/envoi\.ts : unité socle au manifeste, mails rejouée$/m
      );
      expect(git(catalogue, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
    }
  );
});

describe("mettre-a-jour --a-blanc : refus en clair, avant tout rejeu", () => {
  it("refuse un dossier qui n'est pas un dépôt git", () => {
    expect(() => examiner({ catalogue, appli: dossierTemporaire("pas-un-depot-") })).toThrow(
      // Un dossier temporaire peut relever d'un dépôt parent (le dossier de profil d'un poste).
      /n'est pas (un dépôt git|la racine de son dépôt git)/
    );
  });

  it("refuse une appli dont l'arbre n'est pas propre : l'outil lit son HEAD", () => {
    const dossier = appliRetouchee(() => {});
    fs.writeFileSync(path.join(dossier, "src/lib/navigation.ts"), "// en cours\n");
    expect(() => examiner({ catalogue, appli: dossier })).toThrow(/n'est pas propre/);
  });

  it("refuse une appli sans manifeste (assemblée avant le 2026-11-02)", () => {
    const dossier = appliRetouchee((d) => fs.rmSync(path.join(d, MANIFESTE)));
    expect(() => examiner({ catalogue, appli: dossier })).toThrow(/n'a pas de manifeste/);
  });

  it("refuse une appli assemblée depuis un catalogue aux modifications non commitées (+arbre-modifie)", () => {
    const dossier = appliRetouchee((d) =>
      reecrireLeManifeste(d, (manifeste) => {
        manifeste.catalogue.commit += "+arbre-modifie";
      })
    );
    expect(() => examiner({ catalogue, appli: dossier })).toThrow(/\+arbre-modifie.*ne se rejoue pas/);
  });

  it("refuse un commit du manifeste absent du catalogue, en disant quoi faire", () => {
    const dossier = appliRetouchee((d) =>
      reecrireLeManifeste(d, (manifeste) => {
        manifeste.catalogue.commit = "f".repeat(7);
        manifeste.catalogue.commitComplet = "f".repeat(40);
      })
    );
    expect(() => examiner({ catalogue, appli: dossier })).toThrow(/absent du catalogue.*git fetch origin/s);
  });

  it("refuse un manifeste d'un format inconnu", () => {
    const dossier = appliRetouchee((d) =>
      reecrireLeManifeste(d, (manifeste) => {
        manifeste.format = 3;
      })
    );
    expect(() => examiner({ catalogue, appli: dossier })).toThrow(/format 3/);
  });

  it("n'écrit rien sans --a-blanc : la ligne de commande le refuse, l'écriture n'est pas encore outillée", () => {
    const resultat = spawnSync(process.execPath, [path.join(SOURCE, "outils/mettre-a-jour.mjs"), appli], {
      encoding: "utf-8",
    });
    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toMatch(/^Mise à jour refusée : .*--a-blanc/m);
  });
});

// Le cas qui a fait écrire la règle : Dependabot monte Prettier au catalogue, et
// les empreintes d'une appli dépendent de la version qui l'a mise en forme.
describe("mettre-a-jour --a-blanc : le Prettier du commit de l'appli, pas celui du jour", () => {
  it(
    "reproduit encore l'origine quand le catalogue a monté Prettier depuis : npm ci dans le worktree, jamais le Prettier du catalogue",
    { timeout: 600_000 },
    () => {
      // Le commit A' monte Prettier, et le catalogue l'a installé. Ce Prettier
      // installé échoue s'il est appelé : l'origine ne peut venir que du bon.
      const paquet = path.join(catalogue, "package.json");
      fs.writeFileSync(paquet, fs.readFileSync(paquet, "utf-8").replace(/"prettier": "[^"]+"/, '"prettier": "3.99.0"'));
      const verrou = path.join(catalogue, "package-lock.json");
      const lu = JSON.parse(fs.readFileSync(verrou, "utf-8"));
      lu.packages["node_modules/prettier"].version = "3.99.0";
      fs.writeFileSync(verrou, `${JSON.stringify(lu, null, 2)}\n`);
      git(catalogue, "add", "package.json", "package-lock.json");
      git(catalogue, "commit", "-q", "-m", "Catalogue d'essai : monter Prettier");
      delierNodeModules(catalogue);
      const prettier = path.join(catalogue, "node_modules", "prettier");
      fs.mkdirSync(path.join(prettier, "bin"), { recursive: true });
      fs.writeFileSync(path.join(prettier, "package.json"), '{ "name": "prettier", "version": "3.99.0" }\n');
      fs.writeFileSync(
        path.join(prettier, "bin", "prettier.cjs"),
        'console.error("Prettier du catalogue appelé à tort"); process.exit(9);\n'
      );

      const resultat = examiner({ catalogue, appli });
      expect(resultat.prettier).toEqual({ version: PRETTIER_DU_CATALOGUE, provenance: "installé par npm ci" });
      expect(resultat.retouches).toEqual([]);
      expect(resultat.supprimes).toEqual([]);
    }
  );
});
