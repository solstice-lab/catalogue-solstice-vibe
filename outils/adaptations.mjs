#!/usr/bin/env node
/*
 * Les adaptations d'une appli assemblée : les fichiers venus du catalogue que
 * l'appli a retouchés ou supprimés, chacun avec son diff et sa note
 * d'ADAPTATIONS.md, ou « sans note ».
 *
 *   node outils/adaptations.mjs <dossier-de-l-appli> [--json] [--rejouer]
 *
 * Le 2026-11-05, sur l'appli d'essai tours-de-coloc, trois retouches de ce
 * genre (/kit et les écrans du patron retirés, l'accueil livré vide rempli,
 * l'onglet de la coloc) ne sont remontées au catalogue qu'une fois vues
 * à l'écran. Chacune signalait un défaut de l'assembleur. Le
 * manifeste (catalogue.empreintes.json) sait quels fichiers viennent du
 * catalogue et avec quelle empreinte : toute différence est une adaptation,
 * sans jugement. C'est la note qui dit si c'est un défaut du catalogue ou une
 * évolution propre à l'appli.
 *
 * Lecture seule : l'outil lit le HEAD de l'appli (pas son disque, dont les fins
 * de ligne peuvent différer de ce que git enregistre) et n'écrit rien chez elle.
 * Le diff part du fichier tel que l'assemblage l'a donné, retrouvé par son
 * empreinte : dans l'historique de l'appli d'abord (le premier commit d'un
 * assemblage, ou celui d'une mise à jour), sinon dans le catalogue au commit
 * noté, pour un fichier que l'assembleur copie tel quel. Faute de l'un et
 * l'autre (fichier fusionné par une mise à jour, que l'assembleur retouche,
 * historique repris), le diff est dit approché : il part du fichier du
 * catalogue au commit noté, et mêle les retouches de l'assembleur à celles de
 * l'appli. Sur tours-de-coloc, celui de migrations.ts passait 300 lignes,
 * presque toutes dues aux étapes que l'assembleur retire.
 *
 * --rejouer donne alors l'origine exacte : l'assemblage noté au manifeste,
 * rejoué comme le fait outils/mettre-a-jour.mjs (origineRejouee), au prix d'un
 * worktree temporaire du catalogue, de Prettier et parfois d'un npm ci (le seul
 * appel au réseau, pour le Prettier du commit noté s'il n'est pas celui du
 * catalogue). Un rejeu qui échoue se dit en avertissement, et les diffs restent
 * approchés. Sans l'option, pas de rejeu ni de réseau.
 * Méthode et usage : outils/mise-a-jour.md, « Le circuit » et « Ce qui est
 * outillé » ; skill creer-appli, étape 7.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ADAPTATIONS, couvre, entreesDesAdaptations } from "../.claude/hooks/gardes.mjs";
import { environnementDeGit } from "./assembler.mjs";
import {
  contenusDuCommit,
  ecartsAuManifeste,
  empreinte,
  empreintesDuManifeste,
  ErreurManifeste,
  lireDesObjets,
  manifesteDe,
} from "./manifeste.mjs";
import { origineRejouee } from "./mettre-a-jour.mjs";

export class ErreurAdaptations extends Error {
  constructor(message) {
    super(message);
    this.name = "ErreurAdaptations";
  }
}

function git(dossier, ...args) {
  return execFileSync("git", ["-C", dossier, ...args], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: environnementDeGit(),
    maxBuffer: 64 * 1024 * 1024,
  });
}

function verifierLAppli(appli) {
  if (!fs.existsSync(appli) || !fs.statSync(appli).isDirectory()) {
    throw new ErreurAdaptations(`« ${appli} » n'est pas un dossier : donner le dossier de l'appli assemblée.`);
  }
  let racine;
  try {
    racine = git(appli, "rev-parse", "--show-toplevel").trim();
  } catch {
    throw new ErreurAdaptations(`« ${appli} » n'est pas un dépôt git : donner le dossier de l'appli assemblée.`);
  }
  if (fs.realpathSync.native(racine) !== fs.realpathSync.native(appli)) {
    throw new ErreurAdaptations(
      `« ${appli} » n'est pas la racine de son dépôt git (« ${racine} ») : donner la racine de l'appli.`
    );
  }
}

const OBJET_NUL = /^0+$/;

/*
 * Le fichier tel que l'assemblage (ou la dernière mise à jour) l'a donné : le
 * contenu dont l'empreinte est celle du manifeste. Les chemins sont pris
 * littéralement : `src/app/[slug]/page.tsx` n'est pas un motif. `rejouee` :
 * avec --rejouer, rend l'origine rejouée (une Map), ou undefined si le rejeu a échoué.
 */
