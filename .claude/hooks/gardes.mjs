// Gardes PreToolUse du harnais (branchées dans .claude/settings.json) :
// refusent à Claude les gestes qui versent un secret dans le dépôt, touchent la
// prod ou défont un filet de sécurité (force sur le distant, hooks git sautés).
// Dans une appli assemblée, elles rappellent aussi, sans refuser, de noter
// toute retouche d'un fichier venu du catalogue (section « Adaptations d'une
// appli assemblée »).
// Chaque règle renvoie à l'incident qui l'a fait naître (projets précédents,
// septembre-octobre 2026), ou dit qu'il n'y en a pas.
//
// Ce que les gardes arrêtent : l'inadvertance d'une session, y compris le
// geste confié à un interpréteur (`sh -c`, `pwsh -Command`, `eval`, heredoc
// exécuté), à un lanceur (`npx`, `xargs`, `Start-Process`) ou à une API. Ce
// n'est pas une barrière contre qui veut passer : une lecture de commande ne
// suit ni un alias git, ni un script écrit puis lancé, ni une variable remplie
// plus tôt, ni ce que `ssh` lance sur une autre machine. La barrière réelle
// est tenue hors de ce script : protection de `main` sur GitHub (PR, CI,
// fusion humaine) et aucun secret de production sur le poste.
// Ce script ne refait pas ce que GitHub fait déjà pour tout le monde.
//
// Sans dépendance : il tourne avant tout `npm install`, sur n'importe quel poste.
// Test : `node .claude/hooks/gardes.test.mjs` (lancé par la CI). Un garde qui
// bloque à tort se corrige avec un cas de test, comme un garde qui laisse passer.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REFUS = {
  url: "URL de base distante en clair : l'historique du shell la garde (incident du 2026-09-21). La passer par une variable d'environnement saisie sans écho.",
  motDePasse:
    "Mot de passe de base distante en clair (PGPASSWORD, password=, -p) : l'historique du shell le garde, comme une URL (incident du 2026-09-21). Le passer par une variable d'environnement saisie sans écho.",
  confirmer:
    "--confirmer fait écrire un script en vrai : un humain le tape lui-même, après avoir relu le rapport du dry-run.",
  add: "git add -f (ou git update-index --add) passerait outre le .gitignore, qui exclut les données client et les secrets.",
  push: "git push --force écrase sur le distant ce qu'une autre session a pu pousser entre-temps. Après un rebase, sur sa propre branche : git push --force-with-lease.",
  hooks:
    "--no-verify (ou core.hooksPath détourné) saute les hooks git posés pour arrêter un commit ou un envoi : corriger ce qu'ils signalent plutôt que les sauter.",
  fusion:
    "La fusion d'une pull request revient à la personne responsable des fusions : fusionner, c'est mettre en ligne. Pas plus par l'API que par gh pr merge.",
  env: "Un .env (ou .envrc, .npmrc) porte des secrets : Claude ne l'écrit pas, par une commande pas plus que par Write. Le modèle des variables va dans .env.example, les valeurs chez l'hébergeur ; l'humain écrit le fichier local.",
  imbrication: "Commande trop imbriquée pour que le garde la lise : la lancer sans détour.",
};
const refus = (cle) => ["deny", REFUS[cle]];

// --- Secrets : fichiers et mots de passe de base ---------------------------

// Un fichier de secrets, quel que soit son dossier. La casse ne compte pas :
// sous Windows, `.ENV` est le même fichier que `.env`. `.envrc` (direnv) et
// `.npmrc` (jeton du registre) en portent aussi. `.env.example` est le modèle
// sans valeurs ; `.env.d.ts` un fichier de types.
function fichierSecret(chemin) {
  const nom = chemin.replace(/\\/g, "/").split("/").pop() ?? "";
  if (/\.example$/i.test(nom) || /\.d\.ts$/i.test(nom)) return false;
  return /^\.env(\.|rc$|$)/i.test(nom) || /^\.npmrc$/i.test(nom);
}

const HOTE_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
// Un hôte vide ou un chemin de socket désigne aussi la machine locale.
const hoteLocal = (hote) => hote === "" || hote.startsWith("/") || hote.split(",").every((h) => HOTE_LOCAL.test(h));

