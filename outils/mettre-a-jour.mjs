#!/usr/bin/env node
/*
 * Outil de mise à jour des applis assemblées (note de conception :
 * outils/mise-a-jour.md). Première tranche, en lecture seule : retrouver ce
 * qu'une appli a reçu du catalogue, et dire ce qu'elle en a retouché.
 *
 *   node outils/mettre-a-jour.mjs <dossier-de-l-appli> --a-blanc
 *
 * L'origine d'un fichier n'est pas le fichier du catalogue au commit A :
 * l'assembleur retouche les fichiers partagés selon les briques absentes, puis
 * les remet en forme. L'outil rejoue donc l'assembleur DU COMMIT A, dans un
 * worktree temporaire du catalogue, avec les réglages du manifeste
 * (catalogue.empreintes.json), et vérifie que l'origine rejouée redonne toutes
 * les empreintes du manifeste avant d'en tirer quoi que ce soit.
 *
 * Il n'écrit rien dans l'appli et ne touche ni à son remote, ni à une base, ni
 * à un .env*. Dans le catalogue, il ne laisse rien : le worktree temporaire
 * est retiré à la fin, refus compris. Seul appel au réseau : npm ci dans ce
 * worktree, pour le Prettier du commit A s'il n'est pas celui du catalogue.
 */
import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { environnementDeGit } from "./assembler.mjs";

export class ErreurMiseAJour extends Error {
  constructor(message) {
    super(message);
    this.name = "ErreurMiseAJour";
  }
}

const MANIFESTE = "catalogue.empreintes.json";

// Les unités du manifeste qui ne se donnent pas à --briques : le socle, la
// base (que l'assembleur garde d'office et refuse dans --briques) et les unités
// partagées, qui suivent les briques. Chaque brique a au moins son dossier,
// donc une entrée à son nom.
const UNITES_SANS_CHOIX = ["socle", "donnees", "patron-dossiers", "adresse-ip"];

function git(dossier, ...args) {
  return execFileSync("git", ["-C", dossier, ...args], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: environnementDeGit(),
    // Le verrou npm du catalogue dépasse le méga-octet par défaut.
    maxBuffer: 64 * 1024 * 1024,
  });
}

const empreinte = (contenu) => createHash("sha256").update(contenu).digest("hex");

/*
 * Le contenu de chaque fichier d'un commit, tel que git l'enregistre : celui
 * dont le manifeste a pris l'empreinte. Le disque d'un poste Windows peut
 * porter des fins de ligne CRLF que git ne voit pas.
 */
function contenusDuCommit(depot, commit = "HEAD") {
  const entrees = git(depot, "ls-tree", "-r", "-z", commit)
    .split("\0")
    .filter(Boolean)
    .map((ligne) => {
      // Au premier « \t » seulement : un chemin peut en contenir un.
      const tabulation = ligne.indexOf("\t");
      const [, type, objet] = ligne.slice(0, tabulation).split(" ");
      return { chemin: ligne.slice(tabulation + 1), type, objet };
    })
    .filter(({ type }) => type === "blob");
  const sortie = execFileSync("git", ["-C", depot, "cat-file", "--batch"], {
    input: entrees.map(({ objet }) => `${objet}\n`).join(""),
    env: environnementDeGit(),
    maxBuffer: 1024 * 1024 * 1024,
  });
  const contenus = new Map();
  let curseur = 0;
  for (const { chemin } of entrees) {
    // « <objet> blob <taille> », puis le contenu, puis un saut de ligne.
    const finEntete = sortie.indexOf(0x0a, curseur);
    const taille = Number(sortie.toString("latin1", curseur, finEntete).split(" ")[2]);
    contenus.set(chemin, sortie.subarray(finEntete + 1, finEntete + 1 + taille));
    curseur = finEntete + 1 + taille + 1;
  }
  return contenus;
}

// ---------------------------------------------------------------- l'appli

