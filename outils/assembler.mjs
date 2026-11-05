#!/usr/bin/env node
/*
 * Assembleur du catalogue : copie le socle et les briques choisies vers un
 * dossier vide, et rien d'autre. Il lit le dépôt tel quel (socle à la racine,
 * briques dans src/briques/), sans réorganisation.
 *
 *   node outils/assembler.mjs <dossier-vide> \
 *        --briques comptes,mails,echeances,calendrier [--nom mon-appli] [--blueprint fichier.md] \
 *        [--fiche fiche-projet.md] [--dependabot]
 *
 * Le profil de départ (vitrine, outil-interne, portail : PROFILS
 * d'outils/modules.mjs) se lit dans l'en-tête de la blueprint (`profil:`) ;
 * --briques ajoute à ses briques.
 *
 * Il ne déploie rien, ne touche à aucune base, ne lit ni n'écrit aucun
 * secret : il copie des fichiers suivis par git vers un dossier, puis fait de
 * ce dossier un dépôt git LOCAL d'un seul commit, sans remote ni
 * push. Ce qui touche la prod reste à la personne qui tape la commande.
 *
 * Ce que le script décide vient de outils/modules.mjs (la liste déclarative).
 * Ce fichier-ci ne connaît aucun nom de brique : il applique la liste. Son
 * code ne nomme que la vitrine du kit et les écrans du patron dossiers, que
 * aucune copie ne reçoit, l'adresse IP du visiteur et la base (« donnees »),
 * qui ne se choisissent pas mais suivent ce qui les exige, et les briques
 * comptes et contact, que suit l'adresse IP.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADRESSE_IP,
  METHODES_DE_CONNEXION,
  BRIQUES,
  DONNEES,
  EXCLUS_DU_CATALOGUE,
  OPTIONS_DU_SOCLE,
  NOM_DU_CATALOGUE,
  PATRON_DOSSIERS,
  PROFILS,
  RETRAITS_DU_SOCLE,
  VITRINE_DU_KIT,
  remplissagesDeLEnTete,
  remplissagesDeLEntree,
  retraitsDuNom,
} from "./modules.mjs";

export class ErreurAssemblage extends Error {
  constructor(message) {
    super(message);
    this.name = "ErreurAssemblage";
  }
}

// Un .env suivi par erreur (ils sont gitignorés, mais rien n'empêche un
// `git add -f`) ne se copie pas pour autant : `.env.example` seul passe.
const SECRET = /(^|\/)\.env(\.|$)(?!example$)/;

export function estUnSecret(chemin) {
  return SECRET.test(chemin);
}

function correspond(chemin, entrees) {
  return entrees.some((entree) => (entree.endsWith("/") ? chemin.startsWith(entree) : chemin === entree));
}

// Les variables qui envoient git vers un autre dépôt que celui du dossier
// donné : un hook git exporte GIT_DIR, et lancé depuis là, le catalogue se
// lirait et l'appli se commiterait ailleurs. Retirées pour chaque appel.
const VARIABLES_QUI_DETOURNENT = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_NAMESPACE",
];

export function environnementDeGit() {
  const env = { ...process.env };
  for (const nom of Object.keys(env)) {
    if (VARIABLES_QUI_DETOURNENT.includes(nom.toUpperCase())) delete env[nom];
  }
  return env;
}

function git(dossier, ...args) {
  return execFileSync("git", ["-C", dossier, ...args], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: environnementDeGit(),
  });
}

function messageDeGit(erreur) {
  return (erreur.stderr || erreur.message || "").trim();
}

// Les fichiers du catalogue : ceux que git SUIT, et eux seuls. Pas de parcours
// du disque, et pas les fichiers non suivis même non ignorés : un .npmrc, une
// clé ou un export qui traîne dans le dossier n'entre jamais dans une copie.
// node_modules, .next et les autres worktrees non plus.
function listerFichiers(source) {
  let sortie;
  try {
    sortie = git(source, "ls-files", "-z");
  } catch (erreur) {
    throw new ErreurAssemblage(`« ${source} » n'est pas un dépôt git lisible : ${erreur.message}`);
  }
  return [...new Set(sortie.split("\0").filter(Boolean))]
    .filter((chemin) => fs.existsSync(path.join(source, chemin)))
    .sort();
}

// La base (outils/modules.mjs, DONNEES) : ce nom dans un `exige` ne désigne
// pas une brique à choisir, il fait garder la base.
const BASE = "donnees";

/**
 * Les briques que les briques choisies font garder d'office (`entraine` dans
 * outils/modules.mjs), chacune avec celle qui l'entraîne, dans l'ordre où elles
 * se découvrent. Une brique entraînée en entraîne d'autres à son tour ; une
 * brique déjà choisie n'y est pas.
 * @param {string[]} briques
 * @param {{ BRIQUES: Record<string, { exige: string[], entraine?: string[] }> }} [catalogue]
 * @returns {{ nom: string, par: string }[]}
 */
export function briquesEntrainees(briques, catalogue = { BRIQUES }) {
  const retenues = [...briques];
  const ajoutees = [];
  for (let i = 0; i < retenues.length; i++) {
    const par = retenues[i];
    for (const nom of catalogue.BRIQUES[par]?.entraine ?? []) {
      if (!(nom in catalogue.BRIQUES)) {
        throw new ErreurAssemblage(
          `La brique « ${par} » entraîne « ${nom} », inconnue : outils/modules.mjs est fautif.`
        );
      }
      if (retenues.includes(nom)) continue;
      retenues.push(nom);
      ajoutees.push({ nom, par });
    }
  }
  return ajoutees;
}

/**
 * Les briques d'un assemblage : celles du profil de départ (`profil:` de
 * l'en-tête de la blueprint, PROFILS d'outils/modules.mjs), puis celles de
 * --briques qui n'y sont pas déjà. Sans profil, --briques seul. Un profil qui
 * borne sa liste (`permises`) refuse une brique de plus qui en ferait une autre
 * appli, au lieu de la garder sous un nom qui ne la décrit plus. Ce qui est
 * entraîné (rgpd avec comptes) se calcule ensuite, comme pour --briques seul.
 * @param {{ profil?: string, briques: string[] }} choix
 * @param {{ PROFILS: Record<string, { briques: string[], permises?: string[] }> }} [catalogue]
 * @returns {string[]}
 */
export function briquesDeLAssemblage({ profil, briques }, catalogue = { PROFILS }) {
  if (profil === undefined) return [...briques];
  const definition = catalogue.PROFILS[profil];
  if (definition === undefined) {
    throw new ErreurAssemblage(`Profil inconnu « ${profil} ». Profils : ${Object.keys(catalogue.PROFILS).join(", ")}.`);
  }
  const enPlus = briques.filter((nom) => !definition.briques.includes(nom));
  const refusee = enPlus.find((nom) => definition.permises !== undefined && !definition.permises.includes(nom));
  if (refusee !== undefined) {
    const autres = Object.keys(catalogue.PROFILS).filter((nom) => nom !== profil);
    throw new ErreurAssemblage(
      `Le profil « ${profil} » n'admet en plus que ${definition.permises.join(", ")} : « ${refusee} » en ferait une autre appli. ` +
        `Choisir un autre profil (${autres.join(", ")}), ou retirer « ${refusee} ».`
    );
  }
  return [...new Set([...definition.briques, ...enPlus])];
}

// Le profil que déclare l'en-tête de la blueprint, s'il y en a un. L'en-tête
// seul, sans option --profil : le cadrage y écrit déjà tous ses choix, et deux
// sources pour un même choix pourraient se contredire. Les fins de ligne sont
// ramenées à « \n » ici parce que main() le lit avant noterLeCommit.
const profilDeLaBlueprint = (markdown) => champDeLEntete(markdown.replace(/\r\n/g, "\n"), "profil");

// Qui est gardé, qui est retiré. La base n'est pas au choix : elle suit les
// briques qui l'exigent.
/**
 * @param {{ briques: string[] }} choix
 * @param {{ BRIQUES: Record<string, { exige: string[], entraine?: string[] }> }} [catalogue]
 *   la liste déclarative, celle du dépôt par défaut. Un test la remplace pour
 *   prouver un refus qu'aucune brique du catalogue ne déclenche encore.
 */
