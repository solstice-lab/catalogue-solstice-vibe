#!/usr/bin/env node
/*
 * Outil de mise à jour des applis assemblées (note de conception :
 * outils/mise-a-jour.md) : reporter dans une appli le catalogue d'un commit
 * plus récent, hors migrations.
 *
 *   node outils/mettre-a-jour.mjs <dossier-de-l-appli> [--vers <commit>] [--branche <nom>] [--a-blanc]
 *
 * L'origine d'un fichier n'est pas le fichier du catalogue au commit A :
 * l'assembleur retouche les fichiers partagés selon les briques absentes, puis
 * les remet en forme. L'outil rejoue donc l'assembleur DU COMMIT A, dans un
 * worktree temporaire du catalogue, avec les réglages du manifeste
 * (catalogue.empreintes.json), et vérifie que l'origine rejouée redonne toutes
 * les empreintes du manifeste avant d'en tirer quoi que ce soit. La cible se
 * rejoue de même au commit visé A', puis chaque fichier passe par la table de la
 * note : remplacé, fusionné à trois, ajouté, supprimé, ou laissé et signalé.
 *
 * Il écrit sur une branche neuve de l'appli, sans commit, et ne touche ni à son
 * remote, ni à une base, ni à un .env*. Dans le catalogue, il ne laisse rien :
 * les worktrees temporaires sont retirés à la fin, refus compris. Seul appel au
 * réseau : npm ci dans un de ces worktrees, pour le Prettier d'un commit s'il
 * n'est pas celui du catalogue.
 */
import { execFileSync, execSync, spawnSync } from "node:child_process";
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
      !Array.isArray(assemblage.ajouteesDOffice) ||
      !assemblage.ajouteesDOffice.every((brique) => typeof brique?.nom === "string") ||
      !PAQUET.test(assemblage.paquet ?? "") ||
      typeof assemblage.dependabot !== "boolean" ||
      !(assemblage.nom === null || typeof assemblage.nom === "string") ||
      !(assemblage.entete === null || (typeof assemblage.entete === "object" && !Array.isArray(assemblage.entete)))
    ) {
      throw illisible("les réglages de l'assemblage (assemblage) sont incomplets");
    }
  }
}

