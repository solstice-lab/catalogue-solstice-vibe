#!/usr/bin/env node
/*
 * Outil de mise à jour des applis assemblées (note de conception :
 * outils/mise-a-jour.md) : reporter dans une appli le catalogue d'un commit
 * plus récent, étapes de migration comprises, ajoutées en fin de liste, ou lui
 * ajouter des briques au commit qu'elle a.
 *
 *   node outils/mettre-a-jour.mjs <dossier-de-l-appli> [--vers <commit> | --ajouter <briques>] [--branche <nom>] [--a-blanc]
 *
 * Les deux sont une seule opération : faire passer l'appli de l'assemblage
 * (commit A, briques B) à l'assemblage (A', B'). Mettre à jour : A' le commit
 * visé, B' = B. Ajouter : A' = A, B' = B plus les briques ajoutées.
 *
 * L'origine d'un fichier n'est pas le fichier du catalogue au commit A :
 * l'assembleur retouche les fichiers partagés selon les briques absentes, puis
 * les remet en forme. L'outil rejoue donc l'assembleur DU COMMIT A, dans un
 * worktree temporaire du catalogue, avec les réglages du manifeste
 * (catalogue.empreintes.json), et vérifie que l'origine rejouée redonne toutes
 * les empreintes du manifeste avant d'en tirer quoi que ce soit. La cible se
 * rejoue de même au commit visé A', puis chaque fichier passe par la table de la
 * note : remplacé, fusionné à trois, ajouté, supprimé, ou laissé et signalé.
 * migrations.ts a son propre traitement : ses étapes se lisent par leur nom, et
 * les neuves s'ajoutent en fin de la liste de l'appli.
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
import { createRequire } from "node:module";
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
  const lue = contenus.get("blueprint.md")?.toString("utf-8");
  const blueprint = lue === undefined ? undefined : sansLeProfil(lue);
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

// La blueprint de l'appli sans le profil de son en-tête : l'assembleur en
// ajouterait les briques à celles des unités, qui sont déjà toutes les briques
// reçues. Un profil ajouté à l'en-tête après coup les aurait fait garder en
// silence au rejeu. Le corps n'est pas touché.
function sansLeProfil(markdown) {
  const entete = /^---\r?\n[\s\S]*?\r?\n---/.exec(markdown)?.[0];
  if (entete === undefined) return markdown;
  return entete.replace(/^profil:.*\r?\n/m, "") + markdown.slice(entete.length);
}

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

// Les briques de outils/modules.mjs au commit rejoué, avec ce que chacune exige et
// entraîne : de quoi refuser un ajout incomplet en le disant, avant l'assemblage.
// Et les profils de départ, avec les briques que chacun admet en plus (`permises`) :
// {} à un commit d'avant les profils.
function definitionsDuCommit(arbre) {
  const script =
    "const { BRIQUES, PROFILS = {} } = await import(donnees.module);" +
    "console.log(JSON.stringify({" +
    "briques: Object.fromEntries(Object.entries(BRIQUES).map(([nom, { exige, entraine }]) => [nom, { exige: exige ?? [], entraine: entraine ?? [] }]))," +
    "profils: Object.fromEntries(Object.entries(PROFILS).map(([nom, { briques, permises }]) => [nom, { briques: briques ?? [], permises: permises ?? null }]))," +
    "}));";
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
 * ce commit et rend les réglages à redonner ; `controler`, s'il est donné,
 * reçoit les définitions des briques de ce commit et ces réglages, et refuse
 * avant le Prettier et l'assemblage, les deux étapes longues. Ce qui en sort se
 * lit dans le commit que l'assembleur a fait, en LF ; le worktree est retiré
 * dans tous les cas.
 */
function rejouer({ catalogue, temporaire, nom, sha, commit, reglagesDe, controler }) {
  const arbre = path.join(temporaire, `catalogue-${nom}`);
  try {
    try {
      git(catalogue, "worktree", "add", "--detach", "--quiet", arbre, sha);
    } catch (erreur) {
      throw new ErreurMiseAJour(
        `Le worktree temporaire du commit ${commit} n'a pas pu être créé : ${erreur.stderr?.trim() || erreur.message}`
      );
    }
    const { briques: definitions, profils } = definitionsDuCommit(arbre);
    const reglages = reglagesDe(Object.keys(definitions));
    controler?.(definitions, reglages, profils);
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
function examinerDans(temporaire, { racineCatalogue, dossierAppli, lecture, sha, controler }) {
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
    controler,
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
// Une fusion de texte placerait les étapes au mauvais rang (« Les migrations » de la note).
const FICHIER_MIGRATIONS = "src/lib/db/migrations.ts";
const SCHEMA = "src/lib/db/schema.sql";
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

// ---------------------------------------------------------------- les étapes de migration

/*
 * Les étapes se lisent dans l'arbre syntaxique du fichier, par le parseur de
 * TypeScript qu'a installé le catalogue, sans exécuter le fichier : une
 * expression régulière se tromperait sur une accolade ou une virgule dans une
 * chaîne de SQL ou un commentaire, et importer le module ferait tourner du code
 * de l'appli dans l'outil. Chargé à la première lecture : l'examen seul (la
 * première tranche) n'en a pas besoin.
 */
const requerir = createRequire(import.meta.url);
let typescript;
function leTypeScript() {
  try {
    typescript ??= requerir("typescript");
  } catch {
    throw new ErreurMiseAJour(
      `Le catalogue n'a pas TypeScript, qui lit les étapes de ${FICHIER_MIGRATIONS} : npm ci dans le catalogue, puis relancer.`
    );
  }
  return typescript;
}

// Ce qui remplace la liste des étapes dans le reste du fichier, passé à la fusion à trois.
const MARQUE_DES_ETAPES = "\n/* outils/mettre-a-jour.mjs : les étapes de MIGRATIONS, lues par leur nom */\n";

/*
 * La liste MIGRATIONS d'un texte : ses étapes, et où elle commence et finit.
 * `quoi` nomme le fichier dans les refus. Une étape : son nom, son texte tel
 * quel (de la ligne de son premier commentaire à son accolade fermante, sans
 * la virgule qui suit), et son code sans les commentaires ni la mise en page,
 * qui dit si elle a changé autrement que par un commentaire.
 */
function lireLaListe(texte, quoi) {
  const ts = leTypeScript();
  const source = ts.createSourceFile("migrations.ts", texte, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const ligneDe = (position) => source.getLineAndCharacterOfPosition(position).line + 1;
  // Les erreurs de lecture, que createSourceFile garde sans les lever. Une version
  // de TypeScript qui ne les donnerait plus là laisserait passer un fichier
  // illisible : elle se refuse.
  if (!Array.isArray(source.parseDiagnostics)) {
    throw new ErreurMiseAJour(
      `TypeScript ${ts.version} ne donne plus les erreurs de lecture où l'outil les lit (parseDiagnostics) : la lecture de ${FICHIER_MIGRATIONS} est à reprendre.`
    );
  }
  const [erreur] = source.parseDiagnostics;
  if (erreur !== undefined) {
    throw new ErreurMiseAJour(
      `${quoi} ne se lit pas comme du TypeScript (ligne ${ligneDe(erreur.start)} : ` +
        `${ts.flattenDiagnosticMessageText(erreur.messageText, " ")}).`
    );
  }
  const declarations = source.statements
    .filter((instruction) => ts.isVariableStatement(instruction))
    .flatMap((instruction) => instruction.declarationList.declarations)
    .filter((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "MIGRATIONS");
  let tableau = declarations.length === 1 ? declarations[0].initializer : undefined;
  while (
    tableau !== undefined &&
    (ts.isAsExpression(tableau) || ts.isSatisfiesExpression(tableau) || ts.isParenthesizedExpression(tableau))
  ) {
    tableau = tableau.expression;
  }
  if (tableau === undefined || !ts.isArrayLiteralExpression(tableau)) {
    throw new ErreurMiseAJour(
      `${quoi} : pas de tableau MIGRATIONS écrit en liste (export const MIGRATIONS: Migration[] = [ … ]), ou plusieurs.`
    );
  }
  const imprimeur = ts.createPrinter({ removeComments: true });
  const nomDe = (propriete) =>
    ts.isIdentifier(propriete) || ts.isStringLiteral(propriete) ? propriete.text : undefined;
  const declares = valeursDuPremierNiveau(ts, source);
  // Un nom de propriété ou de type n'est pas la lecture d'une valeur.
  const litUneValeur = (noeud) => {
    const parent = noeud.parent;
    return !(
      (ts.isPropertyAccessExpression(parent) && parent.name === noeud) ||
      ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent)) && parent.name === noeud) ||
      (ts.isTypeReferenceNode(parent) && parent.typeName === noeud)
    );
  };
  const valeursLues = (element) => {
    const lues = new Set();
    const parcourir = (noeud) => {
      if (ts.isIdentifier(noeud) && declares.has(noeud.text) && litUneValeur(noeud)) lues.add(noeud.text);
      ts.forEachChild(noeud, parcourir);
    };
    parcourir(element);
    return [...lues];
  };
  const etapes = tableau.elements.map((element, rang) => {
    const ou = `${quoi}, ligne ${ligneDe(element.getStart(source))}`;
    if (!ts.isObjectLiteralExpression(element)) {
      throw new ErreurMiseAJour(
        `${ou} : l'étape ${rang + 1} de MIGRATIONS n'est pas un objet écrit dans la liste ({ nom, appliquer }) : l'outil n'y lit pas de nom.`
      );
    }
    const valeur = element.properties.find(
      (propriete) => ts.isPropertyAssignment(propriete) && nomDe(propriete.name) === "nom"
    )?.initializer;
    if (valeur === undefined || !(ts.isStringLiteral(valeur) || ts.isNoSubstitutionTemplateLiteral(valeur))) {
      throw new ErreurMiseAJour(
        `${ou} : le nom de l'étape ${rang + 1} n'est pas une chaîne écrite en clair (nom: "…") : l'outil reconnaît une étape à son nom.`
      );
    }
    // Une étape se compare par son seul texte : si elle lisait une constante ou une
    // fonction déclarée hors de la liste, ce qu'elle joue changerait avec elle sans
    // que l'outil le voie, et une étape déjà jouée en production changerait en silence.
    const [dehors] = valeursLues(element);
    if (dehors !== undefined) {
      throw new ErreurMiseAJour(
        `${ou} : l'étape « ${valeur.text} » lit « ${dehors} », déclaré hors de la liste : ce qu'elle joue changerait avec lui sans que l'outil le voie. ` +
          "L'écrire d'un seul tenant, son SQL dans l'étape."
      );
    }
    // Les commentaires d'avant l'accolade sont à l'étape, sauf celui qui suit la
    // virgule de la précédente sur la même ligne : il est à elle.
    const ligneDuDebut = ligneDe(element.pos);
    const commentaire = (ts.getLeadingCommentRanges(texte, element.pos) ?? []).find(
      ({ pos }) => ligneDe(pos) > ligneDuDebut
    );
    let debut = Math.min(element.getStart(source), commentaire?.pos ?? Infinity);
    const debutDeLigne = texte.lastIndexOf("\n", debut - 1) + 1;
    if (/^[ \t]*$/.test(texte.slice(debutDeLigne, debut))) debut = debutDeLigne;
    return {
      nom: valeur.text,
      texte: texte.slice(debut, element.end),
      code: imprimeur.printNode(ts.EmitHint.Expression, element, source),
    };
  });
  const vus = new Set();
  for (const { nom } of etapes) {
    if (vus.has(nom)) {
      throw new ErreurMiseAJour(
        `« ${nom} » nomme deux fois une étape de MIGRATIONS, dans ${quoi} : l'outil reconnaît une étape à son nom, ` +
          "et l'erreur d'une étape en échec ne dirait plus laquelle."
      );
    }
    vus.add(nom);
  }
  const derniere = tableau.elements.at(-1);
  return {
    etapes,
    ouvrant: tableau.getStart(source),
    fermant: tableau.end - 1,
    finDeLaDerniere: derniere?.end,
    virguleFinale: tableau.elements.hasTrailingComma,
  };
}

// Les valeurs que le fichier déclare ou importe au premier niveau, hors MIGRATIONS
// (les types n'y sont pas : ils ne jouent rien).
function valeursDuPremierNiveau(ts, source) {
  const noms = new Set();
  for (const instruction of source.statements) {
    if (ts.isVariableStatement(instruction)) {
      for (const { name } of instruction.declarationList.declarations) if (ts.isIdentifier(name)) noms.add(name.text);
    } else if (
      (ts.isFunctionDeclaration(instruction) ||
        ts.isClassDeclaration(instruction) ||
        ts.isEnumDeclaration(instruction)) &&
      instruction.name
    ) {
      noms.add(instruction.name.text);
    } else if (
      ts.isImportDeclaration(instruction) &&
      instruction.importClause &&
      !instruction.importClause.isTypeOnly
    ) {
      const { name, namedBindings } = instruction.importClause;
      if (name) noms.add(name.text);
      if (namedBindings && ts.isNamespaceImport(namedBindings)) noms.add(namedBindings.name.text);
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const lien of namedBindings.elements) if (!lien.isTypeOnly) noms.add(lien.name.text);
      }
    }
  }
  noms.delete("MIGRATIONS");
  return noms;
}