// Une URL de base qui porte un mot de passe et ne vise pas la machine locale :
// collée dans PowerShell, l'URL de prod est restée dans l'historique et il a
// fallu changer les identifiants (2026-09-21). Le mot de passe peut venir sans
// utilisateur (`redis://:mdp@hôte`) ou en paramètre (`?password=`).
const URL_DE_BASE = /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?):\/\/([^\s'"`]*)/gi;
export function urlDeBaseDistante(texte) {
  for (const [, reste] of texte.matchAll(URL_DE_BASE)) {
    const arobase = reste.indexOf("@");
    const utilisateur = arobase === -1 ? "" : reste.slice(0, arobase);
    const apres = reste.slice(arobase + 1);
    const motDePasse = /:./.test(utilisateur) || /[?&]password=[^&]/i.test(apres);
    if (motDePasse && !hoteLocal(apres.split(/[/?#]/)[0])) return true;
  }
  return false;
}

// Le même secret hors URL : `PGPASSWORD=… psql -h hôte`, chaîne de connexion
// `host=… password=…`, `mysql -p…`. Sans hôte nommé, le client vise la machine
// locale : `PGPASSWORD=postgres psql` des tests passe, comme une URL locale.
const CLIENT_DE_BASE =
  /\b(psql|pg_dump|pg_dumpall|pg_restore|pgcli|createdb|dropdb|vacuumdb|pg_isready|mysql\w*|mariadb\w*)\b/i;
const MYSQL = /\b(mysql\w*|mariadb\w*)\b/i;
const MOT_DE_PASSE_LITTERAL = [
  /(?:^|[\s;&|(])(?:\$env:)?(?:PGPASSWORD|MYSQL_PWD)\s*=\s*(?!["']?\$)["']?[^\s"';&|$]/i,
  /(?:^|[\s'"?&])password\s*=\s*(?!["']?\$)[^\s"'&;$]/i,
];
const MOT_DE_PASSE_MYSQL = /(?:^|\s)(?:-p(?!\s)["']?[^\s"'$]|--password=["']?[^\s"'$])/;
function motDePasseDeBaseDistante(texte) {
  const litteral =
    MOT_DE_PASSE_LITTERAL.some((r) => r.test(texte)) || (MYSQL.test(texte) && MOT_DE_PASSE_MYSQL.test(texte));
  if (!litteral) return false;
  const hotes = [...texte.matchAll(/(?:^|[\s'"])(?:host|PGHOST|\$env:PGHOST)\s*=\s*["']?([^\s"'&;|]+)/gi)].map(
    (x) => x[1]
  );
  if (CLIENT_DE_BASE.test(texte))
    hotes.push(...[...texte.matchAll(/(?:^|\s)(?:-h|--host)(?:=|\s+)?["']?([^\s"'&;|]+)/g)].map((x) => x[1]));
  // `PGPASSWORD=… psql postgresql://u@hôte/db` : l'hôte vient de l'URL.
  hotes.push(
    ...[...texte.matchAll(URL_DE_BASE)].map(([, reste]) => reste.slice(reste.indexOf("@") + 1).split(/[/?#]/)[0])
  );
  return hotes.some((h) => !hoteLocal(h));
}

// --- Lecture d'une commande -------------------------------------------------

// Le nom d'un programme, sans dossier, extension ni casse : `C:\…\gh.exe` → `gh`.
const nomOutil = (mot) =>
  (mot ?? "")
    .replace(/^.*[\\/]/, "")
    .replace(/\.(exe|cmd|bat|ps1)$/i, "")
    .toLowerCase();

const mot = (nu) => ({ nu, brut: nu });

// Les mots d'une commande simple, guillemets retirés (`nu`) et tels quels
// (`brut`, pour redonner une commande à relire) : `-f query='a b'` fait deux mots.
function decouperMots(segment) {
  const mots = [];
  let nu = "";
  let brut = "";
  let dans = false;
  let guillemet = null;
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    if (guillemet) {
      brut += c;
      if (c === "\\" && guillemet === '"' && /["\\$`]/.test(segment[i + 1] ?? "")) {
        nu += segment[++i];
        brut += segment[i];
      } else if (c === guillemet) guillemet = null;
      else nu += c;
    } else if (/\s/.test(c)) {
      if (dans) mots.push({ nu, brut });
      nu = brut = "";
      dans = false;
    } else {
      dans = true;
      brut += c;
      if (c === '"' || c === "'") guillemet = c;
      else nu += c;
    }
  }
  if (dans) mots.push({ nu, brut });
  return mots;
}

const CONSOMMATEURS_DE_TEXTE = new Set([
  "git",
  "gh",
  "cat",
  "tee",
  "echo",
  "printf",
  "set-content",
  "add-content",
  "out-file",
  "tee-object",
  "write-output",
  "write-host",
]);

// Où commence la commande qui porte un heredoc : après le dernier séparateur
// hors guillemets (`--title "UI & thème"` n'en est pas un), ou dans la
// substitution `$(` encore ouverte (`--body "$(cat <<'EOF'`), dont `dehors`
// garde l'ouverture.
function commandeOuverte(avant) {
  let debut = 0;
  let guillemet = null;
  const pile = [];
  for (let i = 0; i < avant.length; i++) {
    const c = avant[i];
    if (guillemet === "'") {
      if (c === "'") guillemet = null;
    } else if (c === "$" && avant[i + 1] === "(") {
      pile.push({ debut, guillemet, ouverture: i });
      guillemet = null;
      debut = i + 2;
      i++;
    } else if (guillemet === '"') {
      if (c === "\\") i++;
      else if (c === '"') guillemet = null;
    } else if (c === '"' || c === "'") guillemet = c;
    else if (c === ")" && pile.length > 0) ({ debut, guillemet } = pile.pop());
    else if (";|&({".includes(c)) debut = i + 1;
  }
  return { debut, dehors: pile.at(-1) };
}

// Le corps d'un heredoc (`<<'EOF' … EOF`) ou d'une here-string PowerShell
// (`@' … '@`) n'est du texte que si son hôte en consomme : un message de commit
// qui citait « gh pr merge » bloquait son propre commit (2026-10-08). Donné à un
// interpréteur (`bash <<'EOF'`, `Invoke-Expression @'…'@`, `… | sh`,
// `bash -c "$(cat <<'EOF' …)"`), il se lit comme des commandes. Rangé dans une
// variable (`$corps = @'…'@`, façon habituelle de passer un corps de PR sous
// PowerShell), il reste du texte : le garde ne suit pas les variables.
function hoteConsommateur(avant, apres) {
  const { debut, dehors } = commandeOuverte(avant);
  const commande = avant.slice(debut);
  const tubes = apres.split("|").slice(1);
  let consomme;
  if (/^\s*(\$[\w:]+\s*|[A-Za-z_]\w*)=\s*$/.test(commande)) consomme = tubes.length === 0;
  else {
    const hote = sansPrefixes(decouperMots(commande))[0]?.nu;
    consomme = hote
      ? CONSOMMATEURS_DE_TEXTE.has(nomOutil(hote)) && tubes.length === 0
      : // `@'…'@ | Set-Content notes.md` : le texte part vers un consommateur.
        tubes.length === 1 && CONSOMMATEURS_DE_TEXTE.has(nomOutil(decouperMots(tubes[0])[0]?.nu));
  }
  // Dans `$( … )`, la sortie va à la commande du dehors.
  return consomme && dehors ? hoteConsommateur(avant.slice(0, dehors.ouverture), "") : consomme;
}

// Les `$( … )` d'un texte : un heredoc non quoté ou une here-string `@"…"@`
// les exécutent, même quand leur hôte ne fait que consommer du texte.
function substitutions(corps) {
  const trouvees = [];
  let i = corps.indexOf("$(");
  while (i !== -1) {
    const fin = parentheseFermante(corps, i + 1);
    trouvees.push(corps.slice(i, fin + 1));
    i = corps.indexOf("$(", fin + 1);
  }
  return trouvees;
}

const HEREDOC = /<<-?[ \t]*(['"]?)([\w.-]+)\1([^\n]*)\n([\s\S]*?)\n[ \t]*\2[ \t]*(?=\r?\n|$)/g;
const HERE_STRING = /@(['"])[ \t]*\r?\n([\s\S]*?)\r?\n\1@([^\n]*)/g;
function resoudreTextesLibres(commande) {
  const ligneAvant = (chaine, position) => chaine.slice(chaine.lastIndexOf("\n", position - 1) + 1, position);
  const remplacer = (avant, apres, corps, developpe) =>
    hoteConsommateur(avant, apres)
      ? [apres, ...(developpe ? substitutions(corps) : [])].join("\n")
      : `${apres}\n${corps}`;
  return commande
    .replace(HEREDOC, (_t, g, _d, apres, corps, pos, chaine) =>
      remplacer(ligneAvant(chaine, pos), apres, corps, g === "")
    )
    .replace(HERE_STRING, (_t, g, corps, apres, pos, chaine) =>
      remplacer(ligneAvant(chaine, pos), apres, corps, g === '"')
    );
}

function parentheseFermante(texte, ouvrante) {
  let profondeur = 0;
  let guillemet = null;
  for (let j = ouvrante; j < texte.length; j++) {
    const c = texte[j];
    if (guillemet) {
      if (c === guillemet) guillemet = null;
    } else if (c === "'" || c === '"') guillemet = c;
    else if (c === "(") profondeur++;
    else if (c === ")" && --profondeur === 0) return j;
  }
  return texte.length;
}

// Découpe en commandes simples (`;`, `&&`, `||`, `|`, `&`, retour à la ligne),
// sans couper à l'intérieur des guillemets : `-m "a; gh pr merge"` reste un
// seul argument. Une substitution `$( … )`, exécutée même entre guillemets
// doubles, ressort comme sous-commande à lire.
function decouper(texte) {
  const segments = [];
  const sousCommandes = [];
  let courant = "";
  let guillemet = null;
  let apresTube = false;
  const couper = (tube) => {
    if (courant.trim()) segments.push({ texte: courant.trim(), apresTube });
    courant = "";
    apresTube = tube;
  };
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guillemet === "'") {
      courant += c;
      if (c === "'") guillemet = null;
    } else if (c === "$" && texte[i + 1] === "(") {
      const fin = parentheseFermante(texte, i + 1);
      sousCommandes.push(texte.slice(i + 2, fin));
      courant += "$()";
      i = fin;
    } else if (guillemet === '"') {
      courant += c;
      if (c === "\\" && i + 1 < texte.length) courant += texte[++i];
      else if (c === '"') guillemet = null;
    } else if (c === '"' || c === "'") {
      guillemet = c;
      courant += c;
    } else if (c === "|") {
      if (texte[i + 1] === "|") {
        i++;
        couper(false);
      } else couper(true);
    } else if (";&\n\r".includes(c)) couper(false);
    else courant += c;
  }
  couper(false);
  return { segments, sousCommandes };
}

// Ce qui précède la commande sans en changer le sens : affectations de
// variables (`DATABASE_URL=… npm test`), `env`, `sudo`, `nohup`, `timeout 5`…,
// parenthèse ou accolade de groupe (`(gh pr merge 42)`, `{ … }`).
const PREFIXES = new Set(["env", "sudo", "doas", "nohup", "time", "command", "exec", "nice", "stdbuf", "timeout"]);
const PREFIXE_A_VALEUR = /^(-u|-g|-C|-h|-p|-n|-s|-k|--unset|--chdir|--signal|--kill-after|--user|--group)$/;
function sansPrefixes(mots) {
  let m = mots;
  while (m.length > 0) {
    const premier = m[0].nu.replace(/^(\$?\(|@\(|\{)+/, "");
    if (premier !== m[0].nu) {
      m = [mot(premier), ...m.slice(1)];
      m[m.length - 1] = mot(m[m.length - 1].nu.replace(/[)}]+$/, ""));
      m = m.filter((x) => x.nu !== "");
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(premier)) {
      m = m.slice(1);
      continue;
    }
    const o = nomOutil(premier);
    if (!PREFIXES.has(o)) break;
    if (o === "command" && /^-[vV]$/.test(m[1]?.nu ?? "")) return [];
    let i = 1;
    while (i < m.length && /^-./.test(m[i].nu)) i += PREFIXE_A_VALEUR.test(m[i].nu) ? 2 : 1;
    if (o === "timeout") i++;
    m = m.slice(i);
  }
  return m;
}

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "ash", "fish"]);
const PWSH_COMMANDE = /^[-/]c(o(m(m(a(n(d)?)?)?)?)?)?$/i;
const PWSH_ENCODEE = /^[-/]e(c|n(c(o(d(e(d(c(o(m(m(a(n(d)?)?)?)?)?)?)?)?)?)?)?)?)?$/i;
const PWSH_FICHIER = /^[-/]f(i(l(e)?)?)?$/i;
const PWSH_A_VALEUR =
  /^[-/](executionpolicy|ep|ex|workingdirectory|wd|outputformat|of|o|inputformat|inp|if|windowstyle|w|configurationname|config|settingsfile|custompipename|psconsolefile|version|v)$/i;
const XARGS_A_VALEUR = new Set([
  "-I",
  "-n",
  "-L",
  "-P",
  "-d",
  "-a",
  "-E",
  "-s",
  "--delimiter",
  "--arg-file",
  "--max-args",
]);
const CODE = {
  node: ["-e", "--eval", "-p", "--print"],
  bun: ["-e", "--eval", "-p", "--print"],
  deno: ["eval"],
  python: ["-c"],
  py: ["-c"],
  pythonw: ["-c"],
  perl: ["-e", "-E"],
  ruby: ["-e"],
  php: ["-r"],
};

const joindre = (reste) => (reste.length === 1 ? reste[0].nu : reste.map((x) => x.brut).join(" "));

// Ce qu'une commande fait exécuter à une autre : un texte à relire comme une
// commande (`sh -c`, `pwsh -Command`, `cmd /c`, `eval`, `Invoke-Expression`,
// `Start-Process`, `Invoke-Command`), des mots qui en sont une (`xargs`, `npx`,
// `npm exec`), du code (`node -e`, `python -c`), ou l'entrée standard (un
// interpréteur au bout d'un tube). null : la commande est elle-même la cible.
function interieur(m) {
  const a = m.map((x) => x.nu);
  const o = nomOutil(a[0]);
  if (SHELLS.has(o)) {
    for (let i = 1; i < a.length; i++) {
      if (a[i] === "<<<") return { texte: a[i + 1] ?? "" };
      if (/^-[a-zA-Z]*c[a-zA-Z]*$/.test(a[i])) return { texte: a[i + 1] ?? "" };
      if (/^[-+]o$/.test(a[i])) i++;
      else if (a[i] === "-" || /^-[a-zA-Z]*s[a-zA-Z]*$/.test(a[i])) return { stdin: true };
      else if (!a[i].startsWith("-")) return null;
    }
    return { stdin: true };
  }
  if (o === "pwsh" || o === "powershell") {
    for (let i = 1; i < a.length; i++) {
      if (PWSH_COMMANDE.test(a[i])) {
        const reste = m.slice(i + 1);
        return reste[0]?.nu === "-" ? { stdin: true } : { texte: joindre(reste) };
      }
      if (PWSH_ENCODEE.test(a[i])) return { texte: Buffer.from(a[i + 1] ?? "", "base64").toString("utf16le") };
      if (PWSH_FICHIER.test(a[i])) return null;
      if (PWSH_A_VALEUR.test(a[i])) i++;
      // Sans option, Windows PowerShell lit une commande, pwsh un script.
      else if (!a[i].startsWith("-")) return o === "powershell" ? { texte: joindre(m.slice(i)) } : null;
    }
    return { stdin: true };
  }
  if (o === "cmd") {
    const i = a.findIndex((x, k) => k > 0 && /^\/[ck]$/i.test(x));
    return i === -1 ? { stdin: true } : { texte: joindre(m.slice(i + 1)) };
  }
  if (o === "eval" || o === "invoke-expression" || o === "iex") {
    const reste = PWSH_COMMANDE.test(a[1] ?? "") ? a.slice(2) : a.slice(1);
    return reste.length > 0 ? { texte: reste.join(" ") } : { stdin: true };
  }
  if (o === "xargs") {
    let i = 1;
    while (i < a.length && a[i].startsWith("-")) i += XARGS_A_VALEUR.has(a[i]) ? 2 : 1;
    return { mots: m.slice(i) };
  }
  const lanceurNpm = ["npm", "pnpm", "yarn"].includes(o) && ["exec", "x", "dlx"].includes(a[1]);
  if (["npx", "bunx", "pnpx"].includes(o) || lanceurNpm) {
    let i = lanceurNpm ? 2 : 1;
    while (i < a.length && a[i].startsWith("-")) {
      if (a[i] === "--") {
        i++;
        break;
      }
      if (a[i] === "-c" || a[i] === "--call") return { texte: a[i + 1] ?? "" };
      i += ["-p", "--package", "-w", "--workspace"].includes(a[i]) ? 2 : 1;
    }
    return { mots: m.slice(i) };
  }
  if (o === "start-process" || o === "saps" || o === "start") {
    let fichier;
    const args = [];
    const positionnels = [];
    for (let i = 1; i < a.length; i++) {
      const p = a[i].toLowerCase();
      if (/^-(filepath|path|file)$/.test(p)) fichier = a[++i];
      else if (/^-(argumentlist|args|arguments)$/.test(p))
        while (i + 1 < a.length && (!a[i + 1].startsWith("-") || /^["']/.test(m[i + 1].brut))) args.push(a[++i]);
      else if (/^-(workingdirectory|verb|windowstyle|redirectstandard\w+|credential)$/.test(p)) i++;
      else if (!p.startsWith("-")) positionnels.push(a[i]);
    }
    if (fichier === undefined) fichier = positionnels.shift();
    if (fichier === undefined) return null;
    return { texte: [fichier, ...positionnels, ...args].join(" ").replace(/,/g, " ") };
  }
  if (o === "invoke-command" || o === "icm") {
    const i = m.findIndex((x, k) => k > 0 && (/^-(scriptblock|command)$/i.test(x.nu) || x.nu.startsWith("{")));
    if (i === -1) return null;
    const bloc = m.slice(a[i].startsWith("-") ? i + 1 : i).map((x) => x.brut);
    return {
      texte: bloc
        .join(" ")
        .replace(/^\s*\{/, "")
        .replace(/\}\s*$/, ""),
    };
  }
  const options = CODE[o.replace(/[\d.]+$/, "")];
  if (options) {
    const i = a.findIndex((x, k) => k > 0 && options.includes(x));
    return i === -1 ? null : { code: a[i + 1] ?? "" };
  }
  return null;
}

// Le texte qu'un tube donne à un interpréteur : `echo 'cmd' | bash`, `'cmd' | iex`.
function texteTransmis(segment) {
  const m = sansPrefixes(decouperMots(segment));
  if (["echo", "printf", "write-output", "write-host", "write"].includes(nomOutil(m[0]?.nu)))
    return m
      .slice(1)
      .filter((x, i) => !(i === 0 && /^-[neE]+$/.test(x.nu)))
      .map((x) => x.nu)
      .join(" ");
  return m.length === 1 ? m[0].nu : "";
}

// --- Règles -----------------------------------------------------------------

// git accepte une option longue abrégée (`--no-verif`, `--forc`) : le garde
// compte tout début d'au moins `min` caractères, même ceux que git refuserait
// comme ambigus (`--forc` pour git push) : les refuser ne coûte rien.
const abrege = (a, longue, min) => {
  const nom = a.split("=")[0];
  return nom.length >= min && nom.startsWith("--") && longue.startsWith(nom);
};

// La sous-commande git, ses arguments, et les `-c clé=valeur` passés avant
// elle (`git -C app add`, `git -c core.hooksPath=… commit`) ; null hors git.
const GLOBALE_A_VALEUR = /^(-[Cc]|--git-dir|--work-tree|--namespace|--config-env)$/;
function analyseGit(a) {
  if (nomOutil(a[0]) !== "git") return null;
  const configs = [];
  let i = 1;
  while (i < a.length && a[i].startsWith("-")) {
    if (a[i] === "-c" || a[i] === "--config-env") configs.push(a[i + 1] ?? "");
    else if (/^-c./.test(a[i])) configs.push(a[i].slice(2));
    i += GLOBALE_A_VALEUR.test(a[i]) ? 2 : 1;
  }
  return { sous: a[i], args: a.slice(i + 1), configs };
}

// `git add -f` : passerait outre le .gitignore, qui exclut données client et
// secrets. `git update-index --add` en est la plomberie : il ne lit jamais le
// .gitignore.
const gitAddForce = ({ sous, args }) =>
  (sous === "add" && args.some((a) => abrege(a, "--force", 4) || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a))) ||
  (sous === "update-index" && args.some((a) => abrege(a, "--add", 4)));

// `git push --force` écrase sur le distant ce qu'une autre session a poussé sur la
// même branche entre-temps, sans le voir. Plusieurs sessions travaillent en
// parallèle : le risque est permanent, sans incident vécu à ce jour.
// `--force-with-lease`, que `solstice-livrer` prévoit après un rebase, refuse
// justement ce cas : il passe. Forcent aussi : `-f` seul ou groupé (`-uf`), un
// refspec `+branche`, `--mirror`. Restent hors champ : alias git,
// `remote.<nom>.push` qui force, suppression de branche distante (`--delete`,
// `:branche`, `--prune`).
const gitPushForce = ({ sous, args }) =>
  sous === "push" &&
  args.some((a) => abrege(a, "--force", 4) || abrege(a, "--mirror", 5) || /^-[46dnquv]*f/.test(a) || a.startsWith("+"));

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

// `--no-verify` saute les hooks git (pre-commit, commit-msg, pre-push,
// pre-merge-commit, pre-rebase, applypatch-msg) qu'un poste ou une appli pose
// pour arrêter un commit ou un envoi : ce qu'ils signalent se corrige, il ne se
// saute pas. `-c core.hooksPath=…` le fait pour une commande. Pour git commit,
// `-n` en est la forme courte, seule ou groupée (`-anm`) ; pour push, merge et
// rebase, `-n` est autre chose (essai à blanc, sans statistiques).
const SOUS_COMMANDES_A_HOOKS = new Set(["commit", "push", "merge", "rebase", "am", "pull"]);
function gitSansHooks({ sous, args, configs }) {
  if (!SOUS_COMMANDES_A_HOOKS.has(sous)) return false;
  if (configs.some((c) => /^core\.hookspath(=|$)/i.test(c))) return true;
  if (sous !== "commit") return args.some((a) => abrege(a, "--no-verify", 6));
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") break;
    if (abrege(a, "--no-verify", 6)) return true;
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

// La fusion revient à un humain, fusionner c'est mettre en ligne : `gh pr merge`,
// et l'API qui fait la même chose, depuis gh ou un client HTTP. En REST, la
// fusion est un PUT : le GET du même chemin dit seulement si la PR est fusionnée.
// En GraphQL, la mutation peut arriver par un heredoc (`-F query=@-`), d'où la
// lecture de la commande entière.
const MUTATION_DE_FUSION = /\b(mergePullRequest|enablePullRequestAutoMerge)\b/;
const CLIENTS_HTTP = new Set(["curl", "wget", "invoke-restmethod", "irm", "invoke-webrequest", "iwr", "http", "xh"]);
// Les mots de gh hors options, celles à valeur sautées : `gh pr -R o/r merge 42`
// donne `pr merge 42`.
function positionnelsGh(a) {
  const positionnels = [];
  for (let i = 1; i < a.length; i++) {
    if (/^(-R|--repo|--hostname)$/.test(a[i])) i++;
    else if (!a[i].startsWith("-")) positionnels.push(a[i]);
  }
  return positionnels;
}

function fusion(a, o, entiere) {
  const gh = o === "gh" ? positionnelsGh(a) : [];
  if (gh[0] === "pr" && gh[1] === "merge") return true;
  if (!(gh[0] === "api" || CLIENTS_HTTP.has(o))) return false;
  const put = a.some((x) => /^put$/i.test(x) || /^(-X|--request=|--method=)put$/i.test(x));
  if (put && a.some((x) => /\/pulls\/[^/\s]+\/merge\b/.test(x))) return true;
  return (
    a.some((x) => /graphql/i.test(x)) && (a.some((x) => MUTATION_DE_FUSION.test(x)) || MUTATION_DE_FUSION.test(entiere))
  );
}

// Les commandes qui écrivent, déplacent ou créent le fichier nommé ; pour une
// copie, seule la destination compte.
const ECRIVAINS = new Set([
  "tee",
  "tee-object",
  "set-content",
  "sc",
  "add-content",
  "ac",
  "out-file",
  "new-item",
  "ni",
  "touch",
  "truncate",
  "install",
  "ln",
  "mv",
  "move",
  "move-item",
  "mi",
  "ren",
  "rename",
  "rename-item",
  "rni",
]);
const COPIEURS = new Set(["cp", "copy", "copy-item", "cpi", "xcopy", "robocopy"]);
function ecritureSecrete(a, o) {
  if (o === "sed") return a.some((x) => /^(-i|--in-place)/.test(x)) && a.slice(1).some(fichierSecret);
  if (ECRIVAINS.has(o)) return a.slice(1).some(fichierSecret);
  if (!COPIEURS.has(o)) return false;
  const i = a.findIndex((x) => /^-dest(ination)?$/i.test(x));
  if (i !== -1) return fichierSecret(a[i + 1] ?? "");
  const positionnels = a.slice(1).filter((x) => !x.startsWith("-"));
  return positionnels.length >= 2 && fichierSecret(positionnels.at(-1));
}

// Les cibles des redirections `>`, `>>` d'une commande simple (`2>&1` n'en est pas une).
function ciblesDeRedirection(segment) {
  const cibles = [];
  let guillemet = null;
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    if (guillemet) {
      if (c === guillemet) guillemet = null;
      continue;
    }
    if (c === '"' || c === "'") guillemet = c;
    if (c !== ">") continue;
    let j = i + 1;
    while (segment[j] === ">" || segment[j] === "|") j++;
    if (segment[j] !== "&") cibles.push(decouperMots(segment.slice(j))[0]?.nu ?? "");
    i = j;
  }
  return cibles;
}

// Dans du code (`node -e`, `python -c`, `[IO.File]::…`) : un fichier de secrets
// nommé avec un verbe d'écriture, ou une commande lancée par un verbe
// d'exécution (`execSync('gh pr merge 42')`, `run(['gh', 'pr', 'merge'])`).
const LITTERAUX = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
// Les écritures de fichier de Node, Python et .NET ; `open(…)` seulement avec un
// mode d'écriture : `open('.env.local').read()` lit, `stdout.write` n'écrit
// aucun fichier.
const VERBE_ECRITURE =
  /\b(write(File\w*|_text|_bytes|All\w*)|append(File\w*|All\w*)|copy\w*|cp(Sync)?|rename\w*|move\w*|createWriteStream|symlink\w*|truncate\w*)\b|\bopen\s*\(\s*(?<q>["'])[^"']*\k<q>\s*,\s*(mode\s*=\s*)?["'][^"']*[wax+]/i;
const VERBE_EXECUTION = /\b(exec\w*|spawn\w*|system|popen|subprocess|check_output|call|run|execa|shell)\b/i;
function analyserCode(code, entiere, profondeur) {
  const litteraux = [...code.matchAll(LITTERAUX)].map((x) => x[2]);
  if (litteraux.some(fichierSecret) && VERBE_ECRITURE.test(code)) return refus("env");
  if (!VERBE_EXECUTION.test(code)) return null;
  for (const texte of [...litteraux, litteraux.join(" ")]) {
    const verdict = analyser(texte, entiere, profondeur + 1);
    if (verdict) return verdict;
  }
  return null;
}

// --confirmer cherché dans le code (`grep -- --confirmer`, `git log -S`) ou
// affiché (`echo`) n'est pas --confirmer lancé.
const LECTEURS = new Set([
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "ag",
  "ack",
  "findstr",
  "select-string",
  "sls",
  "git",
  "echo",
  "printf",
  "write-output",
  "write-host",
]);

function regles(m, entiere) {
  const a = m.map((x) => x.nu);
  const o = nomOutil(a[0]);
  if (!LECTEURS.has(o) && a.some((x) => x === "--confirmer" || x.startsWith("--confirmer="))) return refus("confirmer");
  const git = analyseGit(a);
  if (git && gitAddForce(git)) return refus("add");
  if (git && gitPushForce(git)) return refus("push");
  if (git && gitSansHooks(git)) return refus("hooks");
  if (fusion(a, o, entiere)) return refus("fusion");
  if (ecritureSecrete(a, o)) return refus("env");
  return null;
}

function analyserSegment(segment, entree, entiere, profondeur) {
  if (ciblesDeRedirection(segment).some(fichierSecret)) return refus("env");
  if (/\[(System\.)?IO\.(File|Directory)\]::/i.test(segment)) {
    const verdict = analyserCode(segment, entiere, profondeur);
    if (verdict) return verdict;
  }
  let m = sansPrefixes(decouperMots(segment));
  for (;;) {
    const dedans = interieur(m);
    if (dedans?.mots) {
      m = sansPrefixes(dedans.mots);
      continue;
    }
    if (dedans?.texte !== undefined) return analyser(dedans.texte, entiere, profondeur + 1);
    if (dedans?.code !== undefined) return analyserCode(dedans.code, entiere, profondeur);
    if (dedans?.stdin && entree !== null) {
      const verdict = analyser(texteTransmis(entree), entiere, profondeur + 1);
      if (verdict) return verdict;
    }
    return regles(m, entiere);
  }
}

const PROFONDEUR_MAX = 8;
function analyser(texte, entiere, profondeur) {
  if (profondeur > PROFONDEUR_MAX) return refus("imbrication");
  const { segments, sousCommandes } = decouper(resoudreTextesLibres(texte));
  for (const sous of sousCommandes) {
    const verdict = analyser(sous, entiere, profondeur + 1);
    if (verdict) return verdict;
  }
  let precedent = null;
  for (const { texte: segment, apresTube } of segments) {
    const verdict = analyserSegment(segment, apresTube ? precedent : null, entiere, profondeur);
    if (verdict) return verdict;
    precedent = segment;
  }
  return null;
}

export function verifierCommande(commande) {
  // Sur la commande entière, corps des heredocs compris : le secret finirait
  // dans l'historique ou dans un fichier.
  if (urlDeBaseDistante(commande)) return refus("url");
  if (motDePasseDeBaseDistante(commande)) return refus("motDePasse");
  return analyser(commande, commande, 0);
}

export function verifierEcriture(chemin, contenu) {
  if (fichierSecret(chemin)) return refus("env");
  if (urlDeBaseDistante(contenu))
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

// Un refus par code 2 : Claude Code bloque l'outil et donne le motif à Claude.
// Pour une entrée que le garde ne sait pas lire : laisser passer, ce serait
// laisser passer sans regarder la commande (audit du 2026-11-09).
function bloquer(motif) {
  process.stderr.write(`Gardes : ${motif}\n`);
  process.exitCode = 2;
}

const OUTILS_DE_COMMANDE = /^(Bash|PowerShell)$/;

async function principal() {
  let brut = "";
  for await (const morceau of process.stdin) brut += morceau;
  let donnees;
  try {
    donnees = JSON.parse(brut || "{}");
  } catch {
    return bloquer("entrée du hook illisible (JSON invalide) : la commande ou l'écriture est bloquée sans être lue.");
  }
  const outil = donnees?.tool_name ?? "";
  const entree = donnees?.tool_input ?? {};

  // La commande se lit quel que soit l'outil qui la porte : le terminal de
  // l'appli de bureau (mcp__terminal__…) lance des commandes comme Bash.
  let verdict;
  if (typeof entree.command === "string") {
    try {
      verdict = verifierCommande(entree.command);
    } catch (erreur) {
      return bloquer(`commande illisible pour le garde (${erreur?.message ?? erreur}) : la lancer autrement.`);
    }
  } else if (OUTILS_DE_COMMANDE.test(outil)) {
    return bloquer(`entrée du hook illisible : ${outil} sans commande.`);
  } else {
    const chemin = entree.file_path ?? entree.notebook_path ?? "";
    // La racine de l'appli : celle que Claude Code donne au hook, sinon deux
    // niveaux au-dessus de ce script (.claude/hooks/).
    const racine = process.env.CLAUDE_PROJECT_DIR || fileURLToPath(new URL("../..", import.meta.url));
    verdict = verifierEcriture(chemin, contenuEcrit(entree)) ?? rappelSansRisque(chemin, racine);
  }
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
