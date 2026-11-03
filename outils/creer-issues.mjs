#!/usr/bin/env node
/*
 * Issues de la section 9 : lit les étapes « Pour poursuivre » d'une blueprint
 * (format : .claude/skills/creer-appli/blueprint-modele.md) et en crée une
 * issue GitHub chacune, par `gh`.
 *
 *   node outils/creer-issues.mjs --blueprint <fichier> --depot <proprietaire/nom> [--confirmer]
 *
 * À blanc par défaut : il affiche chaque issue (titre, corps, dépendances) et
 * ne crée rien. Les numéros annoncés dans les lignes « Bloqué par #n » sont
 * ceux qui suivent le dernier ticket ou la dernière PR du dépôt : à la
 * création, il vérifie que GitHub a donné ces numéros, et s'arrête net au
 * premier écart. Le dépôt se nomme toujours : aucun dépôt par défaut, pour ne
 * jamais écrire dans celui du catalogue par inadvertance.
 *
 * Il ne touche ni au code, ni à une base, ni à la protection de main. Ce qui
 * crée (--confirmer) se tape à la main, comme les scripts de données.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { NOM_DU_CATALOGUE } from "./modules.mjs";

export class ErreurIssues extends Error {
  constructor(message) {
    super(message);
    this.name = "ErreurIssues";
  }
}

const ETIQUETTE_VERIFIABLE = "Vérifiable à l'écran";
const ETIQUETTE_DEPENDANCES = "Bloqué par";

// Le fichier que l'assembleur écrit à la racine de l'appli : c'est le renvoi
// que porte chaque issue, lisible dès l'ouverture du dépôt du client.
const BLUEPRINT_DE_L_APPLI = "blueprint.md";

// « Vérifiable à l'écran : », avec l'apostrophe droite ou typographique (un
// texte français les mélange), en liste ou en gras (« - **Bloqué par** : »).
const debutDeChamp = (etiquette) =>
  new RegExp(`^(?:[-*]\\s+)?(?:\\*\\*)?${etiquette.replace("'", "['’]")}\\s*(?:\\*\\*)?\\s*:\\s*(?:\\*\\*)?\\s*`, "i");

// Un exemple de section 9 dans un bloc de code (comme celui du modèle de
// blueprint) ne doit ouvrir ni section, ni étape, ni champ.
const BORNE_DE_BLOC = /^\s*(```|~~~)/;

function lignesDeBloc(lignes) {
  let ouvert = false;
  return lignes.map((ligne) => {
    if (BORNE_DE_BLOC.test(ligne)) {
      ouvert = !ouvert;
      return true;
    }
    return ouvert;
  });
}

/*
 * Lecture de la section 9. Une étape est un sous-titre « ### 9.n Titre », puis
 * des paragraphes : le contenu (tout ce qui n'est pas un champ), un paragraphe
 * « Vérifiable à l'écran : … » et un paragraphe « Bloqué par : … ». Les
 * problèmes se rassemblent : un seul passage corrige toute la section.
 */