function lireLAppli(appli) {
  if (!fs.existsSync(appli) || !fs.statSync(appli).isDirectory()) {
    throw new ErreurMiseAJour(`« ${appli} » n'est pas un dossier : donner le dossier de l'appli assemblée.`);
  }
  let racine;
  try {
    racine = git(appli, "rev-parse", "--show-toplevel").trim();
  } catch {
    throw new ErreurMiseAJour(`« ${appli} » n'est pas un dépôt git : donner le dossier de l'appli assemblée.`);
  }
  if (fs.realpathSync.native(racine) !== fs.realpathSync.native(appli)) {
    throw new ErreurMiseAJour(
      `« ${appli} » n'est pas la racine de son dépôt git (« ${racine} ») : donner la racine de l'appli.`
    );
  }
  if (git(appli, "status", "--porcelain").trim() !== "") {
    throw new ErreurMiseAJour(
      `L'arbre de l'appli n'est pas propre : l'outil lit son HEAD, et ce qui n'est pas commité n'y serait pas. ` +
        "Commiter ou mettre de côté (git status dans l'appli), puis relancer."
    );
  }
  const contenus = contenusDuCommit(appli);
  if (!contenus.has(MANIFESTE)) {
    throw new ErreurMiseAJour(
      `L'appli n'a pas de manifeste (${MANIFESTE}) à son HEAD : assemblée avant le 2026-11-02, son origine ne se rejoue pas ` +
        "(« Hors v1 » de outils/mise-a-jour.md)."
    );
  }
  let manifeste;
  try {
    manifeste = JSON.parse(contenus.get(MANIFESTE).toString("utf-8"));
  } catch (erreur) {
    throw new ErreurMiseAJour(`${MANIFESTE} de l'appli n'est pas du JSON lisible : ${erreur.message}`);
  }
  verifierLeManifeste(manifeste);
  return { contenus, manifeste };
}

const illisible = (quoi) =>
  new ErreurMiseAJour(`${MANIFESTE} de l'appli est illisible : ${quoi}. Il a été retouché à la main ?`);

function verifierLeManifeste(manifeste) {
  if (typeof manifeste !== "object" || manifeste === null || Array.isArray(manifeste)) throw illisible("pas un objet");
  if (manifeste.format !== 1 && manifeste.format !== 2) {
    throw new ErreurMiseAJour(
      `${MANIFESTE} de l'appli est au format ${manifeste.format}, que cet outil ne lit pas (formats 1 et 2) : ` +
        "mettre le catalogue à jour (git pull), puis relancer."
    );
  }
  if (typeof manifeste.catalogue !== "object" || manifeste.catalogue === null) throw illisible("pas de catalogue");
  const commit = manifeste.catalogue.commit;
  if (typeof commit !== "string" || commit === "") throw illisible("pas de catalogue.commit");
  if (typeof manifeste.fichiers !== "object" || manifeste.fichiers === null) throw illisible("pas de fichiers");
  for (const [chemin, entree] of Object.entries(manifeste.fichiers)) {
    if (typeof entree?.unite !== "string" || !/^[0-9a-f]{64}$/.test(entree?.sha256 ?? "")) {
      throw illisible(`l'entrée de ${chemin} n'a pas d'unité ou d'empreinte sha256`);
    }
  }
  if (commit.includes("+arbre-modifie")) {
    throw new ErreurMiseAJour(
      `L'appli a été assemblée depuis un catalogue aux modifications non commitées (commit ${commit}) : ` +
        "ces modifications ne sont dans aucun commit, son origine ne se rejoue pas."
    );
  }
  if (manifeste.format === 2) {
    const { catalogue, assemblage } = manifeste;
    if (!/^[0-9a-f]{40}$/.test(catalogue.commitComplet ?? "") || !catalogue.commitComplet.startsWith(commit)) {
      throw illisible("catalogue.commitComplet n'est pas le commit complet de catalogue.commit");
    }
    const estUneListe = (valeur) => Array.isArray(valeur) && valeur.every((nom) => typeof nom === "string");
    if (
      typeof assemblage !== "object" ||
      assemblage === null ||
      !estUneListe(assemblage.briques) ||
      !PAQUET.test(assemblage.paquet ?? "") ||
      typeof assemblage.dependabot !== "boolean" ||
      !(assemblage.nom === null || typeof assemblage.nom === "string") ||
      !(assemblage.entete === null || (typeof assemblage.entete === "object" && !Array.isArray(assemblage.entete)))
    ) {
      throw illisible("les réglages de l'assemblage (assemblage) sont incomplets");
    }
  }
}

