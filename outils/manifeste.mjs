/*
 * Le manifeste d'empreintes d'une appli assemblée (catalogue.empreintes.json,
 * écrit par outils/assembler.mjs) : le lire au HEAD de l'appli, le vérifier, et
 * dire quels fichiers venus du catalogue l'appli a retouchés ou supprimés.
 *
 * Partagé entre les outils qui comparent l'appli au manifeste. Repris tel quel
 * de outils/mettre-a-jour.mjs, qui garde pour l'heure sa propre copie : deux
 * sessions le modifiaient en même temps que celle qui a créé ce module, le
 * 2026-11-05. Son branchement ici est la suite prévue.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { environnementDeGit } from "./assembler.mjs";

export const MANIFESTE = "catalogue.empreintes.json";

export class ErreurManifeste extends Error {
  constructor(message) {
    super(message);
    this.name = "ErreurManifeste";
  }
}

export const empreinte = (contenu) => createHash("sha256").update(contenu).digest("hex");

/*
 * Le contenu de chaque fichier d'un commit, tel que git l'enregistre : celui
 * dont le manifeste a pris l'empreinte. Le disque d'un poste Windows peut
 * porter des fins de ligne CRLF que git ne voit pas : lu sur le disque, un
 * fichier intact passerait pour retouché.
 */
export function contenusDuCommit(depot, commit = "HEAD") {
  const entrees = execFileSync("git", ["-C", depot, "ls-tree", "-r", "-z", commit], {
    encoding: "utf-8",
    env: environnementDeGit(),
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean)
    .map((ligne) => {
      // Au premier « \t » seulement : un chemin peut en contenir un.
      const tabulation = ligne.indexOf("\t");
      const [, type, objet] = ligne.slice(0, tabulation).split(" ");
      return { chemin: ligne.slice(tabulation + 1), type, objet };
    })
    .filter(({ type }) => type === "blob");
  const contenus = new Map();
  const lus = lireDesObjets(
    depot,
    entrees.map(({ objet }) => objet)
  );
  entrees.forEach(({ chemin }, rang) => contenus.set(chemin, lus[rang]));
  return contenus;
}

// Le contenu d'objets git, en un seul appel ; undefined pour un objet absent.
export function lireDesObjets(depot, objets) {
  if (objets.length === 0) return [];
  const sortie = execFileSync("git", ["-C", depot, "cat-file", "--batch"], {
    input: objets.map((objet) => `${objet}\n`).join(""),
    env: environnementDeGit(),
    maxBuffer: 1024 * 1024 * 1024,
  });
  const contenus = [];
  let curseur = 0;
  for (let rang = 0; rang < objets.length; rang++) {
    // « <objet> blob <taille> », puis le contenu, puis un saut de ligne ;
    // « <objet> missing » pour un objet absent.
    const finEntete = sortie.indexOf(0x0a, curseur);
    const entete = sortie.toString("latin1", curseur, finEntete).split(" ");
    if (entete[1] === "missing" || entete.length < 3) {
      contenus.push(undefined);
      curseur = finEntete + 1;
      continue;
    }
    const taille = Number(entete[2]);
    contenus.push(sortie.subarray(finEntete + 1, finEntete + 1 + taille));
    curseur = finEntete + 1 + taille + 1;
  }
  return contenus;
}

const illisible = (quoi) =>
  new ErreurManifeste(`${MANIFESTE} de l'appli est illisible : ${quoi}. Il a été retouché à la main ?`);

/*
 * Ce que tout outil qui compare l'appli au manifeste exige : les formats 1 et
 * 2, le commit du catalogue, une unité et une empreinte par fichier. Ce que le
 * rejeu de l'assemblage exige en plus (réglages du format 2, catalogue sans
 * modification non commitée) reste à outils/mettre-a-jour.mjs.
 */
export function verifierLesEmpreintes(manifeste) {
  if (typeof manifeste !== "object" || manifeste === null || Array.isArray(manifeste)) throw illisible("pas un objet");
  if (manifeste.format !== 1 && manifeste.format !== 2) {
    throw new ErreurManifeste(
      `${MANIFESTE} de l'appli est au format ${manifeste.format}, que cet outil ne lit pas (formats 1 et 2) : ` +
        "mettre le catalogue à jour (git pull), puis relancer."
    );
  }
  if (typeof manifeste.catalogue !== "object" || manifeste.catalogue === null) throw illisible("pas de catalogue");
  if (typeof manifeste.catalogue.commit !== "string" || manifeste.catalogue.commit === "") {
    throw illisible("pas de catalogue.commit");
  }
  if (typeof manifeste.fichiers !== "object" || manifeste.fichiers === null) throw illisible("pas de fichiers");
  for (const [chemin, entree] of Object.entries(manifeste.fichiers)) {
    if (typeof entree?.unite !== "string" || !/^[0-9a-f]{64}$/.test(entree?.sha256 ?? "")) {
      throw illisible(`l'entrée de ${chemin} n'a pas d'unité ou d'empreinte sha256`);
    }
  }
}

// Le manifeste lu dans les contenus d'un commit de l'appli, et vérifié.
export function manifesteDe(contenus) {
  if (!contenus.has(MANIFESTE)) {
    throw new ErreurManifeste(
      `L'appli n'a pas de manifeste (${MANIFESTE}) à son HEAD : assemblée avant le 2026-11-02, ou pas assemblée ` +
        "depuis le catalogue, elle ne dit pas quels fichiers en viennent."
    );
  }
  let manifeste;
  try {
    manifeste = JSON.parse(contenus.get(MANIFESTE).toString("utf-8"));
  } catch (erreur) {
    throw new ErreurManifeste(`${MANIFESTE} de l'appli n'est pas du JSON lisible : ${erreur.message}`);
  }
  verifierLesEmpreintes(manifeste);
  return manifeste;
}

/*
 * Les fichiers du manifeste que l'appli a retouchés (empreinte différente) ou
 * supprimés, triés. `attendus` : les empreintes à comparer, celles du
 * manifeste par défaut ; outils/mettre-a-jour.mjs y ajoute NOTICE, que
 * l'assembleur écrit sans l'inscrire.
 */
export function ecartsAuManifeste(contenus, attendus) {
  const retouches = [];
  const supprimes = [];
  for (const [chemin, sha256] of attendus) {
    const contenu = contenus.get(chemin);
    if (contenu === undefined) supprimes.push(chemin);
    else if (empreinte(contenu) !== sha256) retouches.push(chemin);
  }
  return { retouches: retouches.sort(), supprimes: supprimes.sort() };
}

export const empreintesDuManifeste = (manifeste) =>
  Object.entries(manifeste.fichiers).map(([chemin, { sha256 }]) => [chemin, sha256]);