function origineDe({ appli, catalogue, commit, chemin, sha256, rejouee }) {
  const objets = [
    ...new Set(
      git(
        appli,
        "--literal-pathspecs",
        "log",
        "--format=",
        "--raw",
        "--no-abbrev",
        "--no-renames",
        "HEAD",
        "--",
        chemin
      )
        .split("\n")
        .filter((ligne) => ligne.startsWith(":"))
        .flatMap((ligne) => ligne.split("\t")[0].split(" ").slice(2, 4))
        .filter((objet) => !OBJET_NUL.test(objet))
    ),
  ];
  const lus = lireDesObjets(appli, objets);
  const rang = lus.findIndex((contenu) => contenu !== undefined && empreinte(contenu) === sha256);
  if (rang !== -1) return { origine: { source: "appli", objet: objets[rang], exacte: true }, contenu: lus[rang] };

  let auCatalogue;
  if (catalogue !== undefined && commit !== undefined) {
    try {
      [auCatalogue] = lireDesObjets(catalogue, [`${commit}:${chemin}`]);
    } catch {
      auCatalogue = undefined;
    }
    if (auCatalogue !== undefined && empreinte(auCatalogue) === sha256) {
      return { origine: { source: "catalogue", commit, exacte: true }, contenu: auCatalogue };
    }
  }
  // L'assemblage rejoué redonne toutes les empreintes du manifeste (le rejeu le
  // vérifie avant de rendre quoi que ce soit) : l'origine exacte.
  const rejoue = rejouee?.()?.get(chemin);
  if (rejoue !== undefined && empreinte(rejoue) === sha256) {
    return { origine: { source: "rejeu", commit, exacte: true }, contenu: rejoue };
  }
  // D'une autre empreinte, le fichier du catalogue reste le meilleur point de
  // départ, dit approché : sur tours-de-coloc, les quatre fichiers retouchés
  // l'étaient avant une mise à jour, qui les a fusionnés (l'origine exacte
  // n'a jamais été commitée chez l'appli), et l'assembleur les retouche
  // (en-tête de la blueprint) : sans lui, aucun n'avait de diff.
  if (auCatalogue !== undefined) {
    return { origine: { source: "catalogue", commit, exacte: false }, contenu: auCatalogue };
  }
  return { origine: null, contenu: undefined };
}

// Le diff du fichier d'origine au fichier de l'appli, en-têtes « catalogue/… » et « appli/… ».
function diffDe(chemin, origine, actuel) {
  const temporaire = fs.mkdtempSync(path.join(os.tmpdir(), "adaptations-"));
  try {
    for (const [cote, contenu] of [
      ["catalogue", origine],
      ["appli", actuel],
    ]) {
      const fichier = path.join(temporaire, cote, chemin);
      fs.mkdirSync(path.dirname(fichier), { recursive: true });
      fs.writeFileSync(fichier, contenu);
    }
    const sortie = spawnSync(
      "git",
      [
        "-c",
        "core.autocrlf=false",
        "-c",
        "core.quotepath=false",
        "diff",
        "--no-index",
        "--no-prefix",
        "--no-color",
        "--no-ext-diff",
        "--",
        `catalogue/${chemin}`,
        `appli/${chemin}`,
      ],
      { cwd: temporaire, encoding: "utf-8", env: environnementDeGit(), maxBuffer: 64 * 1024 * 1024 }
    );
    // 1 : des différences, ce qu'on attend ici.
    if (sortie.status !== 0 && sortie.status !== 1) {
      throw new ErreurAdaptations(`git diff a échoué sur ${chemin} : ${sortie.stderr.trim()}`);
    }
    return sortie.stdout;
  } finally {
    fs.rmSync(temporaire, { recursive: true, force: true });
  }
}

/**
 * Les adaptations de l'appli : lecture seule.
 * @param {{ appli: string, catalogue?: string, rejouer?: boolean }} options
 * `catalogue` : le dépôt où chercher l'origine d'un fichier absente de
 * l'historique de l'appli. `rejouer` : la chercher aussi en rejouant
 * l'assemblage noté au manifeste, dans ce catalogue (worktree, Prettier).
 */