/**
 * Les étapes de MIGRATIONS d'un texte de migrations.ts, dans leur ordre :
 * `{ nom, texte, code }`. Refuse (ErreurMiseAJour) un fichier illisible, une
 * étape sans nom écrit en clair, deux étapes du même nom, une étape qui lit une
 * valeur déclarée hors de la liste.
 * @param {string} texte
 * @param {string} quoi le fichier, nommé dans les refus
 * @returns {{ nom: string, texte: string, code: string }[]}
 */
export function lireLesEtapes(texte, quoi) {
  return lireLaListe(texte, quoi).etapes;
}

// Le dedans de la liste de l'appli, `[` et `]` exclus, avec les étapes ajoutées en fin.
function dedansAvecLesAjouts(texte, liste, ajouts) {
  let dedans = texte.slice(liste.ouvrant + 1, liste.fermant);
  if (ajouts.length === 0) return dedans;
  if (liste.finDeLaDerniere !== undefined && !liste.virguleFinale) {
    const virgule = liste.finDeLaDerniere - (liste.ouvrant + 1);
    dedans = `${dedans.slice(0, virgule)},${dedans.slice(virgule)}`;
  }
  // Avant la ligne du « ] », que les étapes ajoutées laissent à sa place.
  const fin = /\n[ \t]*$/.exec(dedans);
  const tete = fin ? dedans.slice(0, fin.index + 1) : `${dedans}\n`;
  const queue = fin ? dedans.slice(fin.index + 1) : "";
  return `${tete}${ajouts.map(({ texte: etape }) => `${etape},\n`).join("")}${queue}`;
}

const GESTE_DU_CATALOGUE =
  "le catalogue a enfreint sa règle (une étape publiée ne se retouche plus, une évolution est une étape neuve en fin) : " +
  "viser par --vers un commit d'avant ce changement, et le signaler au catalogue.";

/**
 * Les étapes de migration d'une mise à jour, sur les textes de migrations.ts à
 * l'origine, à la cible et dans l'appli (« Les migrations » d'outils/mise-a-jour.md).
 * Les étapes de la cible absentes de l'origine s'ajoutent en fin de la liste de
 * l'appli, après ses propres étapes, dans l'ordre de la cible, au texte inchangé.
 * Le reste du fichier passe par `fusionner` (la fusion à trois) si le catalogue
 * l'a changé. Refuse, avant toute écriture, ce qui ne se reporte pas sûrement,
 * tous les motifs à la fois. `contenu` : le texte à écrire, undefined si rien ne change.
 * `cible` ou `appli` undefined : le fichier y manque.
 * @param {{ origine: string, cible: string | undefined, appli: string | undefined,
 *   fusionner: (versions: { origine: string, cible: string, appli: string }) => { contenu: string | Buffer, conflits: number } }} versions
 */
export function reporterLesMigrations({ origine, cible, appli, fusionner }) {
  if (cible === undefined) {
    throw new ErreurMiseAJour(
      `Le catalogue retire ${FICHIER_MIGRATIONS}, dont les bases déployées ont joué les étapes : ${GESTE_DU_CATALOGUE}`
    );
  }
  if (appli === undefined) {
    throw new ErreurMiseAJour(
      `L'appli a supprimé ${FICHIER_MIGRATIONS}, que le catalogue change : les étapes reçues n'y sont plus, et celles à ajouter peuvent en dépendre. ` +
        "Le remettre tel qu'à l'origine, par un commit publié sur le main de l'appli, puis relancer."
    );
  }
  const lire = (texte, quoi, geste) => {
    try {
      return lireLaListe(texte, `${FICHIER_MIGRATIONS} ${quoi}`);
    } catch (erreur) {
      if (erreur instanceof ErreurMiseAJour) throw new ErreurMiseAJour(`${erreur.message} ${geste}`);
      throw erreur;
    }
  };
  const geste = "Viser par --vers un autre commit du catalogue, et le signaler au catalogue.";
  const deLOrigine = lire(origine, "de l'origine", geste);
  const deLaCible = lire(cible, "de la cible", geste);
  const deLAppli = lire(
    appli,
    "de l'appli",
    "La corriger dans l'appli (chaque étape écrite dans la liste, son nom en clair et à elle seule), " +
      "par un commit publié sur son main, puis relancer."
  );

  const parNom = (liste) => new Map(liste.etapes.map((etape) => [etape.nom, etape]));
  const dansLaCible = parNom(deLaCible);
  const dansLAppli = parNom(deLAppli);
  const nomsDeLOrigine = new Set(deLOrigine.etapes.map(({ nom }) => nom));
  const arrets = [];
  const commentaires = [];
  const retouchees = [];
  const ordreDeLaCible = deLaCible.etapes.filter(({ nom }) => nomsDeLOrigine.has(nom)).map(({ nom }) => nom);
  const ordreDeLOrigine = deLOrigine.etapes.filter(({ nom }) => dansLaCible.has(nom)).map(({ nom }) => nom);
  if (ordreDeLaCible.join("\n") !== ordreDeLOrigine.join("\n")) {
    arrets.push(
      `les étapes de l'origine changent d'ordre dans la cible, alors qu'une base déployée les a jouées dans le leur ; ${GESTE_DU_CATALOGUE}`
    );
  }
  for (const etape of deLOrigine.etapes) {
    const deLaCibleAussi = dansLaCible.get(etape.nom);
    if (deLaCibleAussi === undefined) {
      arrets.push(
        `« ${etape.nom} » : étape de l'origine absente de la cible, que les bases déployées ont jouée ; ${GESTE_DU_CATALOGUE}`
      );
    } else if (deLaCibleAussi.code !== etape.code) {
      arrets.push(
        `« ${etape.nom} » : étape de l'origine dont le code change dans la cible ; une base déployée ne la rejoue pas autrement. ${GESTE_DU_CATALOGUE}`
      );
    } else if (deLaCibleAussi.texte !== etape.texte) {
      commentaires.push(etape.nom);
    }
    if (dansLAppli.has(etape.nom) && dansLAppli.get(etape.nom).code !== etape.code) {
      // L'appli a enfreint la règle, mais sa base de production a joué sa version : l'outil n'y touche pas.
      retouchees.push(etape.nom);
    } else if (!dansLAppli.has(etape.nom)) {
      arrets.push(
        `« ${etape.nom} » : étape reçue du catalogue qui manque à l'appli (supprimée ou renommée), et dont une étape à ajouter peut dépendre ` +
          "(celle de journal vise la table utilisateurs de comptes). Remettre l'étape dans l'appli, son nom et son code d'origine, " +
          "par un commit publié sur son main, puis relancer."
      );
    }
  }
  const ajouts = deLaCible.etapes.filter(({ nom }) => !nomsDeLOrigine.has(nom));
  // Une étape neuve que la cible place avant une étape de l'origine : celle d'une
  // brique ajoutée d'office par l'assembleur de la cible, ou une étape insérée au
  // milieu par le catalogue. Mise en fin chez l'appli comme les autres, elle se signale :
  // sur une base neuve, elle tourne après des étapes qu'elle précède au catalogue.
  const derniereDeLOrigine = deLaCible.etapes.findLastIndex(({ nom }) => nomsDeLOrigine.has(nom));
  const auMilieu = deLaCible.etapes
    .filter(({ nom }, rang) => !nomsDeLOrigine.has(nom) && rang < derniereDeLOrigine)
    .map(({ nom }) => nom);
  for (const { nom } of ajouts) {
    if (dansLAppli.has(nom)) {
      arrets.push(
        `« ${nom} » : le nom d'une étape à ajouter existe déjà dans l'appli (une étape recopiée à la main ?). ` +
          "Renommer celle de l'appli (son nom seul, que ne lit que le message d'une étape en échec), par un commit publié sur son main, " +
          "puis relancer : l'étape du catalogue viendra en fin, et relecteur-migrations vérifiera qu'elle ne refait pas autrement celle de l'appli."
      );
    }
  }
  if (arrets.length > 0) {
    throw new ErreurMiseAJour(
      `Les étapes de migration ne se reportent pas (${FICHIER_MIGRATIONS}), rien n'est écrit :\n` +
        `${arrets.map((arret) => `  - ${arret}`).join("\n")}`
    );
  }

  // Le reste du fichier : la liste réduite à une marque dans les trois versions,
  // pour que la fusion à trois ne voie pas les étapes.
  const squelette = (texte, liste) =>
    `${texte.slice(0, liste.ouvrant + 1)}${MARQUE_DES_ETAPES}${texte.slice(liste.fermant)}`;
  const [deOrigine, deCible, dAppli] = [
    [origine, deLOrigine],
    [cible, deLaCible],
    [appli, deLAppli],
  ].map(([texte, liste]) => squelette(texte, liste));
  let fusion = { contenu: dAppli, conflits: 0 };
  if (deOrigine !== deCible) {
    const { contenu, conflits } = fusionner({ origine: deOrigine, cible: deCible, appli: dAppli });
    fusion = { contenu: contenu.toString(), conflits };
  }
  const morceaux = fusion.contenu.split(MARQUE_DES_ETAPES);
  if (morceaux.length !== 2) {
    throw new ErreurMiseAJour(
      `La fusion à trois de ${FICHIER_MIGRATIONS}, hors des étapes, a mêlé ses conflits à la liste MIGRATIONS, rien n'est écrit : ` +
        "reporter à la main le changement du catalogue autour de la liste, par un commit publié sur le main de l'appli, puis relancer."
    );
  }
  const contenu = `${morceaux[0]}${dedansAvecLesAjouts(appli, deLAppli, ajouts)}${morceaux[1]}`;
  return {
    contenu: contenu === appli ? undefined : contenu,
    ajoutees: ajouts.map(({ nom }) => nom),
    auMilieu,
    commentaires,
    retouchees,
    reste: deOrigine !== deCible,
    conflits: fusion.conflits,
  };
}

