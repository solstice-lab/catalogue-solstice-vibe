import { execFileSync, execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assembler } from "../outils/assembler.mjs";
import { ErreurMiseAJour, examiner, lireLesEtapes, mettreAJour, rapport } from "../outils/mettre-a-jour.mjs";
import {
  migrationsAvantPuisApres,
  migrationsSuccessives,
  nettoyerLesAssemblages,
  testsSurUneBaseNeuve,
  typecheck,
} from "./aide-assemblage";

/*
 * Test-verrou de outils/mettre-a-jour.mjs (outils/mise-a-jour.md) : retrouver
 * ce qu'une appli a reçu du catalogue en rejouant l'assembleur de son commit,
 * dire ce qu'elle en a retouché (tranche 1), puis y reporter le catalogue d'un
 * commit plus récent (tranche 2), étapes de migration comprises (tranche 3),
 * ou lui ajouter une brique au commit qu'elle a (tranche 4).
 *
 * La CI ne clone pas l'historique du catalogue : le test construit le sien,
 * une copie du catalogue de travail en un commit A, puis les commits des
 * tranches 2 et 3 et, en dernier, un commit qui monte Prettier. Les applis
 * d'essai sont assemblées à A.
 *
 * Il rejoue plusieurs assemblages, lance un vrai npm ci et rejoue des
 * migrations sur des bases neuves du Postgres de DATABASE_URL : sorti de npm
 * test comme celui de l'assembleur, il tourne avec lui (npm run
 * test:assembleur, job assembleur de .github/workflows/assemblage.yml, qui a
 * son Postgres). Les cas de la tranche 3 sans assemblage ni base sont dans
 * tests/mettre-a-jour-migrations.test.ts. Catalogue seulement
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
  // Les copies de travail des rejeus de migrations (tests/aide-assemblage.ts).
  nettoyerLesAssemblages();
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

// Les réglages qui changent des fichiers : briques dont une ajoutée d'office
// (rgpd avec comptes), champs de l'en-tête, Dependabot.
const REGLAGES_DE_L_APPLI = {
  briques: ["comptes", "mails"],
  dependabot: true,
  entete:
    'appli: Essai de coloc\nnom_affiche: "Essai # de coloc"\nsite: public\nentree: ouverte\nmethodes: [code-email]',
};

beforeAll(() => {
  catalogue = copierLeCatalogue();
  commitA = git(catalogue, "rev-parse", "--short", "HEAD");
  lierNodeModules(catalogue);
  appli = path.join(dossierTemporaire("appli-"), "essai-coloc");
  assembler({
    source: catalogue,
    sortie: appli,
    commit: commitA,
    briques: REGLAGES_DE_L_APPLI.briques,
    dependabot: REGLAGES_DE_L_APPLI.dependabot,
    blueprint: blueprint(REGLAGES_DE_L_APPLI.entete),
  });
}, REJEU);

// Une copie de l'appli d'essai, retouchée et commitée.
function appliRetouchee(retoucher: (dossier: string) => void, source = appli): string {
  const dossier = path.join(dossierTemporaire("appli-retouchee-"), "appli");
  git(path.dirname(dossier), "clone", "-q", source, dossier);
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
  // Le worktree emprunte le node_modules du catalogue par un lien : le retirer
  // ne doit jamais emporter ce qu'il vise.
  expect(fs.existsSync(path.join(SOURCE, "node_modules", "prettier", "package.json"))).toBe(true);
}

// Le manifeste tel que l'écrivait l'assembleur avant le format 2.
const enFormat1 = (dossier: string) =>
  reecrireLeManifeste(dossier, ({ note, catalogue: { version, commit }, fichiers }) => ({
    format: 1,
    note,
    catalogue: { version, commit },
    fichiers,
  }));

describe("mettre-a-jour, examen : l'origine d'une appli rejouée au commit de son manifeste", () => {
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
      rienNEstEcrit(dossier, head);
    }
  );

  // Le profil n'est pas rejoué, mais le défaut qu'il a donné aux limites par réseau
  // est noté au manifeste : sans lui, l'origine rejouée aurait 20 personnes par
  // réseau là où l'appli en a 100, et ne redonnerait pas les empreintes.
  it(
    "rejoue sans écart une appli assemblée par le profil outil-interne, dont le défaut de personnes par réseau n'est pas celui du fichier",
    { timeout: REJEU },
    () => {
      const parProfil = path.join(dossierTemporaire("appli-"), "outil-profile");
      assemblerAuCommitA({
        sortie: parProfil,
        briques: [],
        entete: "appli: Outil profilé\nprofil: outil-interne",
      });
      expect(fs.readFileSync(path.join(parProfil, "src/config/comptes.ts"), "utf-8")).toContain(
        "demandesParHeure: 100,\n  codesFauxParHeure: 150,"
      );
      expect(JSON.parse(fs.readFileSync(path.join(parProfil, MANIFESTE), "utf-8")).assemblage.entete).toMatchObject({
        personnes_par_reseau: "100",
      });
      const head = git(parProfil, "rev-parse", "HEAD");
      const resultat = examiner({ catalogue, appli: parProfil });
      expect(resultat).toMatchObject({
        briques: ["comptes", "mails"],
        retouches: [],
        supprimes: [],
        avertissements: [],
      });
      rienNEstEcrit(parProfil, head);
    }
  );

  it(
    "lit encore le format 1, en déduisant briques, nom du paquet, Dependabot et en-tête de la blueprint",
    { timeout: REJEU },
    () => {
      const dossier = appliRetouchee(enFormat1);
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

  // Le cas qu'une relecture a trouvé : rejouée dans un dossier « appli », une appli
  // assemblée sans nom ni blueprint prenait ce nom pour paquet. Avec la brique
  // deploiement, render.yaml et les mentions légales disent aussi si un nom ou une
  // blueprint ont été donnés.
  it(
    "reproduit une appli assemblée sans nom ni blueprint, au format 2 comme au format 1 (sa blueprint minimale ne se redonne pas)",
    { timeout: REJEU },
    () => {
      const sansNom = path.join(dossierTemporaire("appli-"), "vitrine-sans-nom");
      assembler({ source: catalogue, sortie: sansNom, commit: commitA, briques: ["deploiement"] });
      const attendu = { paquet: "vitrine-sans-nom", dependabot: false, retouches: [], supprimes: [] };
      expect(examiner({ catalogue, appli: sansNom })).toMatchObject({ format: 2, ...attendu });
      expect(examiner({ catalogue, appli: appliRetouchee(enFormat1, sansNom) })).toMatchObject({
        format: 1,
        briques: ["deploiement"],
        ...attendu,
      });
    }
  );

  // Le profil de l'en-tête (outils/modules.mjs, PROFILS) ne passe pas au
  // manifeste : ses briques y sont notées comme choisies, et l'outil les rejoue
  // sans rien savoir des profils.
  it(
    "reproduit sans écart une appli assemblée avec un profil, d'après les briques notées au manifeste",
    { timeout: REJEU },
    () => {
      const portail = path.join(dossierTemporaire("appli-"), "essai-portail");
      assembler({
        source: catalogue,
        sortie: portail,
        commit: commitA,
        briques: [],
        blueprint: blueprint("appli: Essai de portail\nprofil: portail"),
      });
      expect(examiner({ catalogue, appli: portail })).toMatchObject({
        format: 2,
        briques: ["comptes", "mails", "gestion-comptes"],
        deduits: false,
        paquet: "essai-de-portail",
        retouches: [],
        supprimes: [],
      });
    }
  );

  // Au format 1, l'outil redonne la blueprint de l'appli : un `profil:` ajouté à
  // son en-tête après coup y aurait fait garder en silence les briques du profil.
  it(
    "ignore, au format 1, un profil ajouté à l'en-tête de la blueprint de l'appli : les briques sont celles des unités",
    { timeout: REJEU },
    () => {
      const dossier = appliRetouchee((d) => {
        enFormat1(d);
        const fichier = path.join(d, "blueprint.md");
        fs.writeFileSync(fichier, fs.readFileSync(fichier, "utf-8").replace("---\n", "---\nprofil: portail\n"));
      });
      const resultat = examiner({ catalogue, appli: dossier });
      expect([...resultat.briques].sort()).toEqual(["comptes", "mails", "rgpd"]);
      expect(resultat).toMatchObject({ format: 1, retouches: [], supprimes: [] });
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

describe("mettre-a-jour, examen : refus en clair, avant tout rejeu", () => {
  it("refuse un dossier qui n'est pas un dépôt git", () => {
    expect(() => examiner({ catalogue, appli: dossierTemporaire("pas-un-depot-") })).toThrow(
      // Un dossier temporaire peut relever d'un dépôt parent (le dossier de profil d'un poste).
      /n'est pas (un dépôt git|la racine de son dépôt git)/
    );
  });

  it("refuse un sous-dossier de l'appli : seule sa racine se lit", () => {
    expect(() => examiner({ catalogue, appli: path.join(appli, "src") })).toThrow(
      /n'est pas la racine de son dépôt git/
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

  it("refuse, au format 1, une unité qui n'est pas une brique au commit du manifeste", { timeout: REJEU }, () => {
    const dossier = appliRetouchee((d) => {
      enFormat1(d);
      reecrireLeManifeste(d, (manifeste) => {
        manifeste.fichiers["src/lib/navigation.ts"].unite = "inconnue";
      });
    });
    expect(() => examiner({ catalogue, appli: dossier })).toThrow(/l'unité « inconnue »/);
    expect(git(catalogue, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
  });

  it("refuse un manifeste d'un format inconnu", () => {
    const dossier = appliRetouchee((d) =>
      reecrireLeManifeste(d, (manifeste) => {
        manifeste.format = 3;
      })
    );
    expect(() => examiner({ catalogue, appli: dossier })).toThrow(/format 3/);
  });

  it("refuse, par la ligne de commande, un ajout combiné à une mise à jour, un --ajouter sans brique et un retrait", () => {
    const lancer = (...args: string[]) =>
      spawnSync(process.execPath, [path.join(SOURCE, "outils/mettre-a-jour.mjs"), appli, ...args], {
        encoding: "utf-8",
      });
    for (const [args, motif] of [
      [["--ajouter", "journal", "--vers", "HEAD"], /une opération à la fois/],
      [["--ajouter"], /--ajouter attend une valeur/],
      [["--ajouter", ","], /--ajouter attend une valeur/],
      [["--retirer", "mails"], /[Rr]etirer une brique/],
    ] as const) {
      const resultat = lancer(...args);
      expect(resultat.status, args.join(" ")).toBe(1);
      expect(resultat.stderr, args.join(" ")).toMatch(/^Mise à jour refusée : /m);
      expect(resultat.stderr, args.join(" ")).toMatch(motif);
    }
  });
});

// ---------------------------------------------------------------- tranche 2 : écrire dans l'appli

/*
 * Le catalogue d'essai reçoit, après A, deux commits qui donnent chaque ligne
 * de la table « Ce qu'il fait de chaque fichier » (outils/mise-a-jour.md) : un
 * commit de briques seules, puis un commit du socle, le commit visé A'. Un
 * dernier commit change migrations.ts (tranche 3) : une étape neuve en fin, un
 * commentaire seul changé dans une étape publiée, l'en-tête du fichier.
 */