export function adaptations({ appli, catalogue, rejouer = false }) {
  if (rejouer && catalogue === undefined) {
    throw new ErreurAdaptations("Le rejeu se fait dans le catalogue : le donner avec rejouer.");
  }
  const dossierAppli = path.resolve(appli);
  verifierLAppli(dossierAppli);
  const contenus = contenusDuCommit(dossierAppli);
  let manifeste;
  try {
    manifeste = manifesteDe(contenus);
  } catch (erreur) {
    if (erreur instanceof ErreurManifeste) throw new ErreurAdaptations(erreur.message);
    throw erreur;
  }

  const avertissements = [];
  if (git(dossierAppli, "status", "--porcelain").trim() !== "") {
    avertissements.push(
      "L'arbre de l'appli a des modifications non commitées : l'outil lit son HEAD, elles n'y sont pas."
    );
  }
  const notes = contenus.get(ADAPTATIONS);
  if (notes === undefined) {
    avertissements.push(
      `Pas d'${ADAPTATIONS} au HEAD de l'appli (assemblée avant son arrivée, le 2026-11-05) : toutes les adaptations sont sans note.`
    );
  }
  const entrees = entreesDesAdaptations(notes?.toString("utf-8") ?? "");
  // Un commit « +arbre-modifie » n'est dans aucun commit du catalogue : l'origine ne s'y cherche pas.
  const commitNote = manifeste.format === 2 ? manifeste.catalogue.commitComplet : manifeste.catalogue.commit;
  const commit = commitNote?.includes("+") ? undefined : commitNote;
  const racineCatalogue = catalogue === undefined ? undefined : path.resolve(catalogue);
  // Un seul rejeu, et seulement si un fichier retouché n'a pas d'origine exacte ailleurs.
  let rejeu;
  const rejouee = !rejouer
    ? undefined
    : () => {
        if (rejeu === undefined) {
          try {
            rejeu = { origine: origineRejouee({ catalogue: racineCatalogue, appli: dossierAppli }) };
          } catch (erreur) {
            // Toute erreur, pas seulement un refus de l'outil (un commit ancien dont
            // modules.mjs ne se lit pas, une jonction refusée) : la liste et les diffs
            // approchés restent utiles.
            rejeu = { origine: undefined };
            avertissements.push(`Le rejeu de l'assemblage a échoué, les diffs restent approchés : ${erreur.message}`);
          }
        }
        return rejeu.origine;
      };

  const { retouches, supprimes } = ecartsAuManifeste(contenus, empreintesDuManifeste(manifeste));
  const liste = [
    ...retouches.map((chemin) => ({ chemin, etat: "retouché" })),
    ...supprimes.map((chemin) => ({ chemin, etat: "supprimé" })),
  ].sort((a, b) => (a.chemin < b.chemin ? -1 : a.chemin > b.chemin ? 1 : 0));

  // Calculées avant l'objet rendu : le rejeu peut ajouter un avertissement.
  const listees = liste.map(({ chemin, etat }) => {
    const { unite, sha256 } = manifeste.fichiers[chemin];
    // La plus récente en bas du fichier : c'est elle qui fait foi.
    const entree = entrees.findLast((candidate) => couvre(candidate, chemin));
    const note = entree === undefined ? null : { titre: entree.titre, nature: entree.nature, texte: entree.texte };
    if (etat === "supprimé") return { chemin, unite, etat, origine: null, diff: null, note };
    const { origine, contenu } = origineDe({
      appli: dossierAppli,
      catalogue: racineCatalogue,
      commit,
      chemin,
      sha256,
      rejouee,
    });
    const diff = contenu === undefined ? null : diffDe(chemin, contenu, contenus.get(chemin));
    return { chemin, unite, etat, origine, diff, note };
  });
  return {
    appli: dossierAppli,
    format: manifeste.format,
    commit: manifeste.catalogue.commit,
    fichiers: Object.keys(manifeste.fichiers).length,
    // Le rejeu demandé : un diff resté approché vient alors d'un rejeu qui a échoué, dit en avertissement.
    rejouer,
    avertissements,
    adaptations: listees,
  };
}

// ---------------------------------------------------------------- sortie lisible

const pluriel = (nombre, mot) => `${nombre} ${mot}${nombre > 1 ? "s" : ""}`;