/*
 * migrations.ts dans une mise à jour, sur les contenus des trois versions.
 * Absent de l'origine, il arrive avec la base et passe par la table (ajouté) :
 * ses étapes sont toutes neuves. Le même à l'origine et à la cible : rien. Sinon,
 * reporterLesMigrations, et `ecriture` dit quoi écrire et dans quelle liste du rapport.
 */
function reporterLesMigrationsDeLAppli({ origine, cible, appli, fusionner }) {
  const [o, c, p] = [origine, cible, appli].map((contenus) => contenus.get(FICHIER_MIGRATIONS));
  const rien = { ajoutees: [], auMilieu: [], commentaires: [], retouchees: [], reste: false, avecLaBase: false };
  if (egaux(o, c)) return rien;
  if (o === undefined) {
    let etapes;
    try {
      etapes = lireLesEtapes(texteDe(c), `${FICHIER_MIGRATIONS} de la cible`);
    } catch (erreur) {
      if (erreur instanceof ErreurMiseAJour) {
        throw new ErreurMiseAJour(
          `${erreur.message} Viser par --vers un autre commit du catalogue, et le signaler au catalogue.`
        );
      }
      throw erreur;
    }
    return { ...rien, ajoutees: etapes.map(({ nom }) => nom), avecLaBase: true };
  }
  const { contenu, conflits, ...report } = reporterLesMigrations({
    origine: texteDe(o),
    cible: c && texteDe(c),
    appli: p && texteDe(p),
    fusionner,
  });
  const liste = conflits > 0 ? "enConflit" : report.ajoutees.length > 0 ? "migrations" : "fusionnes";
  return {
    ...report,
    avecLaBase: false,
    ecriture: contenu === undefined ? undefined : { contenu: Buffer.from(contenu, "utf-8"), liste },
  };
}

/*
 * La table « Ce qu'il fait de chaque fichier » d'outils/mise-a-jour.md. Les
 * fichiers absents de l'origine comme de la cible sont à l'appli : jamais lus.
 * `aPart` : les fichiers traités ailleurs (migrations.ts reçu du catalogue).
 * `ecritures` : le contenu à écrire, ou null pour supprimer.
 */