// ---------------------------------------------------------------- le catalogue rejoué, au commit A ou A'

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
 * Le code du commit rejoué (A, ou A' pour la cible) tourne dans un Node à part : il n'a rien à faire dans le
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

// Les briques de outils/modules.mjs au commit rejoué.
function briquesDuCommit(arbre) {
  const script = "const { BRIQUES } = await import(donnees.module); console.log(JSON.stringify(Object.keys(BRIQUES)));";
  return JSON.parse(dansUnNodeAPart(script, { module: pathToFileURL(path.join(arbre, "outils", "modules.mjs")).href }));
}

/*
 * Le Prettier du commit rejoué : l'assembleur remet en forme avec celui de la racine
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
 * L'assembleur du commit rejoué, appelé par sa fonction et non par sa ligne de
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

function avecUnDossierTemporaire(travail) {
  const temporaire = fs.mkdtempSync(path.join(os.tmpdir(), "mise-a-jour-"));
  try {
    return travail(temporaire);
  } finally {
    try {
      fs.rmSync(temporaire, { recursive: true, force: true });
    } catch (erreur) {
      console.error(`Nettoyage incomplet : ${erreur.message}`);
    }
  }
}

/*
 * Un assemblage rejoué : le catalogue au commit `sha` dans un worktree
 * temporaire, son Prettier, son assembleur. `reglagesDe` reçoit les briques de
 * ce commit et rend les réglages à redonner. Ce qui en sort se lit dans le
 * commit que l'assembleur a fait, en LF ; le worktree est retiré dans tous les cas.
 */
function rejouer({ catalogue, temporaire, nom, sha, commit, reglagesDe }) {
  const arbre = path.join(temporaire, `catalogue-${nom}`);
  try {
    try {
      git(catalogue, "worktree", "add", "--detach", "--quiet", arbre, sha);
    } catch (erreur) {
      throw new ErreurMiseAJour(
        `Le worktree temporaire du commit ${commit} n'a pas pu être créé : ${erreur.stderr?.trim() || erreur.message}`
      );
    }
    const reglages = reglagesDe(briquesDuCommit(arbre));
    const prettier = installerPrettier({ catalogue, arbre, commit: sha });
    // Nommé comme le paquet : sans nom donné, l'assembleur tire le paquet du
    // dossier de sortie (un premier jet le nommait « appli », et le paquet avec).
    const sortie = path.join(temporaire, nom, reglages.paquet);
    rejouerLAssembleur({ arbre, sortie, commit, reglages });
    return { contenus: contenusDuCommit(sortie), reglages, prettier };
  } finally {
    // Un nettoyage qui échoue ne masque pas le refus qui l'a précédé : il se dit à côté.
    try {
      retirerLeWorktree(catalogue, arbre);
    } catch (erreur) {
      console.error(`Nettoyage incomplet : ${erreur.message}`);
    }
  }
}

// L'origine rejouée au commit A, vérifiée contre le manifeste, et les écarts de l'appli.
function examinerDans(temporaire, { racineCatalogue, dossierAppli, lecture, sha }) {
  const { contenus, manifeste } = lecture;
  const commit = manifeste.catalogue.commit;
  const {
    contenus: origine,
    reglages,
    prettier,
  } = rejouer({
    catalogue: racineCatalogue,
    temporaire,
    nom: "origine",
    sha,
    commit,
    reglagesDe: (briques) => reglagesDeLAssemblage({ manifeste, contenus, briquesDuCommit: briques }),
  });

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
  const reference = champDeLaBlueprint(contenus, "commit_reference");
  if (reference !== undefined && reference !== commit && !(reference.length >= 7 && sha.startsWith(reference))) {
    avertissements.push(
      `blueprint.md dit commit_reference: ${reference}, le manifeste ${commit} : le manifeste fait foi, la blueprint est à corriger.`
    );
  }

  return {
    origine,
    reglages,
    resultat: {
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
    },
  };
}

// Un champ de l'en-tête de blueprint.md, dans l'en-tête seul : le corps peut citer un autre commit.
function champDeLaBlueprint(contenus, cle) {
  const entete = /^---\r?\n([\s\S]*?)\r?\n---/.exec(contenus.get("blueprint.md")?.toString("utf-8") ?? "")?.[1];
  return new RegExp(`^${cle}:[ \\t]*(\\S+)`, "m").exec(entete ?? "")?.[1];
}

/**
 * Rejoue l'origine de l'appli et liste ce qu'elle en a retouché ou supprimé.
 * N'écrit rien dans l'appli ; le worktree temporaire du catalogue est retiré.
 * @param {{ catalogue: string, appli: string }} options
 */
export function examiner({ catalogue, appli }) {
  const dossierAppli = path.resolve(appli);
  const racineCatalogue = path.resolve(catalogue);
  const lecture = lireLAppli(dossierAppli);
  const sha = commitDuCatalogue(racineCatalogue, lecture.manifeste);
  return avecUnDossierTemporaire(
    (temporaire) => examinerDans(temporaire, { racineCatalogue, dossierAppli, lecture, sha }).resultat
  );
}

// ---------------------------------------------------------------- le commit visé A' et la branche

function reussit(dossier, ...args) {
  try {
    git(dossier, ...args);
    return true;
  } catch {
    return false;
  }
}

function origineMain(depot) {
  try {
    return git(depot, "rev-parse", "--verify", "--quiet", "refs/remotes/origin/main^{commit}").trim();
  } catch {
    return undefined;
  }
}

/*
 * A' : le HEAD du catalogue, ou --vers. On ne reporte dans une appli que ce que
 * main a reçu : une branche du catalogue non fusionnée n'a été ni relue ni
 * vérifiée par sa CI (même vérification que l'étape 0 de creer-appli). Pas de
 * fetch : le dire suffit, la personne sait le faire.
 */
function commitVise(catalogue, vers) {
  const main = origineMain(catalogue);
  if (main === undefined) {
    throw new ErreurMiseAJour(
      "Le catalogue n'a pas de origin/main : git fetch origin dans le catalogue, puis relancer."
    );
  }
  let sha;
  if (vers === undefined) {
    if (git(catalogue, "status", "--porcelain").trim() !== "") {
      throw new ErreurMiseAJour(
        "Le catalogue a des modifications non commitées : son HEAD, le commit visé, ne dirait pas ce qui est reporté. " +
          "Commiter ou mettre de côté (git status dans le catalogue), ou viser un commit par --vers."
      );
    }
    sha = git(catalogue, "rev-parse", "HEAD").trim();
    if (sha !== main) {
      throw new ErreurMiseAJour(
        "Le HEAD du catalogue n'est pas origin/main : on ne reporte dans une appli que ce que main a reçu. " +
          "git fetch origin puis git pull sur main dans le catalogue, ou viser un commit de main par --vers."
      );
    }
  } else {
    try {
      sha = git(catalogue, "rev-parse", "--verify", "--quiet", `${vers}^{commit}`).trim();
    } catch {
      throw new ErreurMiseAJour(
        `--vers ${vers} : commit introuvable dans le catalogue (git fetch origin, puis relancer).`
      );
    }
    if (!reussit(catalogue, "merge-base", "--is-ancestor", sha, main)) {
      throw new ErreurMiseAJour(
        `--vers ${vers} n'est pas sur origin/main du catalogue : on ne reporte dans une appli que ce que main a reçu.`
      );
    }
  }
  return { sha, court: git(catalogue, "rev-parse", "--short", sha).trim() };
}

/*
 * La branche part du main publié de l'appli (solstice-livrer §1) : le HEAD du
 * dossier donné doit être son origin/main. Pas de fetch non plus : l'outil
 * n'appelle pas le réseau pour l'appli.
 */
function verifierLaBranche(appli, branche) {
  if (!reussit(appli, "check-ref-format", "--branch", branche)) {
    throw new ErreurMiseAJour(
      `« ${branche} » n'est pas un nom de branche que git accepte : en donner un autre par --branche (<type>/<slug>).`
    );
  }
  const main = origineMain(appli);
  if (main === undefined) {
    throw new ErreurMiseAJour(
      "L'appli n'a pas de origin/main, d'où part la branche : git fetch origin dans l'appli (ou pousser son main d'abord), puis relancer."
    );
  }
  if (git(appli, "rev-parse", "HEAD").trim() !== main) {
    throw new ErreurMiseAJour(
      "Le HEAD de l'appli n'est pas son origin/main : la branche part de son main publié et à jour (solstice-livrer §1). " +
        "git fetch origin dans l'appli, puis relancer sur un worktree à origin/main (git worktree add --detach <dossier> origin/main)."
    );
  }
  if (reussit(appli, "show-ref", "--verify", "--quiet", `refs/heads/${branche}`)) {
    throw new ErreurMiseAJour(`La branche ${branche} existe déjà dans l'appli : en nommer une autre par --branche.`);
  }
}

// ---------------------------------------------------------------- chaque fichier

// Ont leur propre traitement : l'en-tête de la blueprint est réécrit, le
// manifeste remplacé par celui de la cible.
const HORS_DE_LA_TABLE = new Set(["blueprint.md", MANIFESTE]);
const VERROU = "package-lock.json";
// La tranche 3 de la note : une fusion de texte placerait les étapes au mauvais rang.
const MIGRATIONS = ["src/lib/db/migrations.ts", "src/lib/db/schema.sql"];
const REGISTRE = "src/config/donnees-personnelles.ts";
// Le patron des modules métier : sa correction n'atteint pas les modules que l'appli en a copiés.
const PATRON_DOSSIERS = "src/lib/db/dossiers.ts";

const egaux = (a, b) => (a === undefined ? b === undefined : b !== undefined && a.equals(b));

// L'heuristique de git : un octet nul dans les premiers 8 000.
const estBinaire = (contenu) => contenu !== undefined && contenu.subarray(0, 8000).includes(0);

/*
 * La fusion à trois de git, sur des fichiers temporaires écrits depuis les
 * commits. Le style diff3 garde l'origine entre les deux versions d'un conflit :
 * l'appli ne l'a nulle part ailleurs, et c'est elle qui dit ce que chacun a changé.
 */
function fusionnerATrois(dossier, chemin, { origine, cible, appli }, { commitOrigine, commitCible }) {
  fs.mkdirSync(dossier, { recursive: true });
  const [fichierAppli, fichierOrigine, fichierCible] = ["appli", "origine", "cible"].map((nom) =>
    path.join(dossier, nom)
  );
  fs.writeFileSync(fichierAppli, appli);
  fs.writeFileSync(fichierOrigine, origine);
  fs.writeFileSync(fichierCible, cible);
  const resultat = spawnSync(
    "git",
    [
      "merge-file",
      "-p",
      "--diff3",
      "-L",
      "appli",
      "-L",
      `origine (catalogue ${commitOrigine})`,
      "-L",
      `cible (catalogue ${commitCible})`,
      fichierAppli,
      fichierOrigine,
      fichierCible,
    ],
    { env: environnementDeGit(), maxBuffer: 256 * 1024 * 1024 }
  );
  // git rend le nombre de conflits, borné à 127, et une valeur négative en cas d'erreur :
  // un conflit n'est pas un échec, les marqueurs sont le résultat attendu.
  if (resultat.error || resultat.status === null || resultat.status > 127) {
    throw new ErreurMiseAJour(
      `git merge-file a échoué sur ${chemin} : ${resultat.stderr?.toString().trim() || resultat.error?.message}`
    );
  }
  return { contenu: resultat.stdout, conflits: resultat.status };
}

/*
 * La table « Ce qu'il fait de chaque fichier » d'outils/mise-a-jour.md. Les
 * fichiers absents de l'origine comme de la cible sont à l'appli : jamais lus.
 * `ecritures` : le contenu à écrire, ou null pour supprimer.
 */
function planifierLesFichiers({ origine, cible, appli, fusionner }) {
  const fichiers = {
    remplaces: [],
    ajoutes: [],
    supprimes: [],
    fusionnes: [],
    enConflit: [],
    supprimesParLAppli: [],
    retouchesRetires: [],
    binairesRetouches: [],
  };
  const ecritures = new Map();
  let verrou = "inchangé";
  for (const chemin of [...new Set([...origine.keys(), ...cible.keys()])].sort()) {
    if (HORS_DE_LA_TABLE.has(chemin)) continue;
    const o = origine.get(chemin);
    const c = cible.get(chemin);
    const p = appli.get(chemin);
    if (egaux(o, c)) continue;
    if (o === undefined) {
      // Présent dans l'appli, il a été refusé avant.
      fichiers.ajoutes.push(chemin);
      ecritures.set(chemin, c);
    } else if (p === undefined) {
      if (c !== undefined) fichiers.supprimesParLAppli.push(chemin);
      if (chemin === VERROU) verrou = "absent de l'appli";
    } else if (c === undefined) {
      if (p.equals(o)) {
        fichiers.supprimes.push(chemin);
        ecritures.set(chemin, null);
      } else {
        // Un renommage au catalogue perdrait sinon les retouches de l'appli.
        fichiers.retouchesRetires.push(chemin);
      }
    } else if (p.equals(o)) {
      fichiers.remplaces.push(chemin);
      ecritures.set(chemin, c);
      if (chemin === VERROU) verrou = "remplacé";
    } else if (chemin === VERROU) {
      // Un verrou ne se fusionne pas en texte : npm install le régénère.
      verrou = "à régénérer";
    } else if ([o, c, p].some(estBinaire)) {
      fichiers.binairesRetouches.push(chemin);
    } else {
      const { contenu, conflits } = fusionner(chemin, { origine: o, cible: c, appli: p });
      ecritures.set(chemin, contenu);
      (conflits > 0 ? fichiers.enConflit : fichiers.fusionnes).push(chemin);
    }
  }
  return { fichiers, ecritures, verrou };
}

// Ce que l'outil a fait d'un fichier, dit au rapport.
const SORTS = {
  remplaces: "remplacé par la cible (intact dans l'appli)",
  ajoutes: "ajouté",
  supprimes: "supprimé (intact dans l'appli)",
  fusionnes: "fusionné, à relire",
  enConflit: "en conflit, marqueurs à résoudre",
  supprimesParLAppli: "supprimé par l'appli, changé au catalogue : laissé absent, à trancher",
  retouchesRetires: "retouché par l'appli, retiré du catalogue : gardé, à trancher",
  binairesRetouches: "binaire retouché par l'appli, changé au catalogue : gardé, à trancher",
};

function sortDe(fichiers, chemin) {
  const liste = Object.keys(SORTS).find((cle) => fichiers[cle].includes(chemin));
  return liste === undefined ? undefined : SORTS[liste];
}

/*
 * L'en-tête de blueprint.md : commit_reference devient A', briques_assemblees
 * reçoit les briques ajoutées (décision 5 de la note). Le corps reste à l'appli.
 * Lue en LF, comme l'assembleur la lit. undefined : pas d'en-tête à réécrire ;
 * `aReprendre` : une liste de briques écrite en bloc, qu'une réécriture ligne à
 * ligne doublerait.
 */
function reecrireLEntete(brut, { commit, ajoutees }) {
  const markdown = brut.replace(/\r\n/g, "\n");
  const entete = /^---\n([\s\S]*?)\n---(?=\n|$)/.exec(markdown);
  if (!entete) return undefined;
  let aReprendre = false;
  let lignes = entete[1];
  const reference = `commit_reference: ${commit}`;
  lignes = /^commit_reference:.*$/m.test(lignes)
    ? lignes.replace(/^commit_reference:.*$/m, reference)
    : `${lignes}\n${reference}`;
  if (ajoutees.length > 0) {
    const liste = /^briques_assemblees:[ \t]*\[(.*)\][ \t]*$/m.exec(lignes);
    if (liste) {
      const noms = liste[1]
        .split(",")
        .map((nom) => nom.trim())
        .filter(Boolean);
      const toutes = [...noms, ...ajoutees.filter((nom) => !noms.includes(nom))];
      lignes = lignes.replace(liste[0], `briques_assemblees: [${toutes.join(", ")}]`);
    } else if (/^briques_assemblees:/m.test(lignes)) {
      aReprendre = true;
    } else {
      lignes = `${lignes}\nbriques_assemblees: [${ajoutees.join(", ")}]`;
    }
  }
  return { texte: `---\n${lignes}\n---${markdown.slice(entete[0].length)}`, aReprendre };
}

// Les briques que l'appli a reçues, d'après un manifeste au format 2, ou les réglages déduits.
function briquesRecues(manifeste, reglages) {
  if (manifeste.format === 2) {
    return [...manifeste.assemblage.briques, ...manifeste.assemblage.ajouteesDOffice.map(({ nom }) => nom)];
  }
  return reglages.briques;
}

// ---------------------------------------------------------------- ce que le rapport recopie

const texteDe = (contenu) => contenu?.toString("utf-8") ?? "";

/*
 * Les entrées des CHANGELOG.md des briques de l'appli, de A à A' : les sections
 * « ## » de la cible absentes de l'origine (la règle d'entretien les ajoute en
 * fin). Un dernier segment de titre qui commence par « Rupture » (« Rupture pour
 * qui l'importait », dans echeances) : un appelant de l'appli doit changer.
 */
function entreesDesJournaux(origine, cible) {
  const sections = (contenu) =>
    texteDe(contenu)
      .split(/^(?=## )/m)
      .filter((section) => section.startsWith("## "))
      .map((section) => section.trimEnd());
  const entrees = [];
  for (const chemin of [...cible.keys()].sort()) {
    const brique = /^src\/briques\/([^/]+)\/CHANGELOG\.md$/.exec(chemin)?.[1];
    if (brique === undefined) continue;
    const connues = new Set(sections(origine.get(chemin)).map((section) => section.split("\n")[0]));
    for (const section of sections(cible.get(chemin))) {
      const titre = section.split("\n")[0];
      if (connues.has(titre)) continue;
      entrees.push({
        brique,
        titre: titre.slice(3),
        corps: section.slice(titre.length).trim(),
        rupture: /·\s*Rupture[^·]*$/.test(titre),
      });
    }
  }
  // Les ruptures d'abord ; l'ordre des briques et des dates ensuite.
  return [...entrees.filter(({ rupture }) => rupture), ...entrees.filter(({ rupture }) => !rupture)];
}

// Le sujet des commits de A à A' qui touchent un fichier du socle reçu par
// l'appli : le socle n'a pas de CHANGELOG.md (décision 6 de la note).
function commitsDuSocle(catalogue, de, a, chemins) {
  const sortie = git(catalogue, "log", "--no-merges", "--reverse", "--format=%x00%h %s", "--name-only", `${de}..${a}`);
  return sortie
    .split("\0")
    .slice(1)
    .map((bloc) => bloc.split("\n").filter(Boolean))
    .filter(([, ...touches]) => touches.some((chemin) => chemins.has(chemin)))
    .map(([sujet]) => sujet);
}

const VARIABLES = {
  ".env.example": /^#?[ \t]*([A-Z][A-Z0-9_]*)=/gm,
  "render.yaml": /^[ \t]*-[ \t]*key:[ \t]*([A-Z][A-Z0-9_]*)/gm,
};

// Les variables que la cible déclare et que l'origine ne déclarait pas.
function variablesNouvelles(origine, cible) {
  const noms = (contenu, motif) => new Set([...texteDe(contenu).matchAll(motif)].map((trouve) => trouve[1]));
  const nouvelles = [];
  for (const [chemin, motif] of Object.entries(VARIABLES)) {
    const avant = noms(origine.get(chemin), motif);
    for (const nom of noms(cible.get(chemin), motif)) {
      if (!avant.has(nom) && !nouvelles.some((variable) => variable.nom === nom)) nouvelles.push({ nom, chemin });
    }
  }
  return nouvelles;
}

/*
 * Les traitements de la politique de confidentialité, dans les
 * src/briques/<brique>/confidentialite.ts de l'appli : ceux qui arrivent (une
 * clé neuve) et les fichiers dont le texte change.
 */
function traitementsChanges(origine, cible) {
  const cles = (contenu) =>
    new Set([...texteDe(contenu).matchAll(/^[ \t]+cle: "([^"]+)",$/gm)].map((trouve) => trouve[1]));
  const ajoutes = [];
  const changes = [];
  for (const chemin of [...new Set([...origine.keys(), ...cible.keys()])].sort()) {
    if (!/^src\/briques\/[^/]+\/confidentialite\.ts$/.test(chemin) || !cible.has(chemin)) continue;
    if (egaux(origine.get(chemin), cible.get(chemin))) continue;
    const avant = cles(origine.get(chemin));
    for (const cle of cles(cible.get(chemin))) if (!avant.has(cle)) ajoutes.push({ cle, chemin });
    changes.push(chemin);
  }
  return { ajoutes, changes };
}

// Les dossiers qui mènent à un chemin, du plus haut au plus bas : « a/b/c » donne a, a/b.
const dossiersDe = (chemin) =>
  chemin
    .split("/")
    .slice(0, -1)
    .map((_, i, parties) => parties.slice(0, i + 1).join("/"));

/*
 * Les fichiers neufs de la cible qui heurtent un fichier de l'appli : au même
 * chemin, au même chemin à la casse près (un disque Windows ou macOS ne les
 * distingue pas, l'un écraserait l'autre), sous un de ses fichiers, ou au chemin
 * d'un de ses dossiers. Constatés avant toute écriture.
 */
function fichiersOccupes({ origine, cible, appli }) {
  const fichiersDeLAppli = new Map([...appli.keys()].map((chemin) => [chemin.toLowerCase(), chemin]));
  const dossiersDeLAppli = new Set([...appli.keys()].flatMap((chemin) => dossiersDe(chemin.toLowerCase())));
  const occupes = [];
  for (const chemin of [...cible.keys()].sort()) {
    if (HORS_DE_LA_TABLE.has(chemin) || origine.has(chemin)) continue;
    const minuscules = chemin.toLowerCase();
    const parent = dossiersDe(minuscules).find((dossier) => fichiersDeLAppli.has(dossier));
    const heurte =
      fichiersDeLAppli.get(minuscules) ??
      (parent === undefined ? undefined : fichiersDeLAppli.get(parent)) ??
      (dossiersDeLAppli.has(minuscules) ? `un dossier de l'appli` : undefined);
    if (heurte !== undefined) occupes.push(heurte === chemin ? chemin : `${chemin} (heurte ${heurte})`);
  }
  return occupes;
}

// ---------------------------------------------------------------- la mise à jour

const RAPPORT = "catalogue-mise-a-jour.md";

function supprimerDansLAppli(racine, chemin) {
  fs.rmSync(path.join(racine, chemin), { force: true });
  // Les dossiers vidés partent avec : git ne les suit pas.
  let dossier = path.dirname(path.join(racine, chemin));
  while (dossier !== racine && fs.existsSync(dossier) && fs.readdirSync(dossier).length === 0) {
    fs.rmdirSync(dossier);
    dossier = path.dirname(dossier);
  }
}

/**
 * Reporte dans l'appli le catalogue du commit visé (le HEAD du catalogue, ou
 * `vers`), avec les mêmes briques. Écrit sur la branche neuve `branche`, sans
 * commit ; `aBlanc` : rien n'est écrit, le résultat dit ce qui le serait.
 * @param {{ catalogue: string, appli: string, vers?: string, branche?: string, aBlanc?: boolean }} options
 */
export function mettreAJour({ catalogue, appli, vers, branche, aBlanc = false }) {
  const dossierAppli = path.resolve(appli);
  const racineCatalogue = path.resolve(catalogue);
  const lecture = lireLAppli(dossierAppli);
  const { manifeste, contenus } = lecture;
  const commitOrigine = manifeste.catalogue.commit;
  const shaOrigine = commitDuCatalogue(racineCatalogue, manifeste);
  const { sha: shaCible, court: commitCible } = commitVise(racineCatalogue, vers);
  // À blanc, une appli déjà au commit visé reçoit quand même le rapport : il dit
  // ce qu'elle a retouché, l'usage de la première tranche.
  if (shaCible === shaOrigine && !aBlanc) {
    throw new ErreurMiseAJour(`L'appli est déjà au commit ${commitCible} du catalogue : rien à reporter.`);
  }
  if (!reussit(racineCatalogue, "merge-base", "--is-ancestor", shaOrigine, shaCible)) {
    throw new ErreurMiseAJour(
      `Le commit visé ${commitCible} ne descend pas du commit ${commitOrigine} de l'appli : l'outil reporte un catalogue plus récent, jamais un autre.`
    );
  }
  const nomDeBranche = branche ?? `feature/reporter-catalogue-${commitCible}`;
  if (!aBlanc) verifierLaBranche(dossierAppli, nomDeBranche);

  return avecUnDossierTemporaire((temporaire) => {
    const examen = examinerDans(temporaire, { racineCatalogue, dossierAppli, lecture, sha: shaOrigine });
    const { origine } = examen;
    const { contenus: cible } =
      shaCible === shaOrigine
        ? { contenus: origine }
        : rejouer({
            catalogue: racineCatalogue,
            temporaire,
            nom: "cible",
            sha: shaCible,
            commit: commitCible,
            reglagesDe: (briques) => {
              const inconnue = examen.reglages.briques.find((nom) => !briques.includes(nom));
              if (inconnue !== undefined) {
                throw new ErreurMiseAJour(
                  `La brique « ${inconnue} » de l'appli est inconnue au commit ${commitCible} du catalogue (renommée ou retirée) : ` +
                    "son CHANGELOG.md dit ce qu'elle est devenue ; viser par --vers un commit où elle existe encore."
                );
              }
              return examen.reglages;
            },
          });

    // Les arrêts viennent avant toute écriture : un refus ne laisse ni branche ni fichier.
    const migrations = MIGRATIONS.filter((chemin) => !egaux(origine.get(chemin), cible.get(chemin)));
    if (migrations.length > 0) {
      throw new ErreurMiseAJour(
        `Du commit ${commitOrigine} au commit ${commitCible}, ${migrations.join(" et ")} change : le report des étapes de migration ` +
          "n'est pas encore outillé (tranche 3 de outils/mise-a-jour.md), et une fusion de texte les placerait au mauvais rang. " +
          "Viser par --vers un commit antérieur à ce changement."
      );
    }
    const occupes = fichiersOccupes({ origine, cible, appli: contenus });
    if (occupes.length > 0) {
      throw new ErreurMiseAJour(
        `Le catalogue apporte au commit ${commitCible} des fichiers neufs au chemin d'un fichier de l'appli :\n` +
          `${occupes.map((chemin) => `  - ${chemin}`).join("\n")}\n` +
          "Le manifeste réécrit les donnerait pour venus du catalogue, et l'opération suivante les fusionnerait avec les siens : " +
          "renommer d'abord ceux de l'appli (un commit, publié sur son main), puis relancer."
      );
    }

    const { fichiers, ecritures, verrou } = planifierLesFichiers({
      origine,
      cible,
      appli: contenus,
      fusionner: (chemin, versions) =>
        fusionnerATrois(path.join(temporaire, "fusion"), chemin, versions, { commitOrigine, commitCible }),
    });

    const manifesteCible = JSON.parse(cible.get(MANIFESTE).toString("utf-8"));
    const avant = briquesRecues(manifeste, examen.reglages);
    const briques = briquesRecues(manifesteCible, examen.reglages);
    const ajoutees = briques.filter((nom) => !avant.includes(nom));
    const avertissements = [...examen.resultat.avertissements];
    let blueprint;
    if (contenus.has("blueprint.md")) {
      const reecrite = reecrireLEntete(texteDe(contenus.get("blueprint.md")), { commit: commitCible, ajoutees });
      blueprint = reecrite?.texte;
      if (reecrite?.aReprendre) {
        avertissements.push(
          `blueprint.md écrit briques_assemblees en bloc : ${ajoutees.join(", ")} y sont à ajouter à la main.`
        );
      }
      if (reecrite === undefined) {
        avertissements.push(
          "blueprint.md n'a pas d'en-tête : commit_reference n'y est pas noté, à reprendre à la main."
        );
      }
    } else {
      avertissements.push("L'appli n'a pas de blueprint.md : commit_reference n'est noté que dans le manifeste.");
    }

    const socle = new Set(
      [manifeste.fichiers, manifesteCible.fichiers].flatMap((liste) =>
        Object.entries(liste)
          .filter(([, { unite }]) => unite === "socle")
          .map(([chemin]) => chemin)
      )
    );
    const resultat = {
      appli: dossierAppli,
      paquet: examen.reglages.paquet,
      format: manifeste.format,
      briques,
      ajoutees,
      commitOrigine,
      commitCible,
      branche: nomDeBranche,
      aBlanc,
      retouchesAvant: examen.resultat.retouches,
      supprimesAvant: examen.resultat.supprimes,
      fichiers,
      verrou,
      paquetJson: egaux(origine.get("package.json"), cible.get("package.json"))
        ? "inchangé au catalogue"
        : sortDe(fichiers, "package.json"),
      journaux: entreesDesJournaux(origine, cible),
      commitsDuSocle: commitsDuSocle(racineCatalogue, shaOrigine, shaCible, socle),
      variables: variablesNouvelles(origine, cible),
      traitements: traitementsChanges(origine, cible),
      registre: !cible.has(REGISTRE)
        ? undefined
        : egaux(origine.get(REGISTRE), cible.get(REGISTRE))
          ? "inchangé au catalogue"
          : (sortDe(fichiers, REGISTRE) ?? "changé au catalogue"),
      notifications: briques.includes("notifications"),
      deploiement: briques.includes("deploiement"),
      base: cible.has(MIGRATIONS[0]),
      patronDossiers: !egaux(origine.get(PATRON_DOSSIERS), cible.get(PATRON_DOSSIERS)),
      tokens: !egaux(origine.get("src/ui/theme/tokens.css"), cible.get("src/ui/theme/tokens.css")),
      blueprint: blueprint === undefined ? "non réécrite" : "réécrite",
      avertissements,
      fichierDuRapport: null,
    };
    if (aBlanc) return resultat;

    git(dossierAppli, "switch", "--quiet", "-c", nomDeBranche);
    try {
      for (const [chemin, contenu] of ecritures) {
        if (contenu === null) {
          supprimerDansLAppli(dossierAppli, chemin);
        } else {
          fs.mkdirSync(path.dirname(path.join(dossierAppli, chemin)), { recursive: true });
          fs.writeFileSync(path.join(dossierAppli, chemin), contenu);
        }
      }
      fs.writeFileSync(path.join(dossierAppli, MANIFESTE), cible.get(MANIFESTE));
      if (blueprint !== undefined) fs.writeFileSync(path.join(dossierAppli, "blueprint.md"), blueprint);
    } catch (erreur) {
      // Un fichier verrouillé (un serveur de développement ouvert sous Windows) arrête
      // l'écriture en route : la branche est à moitié écrite, et rien ne se commite.
      throw new ErreurMiseAJour(
        `L'écriture dans l'appli a échoué en route (${erreur.message}) : la branche ${nomDeBranche} est à moitié écrite. ` +
          "Pour revenir au main publié de l'appli : git switch --discard-changes --detach origin/main, git clean -fd, " +
          `git branch -D ${nomDeBranche} ; puis lever la cause (fermer ce qui tient le fichier) et relancer.`
      );
    }
    // Dans le dossier git de l'appli : hors de l'arbre suivi, il ne part pas au
    // prochain git add, et chaque worktree a le sien.
    resultat.fichierDuRapport = path.resolve(
      dossierAppli,
      git(dossierAppli, "rev-parse", "--git-path", RAPPORT).trim()
    );
    fs.writeFileSync(resultat.fichierDuRapport, rapport(resultat));
    return resultat;
  });
}

// ---------------------------------------------------------------- le rapport

const code = (texte) => `\`${texte}\``;

function rubriqueDesFichiers(resultat) {
  const lignes = ["## Fichiers", ""];
  const { fichiers } = resultat;
  const listes = [
    ["enConflit", "En conflit, marqueurs à résoudre (`git diff --check` les trouve)"],
    ["fusionnes", "Fusionnés, à relire : sans conflit de texte, pas forcément justes sur le fond"],
    ["supprimesParLAppli", "Supprimés par l'appli et changés au catalogue : laissés absents, à trancher"],
    ["retouchesRetires", "Retouchés par l'appli et retirés du catalogue : gardés, à trancher"],
    ["binairesRetouches", "Binaires retouchés par l'appli et changés au catalogue : gardés, à trancher"],
    ["remplaces", "Remplacés par la cible, intacts dans l'appli"],
    ["ajoutes", "Ajoutés"],
    ["supprimes", "Supprimés, intacts dans l'appli"],
  ];
  let rien = true;
  for (const [cle, titre] of listes) {
    if (fichiers[cle].length === 0) continue;
    rien = false;
    lignes.push(`${titre} (${fichiers[cle].length}) :`, ...fichiers[cle].map((chemin) => `- ${code(chemin)}`), "");
  }
  if (rien) lignes.push("Aucun fichier venu du catalogue ne change.", "");
  // Ce que l'appli a changé et que le catalogue ne touche pas : rien à faire, mais
  // c'est ce que montrait seule la première tranche, et une relecture le cherche.
  const touches = new Set(Object.values(fichiers).flat());
  for (const [avant, titre] of [
    [resultat.retouchesAvant, "Retouchés par l'appli, que le catalogue ne change pas : laissés tels quels"],
    [resultat.supprimesAvant, "Supprimés par l'appli, que le catalogue ne change pas : laissés absents"],
  ]) {
    const restes = avant.filter((chemin) => !touches.has(chemin));
    if (restes.length > 0)
      lignes.push(`${titre} (${restes.length}) :`, ...restes.map((chemin) => `- ${code(chemin)}`), "");
  }
  lignes.push("Les fichiers créés par l'appli ne sont ni lus ni touchés.", "");
  return lignes;
}

function rubriqueDesDependances(resultat) {
  const verrou = {
    inchangé: "inchangé au catalogue.",
    remplacé: "remplacé par celui de la cible (intact dans l'appli).",
    "absent de l'appli": "supprimé par l'appli, changé au catalogue : laissé absent, à trancher.",
    "à régénérer":
      "retouché par l'appli, laissé tel quel : lancer `npm install` dans l'appli pour le régénérer, puis `npm ci`.",
  }[resultat.verrou];
  return [
    "## Dépendances npm",
    "",
    `- ${code("package.json")} : ${resultat.paquetJson ?? "absent de l'appli"}.`,
    `- ${code(VERROU)} : ${verrou}`,
    "",
  ];
}

function rubriqueDesJournaux(resultat) {
  const lignes = [
    "## Journal des briques",
    "",
    `Les entrées ajoutées aux ${code("CHANGELOG.md")} des briques de l'appli, ruptures en tête : une « Rupture » veut dire qu'un appelant de l'appli doit changer.`,
    "",
  ];
  if (resultat.journaux.length === 0) return [...lignes, "Aucune entrée nouvelle.", ""];
  for (const { brique, titre, corps } of resultat.journaux) {
    lignes.push(`### ${brique} · ${titre}`, "", corps, "");
  }
  return lignes;
}

function rubriqueDuSocle(resultat) {
  const lignes = [
    "## Socle",
    "",
    "Le socle n'a pas de journal : les sujets des commits du catalogue qui touchent un de ses fichiers reçus par l'appli.",
    "",
  ];
  if (resultat.commitsDuSocle.length === 0) return [...lignes, "Aucun.", ""];
  return [...lignes, ...resultat.commitsDuSocle.map((sujet) => `- ${sujet}`), ""];
}

function rubriqueDesVariables(resultat) {
  const lignes = ["## Variables d'environnement", ""];
  if (resultat.variables.length === 0) return [...lignes, "Aucune variable nouvelle.", ""];
  return [
    ...lignes,
    "Nouvelles, à déclarer chez l'hébergeur avant la fusion si l'appli en a besoin (le commentaire de leur fichier le dit) :",
    ...resultat.variables.map(({ nom, chemin }) => `- ${code(nom)} (${code(chemin)})`),
    "",
  ];
}

function rubriqueDeLaConfidentialite(resultat) {
  const { ajoutes, changes } = resultat.traitements;
  const lignes = ["## Confidentialité", ""];
  if (ajoutes.length === 0 && changes.length === 0) {
    return [...lignes, "Aucun traitement ajouté ni changé : la politique publiée ne change pas.", ""];
  }
  if (ajoutes.length > 0) {
    lignes.push(
      `- Traitements ajoutés, choix (base légale, durée, destinataires) à faire valider par le client puis à remplir dans ${code("CONFIDENTIALITE.choix")} : ${ajoutes.map(({ cle, chemin }) => `${code(cle)} (${code(chemin)})`).join(", ")}. L'outil n'en remplit aucun.`,
      "- Le registre des traitements du client, hors du code, est à tenir par lui : il reçoit ces traitements."
    );
  }
  if (changes.length > 0) {
    lignes.push(
      `- Texte changé, la politique publiée change, à relire avec le client : ${changes.map(code).join(", ")}.`
    );
  }
  lignes.push(
    `- La date de mise à jour de la politique (${code("miseAJour")} de ${code("src/lib/confidentialite.ts")}) est à changer avec.`
  );
  if (resultat.notifications) {
    lignes.push(
      `- Une durée réglée dans un branchement (${code("conservationMois")} de la brique notifications) doit redire la durée annoncée.`
    );
  }
  return [...lignes, ""];
}

function rubriqueDuRegistre(resultat) {
  const lignes = ["## Registre RGPD", ""];
  if (resultat.registre === undefined) {
    return [...lignes, "L'appli n'a pas de registre (pas de brique rgpd) : rien à faire.", ""];
  }
  lignes.push(`${code(REGISTRE)} : ${resultat.registre}.`);
  if (resultat.registre !== "inchangé au catalogue") {
    lignes.push(
      "",
      `Un conflit s'y tranche en gardant l'ordre de ${code("SOURCES")} (l'effacement le parcourt à l'envers, ${code("SOURCES_COMPTES")} en tête). ` +
        `${code("tests/rgpd-export.test.ts")} refuse une table oubliée, ${code("tests/rgpd-effacement.test.ts")} vérifie l'ordre.`
    );
  }
  return [...lignes, ""];
}

function rubriqueDeLaFusion(resultat) {
  return [
    "## Ce que la fusion déclenche",
    "",
    resultat.deploiement
      ? "- Déploiement : avec la brique deploiement, la fusion sur `main` déploie l'appli (job `deployer` de sa CI)."
      : "- Déploiement : sans la brique deploiement, il suit le réglage de l'hébergeur de l'appli, souvent à chaque fusion sur `main`.",
    resultat.base
      ? `- Migrations : aucune étape ne part avec ce report, ${code(MIGRATIONS[0])} et ${code(MIGRATIONS[1])} sont les mêmes à l'origine et à la cible.`
      : "- Migrations : aucune, l'appli n'a pas de base.",
    ...(resultat.patronDossiers
      ? [
          `- Le patron des modules métier change (${code(PATRON_DOSSIERS)}) : les modules que l'appli en a copiés ne reçoivent pas la correction, la leur reporter est un ticket de l'appli.`,
        ]
      : []),
    resultat.variables.length > 0
      ? "- Les variables nouvelles ci-dessus, à déclarer chez l'hébergeur avant que le code qui les lit ne tourne."
      : "- Aucune variable à déclarer.",
    "",
  ];
}

function rubriqueDeLaSuite(resultat) {
  const humain = [
    "fusionner la PR",
    ...(resultat.variables.length > 0 ? ["déclarer les variables nouvelles chez l'hébergeur"] : []),
    ...(resultat.traitements.ajoutes.length + resultat.traitements.changes.length > 0
      ? ["faire valider par le client les choix de confidentialité"]
      : []),
    ...(resultat.tokens
      ? [`choisir la valeur du client pour un token ajouté à ${code("src/ui/theme/tokens.css")}`]
      : []),
    "valider le rendu des écrans changés",
  ];
  const { fichiers } = resultat;
  const aTrancher =
    fichiers.supprimesParLAppli.length + fichiers.retouchesRetires.length + fichiers.binairesRetouches.length;
  return [
    "## Ensuite, dans une session ouverte dans l'appli",
    "",
    ...(fichiers.enConflit.length > 0
      ? ["- Résoudre les conflits listés ; relire les fusions."]
      : ["- Relire les fusions."]),
    ...(aTrancher > 0 ? ["- Trancher les fichiers signalés, que l'outil n'a pas écrits."] : []),
    ...(resultat.verrou === "à régénérer"
      ? ["- `npm install` pour régénérer le verrou, puis `npm ci`."]
      : ["- `npm ci`."]),
    `- Les vérifications du ${code("CLAUDE.md")} de l'appli (§6), la relecture par sous-agents, le commit, puis la PR avec ce rapport (skill ${code("solstice-livrer")}).`,
    `- Restent à un humain : ${humain.join(", ")}.`,
    "",
  ];
}

/** Le rapport d'une mise à jour, en Markdown : le corps de la PR de l'appli. */
export function rapport(resultat) {
  const lignes = [
    `# Reporter le catalogue de ${resultat.commitOrigine} à ${resultat.commitCible}`,
    "",
    `Appli ${code(resultat.paquet)}, briques : ${resultat.briques.length === 0 ? "aucune" : resultat.briques.join(", ")}.`,
    resultat.aBlanc
      ? "À blanc : rien n'est écrit dans l'appli."
      : `Écrit sur la branche ${code(resultat.branche)}, partie du main publié de l'appli, sans commit.`,
    "",
    ...rubriqueDesFichiers(resultat),
    ...rubriqueDesDependances(resultat),
    ...rubriqueDesJournaux(resultat),
    ...rubriqueDuSocle(resultat),
    ...rubriqueDesVariables(resultat),
    ...rubriqueDeLaConfidentialite(resultat),
    ...rubriqueDuRegistre(resultat),
    ...rubriqueDeLaFusion(resultat),
    "## Manifeste et blueprint",
    "",
    `- ${code(MANIFESTE)} : celui de la cible, commit ${resultat.commitCible}, une empreinte par fichier venu du catalogue, retouché ou non.`,
    resultat.blueprint === "réécrite"
      ? `- ${code("blueprint.md")} : ${code("commit_reference")} passe à ${resultat.commitCible}${resultat.ajoutees.length > 0 ? `, ${code("briques_assemblees")} reçoit ${resultat.ajoutees.join(", ")}` : ""} ; le corps ne change pas.`
      : `- ${code("blueprint.md")} : non réécrite (voir plus bas).`,
    ...resultat.avertissements.map((texte) => `- Attention : ${texte}`),
    "",
    ...rubriqueDeLaSuite(resultat),
  ];
  return `${lignes.join("\n").trimEnd()}\n`;
}

// ---------------------------------------------------------------- ligne de commande

const AIDE = `Usage : node outils/mettre-a-jour.mjs <dossier-de-l-appli> [--vers <commit>] [--branche <nom>] [--a-blanc]

Reporte dans l'appli le catalogue d'un commit plus récent, avec les mêmes briques
(outils/mise-a-jour.md) : rejoue l'assemblage d'origine (commit et réglages de
son catalogue.empreintes.json), vérifie qu'il redonne les empreintes du
manifeste, rejoue l'assemblage au commit visé, puis traite chaque fichier venu
du catalogue (remplacé, fusionné à trois, ajouté, supprimé, ou laissé et
signalé). Imprime le rapport en Markdown, le corps de la PR de l'appli.

  --vers <commit>   le commit visé, sur origin/main du catalogue
                    (défaut : le HEAD du catalogue, propre et à origin/main)
  --branche <nom>   la branche neuve de l'appli où l'outil écrit
                    (défaut : feature/reporter-catalogue-<commit visé>)
  --a-blanc         le rapport seul : rien n'est écrit dans l'appli

Le dossier est la racine d'un worktree de l'appli à l'arbre propre et, sauf
--a-blanc, dont le HEAD est son origin/main (git fetch origin avant). À blanc,
une appli déjà au commit visé reçoit le rapport de ce qu'elle a retouché.
L'outil crée la branche, y
écrit et ne commite pas ; il s'arrête avant toute écriture si migrations.ts ou
schema.sql changent entre l'origine et la cible (pas encore outillé). Seul appel
au réseau : npm ci dans un worktree temporaire du catalogue, quand le Prettier
d'un commit n'est pas celui qu'a installé le catalogue. L'ajout d'une brique
(--ajouter) n'est pas encore outillé.`;

function lireOptions(argv) {
  const options = { positionnels: [], valeurs: {}, aBlanc: false };
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === "--a-blanc") options.aBlanc = true;
    else if (argument === "--ajouter") {
      throw new ErreurMiseAJour(
        "--ajouter : l'ajout d'une brique n'est pas encore outillé (tranche 4 de outils/mise-a-jour.md). Sans lui, l'outil met à jour vers --vers."
      );
    } else if (argument === "--vers" || argument === "--branche") {
      const valeur = argv[++i];
      if (valeur === undefined || valeur.startsWith("--")) throw new ErreurMiseAJour(`${argument} attend une valeur.`);
      options.valeurs[argument.slice(2)] = valeur;
    } else if (argument.startsWith("-")) throw new ErreurMiseAJour(`Option inconnue « ${argument} ».\n\n${AIDE}`);
    else options.positionnels.push(argument);
  }
  return options;
}

function main(argv) {
  if (argv.length === 0 || argv.includes("--aide") || argv.includes("-h")) {
    console.log(AIDE);
    return;
  }
  const options = lireOptions(argv);
  if (options.positionnels.length !== 1) throw new ErreurMiseAJour(`Un seul dossier d'appli attendu.\n\n${AIDE}`);
  const catalogue = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const resultat = mettreAJour({
    catalogue,
    appli: options.positionnels[0],
    vers: options.valeurs.vers,
    branche: options.valeurs.branche,
    aBlanc: options.aBlanc,
  });
  console.log(rapport(resultat));
  // Sur la sortie d'erreur : la sortie standard est le corps de la PR.
  if (resultat.fichierDuRapport) console.error(`Rapport écrit aussi dans ${resultat.fichierDuRapport}.`);
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