// ---------------------------------------------------------------- le catalogue au commit A

function commitDuCatalogue(catalogue, manifeste) {
  const demande = manifeste.format === 2 ? manifeste.catalogue.commitComplet : manifeste.catalogue.commit;
  try {
    return git(catalogue, "rev-parse", "--verify", "--quiet", `${demande}^{commit}`).trim();
  } catch {
    throw new ErreurMiseAJour(
      `Le commit ${manifeste.catalogue.commit} du manifeste est absent du catalogue : git fetch origin dans le catalogue, ` +
        "puis relancer. S'il manque encore, l'appli a été assemblée avant le dépôt public et son origine ne se rejoue pas."
    );
  }
}

/*
 * Les réglages à redonner à l'assembleur du commit A. Au format 2, le manifeste
 * les porte. Au format 1, ils se déduisent :
 *   - les briques : les unités du manifeste qui sont des briques au commit A. Une
 *     brique ajoutée d'office (rgpd avec comptes) se lit comme choisie, ce qui
 *     donne les mêmes fichiers ;
 *   - le paquet : celui de package.json, où l'assembleur l'a reporté ;
 *   - Dependabot : la présence de son fichier au manifeste ;
 *   - la blueprint : celle de l'appli à son HEAD, dont l'assembleur relit
 *     l'en-tête, avec le paquet à --nom : il redonne le paquet et nomme le
 *     service de render.yaml comme le nom d'origine. La blueprint minimale que
 *     l'assembleur écrit sans --blueprint ne se redonne pas : elle déclencherait
 *     ce qu'une blueprint donnée remplit (hébergeur, entrée). Sans blueprint, ni
 *     --nom : le paquet vient du dossier de sortie, nommé comme lui.
 * Limites, que l'écart des empreintes dit : un en-tête retouché depuis ; avec la
 * brique deploiement, une blueprint sans appli ni --nom, ou --nom sans
 * blueprint (le nom du service de render.yaml ne se déduit pas).
 */
function reglagesDeLAssemblage({ manifeste, contenus, briquesDuCommit }) {
  if (manifeste.format === 2) {
    const { briques, nom, dependabot, entete, paquet } = manifeste.assemblage;
    return {
      briques,
      nom: nom ?? undefined,
      dependabot,
      blueprint: entete === null ? undefined : blueprintDeLEntete(entete),
      paquet,
      deduits: false,
    };
  }
  const unites = [...new Set(Object.values(manifeste.fichiers).map(({ unite }) => unite))];
  const inconnue = unites.find((unite) => !UNITES_SANS_CHOIX.includes(unite) && !briquesDuCommit.includes(unite));
  if (inconnue !== undefined) {
    throw new ErreurMiseAJour(
      `Le manifeste nomme l'unité « ${inconnue} », qui n'est pas une brique du catalogue à son commit ${manifeste.catalogue.commit} : il a été retouché ?`
    );
  }
  let paquet;
  try {
    paquet = JSON.parse(contenus.get("package.json").toString("utf-8")).name;
  } catch {
    paquet = undefined;
  }
  if (!PAQUET.test(paquet ?? "")) {
    throw new ErreurMiseAJour(
      "package.json de l'appli est absent, sans nom ou d'un nom que l'assembleur n'écrit pas : au format 1 du manifeste, c'est lui qui donne le nom de l'appli."
    );
  }
  const blueprint = contenus.get("blueprint.md")?.toString("utf-8");
  const donnee = blueprint !== undefined && !blueprint.includes(DEBUT_DE_LA_BLUEPRINT_MINIMALE);
  return {
    briques: briquesDuCommit.filter((nom) => unites.includes(nom)),
    nom: donnee ? paquet : undefined,
    dependabot: ".github/dependabot.yml" in manifeste.fichiers,
    blueprint: donnee ? blueprint : undefined,
    paquet,
    deduits: true,
  };
}

// Un nom de paquet tel que l'assembleur l'écrit (nomDuPaquet d'outils/assembler.mjs) :
// il nomme aussi le dossier où l'assemblage se rejoue.
const PAQUET = /^[a-z][a-z0-9-]*$/;

// La première ligne de la blueprint minimale de l'assembleur (blueprintParDefaut),
// la même depuis l'arrivée du manifeste.
const DEBUT_DE_LA_BLUEPRINT_MINIMALE = "# Blueprint de l'appli, créée par outils/assembler.mjs.";

