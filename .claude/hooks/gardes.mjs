// Gardes PreToolUse du harnais (branchées dans .claude/settings.json) :
// refusent à Claude les gestes qui versent un secret dans le dépôt, touchent la
// prod ou défont un filet de sécurité (force sur le distant, hooks git sautés).
// Dans une appli assemblée, elles rappellent aussi, sans refuser, de noter
// toute retouche d'un fichier venu du catalogue (section « Adaptations d'une
// appli assemblée »).
// Chaque règle renvoie à l'incident qui l'a fait naître (projets précédents,
// septembre-octobre 2026), ou dit qu'il n'y en a pas.
//
// Le reste est tenu côté GitHub (protection de branche, CI obligatoire) : ce
// script ne refait pas ce que GitHub fait déjà pour tout le monde.
//
// Sans dépendance : il tourne avant tout `npm install`, sur n'importe quel poste.
// Test : `node .claude/hooks/gardes.test.mjs` (lancé par la CI). Un garde qui
// bloque à tort se corrige avec un cas de test, comme un garde qui laisse passer.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Une URL de base qui porte un mot de passe et ne vise pas la machine locale :
// collée dans PowerShell, l'URL de prod est restée dans l'historique et il a
// fallu changer les identifiants (2026-09-21).
const URL_BASE_DISTANTE =
  /\b(postgres(ql)?|mysql|mariadb|mongodb(\+srv)?|redis):\/\/[^\s:@'"/]+:[^\s@'"]+@(?!(localhost|127\.0\.0\.1|\[::1\])([:/\s'"]|$))/;

// Le corps d'un heredoc (`<<'EOF' … EOF`) ou d'une here-string PowerShell
// (`@' … '@`) est du texte, pas une commande : un message de commit qui citait
// « gh pr merge » bloquait son propre commit (2026-10-08).
const sansTexteLibre = (commande) =>
  commande
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, "")
    .replace(/@'\r?\n[\s\S]*?\r?\n'@/g, "")
    .replace(/@"\r?\n[\s\S]*?\r?\n"@/g, "");

// Découpe en commandes simples (`;`, `&&`, `||`, `|`, `&`, retour à la ligne),
// sans couper à l'intérieur des guillemets : `-m "a; gh pr merge"` reste un
// seul argument.
function segments(commande) {
  const texte = sansTexteLibre(commande);
  const resultat = [];
  let courant = "";
  let guillemet = null;
  for (const c of texte) {
    if (guillemet) {
      courant += c;
      if (c === guillemet) guillemet = null;
    } else if (c === '"' || c === "'") {
      guillemet = c;
      courant += c;
    } else if (";|&\n\r".includes(c)) {
      resultat.push(courant);
      courant = "";
    } else courant += c;
  }
  resultat.push(courant);
  return resultat.map((s) => s.trim()).filter(Boolean);
}