function planifierLesFichiers({ origine, cible, appli, fusionner, aPart }) {
  const fichiers = {
    remplaces: [],
    ajoutes: [],
    supprimes: [],
    fusionnes: [],
    migrations: [],
    enConflit: [],
    supprimesParLAppli: [],
    retouchesRetires: [],
    binairesRetouches: [],
  };
  const ecritures = new Map();
  let verrou = "inchangé";
  for (const chemin of [...new Set([...origine.keys(), ...cible.keys()])].sort()) {
    if (HORS_DE_LA_TABLE.has(chemin) || aPart.has(chemin)) continue;
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
  migrations: "étapes de migration ajoutées en fin de liste, à relire",
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

/*
 * Les briques qu'une version de l'appli a reçues, d'après son manifeste : au
 * format 2, ses réglages ; au format 1, les réglages qui l'ont produite, plus les
 * unités du manifeste qui ne sont ni le socle, ni la base, ni une unité
 * partagée (une brique venue d'office). Le cas : un ajout au commit d'une
 * appli au format 1, dont l'assembleur écrit encore le format 1, ne voyait
 * arriver aucune brique (essai à blanc sur une appli de colocation).
 */
function briquesRecues(manifeste, reglages) {
  if (manifeste.format === 2) {
    return [...manifeste.assemblage.briques, ...manifeste.assemblage.ajouteesDOffice.map(({ nom }) => nom)];
  }
  const unites = new Set(Object.values(manifeste.fichiers).map(({ unite }) => unite));
  const venuesDOffice = [...unites].filter(
    (unite) => !UNITES_SANS_CHOIX.includes(unite) && !reglages.briques.includes(unite)
  );
  return [...reglages.briques, ...venuesDOffice];
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

// Le sujet des commits de A à A' qui touchent un fichier du socle que le report
// change : le socle n'a pas de CHANGELOG.md (décision 6 de la note).
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

// ---------------------------------------------------------------- ajouter une brique

// La base n'est pas une brique : elle arrive avec la première qui l'exige (l'assembleur la refuse dans --briques).
const BASE = "donnees";

/*
 * Ce qui se refuse avant de lire l'appli : une opération à la fois (« Options
 * écartées » de la note : une PR qui mêle une brique neuve et les évolutions de
 * toutes les autres se relit mal), une liste vide, la base nommée seule.
 */
function verifierLaDemandeDAjout(ajouter, vers) {
  if (vers !== undefined) {
    throw new ErreurMiseAJour(
      "--ajouter et --vers : une opération à la fois. Ajouter au commit qu'a l'appli, puis mettre à jour par une seconde opération (deux PR), ou l'inverse."
    );
  }
  if (!Array.isArray(ajouter) || ajouter.length === 0 || ajouter.some((nom) => typeof nom !== "string" || nom === "")) {
    throw new ErreurMiseAJour("--ajouter attend une valeur : les briques à ajouter, séparées par des virgules.");
  }
  if (ajouter.includes(BASE)) {
    throw new ErreurMiseAJour(
      `« ${BASE} » ne s'ajoute pas seule : la base arrive avec la brique qui l'exige (contact, echeances, comptes…). Ajouter celle-là.`
    );
  }
  const double = ajouter.find((nom, rang) => ajouter.indexOf(nom) !== rang);
  if (double !== undefined) throw new ErreurMiseAJour(`--ajouter nomme deux fois « ${double} ».`);
}

/*
 * L'ajout au commit de l'appli, contre les briques de ce commit : une brique
 * qui n'y existe pas encore arrivera par une mise à jour d'abord ; une brique
 * déjà là n'a rien à ajouter ; une exigence manquante se dit, comme
 * l'assembleur la dit, jamais ajoutée en silence (planifier d'outils/assembler.mjs).
 * Seul `entraine` ajoute d'office, et l'assembleur rejoué le fait.
 */
function controlerLAjout({ ajouter, presentes, definitions, commit }) {
  for (const nom of ajouter) {
    if (!(nom in definitions)) {
      throw new ErreurMiseAJour(
        `La brique « ${nom} » n'existe pas au commit ${commit} du catalogue, celui de l'appli, auquel l'outil ajoute : ` +
          "si elle est arrivée au catalogue depuis, mettre l'appli à jour d'abord (sans --ajouter), puis l'ajouter ; sinon, vérifier son nom. " +
          `Briques au commit ${commit} : ${Object.keys(definitions).join(", ")}.`
      );
    }
    if (presentes.includes(nom)) {
      throw new ErreurMiseAJour(`La brique « ${nom} » est déjà dans l'appli : rien à ajouter.`);
    }
  }
  const toutes = [...presentes, ...ajouter];
  for (let i = 0; i < toutes.length; i++) {
    for (const entrainee of definitions[toutes[i]]?.entraine ?? [])
      if (!toutes.includes(entrainee)) toutes.push(entrainee);
  }
  const manques = toutes
    .filter((nom) => !presentes.includes(nom))
    .map((nom) => ({
      nom,
      manquantes: definitions[nom].exige.filter((exigee) => exigee !== BASE && !toutes.includes(exigee)),
    }))
    .filter(({ manquantes }) => manquantes.length > 0);
  if (manques.length > 0) {
    const demande = [...new Set([...manques.flatMap(({ manquantes }) => manquantes), ...ajouter])].join(",");
    throw new ErreurMiseAJour(
      `${manques.map(({ nom, manquantes }) => `« ${nom} » exige ${manquantes.join(", ")}, que l'appli n'a pas`).join(" ; ")} : ` +
        `les ajouter dans la même opération (--ajouter ${demande}).`
    );
  }
}

/*
 * Le retard de l'appli sur origin/main du catalogue, vu des briques qu'elle reçoit.
 * Ajouter se fait au commit de l'appli (A' = A) : la brique arrive telle qu'elle
 * était alors, pas telle qu'elle est. Le 2026-11-05, l'ajout de notifications à
 * un commit en retard de 50 commits, dont trois sur la brique, l'a donnée sans
 * un mot, et la mise à jour suivante a relu les mêmes fichiers. Le rapport
 * avertit, il ne refuse pas : une mise à jour peut être lourde et attendre son
 * propre ticket, quand l'ajout est urgent. Les fusions ne comptent pas : elles
 * ne portent pas de changement, et un `git log` sur un dossier ne les voit pas.
 * Faute de origin/main (l'ajout n'en a pas besoin, l'outil ne fait pas de fetch),
 * le retard n'est pas calculé, et le rapport le dit.
 */
function retardDeLAjout({ catalogue, shaOrigine, briques }) {
  const main = origineMain(catalogue);
  if (main === undefined) {
    return {
      indisponible: "le catalogue n'a pas de origin/main : git fetch origin dans le catalogue pour le connaître",
    };
  }
  if (!reussit(catalogue, "merge-base", "--is-ancestor", shaOrigine, main)) {
    return { indisponible: "le commit de l'appli n'est pas sur origin/main du catalogue" };
  }
  const intervalle = `${shaOrigine}..${main}`;
  return {
    commitMain: git(catalogue, "rev-parse", "--short", main).trim(),
    total: Number(git(catalogue, "rev-list", "--count", "--no-merges", intervalle).trim()),
    briques: briques.map((brique) => ({
      brique,
      commits: git(catalogue, "log", "--no-merges", "--format=%h %s", intervalle, "--", `src/briques/${brique}`)
        .split("\n")
        .filter(Boolean)
        .map((ligne) => ({ court: ligne.slice(0, ligne.indexOf(" ")), sujet: ligne.slice(ligne.indexOf(" ") + 1) })),
    })),
  };
}

/*
 * Les briques que la fiche projet de l'appli (PROJET.md) a écartées au cadrage,
 * parmi `briques`, avec la raison écrite. Le 2026-11-05, --ajouter validation
 * s'est fait sans un mot sur l'appli d'essai tours-de-coloc, dont la fiche
 * écartait la brique (« un échange s'accepte entre deux personnes, pas par une
 * personne habilitée »), raison toujours vraie dans le code : la PR a été
 * fermée après relecture. Le gabarit de la fiche (skill solstice-nouvelle-appli)
 * ne fixe pas la forme des options écartées, la lecture est donc tolérante et
 * ne regarde que ce qui s'annonce comme écarté, jamais le corps de la fiche :
 *   - une ligne « Écartées : … » (puce, gras ou non) : sa raison est le texte
 *     après les deux-points, ou chaque sous-puce dessous ;
 *   - une rubrique titrée « Briques écartées » : une raison par puce ;
 *   - une ligne de tableau dont une cellule commence par « écartée » (« | validation
 *     | écartée : … | ») : la ligne est l'entrée.
 * Une brique se nomme en mot entier (mails n'est pas mails-groupes) ; sa raison
 * est l'entrée qui la nomme, recopiée telle quelle.
 * @param {string | undefined} fiche le texte de PROJET.md, undefined sans fiche
 * @param {string[]} briques
 * @returns {{ brique: string, raison: string }[]}
 */
export function briquesEcarteesParLaFiche(fiche, briques) {
  const lignes = (fiche ?? "").split(/\r?\n/).map((ligne) => ligne.replace(/\*\*|__/g, ""));
  // Le dépôt écrit lui-même « Écartés : » (socle.md) : le masculin compte comme le féminin.
  const ANNONCE = /^(?:les\s+)?(?:(?:briques|options)\s+)?écart[ée]e?s?\b/i;
  const CELLULE_ECARTEE = /^écart[ée]e?s?\b/i;
  const puce = /^(\s*)[-*+]\s+(.*)$/;
  const indentation = (ligne) => /^\s*/.exec(ligne)[0].length;
  const entrees = [];
  for (let i = 0; i < lignes.length; i++) {
    // Une ligne de tableau dont une cellule dit « écartée » (la fiche de tours-de-coloc :
    // « | validation | écartée : … | ») : la ligne entière est l'entrée.
    if (/^\s*\|/.test(lignes[i])) {
      const cellules = lignes[i]
        .replace(/^\s*\||\|\s*$/g, "")
        .split("|")
        .map((cellule) => cellule.trim());
      if (cellules.some((cellule) => CELLULE_ECARTEE.test(cellule))) entrees.push(cellules.filter(Boolean).join(" | "));
      continue;
    }
    const titre = /^(#{1,6})\s+(.*)$/.exec(lignes[i]);
    const annonce = puce.exec(lignes[i]) ?? /^(\s*)(.*)$/.exec(lignes[i]);
    const etiquette = titre ? titre[2] : annonce[2].split(":")[0];
    if (!ANNONCE.test(etiquette.trim())) continue;
    // Le corps : sous un titre, jusqu'au titre suivant de même rang ou plus haut ;
    // sous une ligne annoncée, ce qui est plus indenté (ou, hors puce, jusqu'à la ligne vide).
    const rang = titre?.[1].length;
    const reste = titre ? "" : annonce[2].slice(annonce[2].indexOf(":") + 1).trim();
    const dansUnePuce = !titre && puce.test(lignes[i]);
    const corps = [];
    for (let j = i + 1; j < lignes.length; j++) {
      const ligne = lignes[j];
      const autreTitre = /^(#{1,6})\s/.exec(ligne);
      if (titre ? autreTitre && autreTitre[1].length <= rang : autreTitre || ligne.trim() === "") break;
      if (!titre && dansUnePuce && (ligne.trim() === "" || indentation(ligne) <= indentation(lignes[i]))) break;
      if (!titre && !dansUnePuce && puce.test(ligne)) break;
      // Hors puce, une ligne qui ouvre une autre étiquette (« Gardées : journal ») n'est pas la suite de la raison.
      if (
        !titre &&
        !dansUnePuce &&
        indentation(ligne) <= indentation(lignes[i]) &&
        /^\s*[^\s:|][^:]{0,40}:\s/.test(ligne)
      )
        break;
      // Sous une rubrique « Briques écartées », chaque ligne d'un tableau est une entrée comme une puce.
      if (/^\s*\|/.test(ligne)) {
        const cellules = ligne
          .replace(/^\s*\||\|\s*$/g, "")
          .split("|")
          .map((cellule) => cellule.trim());
        if (!cellules.every((cellule) => /^:?-+:?$/.test(cellule)))
          corps.push(`- ${cellules.filter(Boolean).join(" | ")}`);
      } else corps.push(ligne);
    }
    const profondeur = Math.min(...corps.filter((ligne) => puce.test(ligne)).map(indentation));
    const aPuces = Number.isFinite(profondeur);
    const morceaux = [];
    for (const ligne of corps) {
      const p = puce.exec(ligne);
      if (p && indentation(ligne) === profondeur) morceaux.push(p[2].trim());
      else if (aPuces && morceaux.length > 0 && ligne.trim() !== "")
        morceaux[morceaux.length - 1] += ` ${ligne.trim()}`;
    }
    if (aPuces) entrees.push(...(reste === "" ? [] : [reste]), ...morceaux);
    else entrees.push([reste, ...corps.map((ligne) => ligne.trim())].filter(Boolean).join(" "));
  }
  const nomme = (entree, brique) =>
    new RegExp(`(?<![\\w-])${brique.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`, "i").test(entree);
  return briques.flatMap((brique) => {
    const raisons = entrees.filter((entree) => nomme(entree, brique));
    return raisons.length === 0 ? [] : [{ brique, raison: raisons.join(" ; ") }];
  });
}

/*
 * Les tables que créent les étapes de migration reçues et qui n'ont pas de
 * colonne espace_id (dans leur CREATE TABLE, ou par un ALTER TABLE qui l'ajoute),
 * hors celles de la brique espaces elle-même (espaces, espaces_*), que le
 * verrou tests/espaces-isolation.test.ts garde à part. Le verrou ne repère une
 * table à protéger que par cette colonne : une table de brique qui ne l'a pas
 * passe le verrou sans être isolée (le 2026-11-05, une brique arrivée dans une
 * appli avec espaces, et rien ne le disait).
 * @param {{ texte: string }[]} etapes
 * @returns {string[]} triées
 */
// Celles que crée l'étape de la brique espaces : le verrou ne les protège pas (TABLES_DE_LA_BRIQUE) ou
// n'a rien à y voir (espaces, espaces_essais_code). Une table d'appli nommée espaces_verts reste signalée.
const TABLES_DE_LA_BRIQUE_ESPACES = ["espaces", "espaces_adhesions", "espaces_invitations", "espaces_essais_code"];

export function tablesSansEspaceId(etapes) {
  const sans = new Set();
  const avec = new Set();
  for (const { texte } of etapes) {
    for (const creation of texte.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?\w+"?\.)?"?(\w+)"?\s*\(/gi)) {
      // Le corps : jusqu'à la parenthèse qui ferme celle de l'ouverture (un CHECK en contient d'autres).
      let profondeur = 1;
      let fin = creation.index + creation[0].length;
      while (fin < texte.length && profondeur > 0) {
        if (texte[fin] === "(") profondeur++;
        else if (texte[fin] === ")") profondeur--;
        fin++;
      }
      const corps = texte.slice(creation.index + creation[0].length, fin);
      (/\bespace_id\b/.test(corps) ? avec : sans).add(creation[1]);
    }
    for (const ajout of texte.matchAll(
      /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:\w+\.)?(\w+)\s[^;`]*?\bespace_id\b/gi
    )) {
      avec.add(ajout[1]);
    }
  }
  return [...sans].filter((table) => !avec.has(table) && !TABLES_DE_LA_BRIQUE_ESPACES.includes(table)).sort();
}

/*
 * Ce que le README d'une brique reçue dit qu'un module métier de l'appli doit
 * faire, lu dans sa section « La brancher » de la cible (le README que l'appli
 * reçoit), deux cas :
 *   - à brancher : la section commence par « Tout se déclare côté appli »
 *     (echeances, calendrier, validation, import-lot, notifications) : la
 *     brique arrive sans appelant, le vocabulaire de creer-appli et de
 *     relecteur-blueprint, hors mails seule, que ce repérage ne voit pas ;
 *   - à rattacher : elle arrive branchée sur le catalogue, et sa section part
 *     du patron `dossiers` pour les modules que l'appli a écrits (journal, qui
 *     ne trace que src/lib/db/dossiers.ts ; espaces).
 * La section de mails, contact, comptes ou rgpd ne commence pas par cette phrase
 * et ne part pas du patron : le rapport ne les annonce pas. Toute brique arrivée
 * se note de toute façon dans la blueprint (rubrique « Manifeste et blueprint »).
 */
function briquesABrancher(cible, briques) {
  const aBrancher = [];
  const aRattacher = [];
  for (const brique of briques) {
    const readme = `src/briques/${brique}/README.md`;
    const texte = texteDe(cible.get(readme));
    const section = /^## (La brancher[^\n]*)\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(texte);
    if (!section) continue;
    if (/^\s*Tout se déclare côté appli/.test(section[2])) aBrancher.push({ brique, readme, section: section[1] });
    else if (/\bdossiers\b/.test(section[2])) aRattacher.push({ brique, readme, section: section[1] });
  }
  return { aBrancher, aRattacher };
}

// Les fichiers ouverts sans garde que tests/gardes-acces.test.ts de la cible
// déclare, et que l'appli a supprimés (une page publique retirée) : le verrou
// refuse une entrée dont le fichier manque.
function ouvertsSupprimes({ origine, cible, appli }) {
  const verrou = /const OUVERTS[^=]*= \{([\s\S]*?)\n\};/.exec(texteDe(cible.get("tests/gardes-acces.test.ts")))?.[1];
  return [...(verrou ?? "").matchAll(/^\s+"([^"]+)":/gm)]
    .map(([, fichier]) => `src/app/${fichier}`)
    .filter((chemin) => origine.has(chemin) && !appli.has(chemin))
    .sort();
}

/*
 * Les fichiers de l'appli que tests/gardes-acces.test.ts relit (pages, routes,
 * fichiers « use server » de src/app/), parmi ceux qu'elle a écrits : avec la
 * brique comptes qui arrive, chacun passe derrière la connexion et le verrou le
 * refuse tant qu'il n'est pas tranché, public ou derrière un droit. Ceux du
 * catalogue arrivent gardés, ou dans les fichiers ouverts du verrou.
 */
function pagesATrancher({ origine, cible, appli }) {
  return [...appli.keys()]
    .filter((chemin) => chemin.startsWith("src/app/") && !origine.has(chemin) && !cible.has(chemin))
    .filter((chemin) => {
      const nom = path.posix.basename(chemin);
      return (
        nom === "route.ts" ||
        nom === "page.tsx" ||
        (/\.tsx?$/.test(nom) && /["']use server["']/.test(texteDe(appli.get(chemin))))
      );
    })
    .sort();
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
 * `vers`), avec les mêmes briques choisies ; ou, avec `ajouter`, lui ajoute ces
 * briques au commit qu'elle a (A' = A), une opération à la fois. Écrit sur la
 * branche neuve `branche`, sans commit ; `aBlanc` : rien n'est écrit, le
 * résultat dit ce qui le serait.
 * @param {{ catalogue: string, appli: string, vers?: string, ajouter?: string[], branche?: string, aBlanc?: boolean }} options
 */
export function mettreAJour({ catalogue, appli, vers, ajouter, branche, aBlanc = false }) {
  const ajout = ajouter !== undefined;
  if (ajout) verifierLaDemandeDAjout(ajouter, vers);
  const dossierAppli = path.resolve(appli);
  const racineCatalogue = path.resolve(catalogue);
  const lecture = lireLAppli(dossierAppli);
  const { manifeste, contenus } = lecture;
  const commitOrigine = manifeste.catalogue.commit;
  const shaOrigine = commitDuCatalogue(racineCatalogue, manifeste);
  // Ajouter se fait au commit de l'appli, quel que soit le HEAD du catalogue :
  // ses briques sont celles de ce commit, déjà reçues.
  const { sha: shaCible, court: commitCible } = ajout
    ? { sha: shaOrigine, court: commitOrigine }
    : commitVise(racineCatalogue, vers);
  // À blanc, une appli déjà au commit visé reçoit quand même le rapport : il dit
  // ce qu'elle a retouché, l'usage de la première tranche.
  if (shaCible === shaOrigine && !aBlanc && !ajout) {
    throw new ErreurMiseAJour(`L'appli est déjà au commit ${commitCible} du catalogue : rien à reporter.`);
  }
  if (!reussit(racineCatalogue, "merge-base", "--is-ancestor", shaOrigine, shaCible)) {
    throw new ErreurMiseAJour(
      `Le commit visé ${commitCible} ne descend pas du commit ${commitOrigine} de l'appli : l'outil reporte un catalogue plus récent, jamais un autre.`
    );
  }
  const nomDeBranche =
    branche ?? (ajout ? `feature/ajouter-${ajouter.join("-")}` : `feature/reporter-catalogue-${commitCible}`);
  if (!aBlanc) verifierLaBranche(dossierAppli, nomDeBranche);

  return avecUnDossierTemporaire((temporaire) => {
    // Les profils de départ du commit A, lus avec ses briques (ajout seulement).
    let profils = {};
    const examen = examinerDans(temporaire, {
      racineCatalogue,
      dossierAppli,
      lecture,
      sha: shaOrigine,
      controler: ajout
        ? (definitions, reglages, lesProfils) => {
            controlerLAjout({
              ajouter,
              presentes: briquesRecues(manifeste, reglages),
              definitions,
              commit: commitOrigine,
            });
            profils = lesProfils;
          }
        : undefined,
    });
    const { origine } = examen;
    const { contenus: cible, reglages: reglagesCible } =
      shaCible === shaOrigine && !ajout
        ? { contenus: origine, reglages: examen.reglages }
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
              // B' : les briques choisies, plus les ajoutées ; l'assembleur rejoué
              // ajoute ce qu'elles entraînent, et son planifier vérifie ce qu'elles exigent.
              return ajout
                ? { ...examen.reglages, briques: [...examen.reglages.briques, ...ajouter] }
                : examen.reglages;
            },
          });

    // Les arrêts viennent avant toute écriture : un refus ne laisse ni branche ni fichier.
    // Un schema.sql qui arrive avec la base (absent de l'origine) passe par la table : ajouté.
    if (origine.has(SCHEMA) && !egaux(origine.get(SCHEMA), cible.get(SCHEMA))) {
      throw new ErreurMiseAJour(
        `Du commit ${commitOrigine} au commit ${commitCible}, ${SCHEMA} change, ce que l'outil ne reporte pas : un CREATE TABLE fusionné ne se retouche plus ` +
          `(une base déployée a déjà sa table, et CREATE TABLE IF NOT EXISTS ne la corrigera pas), et une table neuve naît d'ordinaire dans une étape de ${FICHIER_MIGRATIONS}. ` +
          "Viser par --vers un commit d'avant ce changement, et le signaler au catalogue, qui le portera par une étape en fin de liste."
      );
    }
    const migrations = reporterLesMigrationsDeLAppli({
      origine,
      cible,
      appli: contenus,
      fusionner: (versions) =>
        fusionnerATrois(path.join(temporaire, "fusion"), FICHIER_MIGRATIONS, versions, { commitOrigine, commitCible }),
    });
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
      aPart: new Set(origine.has(FICHIER_MIGRATIONS) ? [FICHIER_MIGRATIONS] : []),
    });
    if (migrations.ecriture !== undefined) {
      const { contenu, liste } = migrations.ecriture;
      ecritures.set(FICHIER_MIGRATIONS, contenu);
      fichiers[liste] = [...fichiers[liste], FICHIER_MIGRATIONS].sort();
    }

    const manifesteCible = JSON.parse(cible.get(MANIFESTE).toString("utf-8"));
    const avant = briquesRecues(manifeste, examen.reglages);
    const briques = briquesRecues(manifesteCible, reglagesCible);
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
    // Un profil qui n'admet pas une brique arrivée (comptes dans une vitrine) : l'en-tête
    // dirait une autre appli que celle qu'elle devient. L'outil ne choisit pas le profil
    // suivant, et ne s'en sert pas au rejeu (ses briques sont au manifeste) : à reprendre.
    const profil = champDeLaBlueprint(contenus, "profil");
    const permises = profils[profil]?.permises;
    const horsProfil = Array.isArray(permises) ? ajoutees.filter((nom) => !permises.includes(nom)) : [];
    if (horsProfil.length > 0) {
      avertissements.push(
        `blueprint.md déclare profil: ${profil}, qui n'admet en plus que ${permises.join(", ")} : avec ${horsProfil.join(", ")}, ` +
          `l'appli n'en est plus une. Reprendre profil: à la main (${Object.keys(profils)
            .filter((nom) => nom !== profil)
            .join(" ou ")}), et le corps de la blueprint avec.`
      );
    }

    // Les fichiers du socle que le report change : un commit qui ne touche au socle
    // que par ce que l'assembleur retire (le script de test de package.json, sur
    // tours-de-coloc) ne change rien pour l'appli.
    const socle = new Set(
      [manifeste.fichiers, manifesteCible.fichiers]
        .flatMap((liste) =>
          Object.entries(liste)
            .filter(([, { unite }]) => unite === "socle")
            .map(([chemin]) => chemin)
        )
        .filter((chemin) => !egaux(origine.get(chemin), cible.get(chemin)))
    );
    // Ce que le rapport d'un ajout dit en tête, au-delà du retard : la fiche projet qui écartait
    // une brique arrivée, et les tables arrivées que le verrou d'isolation ne verrait pas.
    const ecartees = ajout ? briquesEcarteesParLaFiche(texteDe(contenus.get("PROJET.md")), ajoutees) : [];
    const tablesSansEspace =
      // `avant` : l'appli qui avait déjà espaces, donc son verrou. Avec espaces dans le même ajout, les tables
      // des autres briques (utilisateurs de comptes, par exemple) feraient du bruit : elles se branchent à neuf.
      ajout && avant.includes("espaces") && cible.has(FICHIER_MIGRATIONS)
        ? tablesSansEspaceId(
            lireLesEtapes(texteDe(cible.get(FICHIER_MIGRATIONS)), FICHIER_MIGRATIONS).filter(({ nom }) =>
              migrations.ajoutees.includes(nom)
            )
          )
        : [];
    const resultat = {
      appli: dossierAppli,
      paquet: examen.reglages.paquet,
      format: manifeste.format,
      briques,
      ajoutees,
      // Les briques demandées par --ajouter, celles venues d'office avec elles à part.
      ajout: ajout ? ajouter : null,
      // Au format 1, le manifeste ne dit pas par qui : celles qui arrivent sans avoir été demandées.
      ajouteesDOffice:
        manifesteCible.format === 2
          ? manifesteCible.assemblage.ajouteesDOffice.filter(({ nom }) => ajoutees.includes(nom))
          : ajoutees.filter((nom) => !reglagesCible.briques.includes(nom)).map((nom) => ({ nom, par: null })),
      commitOrigine,
      commitCible,
      branche: nomDeBranche,
      aBlanc,
      aJour: shaCible === shaOrigine && !ajout,
      // Ce que l'ajout au commit de l'appli laisse derrière lui ; null pour une mise à jour, qui vise main.
      retard: ajout ? retardDeLAjout({ catalogue: racineCatalogue, shaOrigine, briques: ajoutees }) : null,
      ecartees,
      tablesSansEspace,
      retouchesAvant: examen.resultat.retouches,
      supprimesAvant: examen.resultat.supprimes,
      fichiers,
      verrou,
      paquetJson: egaux(origine.get("package.json"), cible.get("package.json"))
        ? "inchangé au catalogue"
        : sortDe(fichiers, "package.json"),
      // Ajouter ne change pas de commit : le journal d'une brique ajoutée est son
      // histoire entière, pas ce qui a changé pour l'appli.
      journaux: ajout ? [] : entreesDesJournaux(origine, cible),
      commitsDuSocle: commitsDuSocle(racineCatalogue, shaOrigine, shaCible, socle),
      // Les ajouts lourds (« Les ajouts lourds » de la note) : la base dans une
      // appli qui n'en avait pas, et comptes, avec les pages de l'appli à trancher.
      lourds: {
        base: !origine.has(FICHIER_MIGRATIONS) && cible.has(FICHIER_MIGRATIONS),
        comptes: ajoutees.includes("comptes"),
        pages: ajoutees.includes("comptes") ? pagesATrancher({ origine, cible, appli: contenus }) : [],
        ouvertsSupprimes: ajoutees.includes("comptes") ? ouvertsSupprimes({ origine, cible, appli: contenus }) : [],
      },
      ...briquesABrancher(cible, ajoutees),
      variables: variablesNouvelles(origine, cible),
      traitements: traitementsChanges(origine, cible),
      registre: !cible.has(REGISTRE)
        ? undefined
        : egaux(origine.get(REGISTRE), cible.get(REGISTRE))
          ? "inchangé au catalogue"
          : (sortDe(fichiers, REGISTRE) ?? "changé au catalogue"),
      notifications: briques.includes("notifications"),
      deploiement: briques.includes("deploiement"),
      base: cible.has(FICHIER_MIGRATIONS),
      migrations: {
        ajoutees: migrations.ajoutees,
        auMilieu: migrations.auMilieu,
        commentaires: migrations.commentaires,
        retouchees: migrations.retouchees,
        reste: migrations.reste,
        avecLaBase: migrations.avecLaBase,
      },
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
    [
      "migrations",
      "Étapes de migration ajoutées en fin de liste, le reste du fichier fusionné (rubrique Migrations), à relire",
    ],
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
    "Le socle n'a pas de journal : les sujets des commits du catalogue qui touchent un de ses fichiers que ce report change.",
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

function rubriqueDesMigrations(resultat) {
  if (!resultat.base) return [];
  const { ajoutees, auMilieu, commentaires, retouchees, reste, avecLaBase } = resultat.migrations;
  const lignes = ["## Migrations", ""];
  const liste = (noms) => noms.map((nom) => `- « ${nom} »`);
  if (ajoutees.length === 0) {
    lignes.push(`Aucune étape neuve dans ${code(FICHIER_MIGRATIONS)}.`, "");
  } else {
    lignes.push(
      avecLaBase
        ? `${code(FICHIER_MIGRATIONS)} arrive avec la base, ses étapes dans l'ordre du catalogue (${ajoutees.length}) :`
        : `Étapes ajoutées en fin de ${code("MIGRATIONS")} (${code(FICHIER_MIGRATIONS)}), après celles de l'appli, dans l'ordre du catalogue, au texte inchangé (${ajoutees.length}) :`,
      ...liste(ajoutees),
      "",
      ...(auMilieu.length > 0
        ? [
            `Dont, placées au catalogue avant des étapes que l'appli a déjà (celles d'une brique qui arrive, ajoutée ou venue d'office), mises ici en fin : sur une base neuve, elles tournent après ces étapes. À relire (${auMilieu.length}) :`,
            ...liste(auMilieu),
            "",
          ]
        : []),
      "La fusion les rejoue en production au démarrage suivant, après les étapes de l'appli, puis à chaque démarrage. " +
        `Avant la PR, ${code("tests/migrations.test.ts")} de l'appli rejoue le schéma et toutes les étapes sur sa base de test, ` +
        `et l'agent ${code("relecteur-migrations")} relit l'ajout. Une étape qui vise une table que l'appli a retirée ` +
        `(une étape du patron ${code("dossiers")} dans une appli qui a supprimé sa table) casse le rejeu.`,
      ""
    );
  }
  if (commentaires.length > 0) {
    lignes.push(
      `Étapes dont seuls le commentaire ou la mise en page ont changé au catalogue, le code restant le même : non reportées, l'appli garde son texte (${commentaires.length}) :`,
      ...liste(commentaires),
      ""
    );
  }
  if (retouchees.length > 0) {
    lignes.push(
      `Étapes reçues du catalogue dont l'appli a changé le code : laissées telles quelles (sa base de production a joué sa version), à relire (${retouchees.length}) :`,
      ...liste(retouchees),
      ""
    );
  }
  if (reste) {
    lignes.push(
      `Le reste du fichier (en-tête, ${code("appliquerMigrations")}) change au catalogue et passe par la fusion à trois : il peut changer ce qui tourne au démarrage, à relire.`,
      ""
    );
  }
  return lignes;
}

// Au-delà, le nombre seul : le journal de la brique se lit par git log.
const COMMITS_LISTES = 5;

/*
 * En tête du rapport d'un ajout : la brique arrive telle qu'elle était au commit
 * de l'appli. Un seul paragraphe d'une ligne quand il n'y a rien à dire (pas de
 * retard, ou aucun commit sur les briques reçues) ; sinon l'avertissement, avec
 * la commande qui ferait recevoir la brique du jour (puce « L'ajout » de « Ce
 * qui est outillé », dans la note).
 */
function rubriqueDuRetard(resultat) {
  const { retard } = resultat;
  if (!retard) return [];
  const { ajoutees, commitOrigine } = resultat;
  const celleDuJour =
    ajoutees.length > 1 ? "les briques reçues sont celles du jour" : "la brique reçue est celle du jour";
  const entete = ["## Retard sur le catalogue", ""];
  if (retard.indisponible !== undefined) {
    return [
      ...entete,
      `Le retard n'est pas calculé : ${retard.indisponible}. La brique arrive telle qu'elle était au commit ${commitOrigine}.`,
      "",
    ];
  }
  const { commitMain, total, briques } = retard;
  if (total === 0) {
    return [
      ...entete,
      `L'appli est au commit ${commitOrigine} du catalogue, qui est celui d'origin/main : ${celleDuJour}.`,
      "",
    ];
  }
  const commits = (nombre) => (nombre === 1 ? "1 commit" : `${nombre} commits`);
  const touchees = briques.filter(({ commits: liste }) => liste.length > 0);
  if (touchees.length === 0) {
    return [
      ...entete,
      `L'appli est à ${commits(total)} de retard sur origin/main du catalogue (${commitOrigine} à ${commitMain}, hors fusions), aucun ne touche ${ajoutees.join(", ")} : ${celleDuJour}.`,
      "",
    ];
  }
  const ligne = ({ brique, commits: liste }) =>
    liste.length === 0
      ? [`- ${code(brique)} : aucun commit depuis ${commitOrigine}, la brique reçue est celle du jour.`]
      : [
          `- ${code(brique)} : ${commits(liste.length)} du catalogue la touchent depuis ${commitOrigine}${liste.length > COMMITS_LISTES ? ` (${code(`git log --no-merges ${commitOrigine}..${commitMain} -- src/briques/${brique}`)})` : " :"}`,
          ...(liste.length > COMMITS_LISTES ? [] : liste.map(({ court, sujet }) => `  - ${code(court)} ${sujet}`)),
        ];
  return [
    ...entete,
    `**Attention : l'appli est à ${commits(total)} de retard sur origin/main du catalogue** (au commit ${commitOrigine}, origin/main à ${commitMain} ; hors fusions, donc moins que le git log --oneline). ` +
      `L'ajout se fait au commit ${commitOrigine}, sans refus : les briques arrivent telles qu'elles étaient alors, pas telles qu'elles sont.`,
    "",
    ...briques.flatMap(ligne),
    "",
    "Pour recevoir les briques du jour, mettre l'appli à jour d'abord (une PR à part ; cette branche d'ajout ne part pas, ou se supprime), faire fusionner cette mise à jour, puis relancer l'ajout, qui recevra directement les briques du jour :",
    "",
    "```",
    `node outils/mettre-a-jour.mjs <dossier-de-l-appli> --vers ${commitMain}`,
    "```",
    "",
    `Sinon l'ajout reste juste : la mise à jour suivante reportera ces changements, et relira alors les mêmes fichiers.`,
    "",
  ];
}

/*
 * En tête du rapport d'un ajout : les briques arrivées que la fiche projet de
 * l'appli écartait au cadrage, avec la raison qu'elle donne. Avertir, pas
 * refuser : la raison peut avoir changé depuis (ce qu'elle disait était vrai
 * le 2026-11-05, dans le code de l'appli d'essai, et la PR a été fermée après
 * relecture). Rien sans fiche, sans la ligne, ou sans brique nommée.
 */
function rubriqueDesEcartees(resultat) {
  if (resultat.ecartees.length === 0) return [];
  return [
    "## Briques écartées par la fiche projet",
    "",
    `**Attention : ${code("PROJET.md")} écarte ${resultat.ecartees.length === 1 ? "une brique que cet ajout apporte" : "des briques que cet ajout apporte"}.** ` +
      "L'ajout n'est pas refusé : la raison peut avoir changé. La relire avant de fusionner, et si elle tient toujours, ne pas ajouter la brique (cette branche se supprime) ; sinon la mettre à jour dans la fiche.",
    "",
    ...resultat.ecartees.map(({ brique, raison }) => `- ${code(brique)} : « ${raison} »`),
    "",
  ];
}

/*
 * En tête du rapport d'un ajout, dans une appli qui a espaces : les tables
 * arrivées sans colonne espace_id. Le verrou tests/espaces-isolation.test.ts ne
 * repère une table à protéger que par cette colonne, donc une table qui ne
 * l'a pas passe le verrou sans être isolée.
 */
function rubriqueDesTablesSansEspace(resultat) {
  if (resultat.tablesSansEspace.length === 0) return [];
  return [
    "## Tables sans espace_id",
    "",
    `L'appli a la brique ${code("espaces")} : le verrou ${code("tests/espaces-isolation.test.ts")} ne protège une table que par sa colonne ${code("espace_id")}, et ces tables arrivent sans elle, donc sans que rien ne les isole d'un espace à l'autre :`,
    "",
    ...resultat.tablesSansEspace.map((table) => `- ${code(table)}`),
    "",
    "Chacune est à isoler par le branchement, ou à déclarer hors espace en connaissance de cause.",
    "",
  ];
}

/*
 * En tête du rapport : ce que la base ou comptes changent pour l'appli entière.
 * Leur coût est dans ce qui suit l'opération, pas dans les fichiers (« Les
 * ajouts lourds » de la note).
 */
function rubriqueDesAjoutsLourds(resultat) {
  const { base, comptes, pages } = resultat.lourds;
  if (!base && !comptes) return [];
  const lignes = [
    "## Ajouts lourds",
    "",
    "Cet ajout change l'appli entière, au-delà de ses fichiers : les décisions et les gestes ci-dessous font un ticket de l'appli à part entière, pas une retouche.",
    "",
  ];
  if (base) {
    lignes.push(
      "### La base",
      "",
      `L'appli n'avait pas de base : elle reçoit ${code("src/lib/db/")} (${code("schema.sql")}, les étapes de ${code("migrations.ts")}), les scripts de données, ${code("docker-compose.yml")}, la skill ${code("solstice-donnees")} et le Postgres de sa CI.`,
      "",
      "- Décision du client : créer la base chez l'hébergeur, un service payant, dans l'Union européenne.",
      `- Déclarer ${code("DATABASE_URL")} chez l'hébergeur avant la fusion : sans elle, la première requête échoue.`,
      `- En local : ${code("docker compose up -d --wait")}, puis ${code("npx tsx scripts/bases-locales.ts")}, qui crée les bases de développement et de test et donne la ligne ${code("DATABASE_URL")} de ${code(".env.local")}. Les tests de l'appli exigent désormais leur base de test (son ${code("CLAUDE.md")}, §6).`,
      ""
    );
  }
  if (comptes) {
    const rgpd = resultat.ajoutees.includes("rgpd");
    lignes.push(
      "### La brique comptes",
      "",
      `- Dès la fusion, toutes les pages de l'appli passent derrière la connexion, sauf les routes ouvertes (${code("ROUTES_OUVERTES")} de ${code("src/briques/comptes/protection.ts")}).`,
      pages.length > 0
        ? `- ${code("tests/gardes-acces.test.ts")} refusera chacun de ces fichiers de l'appli tant qu'il n'est pas tranché : public (dans ${code("OUVERTS")} du test, ${code("ROUTES_OUVERTES")} et les pages publiques de ${code("src/lib/referencement.ts")}), ou derrière un droit (${code("exiger")} en première ligne, l'action déclarée dans ${code("src/config/acces.ts")}) (${pages.length}) :`
        : `- ${code("tests/gardes-acces.test.ts")} ne trouve aucune page de l'appli à trancher.`,
      ...pages.map((chemin) => `- ${code(chemin)}`),
      ...(pages.length > 0 ? [""] : []),
      ...(resultat.lourds.ouvertsSupprimes.length > 0
        ? [
            `- Le même test refuse une entrée de ses ${code("OUVERTS")} dont le fichier manque : l'appli a supprimé ceux-ci, leur entrée est à retirer du test (${resultat.lourds.ouvertsSupprimes.length}) :`,
            ...resultat.lourds.ouvertsSupprimes.map((chemin) => `- ${code(chemin)}`),
            "",
          ]
        : []),
      `- L'entrée et les méthodes de connexion sont celles du catalogue par défaut : l'en-tête de la blueprint ne pouvait pas les régler sans la brique. Les décider (qui entre, avec quel rôle, par quelle méthode, et combien de personnes au plus se connectent dans la même heure depuis un même réseau : ${code("LIMITES_PAR_RESEAU")}, 20 par défaut), puis les régler dans ${code("src/config/comptes.ts")}.`,
      `- Les pages publiques du référencement (${code("src/lib/referencement.ts")}) se reprennent : l'accueil passe derrière la connexion.`,
      ...(rgpd
        ? [
            `- La brique rgpd arrive d'office : l'export et l'effacement des données d'une personne, et le registre ${code(REGISTRE)}, où chaque table de l'appli se déclare.`,
          ]
        : []),
      `- Avant la mise en ligne : ${code("AUTH_SECRET")}, l'adresse du premier admin (${code("COMPTES_PREMIER_ADMIN")}) et l'envoi des codes de connexion par la brique mails (Resend).`,
      ""
    );
  }
  return lignes;
}

function rubriqueDesBriquesABrancher(resultat) {
  const { aBrancher, aRattacher } = resultat;
  if (aBrancher.length === 0 && aRattacher.length === 0) return [];
  const ligne = ({ brique, readme, section }) => `- ${code(brique)} : ${code(readme)}, « ${section} ».`;
  const lignes = ["## Briques à brancher", ""];
  if (aBrancher.length > 0) {
    lignes.push(
      "Arrivées sans appelant : le module métier de l'appli les branche, comme le dit la section de leur README. " +
        `Chacune est un ticket de l'appli, repris en section 9 de ${code("blueprint.md")} ; sa ligne dans ${code("briques:")} de l'en-tête porte ${code("branchement: à brancher")}.`,
      "",
      ...aBrancher.map(ligne),
      ""
    );
  }
  if (aRattacher.length > 0) {
    lignes.push(
      `Arrivées branchées sur le catalogue (le patron ${code("dossiers")}), pas sur les modules que l'appli a écrits en le copiant : les y rattacher, comme le dit la section de leur README, est un ticket de l'appli.`,
      "",
      ...aRattacher.map(ligne),
      ""
    );
  }
  return lignes;
}

function rubriqueDeLaFusion(resultat) {
  const etapes = resultat.migrations.ajoutees.length;
  return [
    "## Ce que la fusion déclenche",
    "",
    resultat.deploiement
      ? "- Déploiement : avec la brique deploiement, la fusion sur `main` déploie l'appli (job `deployer` de sa CI)."
      : "- Déploiement : sans la brique deploiement, il suit le réglage de l'hébergeur de l'appli, souvent à chaque fusion sur `main`.",
    !resultat.base
      ? "- Migrations : aucune, l'appli n'a pas de base."
      : etapes > 0
        ? `- Migrations : ${etapes === 1 ? "une étape ajoutée, rejouée" : `${etapes} étapes ajoutées, rejouées`} en production au démarrage qui suit la fusion (rubrique Migrations). Un *Revert* de la PR ne ${etapes === 1 ? "la" : "les"} défait pas.`
        : resultat.migrations.reste
          ? `- Migrations : aucune étape neuve, mais le reste de ${code(FICHIER_MIGRATIONS)}, qui les rejoue au démarrage, change (rubrique Migrations).`
          : `- Migrations : aucune étape neuve ne part avec ce report, et ${code(SCHEMA)} ne change pas.`,
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
  const { fichiers } = resultat;
  const aTrancher =
    fichiers.supprimesParLAppli.length + fichiers.retouchesRetires.length + fichiers.binairesRetouches.length;
  const humain = [
    ...(resultat.lourds.base ? ["faire décider au client la base chez l'hébergeur, puis y déclarer DATABASE_URL"] : []),
    ...(resultat.lourds.comptes
      ? ["trancher chaque page de l'appli, publique ou derrière quel droit", "désigner le premier admin"]
      : []),
    ...(aTrancher > 0 ? ["trancher les fichiers signalés, que l'outil n'a pas écrits"] : []),
    resultat.migrations.ajoutees.length > 0
      ? "fusionner la PR, en sachant qu'elle rejoue les étapes ajoutées en production"
      : "fusionner la PR",
    ...(resultat.variables.length > 0 ? ["déclarer les variables nouvelles chez l'hébergeur"] : []),
    ...(resultat.traitements.ajoutes.length + resultat.traitements.changes.length > 0
      ? ["faire valider par le client les choix de confidentialité"]
      : []),
    ...(resultat.tokens
      ? [`choisir la valeur du client pour un token ajouté à ${code("src/ui/theme/tokens.css")}`]
      : []),
    "valider le rendu des écrans changés",
  ];
  return [
    "## Ensuite, dans une session ouverte dans l'appli",
    "",
    ...(fichiers.enConflit.length > 0
      ? ["- Résoudre les conflits listés ; relire les fusions."]
      : ["- Relire les fusions."]),
    ...(resultat.verrou === "à régénérer"
      ? ["- `npm install` pour régénérer le verrou, puis `npm ci`."]
      : ["- `npm ci`."]),
    ...(resultat.migrations.ajoutees.length > 0
      ? [
          `- ${code("tests/migrations.test.ts")} sur la base de test de l'appli, et l'agent ${code("relecteur-migrations")} sur les étapes ajoutées.`,
        ]
      : []),
    ...(resultat.lourds.comptes && resultat.lourds.pages.length > 0
      ? [
          `- ${code("tests/gardes-acces.test.ts")} échoue sur les pages de l'appli listées en tête : chacune se tranche avec la personne qui pilote le projet.`,
        ]
      : []),
    ...(resultat.ajoutees.length > 0
      ? [
          `- Noter chaque brique arrivée dans ${code("blueprint.md")} (${resultat.ajoutees.join(", ")}) : sa ligne dans ${code("briques:")} de l'en-tête (${code("branchement: à brancher")}, ou le fichier qui la branche) et sa ligne en section 3 ; une brique à brancher a en plus son ticket, repris en section 9.`,
        ]
      : []),
    `- Les vérifications du ${code("CLAUDE.md")} de l'appli (§6), la relecture par sous-agents, le commit, puis la PR avec ce rapport (skill ${code("solstice-livrer")}).`,
    `- Restent à un humain : ${humain.join(", ")}.`,
    "",
  ];
}

/** Le rapport d'une mise à jour, en Markdown : le corps de la PR de l'appli. */
export function rapport(resultat) {
  // Une appli déjà au commit visé : rien à reporter, seulement ce qu'elle a retouché.
  if (resultat.aJour) {
    const lignes = [
      `# Ce que l'appli a retouché du catalogue au commit ${resultat.commitOrigine}`,
      "",
      `Appli ${code(resultat.paquet)}, briques : ${resultat.briques.length === 0 ? "aucune" : resultat.briques.join(", ")}.`,
      "À blanc : rien n'est écrit dans l'appli, déjà au commit visé.",
      "",
      ...rubriqueDesFichiers(resultat),
      ...resultat.avertissements.map((texte) => `- Attention : ${texte}`),
    ];
    return `${lignes.join("\n").trimEnd()}\n`;
  }
  const { ajout } = resultat;
  const lignes = [
    ajout
      ? `# Ajouter ${ajout.join(", ")} à l'appli, au catalogue ${resultat.commitCible}`
      : `# Reporter le catalogue de ${resultat.commitOrigine} à ${resultat.commitCible}`,
    "",
    `Appli ${code(resultat.paquet)}, briques : ${resultat.briques.length === 0 ? "aucune" : resultat.briques.join(", ")}.`,
    ...(ajout && resultat.ajouteesDOffice.length > 0
      ? [
          `Ajoutées d'office avec elles : ${resultat.ajouteesDOffice.map(({ nom, par }) => (par === null ? nom : `${nom} (avec ${par})`)).join(", ")}.`,
        ]
      : []),
    resultat.aBlanc
      ? "À blanc : rien n'est écrit dans l'appli."
      : `Écrit sur la branche ${code(resultat.branche)}, partie du main publié de l'appli, sans commit.`,
    "",
    ...rubriqueDuRetard(resultat),
    ...rubriqueDesEcartees(resultat),
    ...rubriqueDesTablesSansEspace(resultat),
    ...rubriqueDesAjoutsLourds(resultat),
    ...rubriqueDesBriquesABrancher(resultat),
    ...rubriqueDesFichiers(resultat),
    ...rubriqueDesDependances(resultat),
    // Au même commit, les journaux des briques et l'histoire du socle n'ont rien de neuf pour l'appli :
    // la seule histoire d'un ajout est son retard sur origin/main, en tête du rapport.
    ...(ajout ? [] : rubriqueDesJournaux(resultat)),
    ...(ajout ? [] : rubriqueDuSocle(resultat)),
    ...rubriqueDesVariables(resultat),
    ...rubriqueDeLaConfidentialite(resultat),
    ...rubriqueDuRegistre(resultat),
    ...rubriqueDesMigrations(resultat),
    ...rubriqueDeLaFusion(resultat),
    "## Manifeste et blueprint",
    "",
    `- ${code(MANIFESTE)} : celui de la cible, commit ${resultat.commitCible}, une empreinte par fichier venu du catalogue, retouché ou non.`,
    resultat.blueprint === "réécrite"
      ? `- ${code("blueprint.md")} : ${code("commit_reference")} ${ajout ? "reste" : "passe à"} ${resultat.commitCible}${resultat.ajoutees.length > 0 ? `, ${code("briques_assemblees")} reçoit ${resultat.ajoutees.join(", ")}` : ""} ; le corps ne change pas.`
      : `- ${code("blueprint.md")} : non réécrite (voir plus bas).`,
    ...resultat.avertissements.map((texte) => `- Attention : ${texte}`),
    "",
    ...rubriqueDeLaSuite(resultat),
  ];
  return `${lignes.join("\n").trimEnd()}\n`;
}

// ---------------------------------------------------------------- ligne de commande

const AIDE = `Usage : node outils/mettre-a-jour.mjs <dossier-de-l-appli> [--vers <commit> | --ajouter <briques>] [--branche <nom>] [--a-blanc]

Reporte dans l'appli le catalogue d'un commit plus récent, avec les mêmes briques choisies,
ou lui ajoute des briques au commit qu'elle a (outils/mise-a-jour.md) : rejoue
l'assemblage d'origine (commit et réglages de son catalogue.empreintes.json),
vérifie qu'il redonne les empreintes du manifeste, rejoue l'assemblage au
commit visé ou avec les briques ajoutées, puis traite chaque fichier venu du
catalogue (remplacé, fusionné à trois, ajouté, supprimé, ou laissé et
signalé). Imprime le rapport en Markdown, le corps de la PR de l'appli.

  --vers <commit>       le commit visé, sur origin/main du catalogue
                        (défaut : le HEAD du catalogue, propre et à origin/main)
  --ajouter <briques>   les briques à ajouter, séparées par des virgules, au
                        commit de l'appli ; jamais avec --vers (une opération
                        à la fois). Ce qu'elles exigent et que l'appli n'a pas
                        se nomme aussi ; ce qu'elles entraînent vient d'office.
  --branche <nom>       la branche neuve de l'appli où l'outil écrit (défaut :
                        feature/reporter-catalogue-<commit visé>, ou
                        feature/ajouter-<briques>)
  --a-blanc             le rapport seul : rien n'est écrit dans l'appli

Le dossier est la racine d'un worktree de l'appli à l'arbre propre et, sauf
--a-blanc, dont le HEAD est son origin/main (git fetch origin avant). L'outil y
crée la branche, y écrit et ne commite pas ; le rapport s'écrit aussi dans le
dossier git du worktree (git rev-parse --git-path catalogue-mise-a-jour.md). À
blanc, une appli déjà au commit visé reçoit le rapport de ce qu'elle a
retouché. Les étapes de migration neuves s'ajoutent en fin de la liste de
l'appli ; l'outil s'arrête avant toute écriture si une étape reçue change au
catalogue ou manque à l'appli, si le nom d'une étape à ajouter y existe déjà,
ou si schema.sql, déjà dans l'appli, change entre l'origine et la cible (un
schema.sql qui arrive avec la base est ajouté). Le catalogue doit
avoir le commit de l'appli (git fetch origin dans le catalogue). Avec --ajouter,
le rapport avertit en tête du retard de l'appli sur origin/main : la brique
arrive telle qu'elle était au commit de l'appli, et la commande --vers à lancer
d'abord est donnée (sans origin/main, l'ajout se fait et le rapport dit que le
retard n'est pas calculé) ; puis des briques ajoutées que le PROJET.md de l'appli
écarte, avec sa raison, et, si l'appli a espaces, des tables arrivées sans
espace_id (avertissements, jamais un refus). Seul appel
au réseau : npm ci dans un worktree temporaire du catalogue, quand le Prettier
d'un commit n'est pas celui qu'a installé le catalogue. La base dans une
appli qui n'en a pas, et la brique comptes, s'ajoutent comme les autres :
le rapport les annonce en tête, avec les décisions et les gestes qui
restent. Retirer une brique n'est pas outillé.`;

function lireOptions(argv) {
  const options = { positionnels: [], valeurs: {}, aBlanc: false };
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === "--a-blanc") options.aBlanc = true;
    else if (argument === "--retirer") {
      throw new ErreurMiseAJour(
        "Retirer une brique d'une appli assemblée n'est pas outillé (« Hors v1 » de outils/mise-a-jour.md) : ses tables resteraient dans la base déployée, les supprimer est un geste humain."
      );
    } else if (argument === "--vers" || argument === "--branche" || argument === "--ajouter") {
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
    // « mails,contact » ou « mails, contact » : des virgules, les espaces ne comptent pas.
    ajouter: options.valeurs.ajouter
      ?.split(",")
      .map((nom) => nom.trim())
      .filter(Boolean),
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