const BRANCHE = "feature/reporter-catalogue-essai";
// Un refus ne rejoue rien, mais lit tout le HEAD de l'appli : plus de 5 s sur un poste chargé.
const REFUS = 60_000;
const POLICE = "src/ui/theme/polices/IBMPlexMono-Medium-Latin1.woff2";
let commitVise: string;
let commitMigration: string;

function ecrire(dossier: string, chemin: string, changer: (texte: string) => string) {
  const fichier = path.join(dossier, chemin);
  fs.writeFileSync(fichier, changer(fs.readFileSync(fichier, "utf-8")));
}

const remplacer = (avant: string, apres: string) => (texte: string) => {
  if (!texte.includes(avant)) throw new Error(`« ${avant} » introuvable : le test est à reprendre.`);
  return texte.replace(avant, apres);
};

const FICHIER_MIGRATIONS = "src/lib/db/migrations.ts";
const ETAPE_DU_CATALOGUE = "essai_catalogue : table d'essai de la mise à jour";
const ETAPE_DE_L_APPLI = "coloc_taches : les tâches de la colocation (appli)";
const ETAPE_AU_COMMENTAIRE_REVU = "dossiers : champ notes (texte libre de la fiche)";

// Une étape en fin de MIGRATIONS, avant la fonction qui les rejoue.
const etapeEnFin = (commentaire: string, nom: string, sql: string) =>
  remplacer(
    "\n];\n\nexport async function appliquerMigrations",
    `\n  {\n    // ${commentaire}\n    nom: ${JSON.stringify(nom)},\n    async appliquer(pool) {\n      await pool.query(\`${sql}\`);\n    },\n  },\n];\n\nexport async function appliquerMigrations`
  );

const nomsDesEtapes = (texte: string) => lireLesEtapes(texte, FICHIER_MIGRATIONS).map(({ nom }) => nom);

// La première ligne seule : l'appli et le catalogue la réécrivent chacun, d'où le conflit.
const premiereLigne = (ligne: string) => (texte: string) => `${ligne}${texte.slice(texte.indexOf("\n"))}`;

// L'appli publiée : son HEAD est son origin/main, d'où part la branche.
function publier(dossier: string) {
  git(dossier, "update-ref", "refs/remotes/origin/main", "HEAD");
}

const contenuDuCommit = (depot: string, commit: string, chemin: string) =>
  execFileSync("git", ["-C", depot, "show", `${commit}:${chemin}`]);

function refusDe(action: () => unknown): Error {
  try {
    action();
  } catch (erreur) {
    expect(erreur).toBeInstanceOf(ErreurMiseAJour);
    return erreur as Error;
  }
  throw new Error("aucun refus");
}

/*
 * Un commit du catalogue hors de la suite principale, publié le temps de
 * `action` : origin/main y pointe, puis revient où il était. Pour un cas qui
 * arrête l'outil et que les cas suivants ne doivent pas voir.
 */
function avecUnCommitDuCatalogue(message: string, changer: () => void, action: (vers: string) => void) {
  const sommet = git(catalogue, "rev-parse", "HEAD");
  git(catalogue, "switch", "-q", "-c", "essai-hors-de-main");
  try {
    changer();
    git(catalogue, "commit", "-q", "-am", message);
    git(catalogue, "update-ref", "refs/remotes/origin/main", "HEAD");
    action(git(catalogue, "rev-parse", "--short", "HEAD"));
  } finally {
    git(catalogue, "switch", "-q", "--discard-changes", "main");
    git(catalogue, "branch", "-q", "-D", "essai-hors-de-main");
    git(catalogue, "update-ref", "refs/remotes/origin/main", sommet);
  }
}