// Une blueprint qui n'a que les champs lus à l'assemblage, recopiés tels quels.
function blueprintDeLEntete(entete) {
  const lignes = Object.entries(entete).map(([cle, valeur]) => `${cle}: ${valeur}`);
  return ["---", "# Rejouée par outils/mettre-a-jour.mjs, depuis le manifeste.", ...lignes, "---", ""].join("\n");
}

/*
 * Le code du commit A tourne dans un Node à part : il n'a rien à faire dans le
 * processus de l'outil. Ses données passent par l'entrée standard, pas par la
 * ligne de commande : l'assembleur prend process.argv[1] pour le script lancé,
 * et un argument à cette place l'a fait échouer au premier essai.
 */
function dansUnNodeAPart(script, donnees, env = environnementDeGit()) {
  const prelude = 'const donnees = JSON.parse((await import("node:fs")).readFileSync(0, "utf-8"));';
  return execFileSync(process.execPath, ["--input-type=module", "-e", prelude + script], {
    input: JSON.stringify(donnees),
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    env,
  });
}

// Les briques de outils/modules.mjs au commit A.
function briquesDuCommit(arbre) {
  const script = "const { BRIQUES } = await import(donnees.module); console.log(JSON.stringify(Object.keys(BRIQUES)));";
  return JSON.parse(dansUnNodeAPart(script, { module: pathToFileURL(path.join(arbre, "outils", "modules.mjs")).href }));
}

/*
 * Le Prettier du commit A : l'assembleur remet en forme avec celui de la racine
 * du catalogue rejoué, et les empreintes dépendent de sa version. Celle du jour,
 * que Dependabot monte, donnerait d'autres fichiers. Même version que celle
 * qu'a installée le catalogue : le worktree emprunte ses node_modules ; sinon,
 * npm ci dans le worktree, sans les scripts d'installation (seul Prettier sert).
 */
function versionDuVerrou(catalogue, commit) {
  try {
    return JSON.parse(git(catalogue, "show", `${commit}:package-lock.json`)).packages?.["node_modules/prettier"]
      ?.version;
  } catch {
    return undefined;
  }
}

function versionInstallee(racine) {
  try {
    return JSON.parse(fs.readFileSync(path.join(racine, "node_modules", "prettier", "package.json"), "utf-8")).version;
  } catch {
    return undefined;
  }
}

function installerPrettier({ catalogue, arbre, commit }) {
  const version = versionDuVerrou(catalogue, commit);
  if (version === undefined) {
    throw new ErreurMiseAJour(
      `Le verrou du catalogue au commit ${commit} ne porte pas Prettier : l'assembleur de ce commit ne se rejoue pas.`
    );
  }
  if (versionInstallee(catalogue) === version) {
    // Jonction sous Windows (sans droit d'administrateur), lien symbolique ailleurs.
    fs.symlinkSync(path.join(catalogue, "node_modules"), path.join(arbre, "node_modules"), "junction");
    return { version, provenance: "emprunté au catalogue" };
  }
  try {
    // Une commande sans argument variable : le shell sert à trouver npm sous Windows.
    execSync("npm ci --ignore-scripts --no-audit --no-fund", { cwd: arbre, stdio: ["ignore", "pipe", "pipe"] });
  } catch (erreur) {
    const message = (erreur.stderr?.toString() || erreur.message).trim().split("\n").slice(-5).join("\n");
    throw new ErreurMiseAJour(
      `Le Prettier du commit ${commit} (${version}) ne s'installe pas : npm ci a échoué dans le worktree temporaire du catalogue. ` +
        `Vérifier le réseau, puis relancer.\n${message}`
    );
  }
  if (versionInstallee(arbre) !== version) {
    throw new ErreurMiseAJour(`npm ci n'a pas installé Prettier ${version} dans le worktree du commit ${commit}.`);
  }
  return { version, provenance: "installé par npm ci" };
}

/*
 * L'assembleur du commit A, appelé par sa fonction et non par sa ligne de
 * commande : celle-ci refuse un catalogue dont l'arbre n'est pas propre, et la
 * jonction vers node_modules en est une modification aux yeux de git (le motif
 * « node_modules/ » de .gitignore ne vise pas un lien). L'identité git est celle
 * de l'outil, le commit rejoué n'étant gardé nulle part.
 */
