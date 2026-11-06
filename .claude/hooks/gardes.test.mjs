// Contrôle des gardes : `node .claude/hooks/gardes.test.mjs`
// (lancé par .github/workflows/ci.yml). Sans framework : le script doit rester
// vérifiable sur n'importe quel poste qui a Node.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  couvre,
  entreesDesAdaptations,
  rappelDAdaptation as rap,
  verifierCommande as cmd,
  verifierEcriture as ecr,
} from "./gardes.mjs";

const refuse = (v) => assert.equal(v?.[0], "deny", JSON.stringify(v));
const passe = (v) => assert.equal(v, null, JSON.stringify(v));

// Les URLs distantes sont coupées en deux : écrites d'un bloc, elles feraient
// refuser l'écriture de ce fichier par le garde lui-même.
const distante = "postgresql://u:secret" + "@dpg-abc.frankfurt-postgres.render.com/db";
const distanteSrv = "mongodb+srv://u:secret" + "@cluster0.example.net/db";

// --- URL de base distante en clair ---

refuse(cmd(`psql ${distante}`));
refuse(cmd(`DATABASE_URL=${distante} python manage.py migrate`));
refuse(cmd(`mongosh "${distanteSrv}"`));
// Même dans un heredoc : le secret finirait dans l'historique ou dans un fichier.
refuse(cmd(`cat > notes.txt <<'EOF'\n${distante}\nEOF`));
passe(cmd('psql "$DATABASE_URL"'));
passe(cmd('psql "$env:DATABASE_URL"'));
passe(cmd("psql postgresql://postgres:postgres@localhost:5434/app_test"));
passe(cmd("psql postgresql://postgres:postgres@127.0.0.1/app_test"));
passe(cmd("psql postgresql://postgres@db.example.com/app")); // sans mot de passe
refuse(cmd("psql postgresql://u:p" + "@localhost.example.com/app")); // pas la machine locale

// --- --confirmer ---

refuse(cmd("npx tsx scripts/import.ts --env-file=.env.prod --confirmer"));
refuse(cmd("python manage.py importer --confirmer=oui"));
refuse(cmd("cd app && npx tsx scripts/import.ts --confirmer"));
passe(cmd("npx tsx scripts/import.ts --env-file=.env.local"));
passe(cmd('git commit -m "Import : --confirmer reste tapé par un humain"'));

// --- git add -f ---

refuse(cmd("git add -f rapport.docx"));
refuse(cmd("git add --force export.csv"));
refuse(cmd("git add -Af"));
refuse(cmd("git -C app add -f x"));
refuse(cmd("git -c core.quotepath=off add --force x"));
refuse(cmd("git status && git add -f x"));
passe(cmd("git add src/app/page.tsx && git commit -m 'Accueil : titre'"));
passe(cmd("git add -A"));
passe(cmd("git commit -m 'git add -f est refusé'"));
passe(cmd("git fetch -f origin"));

// --- gh pr merge ---

refuse(cmd("gh pr merge 42 --squash"));
refuse(cmd("gh pr merge"));
refuse(cmd("gh pr merge --auto --squash 42"));
refuse(cmd("gh pr checks 42 && gh pr merge 42"));
refuse(cmd("GH_TOKEN=x gh pr merge 42"));
refuse(cmd("gh api -X PUT repos/o/r/pulls/42/merge"));
passe(cmd("gh pr view 42"));
passe(cmd("gh pr create --fill"));
passe(cmd("gh api repos/o/r/pulls/42"));
// Le texte n'est pas une commande (faux positif du 2026-10-08).
passe(cmd('git commit -m "Gardes : gh pr merge est refusé"'));
passe(cmd('git commit -m "a; gh pr merge 42"'));
passe(cmd("git commit -F - <<'EOF'\nGardes : refuser gh pr merge\nEOF"));
passe(cmd("git commit -F - @'\nGardes : refuser gh pr merge\n'@"));

// --- git push --force ---