// Ce qu'un refus laisse dans l'appli : ni branche, ni fichier écrit.
function rienNEstTouche(dossier: string, head: string) {
  expect(git(dossier, "status", "--porcelain")).toBe("");
  expect(git(dossier, "rev-parse", "HEAD")).toBe(head);
  expect(git(dossier, "branch", "--list", BRANCHE)).toBe("");
  expect(git(catalogue, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
}

describe("mettre-a-jour : reporter le catalogue du commit A au commit visé A', étapes de migration comprises", () => {
  beforeAll(() => {
    // Le lien vers node_modules n'est pas une modification du catalogue : le motif
    // « node_modules/ » de .gitignore ne vise pas un lien.
    fs.mkdirSync(path.join(catalogue, ".git", "info"), { recursive: true });
    fs.appendFileSync(path.join(catalogue, ".git", "info", "exclude"), "node_modules\n");

    ecrire(
      catalogue,
      "src/briques/comptes/CHANGELOG.md",
      (t) =>
        `${t}\n## 2026-11-04 · Essai d'une rupture · Rupture\n\n- **Ce qui change** : un appel de la brique.\n- **Appelant** : à reprendre.\n`
    );
    ecrire(
      catalogue,
      "src/briques/mails/CHANGELOG.md",
      (t) => `${t}\n## 2026-11-04 · Essai d'un ajout · Ajout\n\n- **Ce qui change** : rien pour l'appelant.\n`
    );
    ecrire(
      catalogue,
      "src/briques/comptes/confidentialite.ts",
      remplacer(
        "Permettre aux personnes autorisées de se connecter",
        "Permettre aux seules personnes autorisées de se connecter"
      )
    );
    ecrire(
      catalogue,
      "src/briques/mails/confidentialite.ts",
      remplacer(
        "\n];",
        '\n  {\n    cle: "mails-essai",\n    titre: "Essai",\n    finalite: "Essai.",\n    donnees: [],\n    personnes: "Personne.",\n    sousTraitants: [],\n    precisions: [],\n  },\n];'
      )
    );
    ecrire(catalogue, "src/briques/mails/README.md", (t) => `${t}\nUne phrase du catalogue.\n`);
    git(catalogue, "add", "-A");
    git(catalogue, "commit", "-q", "-m", "Mails : essai d'une évolution des briques");

    ecrire(catalogue, "src/lib/date-iso.ts", (t) => `${t}// Évolution du catalogue.\n`);
    ecrire(catalogue, "src/lib/navigation.ts", (t) => `// Évolution du catalogue, en tête.\n${t}`);
    ecrire(catalogue, "src/lib/image-partage.ts", premiereLigne("/* Le catalogue réécrit cette ligne."));
    ecrire(catalogue, "src/config/donnees-personnelles.ts", (t) => `${t}// Évolution du registre.\n`);
    // Le fichier que l'appli règle au cadrage (qui entre, et combien de personnes par réseau).
    ecrire(
      catalogue,
      "src/config/comptes.ts",
      (t) => `// Évolution du catalogue, en tête de la configuration des comptes.\n${t}`
    );
    ecrire(catalogue, ".env.example", (t) => `${t}\n# Essai d'une variable nouvelle.\nESSAI_NOUVELLE_VARIABLE=\n`);
    ecrire(catalogue, "LICENSE", remplacer("SOFTWARE.", "SOFTWARE. (Évolution de la licence.)"));
    fs.writeFileSync(path.join(catalogue, "src/lib/nouveau-du-catalogue.ts"), "export const NOUVEAU = true;\n");
    fs.rmSync(path.join(catalogue, "docs/cicatrices.md"));
    fs.rmSync(path.join(catalogue, "src/ui/theme/polices/LISEZMOI.md"));
    fs.appendFileSync(path.join(catalogue, POLICE), Buffer.from([0, 1, 2]));
    // Une dépendance de plus, déjà dans l'arbre du verrou : npm ci n'a rien à télécharger de neuf.
    const paquet = JSON.parse(fs.readFileSync(path.join(catalogue, "package.json"), "utf-8"));
    const verrou = JSON.parse(fs.readFileSync(path.join(catalogue, "package-lock.json"), "utf-8"));
    const version = `^${verrou.packages["node_modules/picocolors"].version}`;
    const avecPicocolors = (dependances: Record<string, string>) =>
      Object.fromEntries(
        Object.entries({ ...dependances, picocolors: version }).sort(([a], [b]) => a.localeCompare(b))
      );
    paquet.devDependencies = avecPicocolors(paquet.devDependencies);
    verrou.packages[""].devDependencies = avecPicocolors(verrou.packages[""].devDependencies);
    fs.writeFileSync(path.join(catalogue, "package.json"), `${JSON.stringify(paquet, null, 2)}\n`);
    fs.writeFileSync(path.join(catalogue, "package-lock.json"), `${JSON.stringify(verrou, null, 2)}\n`);
    git(catalogue, "add", "-A");
    git(catalogue, "commit", "-q", "-m", "Socle : essai d'une évolution du socle");
    commitVise = git(catalogue, "rev-parse", "--short", "HEAD");

    ecrire(
      catalogue,
      FICHIER_MIGRATIONS,
      etapeEnFin(
        "Essai de la mise à jour : une étape neuve du catalogue, en fin de liste.",
        ETAPE_DU_CATALOGUE,
        "CREATE TABLE IF NOT EXISTS essai_catalogue (id SERIAL PRIMARY KEY);"
      )
    );
    ecrire(
      catalogue,
      FICHIER_MIGRATIONS,
      remplacer("// Modèle d'étape : le champ notes", "// Modèle d'étape, commentaire revu : le champ notes")
    );
    ecrire(
      catalogue,
      FICHIER_MIGRATIONS,
      remplacer("faire évoluer une base déployée.", "faire évoluer une base déployée (évolution du catalogue).")
    );
    git(catalogue, "add", "-A");
    git(catalogue, "commit", "-q", "-m", "Base : essai d'une évolution des migrations");
    commitMigration = git(catalogue, "rev-parse", "--short", "HEAD");
    git(catalogue, "update-ref", "refs/remotes/origin/main", "HEAD");
  }, REJEU);

  // Une appli qui touche à chaque ligne de la table, plus un fichier à elle.
  function appliDeLaTable(): string {
    const dossier = appliRetouchee((d) => {
      ecrire(d, "src/lib/format.ts", (t) => `${t}// Retouche de l'appli, le catalogue n'y touche pas.\n`);
      ecrire(d, "src/lib/navigation.ts", (t) => `${t}// Retouche de l'appli, en fin.\n`);
      ecrire(d, "src/lib/image-partage.ts", premiereLigne("/* L'appli réécrit cette ligne."));
      // Le réglage de l'appli : cent personnes par réseau, et non les vingt du catalogue.
      ecrire(
        d,
        "src/config/comptes.ts",
        remplacer(
          "demandesParHeure: 20,\n  codesFauxParHeure: 30,",
          "demandesParHeure: 100,\n  codesFauxParHeure: 150,"
        )
      );
      fs.rmSync(path.join(d, "src/briques/mails/README.md"));
      ecrire(d, "src/ui/theme/polices/LISEZMOI.md", (t) => `${t}\nRetouche de l'appli.\n`);
      fs.appendFileSync(path.join(d, POLICE), Buffer.from([9, 9, 9]));
      ecrire(d, "NOTICE", (t) => `${t}\nAvis de l'appli.\n`);
      ecrire(d, "package.json", remplacer('"scripts": {\n', '"scripts": {\n    "coloc": "echo coloc",\n'));
      fs.mkdirSync(path.join(d, "src/app/coloc"), { recursive: true });
      fs.writeFileSync(path.join(d, "src/app/coloc/page.tsx"), "export default function Page() {}\n");
    });
    publier(dossier);
    return dossier;
  }

  it(
    "traite chaque fichier selon la table, lit les commits en LF et non le disque, réécrit manifeste et en-tête de la blueprint, sans commit",
    { timeout: 900_000 },
    () => {
      const dossier = appliDeLaTable();
      const head = git(dossier, "rev-parse", "HEAD");
      const avant = (chemin: string) => contenuDuCommit(dossier, head, chemin);
      expect(Object.keys(JSON.parse(avant(MANIFESTE).toString()).fichiers)).toContain("docs/cicatrices.md");
      // Le cas Windows : un poste dont git écrit des CRLF sur le disque (ici un
      // attribut local), l'arbre restant propre. Lu sur le disque, chaque ligne
      // serait en conflit.
      fs.mkdirSync(path.join(dossier, ".git", "info"), { recursive: true });
      fs.appendFileSync(path.join(dossier, ".git", "info", "attributes"), "src/lib/navigation.ts eol=crlf\n");
      const navigation = path.join(dossier, "src/lib/navigation.ts");
      fs.rmSync(navigation);
      git(dossier, "checkout", "--", "src/lib/navigation.ts");
      expect(fs.readFileSync(navigation, "utf-8")).toContain("\r\n");
      expect(git(dossier, "status", "--porcelain")).toBe("");

      const resultat = mettreAJour({ catalogue, appli: dossier, vers: commitVise, branche: BRANCHE });
      const lu = (chemin: string) => fs.readFileSync(path.join(dossier, chemin));
      const cible = (chemin: string) => contenuDuCommit(catalogue, commitVise, chemin);

      // La branche neuve, depuis le HEAD publié, sans commit ; le catalogue sans trace.
      expect(git(dossier, "branch", "--show-current")).toBe(BRANCHE);
      expect(git(dossier, "rev-parse", "HEAD")).toBe(head);
      expect(git(dossier, "rev-parse", "refs/remotes/origin/main")).toBe(head);
      expect(git(catalogue, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);

      // identique au catalogue : rien, quelle que soit la version de l'appli.
      expect(lu("src/lib/format.ts")).toEqual(avant("src/lib/format.ts"));
      // changé, intact : remplacé par la cible.
      expect(lu("src/lib/date-iso.ts")).toEqual(cible("src/lib/date-iso.ts"));
      // changé, retouché : fusion à trois sans conflit, en LF.
      const fusionne = lu("src/lib/navigation.ts").toString();
      expect(fusionne).toMatch(/^\/\/ Évolution du catalogue, en tête\.\n/);
      expect(fusionne).toMatch(/\n\/\/ Retouche de l'appli, en fin\.\n$/);
      expect(fusionne).not.toMatch(/\r|<<<<<<<|>>>>>>>/);
      // changé, retouché des deux côtés aux mêmes lignes : écrit avec les marqueurs.
      const conflit = lu("src/lib/image-partage.ts").toString();
      expect(conflit).toMatch(/^<{7} appli\n\/\* L'appli réécrit cette ligne\.\n/);
      expect(conflit).toMatch(/\n={7}\n\/\* Le catalogue réécrit cette ligne\.\n>{7} cible/);
      // La configuration des comptes est un fichier de l'appli : le réglage des limites par
      // réseau qu'elle a retouché survit au report, le changement du catalogue arrive à côté.
      const configComptes = lu("src/config/comptes.ts").toString();
      expect(configComptes).toMatch(/^\/\/ Évolution du catalogue, en tête de la configuration des comptes\.\n/);
      expect(configComptes).toContain("demandesParHeure: 100,\n  codesFauxParHeure: 150,");
      expect(configComptes).not.toMatch(/\r|<<<<<<<|>>>>>>>/);
      // changé, supprimé par l'appli : laissé absent.
      expect(fs.existsSync(path.join(dossier, "src/briques/mails/README.md"))).toBe(false);
      // absent, puis présent, absent de l'appli : ajouté.
      expect(lu("src/lib/nouveau-du-catalogue.ts")).toEqual(cible("src/lib/nouveau-du-catalogue.ts"));
      // présent, puis absent, intact : supprimé.
      expect(fs.existsSync(path.join(dossier, "docs/cicatrices.md"))).toBe(false);
      // présent, puis absent, retouché : gardé.
      expect(lu("src/ui/theme/polices/LISEZMOI.md")).toEqual(avant("src/ui/theme/polices/LISEZMOI.md"));
      // binaire changé, retouché : gardé.
      expect(lu(POLICE)).toEqual(avant(POLICE));
      // NOTICE suit la table : retouché par l'appli, changé avec la licence, fusionné.
      expect(lu("NOTICE").toString()).toMatch(/SOFTWARE\. \(Évolution de la licence\.\)[\s\S]*Avis de l'appli\.\n$/);
      // package.json fusionné, verrou intact remplacé.
      const paquet = JSON.parse(lu("package.json").toString());
      expect(paquet.scripts.coloc).toBe("echo coloc");
      expect(paquet.devDependencies.picocolors).toMatch(/^\^/);
      const verrou = JSON.parse(lu("package-lock.json").toString());
      expect(verrou.name).toBe("essai-de-coloc");
      expect(verrou.packages[""].devDependencies.picocolors).toBe(paquet.devDependencies.picocolors);
      // Le fichier de l'appli n'est ni lu ni touché.
      expect(lu("src/app/coloc/page.tsx").toString()).toBe("export default function Page() {}\n");

      // L'en-tête de la blueprint : commit_reference seul change, le corps reste.
      const blueprintAvant = avant("blueprint.md").toString();
      expect(lu("blueprint.md").toString()).toBe(
        blueprintAvant.replace(/^commit_reference: .*$/m, `commit_reference: ${commitVise}`)
      );

      expect(resultat).toMatchObject({
        commitOrigine: commitA,
        commitCible: commitVise,
        branche: BRANCHE,
        aBlanc: false,
        fichiers: {
          remplaces: expect.arrayContaining([
            "package-lock.json",
            "src/config/donnees-personnelles.ts",
            "src/lib/date-iso.ts",
          ]),
          ajoutes: ["src/lib/nouveau-du-catalogue.ts"],
          supprimes: expect.arrayContaining(["docs/cicatrices.md"]),
          fusionnes: ["NOTICE", "package.json", "src/config/comptes.ts", "src/lib/navigation.ts"],
          enConflit: ["src/lib/image-partage.ts"],
          supprimesParLAppli: ["src/briques/mails/README.md"],
          retouchesRetires: ["src/ui/theme/polices/LISEZMOI.md"],
          binairesRetouches: [POLICE],
        },
        verrou: "remplacé",
      });
      for (const liste of Object.values(resultat.fichiers) as string[][]) {
        expect(liste).not.toContain("src/lib/format.ts");
        expect(liste).not.toContain("src/app/coloc/page.tsx");
      }

      // Le rapport, écrit hors de l'arbre suivi : git status ne le montre pas.
      expect(fs.readFileSync(resultat.fichierDuRapport, "utf-8")).toBe(rapport(resultat));
      expect(git(dossier, "status", "--porcelain", "--untracked-files=all")).not.toMatch(/mise-a-jour/);

      // Le manifeste réécrit est celui de la cible : committée, l'appli se rejoue au
      // commit A', et ses retouches se retrouvent.
      git(dossier, "add", "-A");
      git(dossier, "commit", "-q", "-m", "Reporter le catalogue");
      const apres = examiner({ catalogue, appli: dossier });
      expect(apres).toMatchObject({ commit: commitVise, format: 2 });
      expect(apres.retouches).toEqual(
        expect.arrayContaining([
          "NOTICE",
          "package.json",
          POLICE,
          "src/config/comptes.ts",
          "src/lib/format.ts",
          "src/lib/image-partage.ts",
          "src/lib/navigation.ts",
        ])
      );
      expect(apres.retouches).not.toContain("src/lib/date-iso.ts");
      expect(apres.supprimes).toEqual(["src/briques/mails/README.md"]);

      // Le verrou remplacé tient avec package.json fusionné : npm ci passe dans l'appli.
      // Sans les scripts d'installation, que ce test ne vérifie pas.
      execSync("npm ci --ignore-scripts --no-audit --no-fund", { cwd: dossier, stdio: ["ignore", "pipe", "pipe"] });
    }
  );

  it(
    "porte au rapport chaque rubrique : fichiers, ruptures en tête, journaux des briques, socle, variables, confidentialité, registre, fusion",
    { timeout: REJEU },
    () => {
      const dossier = appliDeLaTable();
      const texte = rapport(mettreAJour({ catalogue, appli: dossier, vers: commitVise, aBlanc: true }));
      const rubrique = (titre: string) => {
        const debut = texte.indexOf(`\n## ${titre}\n`);
        expect(debut, `rubrique « ${titre} »`).toBeGreaterThan(-1);
        const fin = texte.indexOf("\n## ", debut + 1);
        return texte.slice(debut, fin === -1 ? undefined : fin);
      };
      expect(texte).toMatch(new RegExp(`^# Reporter le catalogue de ${commitA} à ${commitVise}$`, "m"));
      expect(rubrique("Fichiers")).toMatch(/En conflit[^\n]*\n- `src\/lib\/image-partage\.ts`/);
      expect(rubrique("Fichiers")).toMatch(/Fusionnés, à relire[^\n]*\n- `NOTICE`/);
      expect(rubrique("Fichiers")).toContain("`src/briques/mails/README.md`");
      expect(rubrique("Dépendances npm")).toMatch(/package-lock\.json.*remplacé/);
      // Les ruptures d'abord, quel que soit l'ordre des briques.
      const journal = rubrique("Journal des briques");
      expect(journal.indexOf("Essai d'une rupture · Rupture")).toBeGreaterThan(-1);
      expect(journal.indexOf("Essai d'une rupture")).toBeLessThan(journal.indexOf("Essai d'un ajout"));
      expect(journal).toContain("**Appelant** : à reprendre.");
      const socle = rubrique("Socle");
      expect(socle).toContain("Socle : essai d'une évolution du socle");
      expect(socle).not.toContain("Mails : essai");
      expect(rubrique("Variables d'environnement")).toContain("`ESSAI_NOUVELLE_VARIABLE`");
      const confidentialite = rubrique("Confidentialité");
      expect(confidentialite).toMatch(/ajouté[^\n]*`mails-essai`/);
      expect(confidentialite).toMatch(/changé[^\n]*`src\/briques\/comptes\/confidentialite\.ts`/);
      expect(confidentialite).toContain("miseAJour");
      expect(rubrique("Registre RGPD")).toContain("`src/config/donnees-personnelles.ts`");
      const fusion = rubrique("Ce que la fusion déclenche");
      expect(fusion).toMatch(/[Dd]éploiement/);
      expect(fusion).toMatch(/^- Migrations : /m);
      expect(texte).toMatch(/À blanc : rien n'est écrit dans l'appli\./);
      // À blanc : ni branche, ni fichier.
      rienNEstTouche(dossier, git(dossier, "rev-parse", "HEAD"));
    }
  );

  it(
    "laisse un verrou retouché par l'appli et demande npm install au rapport, après quoi npm ci passe",
    { timeout: 900_000 },
    () => {
      const dossier = appliRetouchee((d) =>
        ecrire(d, "package-lock.json", remplacer('"license": "ISC"', '"license": "ISC "'))
      );
      publier(dossier);
      const verrou = fs.readFileSync(path.join(dossier, "package-lock.json"));
      const resultat = mettreAJour({ catalogue, appli: dossier, vers: commitVise, branche: BRANCHE });
      expect(resultat.verrou).toBe("à régénérer");
      expect(fs.readFileSync(path.join(dossier, "package-lock.json"))).toEqual(verrou);
      expect(rapport(resultat)).toMatch(/npm install/);
      // Le geste que le rapport demande : le verrou régénéré tient avec package.json fusionné.
      const npm = (commande: string) =>
        execSync(`npm ${commande} --ignore-scripts --no-audit --no-fund`, {
          cwd: dossier,
          stdio: ["ignore", "pipe", "pipe"],
        });
      npm("install");
      const regenere = JSON.parse(fs.readFileSync(path.join(dossier, "package-lock.json"), "utf-8"));
      expect(regenere.packages[""].devDependencies.picocolors).toMatch(/^\^/);
      npm("ci");
    }
  );

  it(
    "donne à blanc, pour une appli déjà au commit visé, le rapport de ce qu'elle a retouché ou supprimé",
    { timeout: REJEU },
    () => {
      const dossier = appliDeLaTable();
      const texte = rapport(mettreAJour({ catalogue, appli: dossier, vers: commitA, aBlanc: true }));
      expect(texte).toContain("Aucun fichier venu du catalogue ne change.");
      expect(texte).toMatch(
        /Retouchés par l'appli, que le catalogue ne change pas[^\n]*\n(- `[^`]+`\n)*- `src\/lib\/navigation\.ts`/
      );
      expect(texte).toMatch(
        /Supprimés par l'appli, que le catalogue ne change pas[^\n]*\n- `src\/briques\/mails\/README\.md`/
      );
      expect(texte).not.toContain("src/app/coloc");
      rienNEstTouche(dossier, git(dossier, "rev-parse", "HEAD"));
    }
  );

  it(
    "refuse un fichier neuf de la cible au chemin d'un fichier de l'appli, à la casse près, avant toute écriture",
    { timeout: 2 * REJEU },
    () => {
      const dossier = appliRetouchee((d) =>
        fs.writeFileSync(path.join(d, "src/lib/nouveau-du-catalogue.ts"), "export const A_MOI = true;\n")
      );
      publier(dossier);
      const head = git(dossier, "rev-parse", "HEAD");
      expect(
        refusDe(() => mettreAJour({ catalogue, appli: dossier, vers: commitVise, branche: BRANCHE })).message
      ).toMatch(/src\/lib\/nouveau-du-catalogue\.ts.*renommer/s);
      rienNEstTouche(dossier, head);
      // Un disque Windows ou macOS ne distingue pas la casse : l'un écraserait l'autre.
      const casse = appliRetouchee((d) =>
        fs.writeFileSync(path.join(d, "src/lib/Nouveau-du-catalogue.ts"), "export const A_MOI = true;\n")
      );
      publier(casse);
      expect(
        refusDe(() => mettreAJour({ catalogue, appli: casse, vers: commitVise, branche: BRANCHE })).message
      ).toMatch(/src\/lib\/nouveau-du-catalogue\.ts \(heurte src\/lib\/Nouveau-du-catalogue\.ts\)/);
      rienNEstTouche(casse, git(casse, "rev-parse", "HEAD"));
    }
  );

  // Une appli qui a sa propre étape, en fin de sa liste, et retouche la fin du fichier.
  function appliAvecSonEtape(retoucher: (dossier: string) => void = () => {}): string {
    const dossier = appliRetouchee((d) => {
      ecrire(
        d,
        FICHIER_MIGRATIONS,
        etapeEnFin(
          "Étape de l'appli : sa table à elle.",
          ETAPE_DE_L_APPLI,
          "CREATE TABLE IF NOT EXISTS coloc_taches (id SERIAL PRIMARY KEY, titre TEXT NOT NULL);"
        )
      );
      ecrire(d, FICHIER_MIGRATIONS, (t) => `${t}// Retouche de l'appli, en fin.\n`);
      retoucher(d);
    });
    publier(dossier);
    return dossier;
  }

  it(
    "ajoute l'étape neuve du catalogue après celles de l'appli, texte tel quel, fusionne le reste du fichier, et les étapes se rejouent sur une base qui a joué celles d'avant",
    { timeout: REJEU },
    async () => {
      const dossier = appliAvecSonEtape();
      const head = git(dossier, "rev-parse", "HEAD");
      // L'appli telle qu'elle tourne en production avant la fusion de la PR.
      const avantLaFusion = path.join(dossierTemporaire("appli-avant-"), "appli");
      git(path.dirname(avantLaFusion), "clone", "-q", dossier, avantLaFusion);

      const resultat = mettreAJour({ catalogue, appli: dossier, vers: commitMigration, branche: BRANCHE });
      const avant = contenuDuCommit(dossier, head, FICHIER_MIGRATIONS).toString();
      const apres = fs.readFileSync(path.join(dossier, FICHIER_MIGRATIONS), "utf-8");
      const cible = contenuDuCommit(catalogue, commitMigration, FICHIER_MIGRATIONS).toString();

      // En fin, après l'étape de l'appli ; les autres à leur place.
      expect(nomsDesEtapes(avant).at(-1)).toBe(ETAPE_DE_L_APPLI);
      expect(nomsDesEtapes(apres)).toEqual([...nomsDesEtapes(avant), ETAPE_DU_CATALOGUE]);
      const etapeDeLaCible = lireLesEtapes(cible, FICHIER_MIGRATIONS).find(({ nom }) => nom === ETAPE_DU_CATALOGUE);
      expect(apres).toContain(`${etapeDeLaCible?.texte},\n];`);
      // Un commentaire seul changé au catalogue : l'appli garde le sien, c'est signalé.
      expect(apres).toContain("// Modèle d'étape : le champ notes");
      expect(apres).not.toContain("commentaire revu");
      // Le reste du fichier, fusionné à trois : l'en-tête du catalogue, la fin de l'appli.
      expect(apres).toContain("faire évoluer une base déployée (évolution du catalogue).");
      expect(apres).toMatch(/\n\/\/ Retouche de l'appli, en fin\.\n$/);

      expect(resultat.migrations).toEqual({
        auMilieu: [],
        retouchees: [],
        reste: true,
        avecLaBase: false,
        ajoutees: [ETAPE_DU_CATALOGUE],
        commentaires: [ETAPE_AU_COMMENTAIRE_REVU],
      });
      expect(resultat.fichiers.migrations).toEqual([FICHIER_MIGRATIONS]);
      const texte = rapport(resultat);
      expect(texte).toMatch(/\n## Migrations\n[\s\S]*essai_catalogue : table d'essai[\s\S]*\n## /);
      expect(texte).toContain(ETAPE_AU_COMMENTAIRE_REVU);
      expect(texte).toMatch(/[Ll]a fusion les rejoue en production/);

      // Le rejeu : les étapes d'avant la fusion sur une base neuve, puis celles d'après.
      git(dossier, "add", "-A");
      git(dossier, "commit", "-q", "-m", "Reporter le catalogue");
      const base = await migrationsAvantPuisApres(avantLaFusion, dossier);
      expect(base.code, base.sortie).toBe(0);
      expect(base.objets).toEqual(
        expect.arrayContaining(["coloc_taches", "dossiers", "essai_catalogue", "utilisateurs"])
      );
    }
  );

  it(
    "s'arrête avant toute écriture si une étape reçue du catalogue manque à l'appli, en disant quoi faire",
    { timeout: REJEU },
    () => {
      const dossier = appliAvecSonEtape((d) =>
        ecrire(d, FICHIER_MIGRATIONS, (t) => {
          const sans = t.replace(/ {2}\{\n {4}\/\/ Modèle d'étape[\s\S]*?\n {2}\},\n/, "");
          if (sans === t) throw new Error("L'étape du patron dossiers est introuvable : le test est à reprendre.");
          return sans;
        })
      );
      const head = git(dossier, "rev-parse", "HEAD");
      const message = refusDe(() =>
        mettreAJour({ catalogue, appli: dossier, vers: commitMigration, branche: BRANCHE })
      ).message;
      expect(message).toMatch(/« dossiers : champ notes \(texte libre de la fiche\) ».*manque à l'appli/);
      expect(message).toMatch(/[Rr]emettre/);
      rienNEstTouche(dossier, head);
    }
  );

  it(
    "s'arrête avant toute écriture si schema.sql change entre l'origine et la cible : un CREATE TABLE fusionné ne se retouche plus",
    { timeout: REJEU },
    () => {
      const dossier = appliRetouchee(() => {});
      publier(dossier);
      const head = git(dossier, "rev-parse", "HEAD");
      avecUnCommitDuCatalogue(
        "Base : essai d'un schema.sql retouché",
        () =>
          ecrire(
            catalogue,
            "src/lib/db/schema.sql",
            remplacer("echeance DATE,", "echeance DATE,\n  priorite INTEGER,")
          ),
        (vers) => {
          const message = refusDe(() => mettreAJour({ catalogue, appli: dossier, vers, branche: BRANCHE })).message;
          expect(message).toMatch(/src\/lib\/db\/schema\.sql/);
          expect(message).toMatch(/--vers/);
        }
      );
      rienNEstTouche(dossier, head);
    }
  );

  it("vise par défaut le HEAD du catalogue, par la ligne de commande", { timeout: REJEU }, () => {
    const dossier = appliRetouchee(() => {});
    publier(dossier);
    // L'outil de la copie : il prend pour catalogue le dépôt où il se trouve.
    const resultat = spawnSync(
      process.execPath,
      [path.join(catalogue, "outils/mettre-a-jour.mjs"), dossier, "--a-blanc"],
      { encoding: "utf-8" }
    );
    expect(resultat.status, resultat.stderr).toBe(0);
    expect(resultat.stdout).toMatch(new RegExp(`^# Reporter le catalogue de ${commitA} à ${commitMigration}$`, "m"));
  });

  it(
    "refuse une brique de l'appli inconnue au commit visé (renommée ou retirée du catalogue)",
    { timeout: REJEU },
    () => {
      const dossier = appliRetouchee(() => {});
      publier(dossier);
      const sommet = git(catalogue, "rev-parse", "HEAD");
      git(catalogue, "switch", "-q", "-c", "essai-brique-retiree");
      try {
        ecrire(catalogue, "outils/modules.mjs", remplacer("\n  mails: {", "\n  courriels: {"));
        git(catalogue, "commit", "-q", "-am", "Outils : essai d'une brique renommée");
        git(catalogue, "update-ref", "refs/remotes/origin/main", "HEAD");
        const vers = git(catalogue, "rev-parse", "--short", "HEAD");
        expect(refusDe(() => mettreAJour({ catalogue, appli: dossier, vers, branche: BRANCHE })).message).toMatch(
          /brique « mails ».*inconnue/
        );
      } finally {
        git(catalogue, "switch", "-q", "main");
        git(catalogue, "branch", "-q", "-D", "essai-brique-retiree");
        git(catalogue, "update-ref", "refs/remotes/origin/main", sommet);
      }
    }
  );

  describe("refus en clair, avant tout rejeu", () => {
    it("refuse un catalogue aux modifications non commitées, quand il vise son HEAD", { timeout: REFUS }, () => {
      const dossier = appliRetouchee(() => {});
      publier(dossier);
      const brouillon = path.join(catalogue, "brouillon.txt");
      fs.writeFileSync(brouillon, "en cours\n");
      try {
        expect(refusDe(() => mettreAJour({ catalogue, appli: dossier, branche: BRANCHE })).message).toMatch(
          /catalogue a des modifications non commitées/
        );
      } finally {
        fs.rmSync(brouillon);
      }
    });

    it("refuse un catalogue dont le HEAD n'est pas origin/main, quand il vise son HEAD", { timeout: REFUS }, () => {
      const dossier = appliRetouchee(() => {});
      publier(dossier);
      const sommet = git(catalogue, "rev-parse", "HEAD");
      git(catalogue, "update-ref", "refs/remotes/origin/main", `${sommet}~1`);
      try {
        expect(refusDe(() => mettreAJour({ catalogue, appli: dossier, branche: BRANCHE })).message).toMatch(
          /HEAD du catalogue n'est pas origin\/main/
        );
      } finally {
        git(catalogue, "update-ref", "refs/remotes/origin/main", sommet);
      }
    });

    it("refuse un commit visé qui n'est pas publié sur origin/main", { timeout: REFUS }, () => {
      const dossier = appliRetouchee(() => {});
      publier(dossier);
      const hors = git(catalogue, "commit-tree", "HEAD^{tree}", "-p", "HEAD", "-m", "hors de main");
      expect(refusDe(() => mettreAJour({ catalogue, appli: dossier, vers: hors, branche: BRANCHE })).message).toMatch(
        /n'est pas sur origin\/main/
      );
    });

    it("ne reporte rien quand l'appli est déjà au commit visé", { timeout: REFUS }, () => {
      const dossier = appliRetouchee(() => {});
      publier(dossier);
      expect(
        refusDe(() => mettreAJour({ catalogue, appli: dossier, vers: commitA, branche: BRANCHE })).message
      ).toMatch(/déjà au commit/);
    });

    it("refuse une appli dont le HEAD n'est pas son origin/main : la branche part de là", { timeout: REFUS }, () => {
      const dossier = appliRetouchee(() => {});
      const head = git(dossier, "rev-parse", "HEAD");
      expect(
        refusDe(() => mettreAJour({ catalogue, appli: dossier, vers: commitVise, branche: BRANCHE })).message
      ).toMatch(/HEAD de l'appli n'est pas son origin\/main/);
      rienNEstTouche(dossier, head);
    });

    it("refuse une branche qui existe déjà, ou un nom que git refuse", { timeout: REFUS }, () => {
      const dossier = appliRetouchee(() => {});
      publier(dossier);
      git(dossier, "branch", BRANCHE);
      expect(
        refusDe(() => mettreAJour({ catalogue, appli: dossier, vers: commitVise, branche: BRANCHE })).message
      ).toMatch(/existe déjà/);
      expect(
        refusDe(() => mettreAJour({ catalogue, appli: dossier, vers: commitVise, branche: "pas un nom" })).message
      ).toMatch(/nom de branche/);
    });
  });
});

// ---------------------------------------------------------------- tranche 4 : ajouter une brique

/*
 * Ajouter une brique (« Le principe » de la note : A' = A, B' = B plus les
 * briques ajoutées) : la cible est l'assemblage rejoué au commit de l'appli,
 * quel que soit le HEAD du catalogue, que la suite ci-dessus a fait avancer.
 * Les deux cas d'essai du ticket : une appli comptes,mails retouchée reçoit
 * journal puis notifications ; une vitrine sans base reçoit mails,contact (la
 * base arrive), puis comptes (ajouts lourds).
 */

// Un assemblage direct au commit A, dans un worktree du catalogue à ce commit :
// le catalogue de travail est plus loin.
function assemblerAuCommitA(options: { sortie: string; briques: string[]; dependabot?: boolean; entete?: string }) {
  const arbre = path.join(dossierTemporaire("catalogue-a-"), "catalogue");
  git(catalogue, "worktree", "add", "--detach", "--quiet", arbre, commitA);
  try {
    lierNodeModules(arbre);
    assembler({
      source: arbre,
      sortie: options.sortie,
      commit: commitA,
      briques: options.briques,
      dependabot: options.dependabot ?? false,
      blueprint: options.entete === undefined ? undefined : blueprint(options.entete),
    });
  } finally {
    delierNodeModules(arbre);
    git(catalogue, "worktree", "remove", "--force", arbre);
  }
}

// Le contenu de chaque fichier d'un commit, par son objet git : deux fichiers
// égaux ont le même, quelles que soient les fins de ligne du disque.
function objetsDuCommit(depot: string): Map<string, string> {
  return new Map(
    git(depot, "ls-tree", "-r", "HEAD")
      .split("\n")
      .filter(Boolean)
      .map((ligne) => {
        const tabulation = ligne.indexOf("\t");
        return [ligne.slice(tabulation + 1), ligne.slice(0, tabulation).split(" ")[2]];
      })
  );
}

// L'état de l'appli à un moment, tel qu'il part en production (pour rejouer ses migrations).
function instantane(dossier: string): string {
  const copie = path.join(dossierTemporaire("appli-instantane-"), "appli");
  git(path.dirname(copie), "clone", "-q", dossier, copie);
  return copie;
}

function commiterEtPublier(dossier: string, message: string) {
  git(dossier, "add", "-A");
  git(dossier, "commit", "-q", "-m", message);
  publier(dossier);
}

const rubriqueDe = (texte: string, titre: string) => {
  const debut = texte.indexOf(`\n## ${titre}\n`);
  if (debut === -1) return undefined;
  const fin = texte.indexOf("\n## ", debut + 1);
  return texte.slice(debut, fin === -1 ? undefined : fin);
};

const sansCouleurs = (texte: string) => texte.replace(/\u001b\[[0-9;]*m/g, "");

// Ce qu'une appli de colocation retouche de ce qu'elle a reçu : ses droits, son
// menu, son registre, sa politique, sa propre étape de migration, et sa page.
function retouchesDeLaColoc(d: string) {
  ecrire(
    d,
    "src/config/acces.ts",
    remplacer("  ...ACTIONS_DOSSIERS,\n", '  ...ACTIONS_DOSSIERS,\n  "taches.gerer",\n')
  );
  ecrire(
    d,
    "src/config/acces.ts",
    remplacer(
      '  "dossiers.acceder": ["membre", "admin"],\n',
      '  "dossiers.acceder": ["membre", "admin"],\n  "taches.gerer": ["membre", "admin"],\n'
    )
  );
  ecrire(
    d,
    "src/lib/navigation.ts",
    remplacer(
      '  { libelle: "Dossiers", href: "/dossiers", visible: visiblePour("dossiers.acceder") },\n',
      '  { libelle: "Dossiers", href: "/dossiers", visible: visiblePour("dossiers.acceder") },\n  { libelle: "Tâches", href: "/taches", visible: visiblePour("taches.gerer") },\n'
    )
  );
  ecrire(
    d,
    "src/config/donnees-personnelles.ts",
    remplacer(
      "export const TABLES_SANS_DONNEE_PERSONNELLE: Record<string, string> = {\n",
      'export const TABLES_SANS_DONNEE_PERSONNELLE: Record<string, string> = {\n  coloc_taches: "Les tâches de la colocation, sans personne désignée (appli).",\n'
    )
  );
  ecrire(
    d,
    "src/lib/confidentialite.ts",
    remplacer(
      '    hebergement: { baseLegale: "", duree: "", destinataires: "" },',
      '    hebergement: { baseLegale: "Intérêt légitime", duree: "", destinataires: "Personne d\'autre." },'
    )
  );
  ecrire(
    d,
    FICHIER_MIGRATIONS,
    etapeEnFin(
      "Étape de l'appli : sa table à elle.",
      ETAPE_DE_L_APPLI,
      "CREATE TABLE IF NOT EXISTS coloc_taches (id SERIAL PRIMARY KEY, titre TEXT NOT NULL);"
    )
  );
  fs.mkdirSync(path.join(d, "src/app/taches"), { recursive: true });
  fs.writeFileSync(
    path.join(d, "src/app/taches/page.tsx"),
    'import { exiger } from "@/briques/comptes/roles";\n\nexport const dynamic = "force-dynamic";\n\n' +
      'export default async function PageTaches() {\n  await exiger("taches.gerer");\n  return <p>Les tâches de la colocation.</p>;\n}\n'
  );
}

describe("mettre-a-jour --ajouter : ajouter une brique au commit de l'appli (tranche 4)", () => {
  it(
    "ajoute journal puis notifications à une appli comptes,mails retouchée : les fichiers d'un assemblage direct, aux retouches de l'appli et à l'ordre des migrations près, puis typecheck, tests et rejeu des migrations passent",
    { timeout: 2_400_000 },
    async () => {
      const coloc = appliRetouchee(retouchesDeLaColoc);
      publier(coloc);
      const avant = instantane(coloc);

      const journal = mettreAJour({ catalogue, appli: coloc, ajouter: ["journal"] });
      expect(journal).toMatchObject({
        commitOrigine: commitA,
        commitCible: commitA,
        branche: "feature/ajouter-journal",
        ajoutees: ["journal"],
        // journal arrive branchée sur le patron dossiers : à rattacher aux modules de l'appli, pas à brancher.
        aBrancher: [],
        aRattacher: [expect.objectContaining({ brique: "journal", readme: "src/briques/journal/README.md" })],
        lourds: { base: false, comptes: false, pages: [] },
      });
      // Les retouches de l'appli sont loin des lignes que la brique remet : rien en conflit.
      expect(journal.fichiers.enConflit).toEqual([]);
      expect(journal.fichiers.fusionnes).toEqual(
        expect.arrayContaining(["src/config/acces.ts", "src/lib/navigation.ts", "src/lib/confidentialite.ts"])
      );
      expect(journal.migrations.ajoutees.length).toBeGreaterThan(0);
      const texte = rapport(journal);
      expect(texte).toMatch(new RegExp(`^# Ajouter journal à l'appli, au catalogue ${commitA}$`, "m"));
      expect(rubriqueDe(texte, "Briques à brancher")).toMatch(
        /Arrivées branchées sur le catalogue[^\n]*\n\n- `journal` : `src\/briques\/journal\/README\.md`/
      );
      expect(texte).not.toContain("## Ajouts lourds");
      // Toute brique arrivée se note dans la blueprint, à rattacher ou à brancher.
      expect(texte).toMatch(/^- Noter chaque brique arrivée dans `blueprint\.md` \(journal\)/m);
      // A' = A : ni journal des briques ni sujets du socle à recopier.
      expect(texte).not.toContain("## Journal des briques");
      expect(texte).not.toContain("## Socle");
      commiterEtPublier(coloc, "Ajouter la brique journal");
      const apresJournal = instantane(coloc);

      const notifications = mettreAJour({ catalogue, appli: coloc, ajouter: ["notifications"] });
      expect(notifications).toMatchObject({
        ajoutees: ["notifications"],
        aBrancher: [expect.objectContaining({ brique: "notifications", section: "La brancher" })],
        aRattacher: [],
      });
      expect(rubriqueDe(rapport(notifications), "Briques à brancher")).toMatch(
        /Arrivées sans appelant[^\n]*`briques:`[^\n]*\n\n- `notifications` : /
      );
      expect(notifications.fichiers.enConflit).toEqual([]);
      commiterEtPublier(coloc, "Ajouter la brique notifications");
      const enTete = fs.readFileSync(path.join(coloc, "blueprint.md"), "utf-8");
      expect(enTete).toMatch(new RegExp(`^commit_reference: ${commitA}$`, "m"));
      expect(enTete).toMatch(/^briques_assemblees: \[journal, notifications\]$/m);

      // L'assemblage direct avec les quatre briques, puis les mêmes retouches.
      const directe = path.join(dossierTemporaire("appli-directe-"), "essai-coloc");
      assemblerAuCommitA({
        sortie: directe,
        ...REGLAGES_DE_L_APPLI,
        briques: ["comptes", "mails", "journal", "notifications"],
      });
      retouchesDeLaColoc(directe);
      git(directe, "add", "-A");
      git(directe, "commit", "-q", "-m", "Retouches de l'appli");
      const deLAppli = objetsDuCommit(coloc);
      const duDirect = objetsDuCommit(directe);
      const ecarts = [...new Set([...deLAppli.keys(), ...duDirect.keys()])]
        .filter((chemin) => chemin !== "blueprint.md" && chemin !== FICHIER_MIGRATIONS)
        .filter((chemin) => deLAppli.get(chemin) !== duDirect.get(chemin))
        .sort();
      expect(ecarts).toEqual([]);
      // Les migrations : les mêmes étapes, au même texte. Seul l'ordre diffère : chaque
      // opération met les siennes en fin, après celles de l'appli et de l'opération
      // d'avant, quand l'assemblage direct glisse celle de notifications entre les deux de journal.
      const etapes = (depot: string) =>
        lireLesEtapes(contenuDuCommit(depot, "HEAD", FICHIER_MIGRATIONS).toString(), FICHIER_MIGRATIONS);
      const noms = (depot: string) => etapes(depot).map(({ nom }) => nom);
      const etapesDeLAppli = etapes(coloc);
      const etapesDuDirect = etapes(directe);
      const nomsDAvant = noms(avant);
      expect(nomsDAvant.at(-1)).toBe(ETAPE_DE_L_APPLI);
      const nomsDuJournal = noms(apresJournal).slice(nomsDAvant.length);
      expect(noms(apresJournal)).toEqual([...nomsDAvant, ...nomsDuJournal]);
      expect(nomsDuJournal.length).toBeGreaterThan(0);
      expect(nomsDuJournal.every((nom) => nom.startsWith("journal_audit"))).toBe(true);
      const nomsDesNotifications = noms(coloc).slice(nomsDAvant.length + nomsDuJournal.length);
      expect(nomsDesNotifications.length).toBeGreaterThan(0);
      expect(nomsDesNotifications.every((nom) => nom.startsWith("notifications"))).toBe(true);
      expect(noms(coloc)).toEqual([...nomsDAvant, ...nomsDuJournal, ...nomsDesNotifications]);
      expect(new Map(etapesDeLAppli.map(({ nom, texte: t }) => [nom, t]))).toEqual(
        new Map(etapesDuDirect.map(({ nom, texte: t }) => [nom, t]))
      );

      expect(await typecheck(coloc)).toEqual({ code: 0, sortie: "" });
      const base = await migrationsSuccessives([avant, apresJournal, coloc]);
      expect(base.code, base.sortie).toBe(0);
      expect(base.objets).toEqual(
        expect.arrayContaining(["coloc_taches", "journal_audit", "notifications_envois", "utilisateurs"])
      );
      const tests = await testsSurUneBaseNeuve(coloc);
      expect(tests.code, sansCouleurs(tests.sortie).slice(-6000)).toBe(0);
    }
  );

  it(
    "ajoute mails,contact puis comptes à une vitrine sans base : ajouts lourds annoncés, typecheck et rejeu des migrations passent, et tests/gardes-acces.test.ts échoue sur la seule page de l'appli (et l'entrée du kit qu'elle a supprimé), nommées au rapport",
    { timeout: 1_800_000 },
    async () => {
      const assemblee = path.join(dossierTemporaire("appli-"), "vitrine-essai");
      assemblerAuCommitA({ sortie: assemblee, briques: [], entete: "appli: Vitrine d'essai\nsite: public" });
      const vitrine = appliRetouchee((d) => {
        fs.mkdirSync(path.join(d, "src/app/a-propos"), { recursive: true });
        fs.writeFileSync(
          path.join(d, "src/app/a-propos/page.tsx"),
          "export default function PageAPropos() {\n  return <p>Qui nous sommes.</p>;\n}\n"
        );
        // Une page du kit que la vitrine n'expose pas : le verrou des gardes la nomme dans ses fichiers ouverts.
        fs.rmSync(path.join(d, "src/app/kit/site-vitrine"), { recursive: true });
        ecrire(d, "src/app/kit/Vitrine.tsx", remplacer('href="/kit/site-vitrine"', 'href="/kit"'));
      }, assemblee);
      publier(vitrine);
      const head = git(vitrine, "rev-parse", "HEAD");

      // contact exige mails, que la vitrine n'a pas : refusé, en disant quoi demander.
      expect(refusDe(() => mettreAJour({ catalogue, appli: vitrine, ajouter: ["contact"] })).message).toMatch(
        /« contact » exige mails.*--ajouter mails,contact/s
      );
      expect(git(vitrine, "rev-parse", "HEAD")).toBe(head);
      expect(git(vitrine, "branch", "--show-current")).toBe("main");

      const contact = mettreAJour({ catalogue, appli: vitrine, ajouter: ["mails", "contact"] });
      expect(contact).toMatchObject({
        branche: "feature/ajouter-mails-contact",
        ajoutees: ["mails", "contact"],
        aBrancher: [],
        aRattacher: [],
        lourds: { base: true, comptes: false, pages: [] },
        migrations: { avecLaBase: true },
      });
      const texteContact = rapport(contact);
      const lourdContact = rubriqueDe(texteContact, "Ajouts lourds");
      expect(lourdContact).toMatch(/### La base/);
      expect(lourdContact).toContain("`DATABASE_URL`");
      expect(lourdContact).not.toMatch(/### La brique comptes/);
      // En tête du rapport : avant les fichiers.
      expect(texteContact.indexOf("## Ajouts lourds")).toBeLessThan(texteContact.indexOf("## Fichiers"));
      commiterEtPublier(vitrine, "Ajouter les briques mails et contact");
      const apresContact = instantane(vitrine);

      const comptes = mettreAJour({ catalogue, appli: vitrine, ajouter: ["comptes"] });
      expect(comptes).toMatchObject({
        ajoutees: ["comptes", "rgpd"],
        lourds: {
          base: false,
          comptes: true,
          pages: ["src/app/a-propos/page.tsx"],
          ouvertsSupprimes: ["src/app/kit/site-vitrine/page.tsx"],
        },
      });
      const texteComptes = rapport(comptes);
      const lourdComptes = rubriqueDe(texteComptes, "Ajouts lourds") ?? "";
      expect(lourdComptes).toMatch(/### La brique comptes/);
      expect(lourdComptes).toMatch(/`tests\/gardes-acces\.test\.ts`[\s\S]*\n- `src\/app\/a-propos\/page\.tsx`\n/);
      expect(lourdComptes).toMatch(/`OUVERTS`[^\n]*\n- `src\/app\/kit\/site-vitrine\/page\.tsx`\n/);
      expect(lourdComptes).toContain("`src/config/comptes.ts`");
      expect(lourdComptes).toContain("rgpd");
      expect(texteComptes).toMatch(/^# Ajouter comptes à l'appli/m);
      commiterEtPublier(vitrine, "Ajouter la brique comptes");

      expect(await typecheck(vitrine)).toEqual({ code: 0, sortie: "" });
      const base = await migrationsSuccessives([apresContact, vitrine]);
      expect(base.code, base.sortie).toBe(0);
      expect(base.objets).toEqual(expect.arrayContaining(["contact_envois", "utilisateurs", "sessions"]));
      const gardes = await testsSurUneBaseNeuve(vitrine, ["tests/gardes-acces.test.ts"]);
      expect(gardes.code).not.toBe(0);
      // Une faute par motif (garde absent, exiger non importé) : toutes sur la page de l'appli.
      const fautes = [...sansCouleurs(gardes.sortie).matchAll(/^\+\s+"([^"]+ : [^"]+)",?$/gm)].map(
        ([, faute]) => faute
      );
      expect(fautes, sansCouleurs(gardes.sortie).slice(-4000)).toContain("a-propos/page.tsx : PageAPropos");
      expect([...new Set(fautes.map((faute) => faute.split(" : ")[0]))]).toEqual(["a-propos/page.tsx"]);
      // Et l'entrée ouverte dont la vitrine a supprimé le fichier, nommée au rapport elle aussi.
      expect(sansCouleurs(gardes.sortie)).toMatch(/kit\/site-vitrine\/page\.tsx: expected false to be true/);
    }
  );

  // Les profils de départ : leurs briques sont au manifeste, et le rejeu se fait sans
  // `profil:` (il redonnerait les briques du profil du jour). Un ajout que le profil
  // n'admet pas laisserait l'en-tête dire une autre appli : le rapport le signale.
  it(
    "ajoute à une appli assemblée par profil, et signale un ajout que son profil n'admet pas (comptes dans une vitrine)",
    { timeout: 2 * REJEU },
    () => {
      const parProfil = path.join(dossierTemporaire("appli-"), "vitrine-profilee");
      assemblerAuCommitA({ sortie: parProfil, briques: [], entete: "appli: Vitrine profilée\nprofil: vitrine" });
      const head = git(parProfil, "rev-parse", "HEAD");

      const admis = mettreAJour({ catalogue, appli: parProfil, ajouter: ["mails", "contact"], aBlanc: true });
      expect(admis).toMatchObject({ ajoutees: ["mails", "contact"], lourds: { base: true, comptes: false } });
      expect(admis.avertissements.join("\n")).not.toMatch(/profil/);

      const horsProfil = mettreAJour({ catalogue, appli: parProfil, ajouter: ["comptes", "mails"], aBlanc: true });
      expect(horsProfil).toMatchObject({ ajoutees: ["comptes", "mails", "rgpd"], lourds: { comptes: true } });
      expect(horsProfil.avertissements.join("\n")).toMatch(
        /profil: vitrine, qui n'admet en plus que mails, contact, deploiement : avec comptes, rgpd.*outil-interne ou portail/s
      );
      expect(rapport(horsProfil)).toMatch(/^- Attention : blueprint\.md déclare profil: vitrine/m);
      expect(git(parProfil, "status", "--porcelain")).toBe("");
      expect(git(parProfil, "rev-parse", "HEAD")).toBe(head);
    }
  );

  describe("refus en clair, avant toute écriture", () => {
    let publiee: string;
    beforeAll(() => {
      publiee = appliRetouchee(() => {});
      publier(publiee);
    });

    it("refuse un ajout combiné à une mise à jour : une opération à la fois", { timeout: REFUS }, () => {
      expect(
        refusDe(() => mettreAJour({ catalogue, appli: publiee, ajouter: ["journal"], vers: commitA })).message
      ).toMatch(/une opération à la fois/);
      expect(
        refusDe(() => mettreAJour({ catalogue, appli: publiee, ajouter: ["journal", "journal"] })).message
      ).toMatch(/nomme deux fois « journal »/);
      rienNEstTouche(publiee, git(publiee, "rev-parse", "HEAD"));
    });

    it(
      "refuse une brique absente du catalogue au commit de l'appli (mettre à jour d'abord), une brique déjà là, et la base nommée seule",
      { timeout: REJEU },
      () => {
        const head = git(publiee, "rev-parse", "HEAD");
        expect(refusDe(() => mettreAJour({ catalogue, appli: publiee, ajouter: ["facturation"] })).message).toMatch(
          new RegExp(`« facturation ».*commit ${commitA}.*mettre (l'appli )?à jour d'abord`, "s")
        );
        // rgpd est venue d'office avec comptes : elle est déjà là.
        expect(refusDe(() => mettreAJour({ catalogue, appli: publiee, ajouter: ["rgpd"] })).message).toMatch(
          /« rgpd ».*déjà/
        );
        expect(refusDe(() => mettreAJour({ catalogue, appli: publiee, ajouter: ["donnees"] })).message).toMatch(
          /« donnees » ne s'ajoute pas/
        );
        rienNEstTouche(publiee, head);
      }
    );
  });
});

// Le cas qui a fait écrire la règle : Dependabot monte Prettier au catalogue, et
// les empreintes d'une appli dépendent de la version qui l'a mise en forme.
describe("mettre-a-jour, examen : le Prettier du commit de l'appli, pas celui du jour", () => {
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