function rejouerLAssembleur({ arbre, sortie, commit, reglages }) {
  const { briques, nom, dependabot, blueprint } = reglages;
  let fichierBlueprint;
  fs.mkdirSync(path.dirname(sortie), { recursive: true });
  if (blueprint !== undefined) {
    fichierBlueprint = path.join(path.dirname(sortie), "blueprint.md");
    fs.writeFileSync(fichierBlueprint, blueprint);
  }
  const options = { source: arbre, sortie, briques, commit, nom, blueprint: fichierBlueprint, dependabot };
  const assembleur = pathToFileURL(path.join(arbre, "outils", "assembler.mjs")).href;
  const script =
    "const { assembler } = await import(donnees.module);" +
    "try { assembler(donnees.options); } catch (erreur) { console.error(erreur.message); process.exit(2); }";
  try {
    dansUnNodeAPart(
      script,
      { module: assembleur, options },
      {
        ...environnementDeGit(),
        GIT_AUTHOR_NAME: "outils/mettre-a-jour.mjs",
        GIT_AUTHOR_EMAIL: "mettre-a-jour@catalogue.invalid",
        GIT_COMMITTER_NAME: "outils/mettre-a-jour.mjs",
        GIT_COMMITTER_EMAIL: "mettre-a-jour@catalogue.invalid",
      }
    );
  } catch (erreur) {
    throw new ErreurMiseAJour(
      `L'assembleur du commit ${commit} refuse de rejouer l'assemblage de l'appli : ${(erreur.stderr?.toString() || erreur.message).trim()}`
    );
  }
}

// Ce qui sépare l'origine rejouée du manifeste de l'appli, fichier par fichier.
function ecartsAuManifeste(duManifeste, rejoues) {
  const ecarts = [];
  for (const chemin of [...new Set([...Object.keys(duManifeste), ...Object.keys(rejoues)])].sort()) {
    const attendu = duManifeste[chemin];
    const obtenu = rejoues[chemin];
    if (!obtenu) ecarts.push(`${chemin} : absent de l'origine rejouée`);
    else if (!attendu) ecarts.push(`${chemin} : absent du manifeste`);
    else if (attendu.unite !== obtenu.unite)
      ecarts.push(`${chemin} : unité ${attendu.unite} au manifeste, ${obtenu.unite} rejouée`);
    else if (attendu.sha256 !== obtenu.sha256) ecarts.push(`${chemin} : empreinte différente`);
  }
  return ecarts;
}

const ECARTS_NOMMES = 30;

function retirerLeWorktree(catalogue, arbre) {
  const lien = path.join(arbre, "node_modules");
  // Le lien seul, jamais ce qu'il vise : le node_modules du catalogue. Resté en
  // place, rien n'est supprimé en dessous, plutôt que de risquer de le suivre.
  if (fs.lstatSync(lien, { throwIfNoEntry: false })?.isSymbolicLink()) {
    try {
      fs.unlinkSync(lien);
    } catch {
      try {
        fs.rmdirSync(lien);
      } catch {
        // Constaté juste après.
      }
    }
    if (fs.lstatSync(lien, { throwIfNoEntry: false })) {
      throw new ErreurMiseAJour(
        `Le lien ${lien} vers le node_modules du catalogue n'a pas pu être retiré : le retirer à la main (le lien seul), ` +
          `puis git worktree remove --force ${arbre} dans le catalogue.`
      );
    }
  }
  try {
    git(catalogue, "worktree", "remove", "--force", arbre);
  } catch {
    // Un worktree à moitié créé : le dossier part ci-dessous, sa trace avec prune.
  }
  fs.rmSync(arbre, { recursive: true, force: true });
  git(catalogue, "worktree", "prune");
}

/**
 * Rejoue l'origine de l'appli et liste ce qu'elle en a retouché ou supprimé.
 * N'écrit rien dans l'appli ; le worktree temporaire du catalogue est retiré.
 * @param {{ catalogue: string, appli: string }} options
 */