export function planifier({ briques: choisies }, catalogue = { BRIQUES }) {
  const { BRIQUES: lesBriques } = catalogue;
  const briquesConnues = Object.keys(lesBriques);
  for (const nom of choisies) {
    if (nom === BASE) {
      throw new ErreurAssemblage(
        `« ${BASE} » ne se choisit pas : l'assembleur garde la base dès qu'une brique gardée l'exige. La retirer de --briques.`
      );
    }
    if (!briquesConnues.includes(nom)) {
      throw new ErreurAssemblage(`Brique inconnue « ${nom} ». Briques : ${briquesConnues.join(", ")}.`);
    }
  }
  // Les briques entraînées sont gardées comme si elles étaient choisies : leurs
  // exigences se vérifient de même, et le refus dit d'où elles viennent.
  const entrainees = briquesEntrainees(choisies, catalogue);
  const briques = [...choisies, ...entrainees.map(({ nom }) => nom)];
  const origine = (nom) => {
    const entrainee = entrainees.find((brique) => brique.nom === nom);
    return entrainee ? ` (ajoutée d'office avec ${entrainee.par})` : "";
  };
  // Une brique peut en exiger une autre (comptes exige mails pour
  // la connexion par code). Refusé en le disant, jamais ajouté en silence : qui
  // assemble doit savoir tout ce que la copie embarque. Seul `entraine` ajoute,
  // pour une obligation, et l'assemblage le dit.
  for (const nom of briques) {
    const manquantes = lesBriques[nom].exige.filter((exigee) => exigee !== BASE && !briques.includes(exigee));
    if (manquantes.length > 0) {
      throw new ErreurAssemblage(
        `La brique « ${nom} »${origine(nom)} exige la ou les briques ${manquantes.join(", ")}, qui ne sont pas choisies. Les ajouter à --briques.`
      );
    }
  }
  // Aucune brique qui lit la base : un site sans base. La brique comptes
  // garde la base et la couche données du patron dossiers (ses écrans, jamais :
  // voir plus bas), d'où partira le premier module métier de l'appli, avec,
  // s'il est choisi, l'écran /comptes de la brique gestion-comptes, et les
  // espaces de la brique du même nom ; la brique contact garde la base sans
  // connexion ; les briques
  // echeances, calendrier, validation, import-lot et
  // notifications la gardent et arrivent à brancher sur ce module métier.
  const lisentLaBase = briques.filter((nom) => lesBriques[nom].exige.includes(BASE));
  const baseGardee = lisentLaBase.length > 0;

  const unites = [];
  // Les écrans du patron dossiers et la vitrine du kit ne sont jamais livrés :
  // ils restent au catalogue, où l'appli les lit et les copie à la demande. Des
  // unités qui ne se gardent pour aucune combinaison, pour que leurs retraits
  // de texte (menu, gardes, skills) et leur ligne « Retiré » dans le premier
  // commit passent par le même chemin que les autres. La couche données du
  // patron reste avec la base.
  unites.push({ genre: "partagée", nom: "patron-dossiers", definition: PATRON_DOSSIERS, gardee: false });
  unites.push({ genre: "partagée", nom: "vitrine-du-kit", definition: VITRINE_DU_KIT, gardee: false });
  // L'adresse IP du visiteur suit les briques qui la lisent.
  unites.push({
    genre: "partagée",
    nom: "adresse-ip",
    definition: ADRESSE_IP,
    gardee: ADRESSE_IP.conserveSiUneDe.some((nom) => briques.includes(nom)),
  });
  for (const [nom, definition] of Object.entries(lesBriques)) {
    unites.push({ genre: "brique", nom, definition, gardee: briques.includes(nom) });
  }
  // En dernier : ses retraits réécrivent des fichiers du socle (navigation,
  // droits, sonde, configuration des tests) que les briques ont déjà retouchés.
  unites.push({ genre: "brique", nom: BASE, definition: DONNEES, gardee: baseGardee });
  return unites;
}

function compter(texte, extrait) {
  return texte.split(extrait).length - 1;
}

// Retirer des lignes sans laisser deux lignes vides de suite : une liste ou un
// fichier de tests dont on retire un élément ne doit pas garder son trou.
function retirerRegion(texte, debut, fin) {
  const gauche = texte.slice(0, debut);
  let droite = texte.slice(fin);
  if (gauche.endsWith("\n\n") && droite.startsWith("\n")) droite = droite.slice(1);
  if (gauche === "") droite = droite.replace(/^\n+/, "");
  return gauche + droite;
}

function debutDeLigne(texte, indice) {
  return texte.lastIndexOf("\n", indice - 1) + 1;
}

function finDeLigne(texte, indice) {
  const fin = texte.indexOf("\n", indice);
  return fin === -1 ? texte.length : fin + 1;
}

function exactementUne(texte, extrait, retrait, quoi) {
  const nombre = compter(texte, extrait);
  if (nombre !== 1) {
    throw new ErreurAssemblage(
      `${retrait.fichier} : ${quoi} ${nombre === 0 ? "introuvable" : `trouvé ${nombre} fois, il doit être unique`} ` +
        `(outils/modules.mjs est à jour du code ?) :\n${extrait}`
    );
  }
}

/**
 * @typedef {{ geste: "ligne", fichier: string, extrait: string }
 *   | { geste: "bloc", fichier: string, de: string, a: string, par?: string }
 *   | { geste: "remplace", fichier: string, extrait: string, par: string }} Retrait
 */

/**
 * @param {string} texte
 * @param {Retrait} retrait
 * @returns {string}
 */
export function appliquerRetrait(texte, retrait) {
  if (retrait.geste === "remplace") {
    exactementUne(texte, retrait.extrait, retrait, "l'extrait à remplacer");
    return texte.replace(retrait.extrait, () => retrait.par);
  }
  if (retrait.geste === "ligne") {
    exactementUne(texte, retrait.extrait, retrait, "la ligne à retirer");
    const indice = texte.indexOf(retrait.extrait);
    // Le geste retire la ligne ENTIÈRE : un extrait qui n'en est qu'un morceau
    // retirerait aussi ce qui l'entoure (un deuxième import, une condition).
    const finLigne = texte.indexOf("\n", indice);
    const ligne = texte.slice(debutDeLigne(texte, indice), finLigne === -1 ? texte.length : finLigne);
    if (ligne.trim() !== retrait.extrait.trim()) {
      throw new ErreurAssemblage(
        `${retrait.fichier} : l'extrait « ligne » n'est qu'un morceau de sa ligne, qu'il retirerait en entier (le donner en entier, ou utiliser « bloc » ou « remplace ») :\n${ligne}`
      );
    }
    return retirerRegion(texte, debutDeLigne(texte, indice), finDeLigne(texte, indice + retrait.extrait.length));
  }
  exactementUne(texte, retrait.de, retrait, "le début du bloc");
  const indiceDe = texte.indexOf(retrait.de);
  const indiceA = texte.indexOf(retrait.a, indiceDe + retrait.de.length);
  if (indiceA === -1) {
    throw new ErreurAssemblage(
      `${retrait.fichier} : la fin du bloc est introuvable après son début (outils/modules.mjs est à jour du code ?) :\n` +
        `début : ${retrait.de}\nfin : ${retrait.a}`
    );
  }
  const debut = debutDeLigne(texte, indiceDe);
  const fin = finDeLigne(texte, indiceA + retrait.a.length);
  if (retrait.par === undefined) return retirerRegion(texte, debut, fin);
  return texte.slice(0, debut) + retrait.par + "\n" + texte.slice(fin);
}

// Les retraits à appliquer, dans l'ordre : les réécritures d'abord (voir
// outils/modules.mjs), les retraits de lignes et de blocs ensuite.
function retraitsAAppliquer(unites, nomPaquet, valeurs, entree) {
  const retirees = unites.filter((unite) => !unite.gardee);
  const retraits = retirees.flatMap((unite) => unite.definition.retraits);
  // Le nom après la licence : l'extrait de la licence dans le verrou porte le nom du catalogue.
  retraits.push(...RETRAITS_DU_SOCLE, ...retraitsDuNom(nomPaquet));
  retraits.push(...remplissagesDeLEnTete(valeurs), ...remplissagesDeLEntree(entree));
  return [...retraits.filter((r) => r.geste === "remplace"), ...retraits.filter((r) => r.geste !== "remplace")];
}