refuse(cmd("git push --force"));
refuse(cmd("git push -f origin fix/x"));
refuse(cmd("git push -uf origin fix/x"));
refuse(cmd("git -C app push --force origin main"));
refuse(cmd("git --git-dir .git push -f"));
refuse(cmd("git rebase origin/main && git push --force"));
refuse(cmd("git push origin +fix/x"));
refuse(cmd("git push origin +HEAD:refs/heads/main"));
refuse(cmd("git push --mirror origin"));
// Le circuit de livraison pousse ainsi après un rebase, sur sa propre branche.
passe(cmd("git push --force-with-lease"));
passe(cmd("git push --force-with-lease=fix/x:abc123 --force-if-includes origin fix/x"));
passe(cmd("git push -u origin fix/x"));
passe(cmd("git push -o ci.skip origin fix/x"));
passe(cmd("git fetch -f origin +refs/heads/*:refs/remotes/origin/*"));
passe(cmd('git commit -m "Gardes : git push --force est refusé"'));

// --- --no-verify ---

refuse(cmd('git commit --no-verify -m "Accueil : titre"'));
refuse(cmd('git commit -n -m "Accueil : titre"'));
refuse(cmd('git commit -anm "Accueil : titre"'));
refuse(cmd("git push --no-verify origin fix/x"));
refuse(cmd("git add -A && git commit --no-verify -m x"));
passe(cmd('git commit -m "Accueil : titre"'));
// `-m` prend la suite du groupe : `-mn` est le message « n », pas `-n`.
passe(cmd("git commit -amn"));
passe(cmd('git commit -m "-n"'));
passe(cmd('git commit -am "-n"'));
passe(cmd('git commit -m "Gardes : --no-verify est refusé"'));
// Pour git push, `-n` est l'essai à blanc.
passe(cmd("git push -n origin fix/x"));

// --- Écritures de fichiers ---

refuse(ecr("C:/repo/.env", "X=1"));
refuse(ecr("C:\\repo\\app\\.env.local", "X=1"));
refuse(ecr("/repo/.env.production", "X=1"));
passe(ecr("/repo/.env.example", "DATABASE_URL="));
passe(ecr("/repo/src/env.ts", "export const x = 1;"));
refuse(ecr("/repo/scripts/import.ts", `const url = "${distante}";`));
passe(ecr("/repo/docs/local.md", "postgresql://postgres:postgres@localhost:5434/app_dev"));
passe(ecr("/repo/src/db.ts", "const url = process.env.DATABASE_URL;"));

// --- Adaptations d'une appli assemblée : un rappel, jamais un refus ---
// Le 2026-11-05, sur l'appli d'essai tours-de-coloc, trois retouches de fichiers
// du catalogue n'ont été remontées qu'une fois vues à l'écran.

const appli = fs.mkdtempSync(path.join(os.tmpdir(), "gardes-appli-"));
fs.mkdirSync(path.join(appli, "src", "app", "exemples"), { recursive: true });
const sha = "0".repeat(64);
fs.writeFileSync(
  path.join(appli, "catalogue.empreintes.json"),
  JSON.stringify({
    format: 2,
    fichiers: {
      "src/app/page.tsx": { unite: "socle", sha256: sha },
      "src/app/exemples/page.tsx": { unite: "socle", sha256: sha },
      "src/lib/navigation.ts": { unite: "socle", sha256: sha },
    },
  })
);
const dans = (...parties) => path.join(appli, ...parties);
const rappel = (v) => {
  assert.equal(v?.[0], "rappel", JSON.stringify(v));
  assert.match(v[1], /ADAPTATIONS\.md/);
};