export function examiner({ catalogue, appli }) {
  const dossierAppli = path.resolve(appli);
  const racineCatalogue = path.resolve(catalogue);
  const { contenus, manifeste } = lireLAppli(dossierAppli);
  const commit = manifeste.catalogue.commit;
  const sha = commitDuCatalogue(racineCatalogue, manifeste);

  const temporaire = fs.mkdtempSync(path.join(os.tmpdir(), "mise-a-jour-"));
  const arbre = path.join(temporaire, "catalogue");
  try {
    try {
      git(racineCatalogue, "worktree", "add", "--detach", "--quiet", arbre, sha);
    } catch (erreur) {
      throw new ErreurMiseAJour(
        `Le worktree temporaire du commit ${commit} n'a pas pu être créé : ${erreur.stderr?.trim() || erreur.message}`
      );
    }
    const reglages = reglagesDeLAssemblage({ manifeste, contenus, briquesDuCommit: briquesDuCommit(arbre) });
    const prettier = installerPrettier({ catalogue: racineCatalogue, arbre, commit: sha });
    // Nommé comme le paquet : sans nom donné, l'assembleur tire le paquet du
    // dossier de sortie (un premier jet le nommait « appli », et le paquet avec).
    const sortie = path.join(temporaire, "origine", reglages.paquet);
    rejouerLAssembleur({ arbre, sortie, commit, reglages });

    const origine = contenusDuCommit(sortie);
    const rejoue = JSON.parse(origine.get(MANIFESTE).toString("utf-8"));
    const ecarts = ecartsAuManifeste(manifeste.fichiers, rejoue.fichiers);
    if (ecarts.length > 0) {
      const nommes = ecarts.slice(0, ECARTS_NOMMES).map((ecart) => `  - ${ecart}`);
      if (ecarts.length > ECARTS_NOMMES) nommes.push(`  - et ${ecarts.length - ECARTS_NOMMES} autres`);
      throw new ErreurMiseAJour(
        `L'origine rejouée au commit ${commit} ne redonne pas les empreintes du manifeste de l'appli :\n${nommes.join("\n")}\n` +
          "Une comparaison contre une origine fausse attribuerait à l'appli des retouches qu'elle n'a pas faites, ou l'inverse : " +
          `rien n'est listé. Le manifeste a été retouché, ou ses réglages ne se rejouent pas${reglages.deduits ? " (format 1, déduits : voir outils/mise-a-jour.md)" : ""}.`
      );
    }

    // NOTICE, que l'assembleur écrit lui-même, n'a pas d'empreinte au manifeste :
    // l'appli est jugée intacte si elle égale l'origine rejouée.
    const attendus = Object.entries(manifeste.fichiers).map(([chemin, { sha256 }]) => [chemin, sha256]);
    if (origine.has("NOTICE")) attendus.push(["NOTICE", empreinte(origine.get("NOTICE"))]);
    const retouches = [];
    const supprimes = [];
    for (const [chemin, sha256] of attendus) {
      const contenu = contenus.get(chemin);
      if (contenu === undefined) supprimes.push(chemin);
      else if (empreinte(contenu) !== sha256) retouches.push(chemin);
    }

    const avertissements = [];
    // Dans l'en-tête seul : le corps peut citer un autre commit.
    const entete = /^---\r?\n([\s\S]*?)\r?\n---/.exec(contenus.get("blueprint.md")?.toString("utf-8") ?? "")?.[1];
    const reference = /^commit_reference:[ \t]*(\S+)/m.exec(entete ?? "")?.[1];
    if (reference !== undefined && reference !== commit && !(reference.length >= 7 && sha.startsWith(reference))) {
      avertissements.push(
        `blueprint.md dit commit_reference: ${reference}, le manifeste ${commit} : le manifeste fait foi, la blueprint est à corriger.`
      );
    }

    return {
      appli: dossierAppli,
      format: manifeste.format,
      commit,
      sha,
      briques: reglages.briques,
      deduits: reglages.deduits,
      paquet: reglages.paquet,
      dependabot: reglages.dependabot,
      prettier,
      fichiers: Object.keys(manifeste.fichiers).length,
      retouches: retouches.sort(),
      supprimes: supprimes.sort(),
      avertissements,
    };
  } finally {
    // Un nettoyage qui échoue ne masque pas le refus qui l'a précédé : il se dit à côté.
    try {
      retirerLeWorktree(racineCatalogue, arbre);
      fs.rmSync(temporaire, { recursive: true, force: true });
    } catch (erreur) {
      console.error(`Nettoyage incomplet : ${erreur.message}`);
    }
  }
}