// Les entrées d'un verrou npm (format 3) qu'atteint sa racine, résolues comme
// Node : le node_modules le plus proche, en remontant. Quatre parcours, qui
// disent ce que npm marque : `toutes` suit chaque dépendance ; `production`
// laisse celles de développement de la racine (sinon « dev ») ; `requises`
// laisse aussi les optionnelles (sinon « optional » ou « devOptional ») ;
// `sansPairs` laisse les pairs (sinon « peer »). Un pair optionnel n'est
// jamais suivi : npm ne l'installe pas pour lui seul.
function entreesAtteintes(paquets) {
  const resoudre = (depuis, nom) => {
    for (let base = depuis; ;) {
      const cle = `${base ? `${base}/` : ""}node_modules/${nom}`;
      if (paquets[cle]) return cle;
      if (!base) return undefined;
      const coupure = base.lastIndexOf("/node_modules/");
      base = coupure === -1 ? "" : base.slice(0, coupure);
    }
  };
  const parcourir = ({ dev, optionnelles, pairs }) => {
    const atteintes = new Set([""]);
    const aVoir = [""];
    while (aVoir.length > 0) {
      const cle = aVoir.pop();
      const paquet = paquets[cle];
      const pairsOptionnels = Object.entries(paquet.peerDependenciesMeta ?? {})
        .filter(([, meta]) => meta.optional)
        .map(([nom]) => nom);
      const noms = [
        ...Object.keys(paquet.dependencies ?? {}),
        ...(pairs ? Object.keys(paquet.peerDependencies ?? {}).filter((nom) => !pairsOptionnels.includes(nom)) : []),
        ...(optionnelles ? Object.keys(paquet.optionalDependencies ?? {}) : []),
        ...(cle === "" && dev ? Object.keys(paquet.devDependencies ?? {}) : []),
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
  };
  return {
    toutes: parcourir({ dev: true, optionnelles: true, pairs: true }),
    production: parcourir({ dev: false, optionnelles: true, pairs: true }),
    requises: parcourir({ dev: false, optionnelles: false, pairs: true }),
    sansPairs: parcourir({ dev: true, optionnelles: true, pairs: false }),
  };
}

// Ce qui décide des marques npm d'une entrée, d'après les parcours ci-dessus.
function natureDe(atteintes, cle) {
  return ["production", "requises", "sansPairs"].map((parcours) => atteintes[parcours].has(cle)).join(",");
}

/*
 * Les dépendances npm d'une unité retirée (`dependances` d'outils/modules.mjs)
 * partent de package.json et du verrou. npm ci refuse un verrou dont la racine
 * ne dit pas les dépendances de package.json : c'est ce qui faisait garder pg
 * à un site vitrine sans base. L'assembleur n'appelle pas npm (aucun réseau à
 * l'assemblage) : il retire ces noms de la racine, puis les entrées que plus
 * rien n'atteint. Sur le verrou du catalogue, le résultat est celui
 * qu'écrit `npm install --package-lock-only`, octet pour octet, et npm ci
 * l'accepte (vérifié le 2026-10-28, à l'arrivée du mécanisme).
 * Un paquet gardé dont le retrait changerait la nature (développement,
 * optionnel, pair) devrait changer de marques : plutôt que de deviner les
 * règles de npm, l'assemblage s'arrête.
 */
export function retirerLesDependances(paquet, verrou, noms) {
  const sections = ["dependencies", "devDependencies", "optionalDependencies"];
  const racine = verrou.packages[""];
  const avant = entreesAtteintes(verrou.packages);
  for (const nom of noms) {
    const section = sections.find((s) => paquet[s]?.[nom] !== undefined);
    if (!section) {
      throw new ErreurAssemblage(
        `package.json n'a pas la dépendance « ${nom} » à retirer (outils/modules.mjs est à jour du code ?).`
      );
    }
    if (racine[section]?.[nom] === undefined) {
      throw new ErreurAssemblage(
        `package-lock.json ne range pas « ${nom} » comme package.json (${section}) : régénérer le verrou du catalogue avec npm install.`
      );
    }
    delete paquet[section][nom];
    delete racine[section][nom];
  }
  const apres = entreesAtteintes(verrou.packages);
  for (const cle of Object.keys(verrou.packages)) if (!apres.toutes.has(cle)) delete verrou.packages[cle];
  const aRemarquer = [...apres.toutes].filter((cle) => natureDe(avant, cle) !== natureDe(apres, cle));
  if (aRemarquer.length > 0) {
    throw new ErreurAssemblage(
      `Retirer ${noms.join(", ")} change la nature de ${aRemarquer.join(", ")} dans package-lock.json (développement, optionnel ou pair) : ` +
        "régénérer ce verrou avec npm install --package-lock-only plutôt que de l'élaguer, et revoir outils/modules.mjs."
    );
  }
  return { paquet, verrou };
}

function estVide(dossier) {
  if (!fs.existsSync(dossier)) return true;
  if (!fs.statSync(dossier).isDirectory()) {
    throw new ErreurAssemblage(`Le dossier de sortie « ${dossier} » est un fichier : en choisir un autre.`);
  }
  return fs.readdirSync(dossier).length === 0;
}

// Un chemin de --blueprint faux est une erreur de commande, comme les autres
// refus : sans cette garde, un essai a vu une erreur Node brute
// (ENOENT et sa pile) au lieu de « Assemblage refusé : … ».
function lireLaBlueprint(fichier) {
  try {
    return fs.readFileSync(fichier, "utf-8");
  } catch {
    throw new ErreurAssemblage(
      `La blueprint « ${fichier} » est introuvable ou illisible : vérifier le chemin donné à --blueprint.`
    );
  }
}

// La fiche projet (PROJET.md de l'appli) est écrite par la skill creer-appli
// AVANT l'assemblage, hors du catalogue comme la blueprint : elle part ainsi
// dans le premier commit, copiée octet pour octet.
function lireLaFiche(fichier) {
  try {
    return fs.readFileSync(fichier);
  } catch {
    throw new ErreurAssemblage(
      `La fiche projet « ${fichier} » est introuvable ou illisible : vérifier le chemin donné à --fiche.`
    );
  }
}

/*
 * Un retrait laisse parfois une forme que Prettier écrirait autrement (une
 * condition de plusieurs lignes qui tient de nouveau sur une seule, un appel
 * raccourci), et la CI de l'appli vérifie la mise en forme : sans ce passage,
 * elle refuserait son premier commit. Seuls les fichiers retouchés, avec les
 * réglages copiés dans l'appli ; le Prettier est celui du catalogue, l'appli
 * n'a pas encore ses node_modules. Cherché avant la première écriture : son
 * absence ne laisse pas de sortie à moitié écrite.
 */
function prettierDuCatalogue(racine) {
  const prettier = path.join(racine, "node_modules", "prettier", "bin", "prettier.cjs");
  if (!fs.existsSync(prettier)) {
    throw new ErreurAssemblage("Prettier est absent du catalogue : lancer npm ci dans le catalogue, puis réassembler.");
  }
  return prettier;
}

function mettreEnForme(prettier, destination, fichiers) {
  if (fichiers.length === 0) return;
  try {
    execFileSync(process.execPath, [prettier, "--write", "--ignore-unknown", "--log-level", "warn", ...fichiers], {
      cwd: destination,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (erreur) {
    throw new ErreurAssemblage(
      `la mise en forme des fichiers retouchés a échoué (vider ${destination} avant de réessayer) :\n` +
        `${erreur.stderr?.toString().trim() || erreur.message}`
    );
  }
}

/*
 * Le dépôt de l'appli, créé AVANT toute copie : s'il ne peut pas
 * porter de commit, le refus laisse le dossier de sortie tel qu'il était.
 * `premierCree` : le premier dossier que l'assembleur a créé pour la sortie
 * (undefined si elle existait déjà, vide).
 */
function preparerLeDepot(destination, premierCree) {
  const defaire = () => {
    if (premierCree) fs.rmSync(premierCree, { recursive: true, force: true });
    else fs.rmSync(path.join(destination, ".git"), { recursive: true, force: true });
  };
  try {
    git(destination, "init", "-q", "-b", "main");
  } catch (erreur) {
    defaire();
    throw new ErreurAssemblage(`« git init » a échoué dans « ${destination} » : ${messageDeGit(erreur)}`);
  }
  // Le cas d'un essai : sans dépôt à lui, le dossier relevait du
  // dépôt parent (le dossier de profil), où un `git add -A` aurait versé
  // toute l'appli. Le commit ne se fait que si la racine est bien la sortie.
  let racine;
  try {
    racine = git(destination, "rev-parse", "--show-toplevel").trim();
  } catch (erreur) {
    defaire();
    throw new ErreurAssemblage(
      `git ne reconnaît pas le dépôt qu'il vient de créer dans « ${destination} » : ${messageDeGit(erreur)}`
    );
  }
  if (fs.realpathSync.native(racine) !== fs.realpathSync.native(destination)) {
    defaire();
    throw new ErreurAssemblage(
      `Le dépôt git du dossier de sortie a pour racine « ${racine} » et non « ${destination} » : rien n'est commité.`
    );
  }
  // Sans identité, refuser plutôt que laisser un
  // dossier sans commit. useConfigOnly : une identité devinée par git
  // (utilisateur@MACHINE) ne signe pas le premier commit d'une appli client.
  try {
    git(destination, "-c", "user.useConfigOnly=true", "var", "GIT_AUTHOR_IDENT");
    git(destination, "-c", "user.useConfigOnly=true", "var", "GIT_COMMITTER_IDENT");
  } catch (erreur) {
    defaire();
    // Une autre erreur de git (un dossier refusé par safe.directory, par
    // exemple) ne doit pas se dire « pas d'identité ».
    const message = messageDeGit(erreur);
    if (!/identity|auto-detect|no email|no name/i.test(message)) {
      throw new ErreurAssemblage(`git refuse de préparer le premier commit dans « ${destination} » : ${message}`);
    }
    throw new ErreurAssemblage(
      "git n'a pas d'identité pour signer le premier commit de l'appli. La configurer, puis relancer l'assemblage :\n" +
        '  git config --global user.name "Prénom Nom"\n' +
        '  git config --global user.email "adresse@exemple.com"'
    );
  }
}

// Dependabot est tracé dans le commit : sans cela, l'absence du fichier dans
// l'appli livrée ne dit pas si elle est voulue (--dependabot) ou accidentelle.
// `manifeste` : écrit une fois les fichiers dans l'index, dont il lit les empreintes,
// puis remis en forme par `formater` : au format 2, ses listes s'écrivent sur une
// ligne pour Prettier, et la CI de l'appli refusait sinon son premier commit.
function commiterLeSocle(
  destination,
  { commit, profil, gardees, ajoutees, retirees, dependabot, manifeste, formater }
) {
  const corps = [
    "Assemblée par l'assembleur du catalogue Solstice-vibe. Dépôt local, sans remote : rien n'est poussé.",
    "",
    ...(profil === undefined ? [] : [`Profil : ${profil}.`]),
    `Gardé : ${gardees.join(", ")}.`,
    ...(ajoutees.length > 0 ? [`Ajouté d'office : ${ajoutees.join(", ")}.`] : []),
    `Retiré : ${retirees.length === 0 ? "rien" : retirees.join(", ")}.`,
    `Dependabot : ${dependabot ? "gardé" : "retiré"}.`,
  ].join("\n");
  try {
    // Le gitignore global du poste (core.excludesFile) ne décide pas de ce que
    // l'appli contient : un fichier copié qu'il viserait serait écrit mais
    // jamais commité, avec un arbre qui se dit propre. Seul le .gitignore
    // copié compte.
    git(destination, "-c", "core.excludesFile=", "add", "-A");
    fs.writeFileSync(path.join(destination, MANIFESTE), manifeste());
    formater([MANIFESTE]);
    git(destination, "-c", "core.excludesFile=", "add", "--", MANIFESTE);
    git(
      destination,
      "-c",
      "user.useConfigOnly=true",
      "commit",
      "-q",
      "-m",
      `Socle : appli assemblée depuis le catalogue au commit ${commit}`,
      "-m",
      corps
    );
    return git(destination, "rev-parse", "HEAD").trim();
  } catch (erreur) {
    throw new ErreurAssemblage(
      `L'appli est copiée dans « ${destination} » et son dépôt créé, mais le premier commit a échoué : ${messageDeGit(erreur)}\n` +
        "Corriger la cause, vider ce dossier et relancer l'assemblage."
    );
  }
}

function noterLeCommit(markdown, commit) {
  const texte = markdown.replace(/\r\n/g, "\n");
  const entete = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(texte);
  if (!entete) {
    throw new ErreurAssemblage(
      "La blueprint n'a pas d'en-tête YAML (un bloc entre deux lignes « --- » en tête de fichier)."
    );
  }
  const ligneCommit = `commit_reference: ${commit}`;
  const corps = /^commit_reference:.*$/m.test(entete[1])
    ? entete[1].replace(/^commit_reference:.*$/m, ligneCommit)
    : `${entete[1]}\n${ligneCommit}`;
  return `---\n${corps}\n---\n${texte.slice(entete[0].length)}`;
}

/*
 * Un champ de l'en-tête de la blueprint, à une ligne : sans guillemets (un
 * commentaire « # » après un espace est écarté), entre guillemets doubles
 * (échappements du JSON) ou entre apostrophes (« '' » pour une apostrophe).
 * Entre guillemets, un « # » fait partie du texte : une description qui en
 * porte un ne doit pas être coupée. Absent ou vide : undefined.
 */
function ligneDeLEntete(markdown, cle) {
  const entete = /^---\n([\s\S]*?)\n---/.exec(markdown)?.[1] ?? "";
  // Une valeur qui se poursuit sur la ligne suivante (liste en bloc, texte replié) :
  // lue comme vide, elle ferait retomber l'appli sur sa valeur de remplacement,
  // sans un mot.
  if (new RegExp(`^${cle}:.*\\n[ \\t]+\\S`, "m").test(entete)) {
    throw new ErreurAssemblage(
      `En-tête de la blueprint, ${cle} : une valeur sur une seule ligne est attendue (pas de suite sur la ligne d'après).`
    );
  }
  return new RegExp(`^${cle}:[ \\t]*(.*?)[ \\t]*$`, "m").exec(entete)?.[1];
}

function champDeLEntete(markdown, cle) {
  const brut = ligneDeLEntete(markdown, cle);
  if (brut === undefined) return undefined;
  const double = /^"((?:[^"\\]|\\.)*)"(?:[ \t]+#.*)?$/.exec(brut);
  if (double) {
    try {
      return JSON.parse(`"${double[1]}"`) || undefined;
    } catch {
      throw new ErreurAssemblage(
        `En-tête de la blueprint, ${cle} : la valeur entre guillemets doubles n'est pas lisible (échappements du JSON seuls admis).`
      );
    }
  }
  const simple = /^'((?:[^']|'')*)'(?:[ \t]+#.*)?$/.exec(brut);
  if (simple) return simple[1].replace(/''/g, "'") || undefined;
  // Un guillemet mal fermé, un bloc YAML (> ou |) ou une liste s'écriraient tels
  // quels dans le code de l'appli, sans erreur : mieux vaut refuser.
  if (/^["'>|[{]/.test(brut)) {
    throw new ErreurAssemblage(
      `En-tête de la blueprint, ${cle} : une valeur sur une seule ligne est attendue (ni guillemet mal fermé, ni bloc « > » ou « | », ni liste).`
    );
  }
  return brut.replace(/(?:^|[ \t]+)#.*$/, "").replace(/^(["'])(.*)\1$/, "$2") || undefined;
}

// Une liste de l'en-tête, entre crochets sur une ligne : « [code-email, google] ».
// Absente ou vide : undefined.
function listeDeLEntete(markdown, cle) {
  const brut = ligneDeLEntete(markdown, cle)?.replace(/(?:^|[ \t]+)#.*$/, "");
  if (brut === undefined || brut === "") return undefined;
  const liste = /^\[(.*)\]$/.exec(brut)?.[1];
  if (liste === undefined) {
    throw new ErreurAssemblage(`En-tête de la blueprint, ${cle} : une liste entre crochets est attendue (« [a, b] »).`);
  }
  const noms = liste
    .split(",")
    .map((nom) => nom.trim().replace(/^(["'])(.*)\1$/, "$2"))
    .filter(Boolean);
  return noms.length === 0 ? undefined : noms;
}

// Le champ « appli » de l'en-tête, s'il y en a un.
const appliDeLaBlueprint = (markdown) => champDeLEntete(markdown, "appli");

// Ce que l'en-tête déclare pour remplir l'appli : le nom affiché, la description
// et le choix site public ou fermé. Un choix qu'on ne comprend pas est refusé :
// « publique » lu comme « fermé » laisserait un site vitrine invisible des moteurs.
function valeursDeLEntete(markdown) {
  const site = champDeLEntete(markdown, "site");
  if (site !== undefined && site !== "public" && site !== "ferme") {
    throw new ErreurAssemblage(`En-tête de la blueprint, site : public ou ferme attendu, « ${site} » trouvé.`);
  }
  return {
    nomAffiche: champDeLEntete(markdown, "nom_affiche"),
    description: champDeLEntete(markdown, "description"),
    sitePublic: site === undefined ? undefined : site === "public",
  };
}

/**
 * Les rôles de l'appli et celui qui administre, lus dans src/config/acces.ts.
 * Les déclarations sont ancrées en début de ligne : le commentaire de tête du
 * fichier cite un exemple `export const ROLES = ["membre"] as const;`, que la
 * première correspondance aurait pris pour les rôles de l'appli (tout rôle
 * ajouté aurait été refusé).
 * @param {string} acces le texte de src/config/acces.ts
 * @returns {{ connus: string[], roleAdmin: string }}
 */
export function rolesDeLApp(acces) {
  const texte = acces.replace(/\r\n/g, "\n");
  const roles = /^export const ROLES = \[([^\]]*)\] as const;/m.exec(texte)?.[1].match(/"([^"]+)"/g);
  const roleAdmin = /^export const ROLE_ADMIN: Role = "([^"]+)";/m.exec(texte)?.[1];
  if (!roles || !roleAdmin) {
    throw new ErreurAssemblage(
      "src/config/acces.ts : ROLES et ROLE_ADMIN introuvables (outils/assembler.mjs est à jour du code ?)."
    );
  }
  return { connus: roles.map((role) => role.slice(1, -1)), roleAdmin };
}

// Le nombre de personnes qui se connectent au plus dans l'heure depuis un même
// réseau (`personnes_par_reseau`), entier d'au moins 1. Refusé sinon : un zéro ou
// un texte écrit tel quel dans src/config/comptes.ts ferait refuser l'appli au
// démarrage (la brique refuse une limite nulle), ou pire, serait lu comme une
// absence de réponse.
function personnesParReseauDeLEntete(markdown) {
  const brut = champDeLEntete(markdown, "personnes_par_reseau");
  if (brut === undefined) return undefined;
  const personnes = /^[0-9]+$/.test(brut) ? Number(brut) : Number.NaN;
  if (!Number.isSafeInteger(personnes) || personnes < 1) {
    throw new ErreurAssemblage(
      `En-tête de la blueprint, personnes_par_reseau : un nombre entier de personnes d'au moins 1 attendu (combien se connectent au plus dans l'heure depuis un même réseau), « ${brut} » trouvé.`
    );
  }
  return personnes;
}

/*
 * L'entrée de l'appli que déclare l'en-tête : `entree` (ouverte ou ferme),
 * `role_par_defaut`, `methodes` et `personnes_par_reseau`. Sans réponse à cette
 * dernière, le défaut du profil (PROFILS de modules.mjs), s'il y en a un et que
 * la brique qui porte la connexion est gardée. Refusée avant toute écriture :
 *   - sans la brique qui porte la connexion, la promesse ne serait pas tenue ;
 *   - un rôle par défaut qui administre : une entrée ouverte le donnerait à
 *     n'importe quelle adresse d'Internet, et un domaine à tout son personnel.
 *     Refusé pour toute entrée : ce rôle ne s'attribue jamais en masse ;
 *   - un rôle absent de l'appli, ou une méthode inconnue, qui casseraient le
 *     typecheck de l'appli au lieu d'un refus clair ici.
 * `demo` reste dans METHODES, en local : elle refuse de démarrer en production,
 * et son retrait fait partie des gestes de la mise en ligne.
 */
function entreeDeLEntete(markdown, { unites, racine, profil }) {
  const entree = champDeLEntete(markdown, "entree");
  if (entree !== undefined && entree !== "ouverte" && entree !== "ferme") {
    throw new ErreurAssemblage(`En-tête de la blueprint, entree : ouverte ou ferme attendu, « ${entree} » trouvé.`);
  }
  const roleParDefaut = champDeLEntete(markdown, "role_par_defaut");
  const liste = listeDeLEntete(markdown, "methodes");
  const personnesDonnees = personnesParReseauDeLEntete(markdown);
  const connexionGardee = unites.some((unite) => unite.gardee && unite.definition.connexion);
  // Le défaut du profil ne vaut que s'il y a une connexion à limiter.
  const personnesDuProfil = connexionGardee ? PROFILS[profil]?.personnesParReseau : undefined;
  if (entree === undefined && roleParDefaut === undefined && liste === undefined && personnesDonnees === undefined) {
    return { personnesParReseau: personnesDuProfil };
  }

  if (!connexionGardee) {
    throw new ErreurAssemblage(
      "L'en-tête de la blueprint règle l'entrée (entree, role_par_defaut, methodes ou personnes_par_reseau), mais la brique qui porte la connexion n'est pas gardée : l'ajouter à --briques, ou retirer ces champs."
    );
  }
  if (roleParDefaut !== undefined) {
    const acces = fs.readFileSync(path.join(racine, "src/config/acces.ts"), "utf-8");
    const { connus, roleAdmin } = rolesDeLApp(acces);
    if (roleParDefaut === roleAdmin) {
      throw new ErreurAssemblage(
        `En-tête de la blueprint, role_par_defaut : « ${roleParDefaut} » est un rôle qui administre, jamais le rôle par défaut (n'importe quelle adresse entrée par l'entrée ouverte ou par un domaine l'obtiendrait).`
      );
    }
    if (!connus.includes(roleParDefaut)) {
      throw new ErreurAssemblage(
        `En-tête de la blueprint, role_par_defaut : « ${roleParDefaut} » n'est pas un rôle de l'appli (src/config/acces.ts : ${connus.join(", ")}). Un rôle de plus s'ajoute par ticket, après l'assemblage.`
      );
    }
  }
  let methodes;
  if (liste !== undefined) {
    const inconnue = liste.find((nom) => nom !== "demo" && !METHODES_DE_CONNEXION.includes(nom));
    if (inconnue !== undefined) {
      throw new ErreurAssemblage(
        `En-tête de la blueprint, methodes : méthode de connexion « ${inconnue} » inconnue (${METHODES_DE_CONNEXION.join(", ")}).`
      );
    }
    methodes = [...new Set(liste.filter((nom) => nom !== "demo"))];
    if (methodes.length === 0) {
      throw new ErreurAssemblage(
        "En-tête de la blueprint, methodes : au moins une méthode de connexion autre que demo, qui n'ouvre rien en production."
      );
    }
  }
  return {
    ouverte: entree === undefined ? undefined : entree === "ouverte",
    roleParDefaut,
    methodes,
    personnesParReseau: personnesDonnees ?? personnesDuProfil,
  };
}

/*
 * Le nom du paquet de l'appli, tiré d'un nom libre : minuscules, sans accent,
 * tirets. Il doit commencer par une lettre, comme le nom de base qui en
 * dérive (scripts/lib/bases-locales.ts), tenir dans les 63 caractères que
 * Postgres garde une fois suffixé de « _test » (au-delà, il tronque le nom
 * sans erreur), et ne pas être celui du catalogue, dont l'appli partagerait
 * les bases locales.
 */
const LONGUEUR_MAX_DU_PAQUET = 63 - "_test".length;

function nomDuPaquet(nom) {
  const paquet = nom
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const refus = !/^[a-z]/.test(paquet)
    ? "le nom de paquet qui en dérive doit commencer par une lettre"
    : paquet.length > LONGUEUR_MAX_DU_PAQUET
      ? `le nom de paquet qui en dérive dépasse ${LONGUEUR_MAX_DU_PAQUET} caractères, trop pour le nom de ses bases locales`
      : paquet === NOM_DU_CATALOGUE
        ? "c'est celui du catalogue, dont l'appli partagerait les bases locales"
        : undefined;
  if (refus) throw new ErreurAssemblage(`Nom d'appli « ${nom} » : ${refus}. En donner un autre par --nom.`);
  return paquet;
}

/*
 * L'avis de licence de l'appli (NOTICE). L'appli reste UNLICENSED, livrée
 * sous le contrat du client, mais elle contient le code du catalogue, publié
 * sous MIT : la licence exige que son avis et son texte accompagnent toute
 * copie, sans quoi redistribuer l'appli enfreindrait la licence de chaque
 * contribution extérieure qu'elle contient. Les polices IBM Plex du kit sont,
 * elles, sous OFL 1.1 : leur avis suit, et le texte complet reste à côté
 * d'elles. Un fichier NOTICE plutôt qu'un LICENCE-* : c'est le nom établi
 * pour les avis qui accompagnent une distribution, et un nom en LICENCE se
 * lirait, par une personne ou par la détection de licence d'un hébergeur de
 * code, comme la licence de l'appli elle-même.
 */
const TEXTE_OFL = "src/ui/theme/polices/LICENCE-OFL.txt";

function lireLAvis(racine, chemin) {
  try {
    return fs.readFileSync(path.join(racine, chemin), "utf-8").replace(/\r\n/g, "\n");
  } catch (erreur) {
    if (erreur.code !== "ENOENT") throw erreur;
    throw new ErreurAssemblage(
      `${chemin} est introuvable dans le catalogue : l'avis de licence de l'appli (NOTICE) ne peut pas être écrit.`
    );
  }
}

function avisDeLicence(racine) {
  const licence = lireLAvis(racine, "LICENSE").trim();
  // L'en-tête de l'OFL : sa ligne de droit d'auteur et celle qui nomme la
  // licence, ses deux premiers paragraphes. La suite (« copied below ») ne
  // vaut que dans le fichier complet.
  const avisPolices = lireLAvis(racine, TEXTE_OFL)
    .trim()
    .split(/\n\s*\n/)
    .slice(0, 2)
    .join("\n\n");
  const filet = "-".repeat(72);
  return [
    "Avis de droit d'auteur et de licence",
    "",
    "Cette application n'est pas publiée sous licence libre : ses droits",
    "relèvent de son propriétaire et, le cas échéant, du contrat passé avec son",
    "client. Ce fichier ne lui donne aucune licence et ne change rien à ses",
    "droits (son package.json la marque « UNLICENSED »).",
    "",
    `Elle a été assemblée depuis le catalogue Solstice-vibe (${NOM_DU_CATALOGUE}),`,
    "publié sous licence MIT. Le code qui en provient reste couvert par l'avis",
    "ci-dessous, qui doit accompagner toute copie de l'application.",
    "",
    filet,
    "Catalogue Solstice-vibe : licence MIT",
    filet,
    "",
    licence,
    "",
    filet,
    "Polices IBM Plex : SIL Open Font License 1.1",
    filet,
    "",
    "Les polices de src/ui/theme/polices/ ne sont pas sous MIT :",
    "",
    avisPolices,
    "",
    `Texte complet de la licence : ${TEXTE_OFL}.`,
    "",
  ].join("\n");
}

/*
 * Le manifeste d'empreintes de l'appli : pour chaque fichier venu du catalogue,
 * l'unité dont il vient et l'empreinte du fichier tel que l'appli le reçoit.
 * Une appli livrée ne disait pas ce qu'elle avait retouché du catalogue, et le
 * commit de référence ne le permet pas : il désigne le catalogue, pas les
 * fichiers une fois retirés et remis en forme, et le dépôt public n'a pas
 * l'historique des applis assemblées avant lui.
 *
 * L'empreinte est celle du contenu que git enregistre, lu dans l'index, et non
 * celle du disque : git normalise les fins de ligne (`* text=auto eol=lf`),
 * alors qu'un fichier copié ou retouché garde les siennes. Un fichier en CRLF
 * (arbre modifié toléré, Markdown que Prettier ne remet pas en forme) aurait
 * eu une empreinte qu'aucun clone de l'appli ne retrouve.
 */
const MANIFESTE = "catalogue.empreintes.json";

// L'appli ne reçoit ni le README ni la skill qui décrivent le manifeste : il
// se présente lui-même à qui l'ouvre dans l'appli.
const NOTE_DU_MANIFESTE =
  "Écrit par l'assembleur du catalogue Solstice-vibe au premier commit de l'appli, réécrit par son outil " +
  "de mise à jour à chaque report ou ajout de brique : les réglages de " +
  "l'assemblage et, pour chaque fichier venu du catalogue, son unité et l'empreinte sha256 du fichier tel " +
  "que le catalogue le donne au commit noté. Ne pas le retoucher ni le régénérer à la main : il sert à retrouver ce que " +
  "l'appli a changé depuis.";

/*
 * Format 2 : le manifeste dit aussi avec quoi l'assemblage a été fait, pour que
 * outils/mettre-a-jour.mjs le rejoue à l'identique (outils/mise-a-jour.md). Au
 * format 1, l'outil le déduit : les briques des unités, le nom du paquet de
 * package.json, Dependabot de son fichier, l'en-tête de la blueprint telle
 * qu'elle est devenue. Une blueprint dont l'en-tête a changé depuis ne se
 * rejoue plus. Le commit complet s'y ajoute : un commit court peut devenir
 * ambigu quand le catalogue grandit.
 */
const FORMAT_DU_MANIFESTE = 2;

// Les champs de l'en-tête de la blueprint qui changent les fichiers de l'appli,
// recopiés tels quels (guillemets et commentaire compris) : rejoués dans une
// blueprint qui n'a qu'eux, ils redonnent les mêmes valeurs. Hors `profil` :
// ses briques sont dans `assemblage.briques`, et le rejouer les redonnerait
// selon le profil du jour, pas celui de l'assemblage.
const CHAMPS_DE_L_ENTETE_LUS = [
  "appli",
  "nom_affiche",
  "description",
  "site",
  "entree",
  "role_par_defaut",
  "methodes",
  "personnes_par_reseau",
];

// `personnesParReseau` : la valeur écrite dans l'appli, qu'elle vienne de l'en-tête
// ou du profil. Celle du profil, que le rejeu ne connaît pas, est notée ici : sans
// cela l'assembleur rejoué par outils/mettre-a-jour.mjs redonnerait le défaut du
// fichier (20) à une appli assemblée à 100, et l'origine rejouée ne redonnerait pas
// les empreintes. Notée même quand elle vaut le défaut du fichier, pour que
// l'outil sache toujours d'où elle vient.
function enteteLue(markdown, personnesParReseau) {
  const entete = {};
  for (const cle of CHAMPS_DE_L_ENTETE_LUS) {
    const brut = ligneDeLEntete(markdown, cle);
    if (brut !== undefined) entete[cle] = brut;
  }
  if (entete.personnes_par_reseau === undefined && personnesParReseau !== undefined) {
    entete.personnes_par_reseau = String(personnesParReseau);
  }
  return entete;
}

function versionDuCatalogue(racine) {
  return JSON.parse(fs.readFileSync(path.join(racine, "package.json"), "utf-8")).version;
}

// Le contenu de chaque fichier de l'index, en un seul appel à git.
function contenusDeLIndex(destination) {
  const entrees = git(destination, "ls-files", "-s", "-z")
    .split("\0")
    .filter(Boolean)
    .map((ligne) => {
      const [meta, chemin] = ligne.split("\t");
      return { chemin, blob: meta.split(" ")[1] };
    });
  const sortie = execFileSync("git", ["-C", destination, "cat-file", "--batch"], {
    input: entrees.map(({ blob }) => `${blob}\n`).join(""),
    env: environnementDeGit(),
    maxBuffer: 1024 * 1024 * 1024,
  });
  const contenus = new Map();
  let curseur = 0;
  for (const { chemin } of entrees) {
    // « <blob> blob <taille> », puis le contenu, puis un saut de ligne.
    const finEntete = sortie.indexOf(0x0a, curseur);
    const taille = Number(sortie.toString("latin1", curseur, finEntete).split(" ")[2]);
    contenus.set(chemin, sortie.subarray(finEntete + 1, finEntete + 1 + taille));
    curseur = finEntete + 1 + taille + 1;
  }
  return contenus;
}

function manifesteDEmpreintes(destination, { version, commit, commitComplet, assemblage, fichiers, uniteDe }) {
  const contenus = contenusDeLIndex(destination);
  const empreintes = {};
  for (const chemin of [...fichiers].sort()) {
    const sha256 = createHash("sha256").update(contenus.get(chemin)).digest("hex");
    empreintes[chemin] = { unite: uniteDe(chemin), sha256 };
  }
  const manifeste = {
    format: FORMAT_DU_MANIFESTE,
    note: NOTE_DU_MANIFESTE,
    catalogue: { version, commit, commitComplet },
    assemblage,
    fichiers: empreintes,
  };
  return `${JSON.stringify(manifeste, null, 2)}\n`;
}

function blueprintParDefaut({ nom, commit, briques }) {
  return [
    "---",
    "# Blueprint de l'appli, créée par outils/assembler.mjs. L'en-tête ne porte que",
    "# l'essentiel, en clair : l'assembleur en lit appli, profil, nom_affiche, description,",
    "# site, entree, role_par_defaut, methodes, personnes_par_reseau et commit_reference ; l'outil de mise à jour",
    "# du catalogue y réécrit commit_reference et briques_assemblees ; tout le reste est",
    "# dans le corps, à écrire.",
    "format: 1",
    `appli: ${nom}`,
    "statut: assemblée depuis le catalogue, à décrire",
    `commit_reference: ${commit}`,
    `briques_assemblees: [${briques.join(", ")}]`,
    "---",
    "",
    `# Blueprint : ${nom}`,
    "",
    "Appli assemblée depuis le catalogue Solstice-vibe. L'en-tête note le commit du",
    "catalogue qu'elle a reçu en dernier (assemblage, ou report par outils/mettre-a-jour.mjs).",
    "Ce que chaque brique a changé depuis ce commit est dans son `CHANGELOG.md`, dans",
    "`src/briques/<brique>/` du catalogue.",
    "",
  ].join("\n");
}

/*
 * Assemble. `source` : la racine du catalogue ; `sortie` : un dossier vide ou à
 * créer. `commit` est noté dans la blueprint et dans le premier commit ;
 * l'appelant le choisit (la ligne de commande lit celui du dépôt, un test en
 * donne un fictif). `fiche`, si donnée, devient le PROJET.md de l'appli.
 * `dependabot` : garder .github/dependabot.yml, que l'appli ne reçoit sinon pas.
 * `briques` s'ajoute à celles du profil que déclare l'en-tête de la blueprint
 * (`profil:`), s'il y en a un (briquesDeLAssemblage).
 */
/**
 * @param {{ source: string, sortie: string, briques: string[], commit: string, nom?: string, blueprint?: string, fiche?: string, dependabot?: boolean }} options
 * @returns {{ fichiers: string[], retires: string[], ajoutees: string[], commitInitial: string, profil?: string, briques: string[] }}
 *   `ajoutees` : les briques gardées sans être choisies, « rgpd (avec comptes) » ;
 *   `briques` : les choisies, celles du profil d'abord, telles que notées au manifeste.
 */
export function assembler({ source, sortie, briques, commit, nom, blueprint, fiche, dependabot = false }) {
  const racine = path.resolve(source);
  const destination = path.resolve(sortie);
  // La blueprint est lue d'abord : son en-tête peut donner le profil de départ,
  // dont les briques passent avant celles de --briques.
  const blueprintDonnee = blueprint ? lireLaBlueprint(blueprint) : undefined;
  const profil = blueprintDonnee === undefined ? undefined : profilDeLaBlueprint(blueprintDonnee);
  const choisies = briquesDeLAssemblage({ profil, briques });
  const unites = planifier({ briques: choisies });
  const entrainees = briquesEntrainees(choisies);

  const relatif = path.relative(racine, destination);
  if (relatif === "" || (!relatif.startsWith("..") && !path.isAbsolute(relatif))) {
    throw new ErreurAssemblage(`Le dossier de sortie « ${destination} » est dans le catalogue : en choisir un à côté.`);
  }
  if (!estVide(destination)) {
    throw new ErreurAssemblage(
      `Le dossier de sortie « ${destination} » n'est pas vide : l'assembleur n'écrit que dans un dossier vide.`
    );
  }

  const tous = listerFichiers(racine);
  const retires = unites.filter((unite) => !unite.gardee);
  const aSupprimer = (chemin) => retires.some((unite) => correspond(chemin, unite.definition.fichiers));

  // Un fichier propre à deux unités serait retiré par l'une avec l'autre qui le
  // garde : la liste est fautive, mieux vaut le dire que choisir.
  for (const chemin of tous) {
    const proprietaires = unites.filter((unite) => correspond(chemin, unite.definition.fichiers));
    if (proprietaires.length > 1) {
      throw new ErreurAssemblage(
        `${chemin} est propre à plusieurs unités (${proprietaires.map((u) => u.nom).join(", ")}) : outils/modules.mjs est fautif.`
      );
    }
  }

  // Les options du socle non demandées : leurs fichiers ne partent pas.
  const demandees = { dependabot };
  const sansOption = (chemin) =>
    Object.entries(OPTIONS_DU_SOCLE).some(([option, fichiers]) => !demandees[option] && correspond(chemin, fichiers));

  const copies = tous.filter(
    (chemin) =>
      !correspond(chemin, EXCLUS_DU_CATALOGUE) && !estUnSecret(chemin) && !aSupprimer(chemin) && !sansOption(chemin)
  );

  // Préparés AVANT la première écriture : une blueprint refusée (sans
  // en-tête) ou un nom refusé ne doit pas laisser derrière lui une sortie à
  // moitié écrite, que le prochain essai refuserait comme « pas vide ».
  const prettier = prettierDuCatalogue(racine);
  const nomAppli = nom ?? path.basename(destination);
  const contenuBlueprint = blueprint
    ? noterLeCommit(blueprintDonnee, commit)
    : blueprintParDefaut({
        nom: nomAppli,
        commit,
        briques: [...choisies, ...entrainees.map(({ nom }) => nom)],
      });
  const contenuFiche = fiche === undefined ? undefined : lireLaFiche(fiche);
  const contenuAvis = avisDeLicence(racine);
  const version = versionDuCatalogue(racine);
  const commitComplet = git(racine, "rev-parse", "HEAD").trim();
  // Le nom que la personne a donné (--nom ou appli de la blueprint) : le nom du
  // dossier de sortie n'en est pas un, il ne nomme pas un service chez l'hébergeur.
  const nomDonne = nom ?? (blueprint && appliDeLaBlueprint(contenuBlueprint)) ?? undefined;
  const nomPaquet = nomDuPaquet(nomDonne ?? path.basename(destination));

  // Les fichiers à retoucher : lus une fois, retouchés dans l'ordre, écrits avec
  // leurs fins de ligne d'origine (les extraits de la liste sont en « \n »),
  // puis remis en forme, donc en LF, par Prettier.
  const textes = new Map();
  const finsDeLigne = new Map();
  // Ce que la blueprint fait écrire. Sans blueprint, la copie reste celle du
  // catalogue, hors le nom du paquet et, si --nom le donne, celui du service. L'hébergeur
  // est celui de la brique gardée qui le déclare : sans elle, il reste à remplir.
  const valeurs = {
    ...(blueprint && valeursDeLEntete(contenuBlueprint)),
    nomService: nomDonne === undefined ? undefined : nomPaquet,
    hebergeur: blueprint
      ? unites.find((unite) => unite.gardee && unite.definition.hebergeur)?.definition.hebergeur
      : undefined,
  };
  const entree = blueprint ? entreeDeLEntete(contenuBlueprint, { unites, racine, profil }) : {};
  for (const retrait of retraitsAAppliquer(unites, nomPaquet, valeurs, entree)) {
    // Un fichier retiré par une autre unité n'a plus rien à retoucher.
    if (aSupprimer(retrait.fichier) || correspond(retrait.fichier, EXCLUS_DU_CATALOGUE)) continue;
    if (!copies.includes(retrait.fichier)) {
      throw new ErreurAssemblage(
        `${retrait.fichier} : fichier à retoucher introuvable dans le catalogue (outils/modules.mjs est à jour du code ?).`
      );
    }
    if (!textes.has(retrait.fichier)) {
      const brut = fs.readFileSync(path.join(racine, retrait.fichier), "utf-8");
      finsDeLigne.set(retrait.fichier, brut.includes("\r\n") ? "\r\n" : "\n");
      textes.set(retrait.fichier, brut.replace(/\r\n/g, "\n"));
    }
    textes.set(retrait.fichier, appliquerRetrait(textes.get(retrait.fichier), retrait));
  }
  // Après les retraits de texte, qui retouchent toujours ces deux fichiers
  // (licence, nom) : réécrits par JSON.stringify, ils doivent déjà en avoir la
  // forme, celle qu'écrit npm, sinon tout le fichier changerait.
  const dependances = retires.flatMap((unite) => unite.definition.dependances ?? []);
  if (dependances.length > 0) {
    const lire = (chemin) => {
      const texte = textes.get(chemin);
      const objet = JSON.parse(texte);
      if (
        `${JSON.stringify(objet, null, 2)}
` !== texte
      ) {
        throw new ErreurAssemblage(
          `${chemin} n'a pas la forme qu'écrit npm : en retirer une dépendance le réécrirait en entier.`
        );
      }
      return objet;
    };
    const { paquet, verrou } = retirerLesDependances(lire("package.json"), lire("package-lock.json"), dependances);
    textes.set(
      "package.json",
      `${JSON.stringify(paquet, null, 2)}
`
    );
    textes.set(
      "package-lock.json",
      `${JSON.stringify(verrou, null, 2)}
`
    );
  }

  preparerLeDepot(destination, fs.mkdirSync(destination, { recursive: true }));

  const ecrits = [];
  for (const chemin of copies) {
    const cible = path.join(destination, chemin);
    if (textes.has(chemin)) {
      const texte = textes.get(chemin);
      // Un fichier dont plus rien ne reste (une règle d'attributs qui ne
      // visait que l'unité retirée) ne laisse pas de fichier vide.
      if (texte.trim() === "") continue;
      fs.mkdirSync(path.dirname(cible), { recursive: true });
      fs.writeFileSync(cible, texte.replace(/\n/g, finsDeLigne.get(chemin)));
    } else {
      fs.mkdirSync(path.dirname(cible), { recursive: true });
      fs.copyFileSync(path.join(racine, chemin), cible);
    }
    ecrits.push(chemin);
  }

  mettreEnForme(
    prettier,
    destination,
    ecrits.filter((chemin) => textes.has(chemin))
  );

  // Les fichiers venus du catalogue, après la mise en forme : ni ceux que
  // l'assembleur écrit lui-même, ni le manifeste.
  const venusDuCatalogue = [...ecrits];
  const gardees = unites.filter((unite) => unite.gardee);
  const uniteDe = (chemin) => gardees.find((unite) => correspond(chemin, unite.definition.fichiers))?.nom ?? "socle";

  fs.writeFileSync(path.join(destination, "blueprint.md"), contenuBlueprint);
  ecrits.push("blueprint.md");
  fs.writeFileSync(path.join(destination, "NOTICE"), contenuAvis);
  ecrits.push("NOTICE");
  ecrits.push(MANIFESTE);
  if (contenuFiche !== undefined) {
    fs.writeFileSync(path.join(destination, "PROJET.md"), contenuFiche);
    ecrits.push("PROJET.md");
  }

  const nommer = (unite) => `${unite.genre} ${unite.nom}`;
  const retirees = retires.map(nommer);
  const ajoutees = entrainees.map(({ nom, par }) => `${nom} (avec ${par})`);
  const commitInitial = commiterLeSocle(destination, {
    commit,
    profil,
    gardees: unites.filter((unite) => unite.gardee).map(nommer),
    ajoutees,
    retirees,
    dependabot,
    // Les briques telles que choisies (celles du profil comprises, le profil
    // lui-même non : enteteLue ne le recopie pas), celles ajoutées d'office à
    // part, et le nom tel que donné : ce sont eux que l'assembleur rejoué doit
    // recevoir.
    manifeste: () =>
      manifesteDEmpreintes(destination, {
        version,
        commit,
        commitComplet,
        assemblage: {
          briques: choisies,
          ajouteesDOffice: entrainees,
          paquet: nomPaquet,
          nom: nom ?? null,
          dependabot,
          entete: blueprint ? enteteLue(contenuBlueprint, entree.personnesParReseau) : null,
        },
        fichiers: venusDuCatalogue,
        uniteDe,
      }),
    formater: (fichiers) => mettreEnForme(prettier, destination, fichiers),
  });

  return { fichiers: ecrits, retires: retirees, ajoutees, commitInitial, profil, briques: choisies };
}

// ---------------------------------------------------------------- ligne de commande

const AIDE = `Usage : node outils/assembler.mjs <dossier-vide> [--briques <liste>] [options]

  --briques <liste>   briques à garder, séparées par des virgules : ${Object.keys(BRIQUES).join(", ")}
                      (en plus de celles du profil de la blueprint, s'il y en a un ;
                      aucune, sans profil : un site sans base de données ;
                      une brique exige les siennes : voir le message d'erreur ;
                      la base, « donnees », vient d'office avec une brique qui la lit ;
                      rgpd vient d'office avec comptes, et la sortie le dit)
  --nom <nom>         nom de l'appli : celui de son paquet (package.json, d'où ses bases
                      locales) et, sans --blueprint, celui de la blueprint minimale
                      (défaut : le champ appli de la blueprint, sinon le nom du dossier)
  --blueprint <fichier>  une blueprint existante, copiée dans le dossier avec le
                      commit de référence mis à jour (défaut : une blueprint minimale).
                      Son en-tête donne aussi le profil de départ (profil: ${Object.keys(PROFILS).join(", ")}),
                      dont les briques passent avant --briques, le nom affiché (nom_affiche),
                      la description et le choix site: public ou ferme, écrits dans l'appli ;
                      avec la brique comptes, l'entrée (entree, role_par_defaut, methodes) et
                      les personnes au plus par réseau et par heure (personnes_par_reseau)
  --fiche <fichier>   la fiche projet, copiée telle quelle en PROJET.md à la racine
                      (défaut : pas de PROJET.md)
  --dependabot        garder .github/dependabot.yml, à demander quand quelqu'un entretient
                      l'appli après la livraison (défaut : retiré, car sans personne pour
                      les fusionner, ses PR hebdomadaires s'accumulent)
  --tolerer-arbre-modifie  assembler un catalogue dont des fichiers ne sont pas
                      commités ; le commit noté porte alors la mention « +arbre-modifie »

Le dossier de sortie doit être vide ou ne pas exister. Il devient un dépôt git
local (branche main, un seul commit) : aucun remote n'est créé, rien n'est poussé.
Il faut une identité git (user.name, user.email). Rien n'est déployé, aucune base
n'est touchée.`;

function lireOptions(argv) {
  const options = { positionnels: [], valeurs: {}, drapeaux: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === "--aide" || argument === "-h") options.drapeaux.add("aide");
    else if (argument === "--tolerer-arbre-modifie") options.drapeaux.add("tolerer");
    else if (argument === "--dependabot") options.drapeaux.add("dependabot");
    else if (["--briques", "--nom", "--blueprint", "--fiche"].includes(argument)) {
      const valeur = argv[++i];
      if (valeur === undefined || valeur.startsWith("--")) throw new ErreurAssemblage(`${argument} attend une valeur.`);
      options.valeurs[argument.slice(2)] = valeur;
    } else if (argument.startsWith("-")) throw new ErreurAssemblage(`Option inconnue « ${argument} ».\n\n${AIDE}`);
    else options.positionnels.push(argument);
  }
  return options;
}

const liste = (valeur) =>
  (valeur ?? "")
    .split(",")
    .map((nom) => nom.trim())
    .filter(Boolean);

function commitDeReference(source, tolerer) {
  const court = git(source, "rev-parse", "--short", "HEAD").trim();
  const modifie = git(source, "status", "--porcelain").trim() !== "";
  if (!modifie) return court;
  if (!tolerer) {
    throw new ErreurAssemblage(
      `Le catalogue a des modifications non commitées : le commit ${court} noté dans la blueprint ne dirait pas ce qui est copié. ` +
        "Commiter, ou ajouter --tolerer-arbre-modifie."
    );
  }
  return `${court}+arbre-modifie`;
}

function main(argv) {
  const options = lireOptions(argv);
  if (options.drapeaux.has("aide") || argv.length === 0) {
    console.log(AIDE);
    return;
  }
  if (options.positionnels.length !== 1) {
    throw new ErreurAssemblage(`Un seul dossier de sortie attendu.\n\n${AIDE}`);
  }
  const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const briques = liste(options.valeurs.briques);
  // Validé avant de lire git : une faute de frappe se dit sans dépendre de l'état du dépôt.
  const profil =
    options.valeurs.blueprint === undefined
      ? undefined
      : profilDeLaBlueprint(lireLaBlueprint(options.valeurs.blueprint));
  planifier({ briques: briquesDeLAssemblage({ profil, briques }) });
  const commit = commitDeReference(source, options.drapeaux.has("tolerer"));
  const resultat = assembler({
    source,
    sortie: options.positionnels[0],
    briques,
    commit,
    nom: options.valeurs.nom,
    blueprint: options.valeurs.blueprint,
    fiche: options.valeurs.fiche,
    dependabot: options.drapeaux.has("dependabot"),
  });
  const dossier = path.resolve(options.positionnels[0]);
  const commitInitial = resultat.commitInitial.slice(0, 7);
  console.log(`Assemblé : ${resultat.fichiers.length} fichiers dans ${dossier} (catalogue au commit ${commit}).`);
  // Ce que le profil a fait garder, dit comme le reste : qui relit la sortie
  // doit voir les briques, pas seulement un nom de profil.
  if (resultat.profil !== undefined) {
    const choisies = resultat.briques.length === 0 ? "aucune" : resultat.briques.join(", ");
    console.log(`Profil : ${resultat.profil}, briques ${choisies}.`);
  }
  if (resultat.ajoutees.length > 0) console.log(`Ajouté d'office : ${resultat.ajoutees.join(", ")}.`);
  console.log(`Retiré : ${resultat.retires.length === 0 ? "rien" : resultat.retires.join(", ")}.`);
  console.log(
    options.drapeaux.has("dependabot")
      ? "Dependabot : gardé (.github/dependabot.yml)."
      : "Dependabot : retiré (--dependabot le garde, quand quelqu'un entretient l'appli après la livraison)."
  );
  // Les commandes de la base sont citées ici : à un essai, la suite disait
  // « une base locale jetable » sans dire comment l'obtenir. Sans la brique données, l'appli n'a pas de base à créer.
  const avecBase = !resultat.retires.includes(`brique ${BASE}`);
  const ensuite = avecBase
    ? "puis npm ci, les bases locales (docker compose up -d --wait, puis npx tsx scripts/bases-locales.ts) et les vérifications de CLAUDE.md §6."
    : "puis npm ci et les vérifications de CLAUDE.md §6 (sans base : npm test seul).";
  console.log(
    `Suite : dépôt git local créé (branche main, un commit ${commitInitial}), aucun remote, rien n'est poussé ; ${ensuite}`
  );
}

// Node résout le module principal par realpath : argv[1], lui, garde le lien ou
// la jonction par lesquels on a lancé la commande. Sans realpath, un catalogue
// atteint par un lien ne ferait rien, sans un mot.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (erreur) {
    if (erreur instanceof ErreurAssemblage) {
      console.error(`Assemblage refusé : ${erreur.message}`);
      process.exit(1);
    }
    throw erreur;
  }
}