// Écrire un fichier du manifeste : rappel, avec le chemin relatif à l'appli.
rappel(rap(dans("src", "app", "page.tsx"), appli));
assert.match(rap(dans("src", "app", "page.tsx"), appli)[1], /src\/app\/page\.tsx/);
// Un fichier de l'appli hors manifeste, ou hors de l'appli : rien.
passe(rap(dans("src", "app", "coloc", "page.tsx"), appli));
passe(rap(dans("ADAPTATIONS.md"), appli));
passe(rap(path.join(os.tmpdir(), "ailleurs.ts"), appli));
// Le catalogue n'a pas de manifeste : la garde n'y rappelle jamais rien.
passe(
  rap(
    fileURLToPath(new URL("../../src/app/page.tsx", import.meta.url)),
    fileURLToPath(new URL("../..", import.meta.url))
  )
);
// Un manifeste illisible ou d'une forme inattendue ne bloque rien et ne dit rien :
// JSON cassé, octets qui ne sont pas de l'UTF-8, marque d'ordre en tête, autre
// chose qu'un objet, liste de fichiers absente ou d'un autre type.
const illisibleAppli = fs.mkdtempSync(path.join(os.tmpdir(), "gardes-appli-"));
const manifesteIllisible = path.join(illisibleAppli, "catalogue.empreintes.json");
for (const contenu of [
  "{ pas du json",
  Buffer.from([0x7b, 0xff, 0xfe, 0x7d]),
  `﻿${JSON.stringify({ fichiers: { "src/app/page.tsx": {} } })}`,
  "null",
  "[]",
  '"texte"',
  "{}",
  '{ "fichiers": "src/app/page.tsx" }',
  '{ "fichiers": null }',
]) {
  fs.writeFileSync(manifesteIllisible, contenu);
  passe(rap(path.join(illisibleAppli, "src", "app", "page.tsx"), illisibleAppli));
}
// Un manifeste qui est un dossier : pas lisible non plus.
fs.rmSync(manifesteIllisible);
fs.mkdirSync(manifesteIllisible);
passe(rap(path.join(illisibleAppli, "src", "app", "page.tsx"), illisibleAppli));

// ADAPTATIONS.md illisible (un dossier à sa place, des octets qui ne sont pas de
// l'UTF-8) : l'écriture passe, avec le rappel ordinaire, rien n'y étant lisible comme noté.
fs.mkdirSync(dans("ADAPTATIONS.md"));
rappel(rap(dans("src", "app", "page.tsx"), appli));
fs.rmSync(dans("ADAPTATIONS.md"), { recursive: true });
fs.writeFileSync(dans("ADAPTATIONS.md"), Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a, 0x60, 0xc3]));
rappel(rap(dans("src", "app", "page.tsx"), appli));

// Déjà noté dans ADAPTATIONS.md, par son chemin ou par un dossier qui le contient : rien.
fs.writeFileSync(
  dans("ADAPTATIONS.md"),
  [
    "# Adaptations de l'appli",
    "",
    "```",
    "## AAAA-MM-JJ",
    "- Fichiers : `src/lib/navigation.ts`",
    "```",
    "",
    "## 2026-11-05",
    "- Fichiers : `src/app/page.tsx`, `src/app/exemples/`",
    "- Ce qui change : l'accueil livré vide devient le tableau des tours ; les exemples sont retirés.",
    "- Pourquoi : l'accueil disait « Page d'accueil à écrire ».",
    "- Nature : défaut du catalogue",
    "",
  ].join("\r\n")
);
passe(rap(dans("src", "app", "page.tsx"), appli));
passe(rap(dans("src", "app", "exemples", "page.tsx"), appli));
// L'exemple de l'en-tête, dans un bloc de code, n'est pas une entrée.
rappel(rap(dans("src", "lib", "navigation.ts"), appli));

assert.deepEqual(
  entreesDesAdaptations(fs.readFileSync(dans("ADAPTATIONS.md"), "utf8")).map(({ titre, chemins, nature }) => ({
    titre,
    chemins,
    nature,
  })),
  [{ titre: "2026-11-05", chemins: ["src/app/page.tsx", "src/app/exemples/"], nature: "défaut du catalogue" }]
);

