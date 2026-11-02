// Contrôle des gardes : `node .claude/hooks/gardes.test.mjs`
// (lancé par .github/workflows/ci.yml). Sans framework : le script doit rester
// vérifiable sur n'importe quel poste qui a Node.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifierCommande as cmd, verifierEcriture as ecr } from "./gardes.mjs";

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

// --- Bout en bout : le script lancé comme hook répond au format attendu ---

const script = fileURLToPath(new URL("./gardes.mjs", import.meta.url));
const lancer = (entree) => spawnSync(process.execPath, [script], { input: JSON.stringify(entree), encoding: "utf8" });

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
