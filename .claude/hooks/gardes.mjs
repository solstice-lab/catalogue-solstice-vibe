// Gardes PreToolUse du harnais (branchées dans .claude/settings.json) :
// refusent à Claude les gestes qui versent un secret dans le dépôt, touchent la
// prod ou défont un filet de sécurité (force sur le distant, hooks git sautés).
// Chaque règle renvoie à l'incident qui l'a fait naître (projets précédents,
// septembre-octobre 2026), ou dit qu'il n'y en a pas.
//
// Le reste est tenu côté GitHub (protection de branche, CI obligatoire) : ce
// script ne refait pas ce que GitHub fait déjà pour tout le monde.
//
// Sans dépendance : il tourne avant tout `npm install`, sur n'importe quel poste.
// Test : `node .claude/hooks/gardes.test.mjs` (lancé par la CI). Un garde qui
// bloque à tort se corrige avec un cas de test, comme un garde qui laisse passer.

import { pathToFileURL } from "node:url";

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

  const verdict =
    outil === "Bash" || outil === "PowerShell"
      ? verifierCommande(entree.command ?? "")
      : verifierEcriture(entree.file_path ?? entree.notebook_path ?? "", contenuEcrit(entree));
  if (!verdict) return;

  const [decision, raison] = verdict;
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