// Une note écrite autrement que le modèle compte quand même : champ en gras,
// liste sur plusieurs lignes, dossier sans barre finale, barres obliques
// inverses, apostrophe typographique. Mal lue, elle ferait revenir le rappel à
// chaque écriture.
assert.deepEqual(
  entreesDesAdaptations(
    [
      "## 2026-11-05 : onglet de la coloc",
      "- **Fichiers** :",
      "  - `src\\lib\\navigation.ts`",
      "  - `src/app/exemples`",
      "- **Ce qui change** : l'onglet s'appelle « Ma coloc ».",
      "- **Nature** : propre à l’appli",
    ].join("\n")
  ).map(({ chemins, nature }) => ({ chemins, nature })),
  [{ chemins: ["src/lib/navigation.ts", "src/app/exemples"], nature: "propre à l'appli" }]
);
fs.writeFileSync(
  dans("ADAPTATIONS.md"),
  `${fs.readFileSync(dans("ADAPTATIONS.md"), "utf8")}\n## 2026-11-06\n- **Fichiers** :\n  - \`src\\lib\\navigation.ts\`\n- Nature : propre à l’appli\n`
);
passe(rap(dans("src", "lib", "navigation.ts"), appli));
// Un dossier cité sans barre finale couvre ce qu'il contient, pas un voisin au nom qui commence pareil.
assert.ok(couvre({ chemins: ["src/app/exemples"] }, "src/app/exemples/page.tsx"));
assert.ok(!couvre({ chemins: ["src/app/exemples"] }, "src/app/exemples-bis/page.tsx"));
// Sous Windows, un chemin d'une autre casse désigne le même fichier.
fs.writeFileSync(dans("ADAPTATIONS.md"), "# Adaptations de l'appli\n");
if (process.platform === "win32") {
  rappel(rap(dans("SRC", "App", "page.tsx"), appli));
  assert.match(rap(dans("SRC", "App", "page.tsx"), appli)[1], /^src\/app\/page\.tsx /);
}

// --- Bout en bout : le script lancé comme hook répond au format attendu ---

const script = fileURLToPath(new URL("./gardes.mjs", import.meta.url));
const lancer = (entree, env = {}) =>
  spawnSync(process.execPath, [script], {
    input: JSON.stringify(entree),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: "", ...env },
  });

// Le rappel arrive dans le contexte de Claude, sans décision : la demande de
// permission habituelle reste (« allow » la sauterait).
const rappelHook = lancer(
  { tool_name: "Edit", tool_input: { file_path: dans("src", "lib", "navigation.ts"), new_string: "x" } },
  { CLAUDE_PROJECT_DIR: appli }
);
assert.equal(rappelHook.status, 0);
const sortieRappel = JSON.parse(rappelHook.stdout).hookSpecificOutput;
assert.equal(sortieRappel.hookEventName, "PreToolUse");
assert.equal(sortieRappel.permissionDecision, undefined);
assert.match(sortieRappel.additionalContext, /src\/lib\/navigation\.ts[\s\S]*ADAPTATIONS\.md/);
// Une commande n'est pas une écriture : pas de rappel.
const commandeHook = lancer({ tool_name: "Bash", tool_input: { command: "ls" } }, { CLAUDE_PROJECT_DIR: appli });
assert.equal(commandeHook.stdout, "");
// Un refus passe avant le rappel.
const refusHook = lancer(
  { tool_name: "Write", tool_input: { file_path: dans(".env"), content: "X=1" } },
  { CLAUDE_PROJECT_DIR: appli }
);
assert.equal(JSON.parse(refusHook.stdout).hookSpecificOutput.permissionDecision, "deny");
// Lancé comme hook dans une appli au manifeste cassé : code 0, aucune sortie, l'écriture passe.
fs.rmSync(manifesteIllisible, { recursive: true });
fs.writeFileSync(manifesteIllisible, "{ pas du json");
const casseHook = lancer(
  { tool_name: "Write", tool_input: { file_path: path.join(illisibleAppli, "src", "app", "page.tsx"), content: "x" } },
  { CLAUDE_PROJECT_DIR: illisibleAppli }
);
assert.equal(casseHook.status, 0);
assert.equal(casseHook.stdout, "");
assert.equal(casseHook.stderr, "");

fs.rmSync(appli, { recursive: true, force: true });
fs.rmSync(illisibleAppli, { recursive: true, force: true });

const refus = lancer({ tool_name: "Bash", tool_input: { command: "gh pr merge 42" } });
assert.equal(refus.status, 0);
assert.equal(JSON.parse(refus.stdout).hookSpecificOutput.permissionDecision, "deny");

const accord = lancer({ tool_name: "Write", tool_input: { file_path: "/repo/a.ts", content: "x" } });
assert.equal(accord.status, 0);
assert.equal(accord.stdout, "");

// Une entrée illisible ne bloque rien : le hook ne doit jamais empêcher de travailler par accident.
const illisible = spawnSync(process.execPath, [script], { input: "pas du json", encoding: "utf8" });
assert.equal(illisible.status, 0);
assert.equal(illisible.stdout, "");

console.log("Gardes : tous les cas passent.");