const mots = (segment) => (segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((m) => m.replace(/^(["'])(.*)\1$/, "$2"));

// Retire les affectations de variables en tête (`DATABASE_URL=… npm test`).
const commandeNue = (m) => {
  let i = 0;
  while (i < m.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(m[i])) i++;
  if (m[i] === "env") i++;
  return m.slice(i);
};

const estOutil = (mot, nom) => mot !== undefined && new RegExp(`(^|[\\\\/])${nom}(\\.exe)?$`, "i").test(mot);

// Les arguments d'une sous-commande git, options globales sautées
// (`git -C app add`, `git -c clé=valeur push`) ; null pour toute autre commande.
const GLOBALE_A_VALEUR = /^(-[Cc]|--git-dir|--work-tree|--namespace|--config-env)$/;
function argumentsGit(m, sousCommande) {
  if (!estOutil(m[0], "git")) return null;
  let i = 1;
  while (i < m.length && m[i].startsWith("-")) {
    if (GLOBALE_A_VALEUR.test(m[i])) i++;
    i++;
  }
  return m[i] === sousCommande ? m.slice(i + 1) : null;
}

// `git add -f` : passerait outre le .gitignore, qui exclut données client et secrets.
const gitAddForce = (m) =>
  argumentsGit(m, "add")?.some((a) => a === "--force" || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a)) ?? false;

// `git push --force` écrase sur le distant ce qu'une autre session a poussé sur la
// même branche entre-temps, sans le voir. Plusieurs sessions travaillent en
// parallèle : le risque est permanent, sans incident vécu à ce jour.
// `--force-with-lease`, que `solstice-livrer` prévoit après un rebase, refuse
// justement ce cas : il passe. Forcent aussi : `-f` seul ou groupé (`-uf`), un
// refspec `+branche`, `--mirror`. Le garde arrête le geste habituel, pas un
// contournement : abréviation d'option, alias git, commande passée à `sh -c` ou
// `pwsh -Command`, `remote.<nom>.push` qui force, suppression de branche distante
// (`--delete`, `:branche`, `--prune`) restent hors champ.
const gitPushForce = (m) =>
  argumentsGit(m, "push")?.some(
    (a) => a === "--force" || a === "--mirror" || /^-[46dnquv]*f/.test(a) || a.startsWith("+")
  ) ?? false;

// Options de git commit dont la valeur est le mot suivant : `-m "-n"` est un
// message, pas l'option `-n`.
const VALEUR_COMMIT = new Set([
  "-m",
  "-F",
  "-c",
  "-C",
  "-t",
  "--message",
  "--file",
  "--author",
  "--date",
  "--template",
  "--reuse-message",
  "--reedit-message",
  "--fixup",
  "--squash",
  "--trailer",
  "--cleanup",
  "--pathspec-from-file",
]);

// `--no-verify` saute les hooks git (pre-commit, commit-msg, pre-push) qu'un poste
// ou une appli pose pour arrêter un commit ou un envoi : ce qu'ils signalent se
// corrige, il ne se saute pas. Pour git commit, `-n` en est la forme courte, seule
// ou groupée (`-anm`) ; pour git push, `-n` est l'essai à blanc. Hors champ, comme
// pour la force : `--no-verify` d'autres commandes (merge, rebase, am),
// `core.hooksPath` détourné.
function gitSansHooks(m) {
  const push = argumentsGit(m, "push");
  if (push) return push.includes("--no-verify");
  const commit = argumentsGit(m, "commit") ?? [];
  for (let i = 0; i < commit.length; i++) {
    const a = commit[i];
    if (a === "--") break;
    if (a === "--no-verify") return true;
    if (VALEUR_COMMIT.has(a)) i++;
    else if (/^-[^-]/.test(a)) {
      // Dans un groupe, une option à valeur prend le reste du groupe (`-mn` est le
      // message « n »), ou le mot suivant si elle le clôt (`-am "-n"`).
      const lettres = a.slice(1);
      const k = lettres.search(/[nmFcCtSu]/);
      if (k === -1) continue;
      if (lettres[k] === "n") return true;
      if (k === lettres.length - 1 && "mFcCt".includes(lettres[k])) i++;
    }
  }
  return false;
}

// `gh pr merge` : la fusion revient à un humain, fusionner c'est mettre en ligne.
const ghMerge = (m) =>
  estOutil(m[0], "gh") &&
  ((m[1] === "pr" && m[2] === "merge") || (m[1] === "api" && m.some((a) => /\/pulls\/\d+\/merge\b/.test(a))));

export function verifierCommande(commande) {
  if (URL_BASE_DISTANTE.test(commande))
    return [
      "deny",
      "URL de base distante en clair : l'historique du shell la garde (incident du 2026-09-21). La passer par une variable d'environnement saisie sans écho.",
    ];
  for (const s of segments(commande)) {
    const m = commandeNue(mots(s));
    if (m.some((a) => a === "--confirmer" || a.startsWith("--confirmer=")))
      return [
        "deny",
        "--confirmer fait écrire un script en vrai : un humain le tape lui-même, après avoir relu le rapport du dry-run.",
      ];
    if (gitAddForce(m))
      return ["deny", "git add -f passerait outre le .gitignore, qui exclut les données client et les secrets."];
    if (gitPushForce(m))
      return [
        "deny",
        "git push --force écrase sur le distant ce qu'une autre session a pu pousser entre-temps. Après un rebase, sur sa propre branche : git push --force-with-lease.",
      ];
    if (gitSansHooks(m))
      return [
        "deny",
        "--no-verify saute les hooks git posés pour arrêter un commit ou un envoi : corriger ce qu'ils signalent plutôt que les sauter.",
      ];
    if (ghMerge(m))
      return [
        "deny",
        "La fusion d'une pull request revient à la personne responsable des fusions : fusionner, c'est mettre en ligne.",
      ];
  }
  return null;
}

export function verifierEcriture(chemin, contenu) {
  const nom = chemin.replace(/\\/g, "/").split("/").pop();
  if (/^\.env(\.|$)/.test(nom) && !nom.endsWith(".example"))
    return [
      "deny",
      `${nom} porte des secrets : Claude ne l'écrit pas. Le modèle des variables va dans .env.example, les valeurs chez l'hébergeur.`,
    ];
  if (URL_BASE_DISTANTE.test(contenu))
    return [
      "deny",
      "URL de base distante avec mot de passe : un secret ne s'écrit dans aucun fichier du dépôt. Lire DATABASE_URL depuis l'environnement.",
    ];
  return null;
}

// --- Adaptations d'une appli assemblée -------------------------------------
//
// Dans une appli assemblée, catalogue.empreintes.json liste les fichiers venus
// du catalogue. En modifier un, c'est une adaptation : normale, mais muette.
// Le 2026-11-05, sur l'appli d'essai tours-de-coloc, trois retouches (la
// vitrine du kit et les écrans du patron retirés, l'accueil livré vide rempli,
// l'onglet de la coloc) n'ont été remontées au catalogue qu'une fois vues à
// l'écran. La garde laisse donc passer et rappelle de noter l'adaptation dans
// ADAPTATIONS.md, jusqu'à ce qu'elle y soit. Le catalogue lui-même n'a pas de
// manifeste : rien ne s'y déclenche. Un fichier écrit ou supprimé par une
// commande (sed -i, Set-Content, rm, git rm) échappe au rappel : l'outil des
// adaptations du catalogue (adaptations.mjs), lancé depuis le catalogue, le
// retrouve. L'appli n'a pas l'outillage du catalogue, d'où le nom sans son chemin.

const MANIFESTE = "catalogue.empreintes.json";
export const ADAPTATIONS = "ADAPTATIONS.md";

// Les blocs de code ne sont pas des entrées : l'en-tête d'ADAPTATIONS.md en
// montre une en exemple.
const sansBlocsDeCode = (texte) => texte.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "");

// Une ligne de champ de l'entrée (« - Fichiers : », « - **Nature** : ») ; une
// ligne de suite (« - `src/app/exemples/` » en retrait) n'en est pas une.
const CHAMP = /^[-*]\s+\**\s*([\p{L}' ]+?)\s*\**\s*:/u;
const champ = (ligne) => CHAMP.exec(ligne.trim())?.[1].toLowerCase();

/**
 * Les entrées d'ADAPTATIONS.md : une par titre `## `, ses chemins cités entre
 * accents graves sur la ligne « Fichiers » et ses lignes de suite, sa nature,
 * et son texte tel quel. L'outil des adaptations du catalogue l'importe : une
 * seule lecture, celle que l'appli reçoit. Lue avec indulgence (champ en gras,
 * liste sur plusieurs lignes, barres obliques inverses, apostrophe
 * typographique) : une note mal lue ferait revenir le rappel à chaque écriture.
 */
export function entreesDesAdaptations(texte) {
  const entrees = [];
  for (const partie of sansBlocsDeCode(texte.replace(/\r\n/g, "\n")).split(/^(?=## )/m)) {
    if (!partie.startsWith("## ")) continue;
    const lignes = partie.trimEnd().split("\n");
    const debut = lignes.findIndex((ligne) => /^fichiers?$/.test(champ(ligne) ?? ""));
    const lignesFichiers = [];
    for (let i = debut; debut !== -1 && i < lignes.length; i++) {
      if (i > debut && champ(lignes[i]) !== undefined) break;
      lignesFichiers.push(lignes[i]);
    }
    const chemins = [...lignesFichiers.join("\n").matchAll(/`([^`]+)`/g)].map(([, chemin]) =>
      chemin.trim().replace(/\\/g, "/").replace(/^\.\//, "")
    );
    const ligneNature = lignes.find((ligne) => champ(ligne) === "nature") ?? "";
    const nature = /défaut du catalogue|propre à l['’]appli/i.exec(ligneNature)?.[0].toLowerCase().replace("’", "'");
    entrees.push({ titre: lignes[0].slice(3).trim(), chemins, nature: nature ?? null, texte: lignes.join("\n") });
  }
  return entrees;
}

// Un chemin cité couvre ce fichier, et tout ce qu'il contient s'il est un
// dossier, barre finale ou non.
export const couvre = (entree, chemin) =>
  entree.chemins.some((cite) => cite === chemin || chemin.startsWith(cite.endsWith("/") ? cite : `${cite}/`));

// La clé du manifeste qui désigne ce chemin. Sous Windows, le disque ne
// distingue pas la casse : écrire `src/App/page.tsx`, c'est écrire `src/app/page.tsx`.
function cleDuManifeste(fichiers, relatif) {
  if (Object.hasOwn(fichiers, relatif)) return relatif;
  if (process.platform !== "win32") return undefined;
  const minuscules = relatif.toLowerCase();
  return Object.keys(fichiers).find((cle) => cle.toLowerCase() === minuscules);
}

// Lu à chaque appel : deux petits fichiers, quelques millisecondes, loin du
// délai de 10 s de settings.json. Tout ce qui ne se lit pas laisse passer sans
// un mot : un rappel ne doit jamais gêner le travail.
export function rappelDAdaptation(chemin, racine) {
  if (!chemin || !racine) return null;
  let fichiers;
  try {
    fichiers = JSON.parse(fs.readFileSync(path.join(racine, MANIFESTE), "utf-8"))?.fichiers;
  } catch {
    return null;
  }
  const relatif = path.relative(racine, path.resolve(racine, chemin)).replace(/\\/g, "/");
  if (relatif === "" || relatif.startsWith("../") || path.isAbsolute(relatif)) return null;
  if (typeof fichiers !== "object" || fichiers === null) return null;
  const cle = cleDuManifeste(fichiers, relatif);
  if (cle === undefined) return null;
  let notes = "";
  try {
    notes = fs.readFileSync(path.join(racine, ADAPTATIONS), "utf-8");
  } catch {
    // Pas encore de fichier : rien n'est noté.
  }
  if (entreesDesAdaptations(notes).some((entree) => couvre(entree, cle))) return null;
  return [
    "rappel",
    `${cle} vient du catalogue (${MANIFESTE}) : le modifier est une adaptation de l'appli. L'écriture passe. ` +
      `La noter dans ${ADAPTATIONS} à la racine de l'appli, une entrée de cinq lignes au plus (le modèle est en tête du fichier) : ` +
      "date, fichiers, ce qui change, pourquoi, « défaut du catalogue » ou « propre à l'appli ». " +
      "Ce rappel ne revient plus pour ce fichier une fois noté.",
  ];
}

// Le rappel n'arrête jamais une écriture, même sur un cas que ses tests n'ont
// pas prévu : une exception s'y tait, là où un refus des gardes, lui, compte.
function rappelSansRisque(chemin, racine) {
  try {
    return rappelDAdaptation(chemin, racine);
  } catch {
    return null;
  }
}

function contenuEcrit(entree) {
  if (entree.content != null) return entree.content;
  if (entree.new_string != null) return entree.new_string;
  if (entree.new_source != null) return entree.new_source;
  if (Array.isArray(entree.edits)) return entree.edits.map((e) => e.new_string ?? "").join("\n");
  return "";
}

async function principal() {
  let brut = "";
  for await (const morceau of process.stdin) brut += morceau;
  let donnees;
  try {
    donnees = JSON.parse(brut || "{}");
  } catch {
    return;
  }
  const { tool_name: outil, tool_input: entree = {} } = donnees;

  const commande = outil === "Bash" || outil === "PowerShell";
  const chemin = entree.file_path ?? entree.notebook_path ?? "";
  // La racine de l'appli : celle que Claude Code donne au hook, sinon deux
  // niveaux au-dessus de ce script (.claude/hooks/).
  const racine = process.env.CLAUDE_PROJECT_DIR || fileURLToPath(new URL("../..", import.meta.url));
  const verdict = commande
    ? verifierCommande(entree.command ?? "")
    : (verifierEcriture(chemin, contenuEcrit(entree)) ?? rappelSansRisque(chemin, racine));
  if (!verdict) return;

  const [decision, raison] = verdict;
  if (decision === "rappel") {
    // Sans permissionDecision : la demande de permission habituelle reste
    // (« allow » la sauterait), le texte arrive dans le contexte de Claude.
    process.stdout.write(
      JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: raison } })
    );
    return;
  }
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: raison,
      },
    })
  );
}

// Lancé comme hook, et non importé par le test. Le chemin peut contenir espaces
// et accents, d'où la comparaison par URL encodée.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await principal();
}