export function lireLesEtapes(texte) {
  const lignes = texte.split(/\r?\n/);
  const enBloc = lignesDeBloc(lignes);
  const debut = lignes.findIndex((ligne, i) => !enBloc[i] && /^## 9[.\s]/.test(ligne));
  if (debut === -1) {
    throw new ErreurIssues("La blueprint n'a pas de section 9 (un titre « ## 9. Pour poursuivre »).");
  }
  let fin = lignes.findIndex((ligne, i) => i > debut && !enBloc[i] && /^## /.test(ligne));
  if (fin === -1) fin = lignes.length;

  // Seul « ### 9.n » ouvre une étape : un autre sous-titre appartient au contenu.
  const departs = [];
  for (let i = debut + 1; i < fin; i++) {
    const m = enBloc[i] ? null : /^### 9\.(\d+)\s+(.+?)\s*$/.exec(lignes[i]);
    if (m) departs.push({ i, numero: Number(m[1]), titre: m[2] });
  }
  if (departs.length === 0) {
    throw new ErreurIssues(
      "La section 9 n'a aucune étape au format « ### 9.1 Titre » : voir la section 9 du modèle de blueprint " +
        "(chaque étape : un titre, son contenu, « Vérifiable à l'écran : … », « Bloqué par : … »)."
    );
  }

  const problemes = [];
  const etapes = departs.map((depart, rang) => {
    const reference = `9.${depart.numero}`;
    if (depart.numero !== rang + 1) {
      problemes.push(
        `Les étapes se numérotent 9.1, 9.2, 9.3… sans trou : « ${reference} » est à la place de 9.${rang + 1}.`
      );
    }
    // Les paragraphes se coupent aux lignes vides, sauf dans un bloc de code.
    const paragraphes = [];
    let courant = [];
    const fermer = () => {
      if (courant.length > 0) paragraphes.push(courant);
      courant = [];
    };
    const finDeLEtape = rang + 1 < departs.length ? departs[rang + 1].i : fin;
    for (let i = depart.i + 1; i < finDeLEtape; i++) {
      if (!enBloc[i] && lignes[i].trim() === "") fermer();
      else courant.push({ ligne: lignes[i], code: enBloc[i] });
    }
    fermer();
    const champs = { verifiable: [], bloquePar: [] };
    const contenu = [];
    // Un paragraphe peut porter les deux champs, sur deux lignes consécutives.
    for (const paragraphe of paragraphes) {
      const reste = [];
      let champCourant = null;
      for (const { ligne, code } of paragraphe) {
        if (code) {
          champCourant = null;
          reste.push(ligne);
        } else if (debutDeChamp(ETIQUETTE_VERIFIABLE).test(ligne)) {
          champCourant = "verifiable";
          champs.verifiable.push(ligne.replace(debutDeChamp(ETIQUETTE_VERIFIABLE), ""));
        } else if (debutDeChamp(ETIQUETTE_DEPENDANCES).test(ligne)) {
          champCourant = "bloquePar";
          champs.bloquePar.push(ligne.replace(debutDeChamp(ETIQUETTE_DEPENDANCES), ""));
        } else if (champCourant) {
          // Suite d'un champ écrit sur plusieurs lignes.
          const liste = champs[champCourant];
          liste[liste.length - 1] += ` ${ligne.trim()}`;
        } else {
          reste.push(ligne);
        }
      }
      if (reste.length > 0) contenu.push(reste.join("\n"));
    }

    const etape = {
      numero: depart.numero,
      reference,
      titre: depart.titre,
      contenu: contenu.join("\n\n").trim(),
      verifiable: "",
      /** @type {number[]} */
      bloquePar: [],
    };
    if (etape.contenu === "") problemes.push(`${reference} : le contenu de l'étape est vide.`);

    if (champs.verifiable.length !== 1 || champs.verifiable[0].trim() === "") {
      problemes.push(`${reference} : un seul champ « ${ETIQUETTE_VERIFIABLE} : … » non vide est attendu.`);
    }
    etape.verifiable = (champs.verifiable[0] ?? "").trim();

    if (champs.bloquePar.length !== 1) {
      problemes.push(
        `${reference} : un seul champ « ${ETIQUETTE_DEPENDANCES} : … » est attendu (« aucune » s'il n'y en a pas).`
      );
    } else {
      const valeur = champs.bloquePar[0].trim().replace(/\.$/, "");
      if (!/^aucune$/i.test(valeur)) {
        for (const morceau of valeur.split(",").map((m) => m.trim())) {
          const m = /^9\.(\d+)$/.exec(morceau);
          if (!m || Number(m[1]) < 1 || Number(m[1]) >= depart.numero) {
            problemes.push(
              `${reference} : « ${ETIQUETTE_DEPENDANCES} : ${valeur} » : « aucune », ou des étapes précédentes séparées par des virgules (9.1, 9.3).`
            );
            etape.bloquePar = [];
            break;
          }
          if (!etape.bloquePar.includes(Number(m[1]))) etape.bloquePar.push(Number(m[1]));
        }
      }
    }
    return etape;
  });

  // Le contrôle des doublons côté GitHub compare les titres : ils doivent différer.
  const parTitre = new Map();
  for (const etape of etapes) {
    const deja = parTitre.get(etape.titre);
    if (deja) problemes.push(`Les étapes ${deja} et ${etape.reference} ont le même titre : « ${etape.titre} ».`);
    else parTitre.set(etape.titre, etape.reference);
  }

  if (problemes.length > 0) {
    throw new ErreurIssues(
      `La section 9 de la blueprint n'est pas lisible :\n${problemes.map((p) => `- ${p}`).join("\n")}`
    );
  }
  return etapes;
}

// Les numéros d'issue sont annoncés avant la création : ils suivent, dans
// l'ordre des étapes, le numéro suivant du dépôt. C'est ce que `creerLesIssues`
// vérifie ensuite.
export function planDesIssues(etapes, { premierNumero }) {
  return etapes.map((etape, rang) => {
    const issue = premierNumero + rang;
    const bloquePar = etape.bloquePar.map((numero) => premierNumero + numero - 1);
    const corps = [
      etape.contenu,
      `**${ETIQUETTE_VERIFIABLE}** : ${etape.verifiable}`,
      `Blueprint : \`${BLUEPRINT_DE_L_APPLI}\`, section 9, étape ${etape.reference}.`,
      ...(bloquePar.length > 0 ? [`${ETIQUETTE_DEPENDANCES} ${bloquePar.map((n) => `#${n}`).join(", ")}`] : []),
    ].join("\n\n");
    return { reference: etape.reference, titre: etape.titre, corps, issue, bloquePar };
  });
}

export function creerLesIssues({ plan, gh, depot }) {
  const crees = [];
  for (const etape of plan) {
    let sortie;
    try {
      sortie = gh(["issue", "create", "--repo", depot, "--title", etape.titre, "--body-file", "-"], etape.corps);
    } catch (erreur) {
      // Une panne de gh (réseau, quota) en cours de route ne doit pas faire
      // oublier ce qui est déjà créé : la relance serait refusée sans le dire.
      throw new ErreurIssues(
        `${erreur.message}\nÉtape ${etape.reference} non créée. ${resume(crees)}` +
          `Vérifier le dépôt, fermer ces issues (gh issue close <n> --repo ${depot} --reason "not planned"), puis relancer l'outil.`
      );
    }
    const trouve = /\/issues\/(\d+)\s*$/.exec(sortie.trim());
    if (!trouve) {
      throw new ErreurIssues(
        `gh n'a pas rendu l'adresse de l'issue de l'étape ${etape.reference} : « ${sortie.trim()} ». ` +
          `${resume(crees)}Vérifier le dépôt avant de relancer.`
      );
    }
    const obtenu = Number(trouve[1]);
    crees.push({ ...etape, issue: obtenu, annonce: etape.issue });
    if (obtenu !== etape.issue) {
      throw new ErreurIssues(
        `Issue de l'étape ${etape.reference} créée sous le #${obtenu}, le #${etape.issue} était annoncé : ` +
          "quelqu'un a ouvert un ticket ou une PR en même temps (ou un ticket supprimé a laissé un trou). " +
          "Les lignes « Bloqué par » des étapes suivantes seraient fausses : rien d'autre n'est créé.\n" +
          `${resume(crees)}` +
          `Pour reprendre : fermer chacune de ces issues (gh issue close <n> --repo ${depot} --reason "not planned"), puis relancer l'outil, qui repart du numéro suivant.`
      );
    }
  }
  return crees;
}

function resume(crees) {
  if (crees.length === 0) return "";
  return `Déjà créées : ${crees.map((c) => `#${c.issue} (${c.reference})`).join(", ")}. `;
}

const AIDE = `Usage :
  node outils/creer-issues.mjs --blueprint <fichier> --depot <proprietaire/nom> [--confirmer]

Lit la section 9 de la blueprint (une étape par « ### 9.n Titre », avec « Vérifiable à
l'écran : … » et « Bloqué par : … », voir blueprint-modele.md) et prépare une issue
GitHub par étape.

Options :
  --blueprint <fichier>   la blueprint (celle de l'appli : blueprint.md à la racine du dépôt assemblé)
  --depot <proprietaire/nom>   le dépôt où créer les issues (aucun dépôt par défaut)
  --confirmer             crée réellement les issues ; sans lui, tout reste à blanc
  --aide                  cette aide

À blanc, l'outil lit GitHub (le dernier numéro du dépôt, les issues ouvertes) mais ne
crée rien. Avec --confirmer, il vérifie que chaque issue prend le numéro annoncé par les
lignes « Bloqué par » et s'arrête net au premier écart. Il refuse une étape dont le titre
est déjà celui d'une issue ouverte du dépôt.`;

function lireOptions(argv) {
  const options = { valeurs: {}, drapeaux: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === "--aide" || argument === "-h") options.drapeaux.add("aide");
    else if (argument === "--confirmer") options.drapeaux.add("confirmer");
    else if (["--blueprint", "--depot"].includes(argument)) {
      const valeur = argv[++i];
      if (valeur === undefined || valeur.startsWith("--")) throw new ErreurIssues(`${argument} attend une valeur.`);
      options.valeurs[argument.slice(2)] = valeur;
    } else throw new ErreurIssues(`Option inconnue « ${argument} ».\n\n${AIDE}`);
  }
  return options;
}

function ghParDefaut(args, entree) {
  try {
    return execFileSync("gh", args, { encoding: "utf8", input: entree, stdio: ["pipe", "pipe", "pipe"] });
  } catch (erreur) {
    const detail = String(erreur.stderr ?? erreur.message).trim();
    throw new ErreurIssues(`gh ${args.slice(0, 2).join(" ")} a échoué : ${detail}`);
  }
}

function numeroSuivant(gh, depot) {
  // L'API des issues liste aussi les PR : le numéro est partagé entre les deux.
  const sortie = gh([
    "api",
    `repos/${depot}/issues?state=all&per_page=1&sort=created&direction=desc`,
    "--jq",
    ".[0].number // 0",
  ]);
  const dernier = Number(sortie.trim());
  if (!Number.isInteger(dernier)) throw new ErreurIssues(`Dernier numéro du dépôt illisible : « ${sortie.trim()} ».`);
  return dernier + 1;
}

function titresDejaOuverts(gh, depot) {
  const sortie = gh(["issue", "list", "--repo", depot, "--state", "open", "--limit", "1000", "--json", "title"]);
  return new Set(JSON.parse(sortie).map((issue) => issue.title));
}

export function executer(
  argv,
  { gh = ghParDefaut, lireBlueprint = (chemin) => fs.readFileSync(chemin, "utf8"), ecrire = console.log } = {}
) {
  const options = lireOptions(argv);
  if (options.drapeaux.has("aide") || argv.length === 0) {
    ecrire(AIDE);
    return;
  }
  const { blueprint, depot } = options.valeurs;
  if (!blueprint) throw new ErreurIssues(`--blueprint est requis.\n\n${AIDE}`);
  if (!depot) throw new ErreurIssues(`--depot est requis : aucun dépôt par défaut.\n\n${AIDE}`);
  if (!/^[\w.-]+\/[\w.-]+$/.test(depot)) {
    throw new ErreurIssues(`--depot s'écrit proprietaire/nom (reçu « ${depot} »).`);
  }
  // Les issues de la section 9 sont celles d'une appli : le dépôt du catalogue
  // n'en reçoit jamais (à blanc, il reste lisible pour voir une sortie).
  if (options.drapeaux.has("confirmer") && depot.split("/")[1].toLowerCase() === NOM_DU_CATALOGUE) {
    throw new ErreurIssues(`--confirmer refuse le dépôt du catalogue (${NOM_DU_CATALOGUE}) : donner celui de l'appli.`);
  }

  let texte;
  try {
    texte = lireBlueprint(blueprint);
  } catch {
    throw new ErreurIssues(`La blueprint « ${blueprint} » est introuvable ou illisible.`);
  }
  const etapes = lireLesEtapes(texte);

  const ouverts = titresDejaOuverts(gh, depot);
  const deja = etapes.filter((etape) => ouverts.has(etape.titre));
  if (deja.length > 0) {
    throw new ErreurIssues(
      `Des issues ouvertes de ${depot} portent déjà le titre de ${deja.map((e) => `${e.reference} « ${e.titre} »`).join(", ")} : ` +
        "les issues de cette section sont-elles déjà créées ? Rien n'est créé."
    );
  }

  const plan = planDesIssues(etapes, { premierNumero: numeroSuivant(gh, depot) });
  const premier = plan[0].issue;
  const dernier = plan[plan.length - 1].issue;

  if (!options.drapeaux.has("confirmer")) {
    ecrire(
      `À blanc : ${plan.length} issues seraient créées dans ${depot}, du #${premier} au #${dernier}. Rien n'est créé.`
    );
    for (const etape of plan) {
      ecrire(`\n=== #${etape.issue} · ${etape.reference} · ${etape.titre}`);
      ecrire(
        etape.bloquePar.length > 0
          ? `Dépendances : ${etape.bloquePar.map((n) => `#${n}`).join(", ")}`
          : "Dépendances : aucune"
      );
      ecrire(`\n${etape.corps}`);
    }
    ecrire(`\nÀ relire, puis à lancer par un humain avec --confirmer pour créer ces ${plan.length} issues.`);
    return;
  }

  const crees = creerLesIssues({ plan, gh, depot });
  for (const etape of crees) ecrire(`Créée : #${etape.issue} · ${etape.reference} · ${etape.titre}`);
  ecrire(
    `${crees.length} issues créées dans ${depot}, du #${premier} au #${dernier}, chacune avec ses « Bloqué par » exacts.`
  );
}

// Node résout le module principal par realpath : argv[1] garde le lien ou la
// jonction par lesquels on a lancé la commande (même garde que l'assembleur).
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    executer(process.argv.slice(2));
  } catch (erreur) {
    if (erreur instanceof ErreurIssues) {
      console.error(`Issues refusées : ${erreur.message}`);
      process.exit(1);
    }
    throw erreur;
  }
}