const liste = (titre, chemins) => [`${titre} (${chemins.length}) :`, ...chemins.map((chemin) => `- ${chemin}`)];

/** Le rapport de --a-blanc, en texte. */
export function rapport(resultat) {
  const lignes = [
    `Appli : ${resultat.appli}`,
    `Manifeste au format ${resultat.format} : catalogue au commit ${resultat.commit} (${resultat.sha}).`,
    `Briques${resultat.deduits ? " (déduites du manifeste)" : ""} : ${resultat.briques.length === 0 ? "aucune" : resultat.briques.join(", ")}.`,
    `Paquet : ${resultat.paquet}. Dependabot : ${resultat.dependabot ? "gardé" : "retiré"}.`,
    `Prettier du commit : ${resultat.prettier.version}, ${resultat.prettier.provenance}.`,
    `Origine rejouée : les ${resultat.fichiers} empreintes du manifeste se retrouvent.`,
    "",
  ];
  if (resultat.retouches.length === 0 && resultat.supprimes.length === 0) {
    lignes.push("Rien n'est retouché ni supprimé : l'appli a gardé tels quels les fichiers venus du catalogue.");
  } else {
    if (resultat.retouches.length > 0) lignes.push(...liste("Retouchés par l'appli", resultat.retouches), "");
    if (resultat.supprimes.length > 0) lignes.push(...liste("Supprimés par l'appli", resultat.supprimes), "");
    lignes.push("Les fichiers créés par l'appli ne sont ni lus ni listés.");
  }
  if (resultat.avertissements.length > 0)
    lignes.push("", ...resultat.avertissements.map((texte) => `Attention : ${texte}`));
  lignes.push("", "À blanc : rien n'est écrit dans l'appli.");
  return lignes.join("\n");
}

// ---------------------------------------------------------------- ligne de commande

const AIDE = `Usage : node outils/mettre-a-jour.mjs <dossier-de-l-appli> --a-blanc

  --a-blanc   rejoue l'assemblage d'origine de l'appli (commit et réglages de son
              catalogue.empreintes.json), vérifie qu'il redonne les empreintes du
              manifeste, puis liste les fichiers venus du catalogue que l'appli a
              retouchés ou supprimés. N'écrit rien dans l'appli.

L'appli doit avoir un arbre propre ; on lit son HEAD. Le catalogue doit avoir le
commit de l'appli (git fetch origin). Seul appel au réseau : npm ci dans un
worktree temporaire du catalogue, quand le Prettier de ce commit n'est pas celui
qu'a installé le catalogue. La mise à jour et l'ajout d'une brique, qui écrivent
dans l'appli, ne sont pas encore outillés (outils/mise-a-jour.md).`;

function main(argv) {
  if (argv.length === 0 || argv.includes("--aide") || argv.includes("-h")) {
    console.log(AIDE);
    return;
  }
  const inconnue = argv.find((argument) => argument.startsWith("-") && argument !== "--a-blanc");
  if (inconnue !== undefined) throw new ErreurMiseAJour(`Option inconnue « ${inconnue} ».\n\n${AIDE}`);
  const positionnels = argv.filter((argument) => !argument.startsWith("-"));
  if (positionnels.length !== 1) throw new ErreurMiseAJour(`Un seul dossier d'appli attendu.\n\n${AIDE}`);
  if (!argv.includes("--a-blanc")) {
    throw new ErreurMiseAJour(
      "seul --a-blanc est outillé : la mise à jour qui écrit dans l'appli viendra ensuite (outils/mise-a-jour.md). Relancer avec --a-blanc."
    );
  }
  const catalogue = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  console.log(rapport(examiner({ catalogue, appli: positionnels[0] })));
}

// Node résout le module principal par realpath (voir outils/assembler.mjs).
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (erreur) {
    if (erreur instanceof ErreurMiseAJour) {
      console.error(`Mise à jour refusée : ${erreur.message}`);
      process.exit(1);
    }
    throw erreur;
  }
}