export function rapport(resultat) {
  const { adaptations: liste } = resultat;
  const retouches = liste.filter(({ etat }) => etat === "retouché").length;
  const sansNote = liste.filter(({ note }) => note === null).length;
  const lignes = [
    `# Adaptations de ${resultat.appli}`,
    "",
    `Catalogue au commit ${resultat.commit} (manifeste au format ${resultat.format}, ${pluriel(resultat.fichiers, "fichier")} venus du catalogue).`,
    ...resultat.avertissements.map((avertissement) => `Avertissement : ${avertissement}`),
    "",
  ];
  if (liste.length === 0) {
    lignes.push("Aucun fichier venu du catalogue n'est retouché ni supprimé.");
    return `${lignes.join("\n")}\n`;
  }
  lignes.push(
    `${pluriel(liste.length, "fichier")} du catalogue adapté${liste.length > 1 ? "s" : ""} : ` +
      `${retouches} retouché${retouches > 1 ? "s" : ""}, ${liste.length - retouches} supprimé${liste.length - retouches > 1 ? "s" : ""} ; ` +
      `${sansNote} sans note.`,
    ""
  );
  // Une note couvre souvent plusieurs fichiers (sur tours-de-coloc, une seule
  // pour les onze fichiers de /kit et des écrans du patron) : son texte se cite
  // une fois, en fin, et chaque fichier y renvoie par son titre.
  const notes = [...new Map(liste.filter(({ note }) => note !== null).map(({ note }) => [note.texte, note])).values()];
  const renvoi = (note) =>
    note === null
      ? `sans note dans ${ADAPTATIONS}`
      : `note « ${note.titre} »${note.nature === null ? "" : `, ${note.nature}`}`;

  const supprimes = liste.filter(({ etat }) => etat === "supprimé");
  if (supprimes.length > 0) {
    lignes.push("## Supprimés", "");
    for (const { chemin, unite, note } of supprimes) lignes.push(`- \`${chemin}\` (${unite}) : ${renvoi(note)}`);
    lignes.push("");
  }
  for (const { chemin, unite, origine, diff, note } of liste.filter(({ etat }) => etat === "retouché")) {
    lignes.push(`## ${chemin} (${unite}) : retouché`, "");
    lignes.push(`${renvoi(note).replace(/^./, (lettre) => lettre.toUpperCase())}.`, "");
    if (diff === null || origine === null) {
      lignes.push(
        "Diff non donné : origine introuvable, ni dans l'historique de l'appli ni dans le catalogue au commit noté.",
        ""
      );
      continue;
    }
    const depuis = {
      appli: "l'historique de l'appli",
      catalogue: `le catalogue au commit ${origine.commit?.slice(0, 7)}`,
      rejeu: `l'assemblage rejoué au commit ${origine.commit?.slice(0, 7)}`,
    }[origine.source];
    lignes.push(
      origine.exacte
        ? `Origine prise dans ${depuis}.`
        : `Diff approché : depuis ${depuis}, d'une autre empreinte que celle du manifeste (fichier que l'assembleur ` +
            "retouche, ou fusionné par une mise à jour) ; il mêle les retouches de l'assembleur à celles de l'appli" +
            (resultat.rejouer ? "." : " (--rejouer donne l'origine exacte)."),
      "",
      "```diff",
      diff.trimEnd(),
      "```",
      ""
    );
  }
  if (notes.length > 0) {
    lignes.push(`## Notes citées (${ADAPTATIONS})`, "");
    for (const note of notes) lignes.push(...note.texte.split("\n").map((ligne) => `> ${ligne}`), "");
  }
  return `${lignes.join("\n").trimEnd()}\n`;
}

// ---------------------------------------------------------------- ligne de commande

const AIDE = `Usage : node outils/adaptations.mjs <dossier-de-l-appli> [--json] [--rejouer]

Liste les fichiers venus du catalogue (catalogue.empreintes.json de l'appli)
que l'appli a retouchés ou supprimés, avec le diff depuis le fichier tel que
l'assemblage l'a donné et la note d'ADAPTATIONS.md, ou « sans note ».
Lit le HEAD de l'appli : ce qui n'est pas commité n'est pas lu.

  --json      la même chose en JSON, pour les outils suivants
  --rejouer   un diff exact au lieu d'approché (fichier fusionné par une mise à
              jour, que l'assembleur retouche) : rejoue l'assemblage noté au
              manifeste dans un worktree temporaire du catalogue, avec Prettier ;
              npm ci, donc le réseau, si le Prettier de ce commit n'est pas celui
              du catalogue

Lecture seule : rien n'est écrit dans l'appli ; le worktree temporaire est retiré.
Sans --rejouer, pas de réseau.`;

function main(argv) {
  const positionnels = argv.filter((argument) => !argument.startsWith("-"));
  const inconnue = argv.find(
    (argument) => argument.startsWith("-") && !["--json", "--rejouer", "--aide", "-h"].includes(argument)
  );
  if (argv.length === 0 || argv.includes("--aide") || argv.includes("-h")) {
    console.log(AIDE);
    return;
  }
  if (inconnue !== undefined) throw new ErreurAdaptations(`Option inconnue « ${inconnue} ».\n\n${AIDE}`);
  if (positionnels.length !== 1) throw new ErreurAdaptations(`Un seul dossier d'appli attendu.\n\n${AIDE}`);
  const catalogue = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const resultat = adaptations({ appli: positionnels[0], catalogue, rejouer: argv.includes("--rejouer") });
  process.stdout.write(argv.includes("--json") ? `${JSON.stringify(resultat, null, 2)}\n` : rapport(resultat));
}

// Résolu par realpath, comme outils/assembler.mjs : un catalogue atteint par un lien doit marcher.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (erreur) {
    if (erreur instanceof ErreurAdaptations) {
      console.error(`Lecture refusée : ${erreur.message}`);
      process.exit(1);
    }
    throw erreur;
  }
}
