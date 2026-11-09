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
// .ENV est le même fichier que .env sous Windows ; .envrc et .npmrc portent
// eux aussi des secrets (variables chargées par direnv, jeton du registre npm).
refuse(ecr("/repo/.ENV", "X=1"));
refuse(ecr("C:\\repo\\.Env.Local", "X=1"));
refuse(ecr("/repo/.envrc", "export X=1"));
refuse(ecr("/repo/.npmrc", "//registry.npmjs.org/:_authToken=x"));
passe(ecr("/repo/.env.EXAMPLE", "X="));
passe(ecr("/repo/src/.env.d.ts", "declare const x: string;"));

// --- Contournements reproduits à l'audit du 2026-11-09 ---
// Le garde ne lisait que le premier mot de chaque commande simple : le même
// geste confié à un interpréteur, à un lanceur ou à un heredoc passait.

const encodee = (texte) => Buffer.from(texte, "utf16le").toString("base64");
for (const interdite of [
  "gh pr merge 42 --squash",
  "git push -f origin fix/x",
  "git commit -n -m x",
  "git add -f .env.local",
  "npx tsx scripts/import.ts --confirmer",
]) {
  refuse(cmd(`sh -c '${interdite}'`));
  refuse(cmd(`bash -c "${interdite}"`));
  refuse(cmd(`bash -lc "${interdite}"`));
  refuse(cmd(`pwsh -Command "${interdite}"`));
  refuse(cmd(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${interdite}"`));
  refuse(cmd(`pwsh -EncodedCommand ${encodee(interdite)}`));
  refuse(cmd(`cmd /c "${interdite}"`));
  refuse(cmd(`Invoke-Expression '${interdite}'`));
  refuse(cmd(`iex '${interdite}'`));
  refuse(cmd(`eval '${interdite}'`));
  refuse(cmd(`echo '${interdite}' | bash`));
  refuse(cmd(`'${interdite}' | Invoke-Expression`));
  refuse(cmd(`bash <<< '${interdite}'`));
  refuse(cmd(`bash <<'EOF'\n${interdite}\nEOF`));
  refuse(cmd(`cat <<'EOF' | sh\n${interdite}\nEOF`));
  refuse(cmd(`Invoke-Expression @'\n${interdite}\n'@`));
  refuse(cmd(`@'\n${interdite}\n'@ | Invoke-Expression`));
  refuse(cmd(`echo "$(${interdite})"`));
  refuse(cmd(`(${interdite})`));
  refuse(cmd(`Invoke-Command -ScriptBlock { ${interdite} }`));
  refuse(cmd(`sudo -E ${interdite}`));
  refuse(cmd(`node -e "require('child_process').execSync('${interdite}')"`));
  refuse(cmd(`bash -c "pwsh -Command '${interdite}'"`));
}
refuse(cmd("echo 42 | xargs gh pr merge"));
refuse(cmd("echo 42 | xargs -I {} gh pr merge {} --squash"));
refuse(cmd("npx gh pr merge 42"));
refuse(cmd("npm exec -- gh pr merge 42"));
refuse(cmd("Start-Process gh -ArgumentList 'pr merge 42'"));
refuse(cmd("Start-Process -FilePath gh -ArgumentList 'pr','merge','42' -Wait"));
refuse(cmd("Start-Process git 'push --force'"));
refuse(cmd(`python -c "import subprocess; subprocess.run(['gh', 'pr', 'merge', '42'])"`));
// Le texte d'un consommateur connu (message de commit, corps de PR, fichier)
// reste du texte : seul l'hôte du heredoc décide.
passe(cmd("git commit -F - <<'EOF'\nGardes : refuser gh pr merge, git push --force et --confirmer\nEOF"));
passe(cmd(`gh pr create --title "Gardes" --body "$(cat <<'EOF'\nRefuse gh pr merge 42 et --confirmer\nEOF\n)"`));
passe(cmd("gh pr create --title Gardes --body-file - <<'EOF'\ngh pr merge 42\nEOF"));
passe(cmd("git commit -m @'\nGardes : gh pr merge est refusé\n'@"));
passe(cmd("cat > notes.md <<'EOF'\ngh pr merge 42\nEOF"));
passe(cmd(`node -e "console.log('gh pr merge 42')"`));
passe(cmd('bash -c "npm run lint && npm run typecheck"'));
passe(cmd("pwsh -File scripts/verifier.ps1"));

// --confirmer cherché dans le code n'est pas --confirmer lancé.
passe(cmd("grep -rn -- --confirmer scripts/"));
passe(cmd("rg -- --confirmer"));
passe(cmd("git log -S '--confirmer'"));
passe(cmd("Select-String -Path scripts\\*.ts -Pattern '--confirmer'"));
passe(cmd("git ls-files | xargs grep -l -- --confirmer"));
refuse(cmd("grep -q x f && npx tsx scripts/import.ts --confirmer"));

// Un .env écrit par une commande, et non par Write ou Edit.
for (const ecriture of [
  "cp .env.example .env.local",
  "copy .env.example .env.local",
  "Copy-Item .env.example -Destination .env.local",
  "echo A=1 > .env.local",
  "echo A=1 >> app/.env",
  "echo A=1>.env.local",
  "printf 'A=1' | tee .env.local",
  "printf 'A=1' | tee -a .env",
  "Set-Content .env.local 'A=1'",
  "Set-Content -Path .env.local -Value 'A=1'",
  "'A=1' | Out-File -FilePath .env.local",
  "Add-Content .env 'A=1'",
  "mv .env.local.bak .env.local",
  "Move-Item .env.bak .env",
  "Rename-Item x.txt .env.local",
  "New-Item .env.local -Value 'A=1'",
  "sed -i 's/A=1/A=2/' .env.local",
  "touch .env.local",
  `node -e "require('fs').writeFileSync('.env','A=1')"`,
  `python -c "open('.env.local', 'w').write('A=1')"`,
  "[IO.File]::WriteAllText('.env.local', 'A=1')",
  "echo A=1 > .ENV",
  "echo 'use nix' > .envrc",
  "echo '//registry.npmjs.org/:_authToken=x' > .npmrc",
  "cat > .env.local <<'EOF'\nA=1\nEOF",
  'bash -c "echo A=1 > .env.local"',
])
  refuse(cmd(ecriture));
passe(cmd("cat .env.local"));
passe(cmd("Get-Content .env.example"));
passe(cmd("git diff -- .env.example"));
passe(cmd("echo 'export {};' > src/.env.d.ts"));
passe(cmd("echo x > environnement.txt"));
passe(cmd(`node -e "require('dotenv').config({ path: '.env.local' })"`));

// git : plomberie de git add -f, abréviations d'options, hooks détournés.
refuse(cmd("git update-index --add .env.local"));
refuse(cmd("git update-index --add --cacheinfo 100644,abc,.env"));
refuse(cmd("git add --forc .env.local"));
refuse(cmd("git push --forc origin fix/x"));
refuse(cmd("git commit --no-verif -m x"));
refuse(cmd("git commit --no-ver -m x"));
refuse(cmd("git push --no-verif"));
refuse(cmd("git -c core.hooksPath=/dev/null commit -m x"));
refuse(cmd("git -c core.hookspath=NUL push origin fix/x"));
refuse(cmd("git merge --no-verify fix/x"));
refuse(cmd("git rebase --no-verify origin/main"));
refuse(cmd("git am --no-verify < correctif.patch"));
refuse(cmd("git pull --no-verify"));
passe(cmd("git update-index --refresh"));
passe(cmd("git -c core.quotepath=off commit -m x"));
passe(cmd("git merge --no-ff fix/x"));
passe(cmd("git rebase -n origin/main"));
passe(cmd("git push --force-with-lease origin fix/x"));
passe(cmd("git config core.hooksPath .husky"));

// Fusion par l'API : GraphQL, REST en PUT, depuis gh ou un client HTTP.
const mutation = (nom) => `mutation { ${nom}(input: {pullRequestId: "PR_x"}) { clientMutationId } }`;
refuse(cmd(`gh api graphql -f query='${mutation("mergePullRequest")}'`));
refuse(cmd(`gh api graphql -f query='${mutation("enablePullRequestAutoMerge")}'`));
refuse(cmd(`gh api graphql -F query=@- <<'EOF'\n${mutation("mergePullRequest")}\nEOF`));
refuse(cmd("gh api --method PUT repos/o/r/pulls/42/merge -f merge_method=squash"));
refuse(cmd("gh api -XPUT repos/o/r/pulls/42/merge"));
refuse(cmd('curl -X PUT -H "Authorization: Bearer $GH_TOKEN" https://api.github.com/repos/o/r/pulls/42/merge'));
refuse(cmd("curl --request PUT https://api.github.com/repos/o/r/pulls/42/merge"));
refuse(cmd("Invoke-RestMethod -Method Put -Uri https://api.github.com/repos/o/r/pulls/42/merge"));
refuse(
  cmd(`curl https://api.github.com/graphql -d '{"query":"${mutation("mergePullRequest").replace(/"/g, '\\"')}"}'`)
);
// En GET, l'API dit seulement si la PR est fusionnée.
passe(cmd("gh api repos/o/r/pulls/42/merge"));
passe(cmd("curl -s https://api.github.com/repos/o/r/pulls/42/merge"));
passe(cmd("gh api graphql -f query='{ viewer { login } }'"));
passe(cmd("gh pr view 42 --json mergeable"));

// Mot de passe de base hors de la forme scheme://user:pass@host. Coupés en deux
// comme plus haut, pour que le garde n'en refuse pas l'écriture ici.
refuse(cmd("PGPASSWORD=secret psql -h dpg-x.render.com -U u db"));
refuse(cmd("$env:PGPASSWORD = 'secret'; psql -h dpg-x.render.com -U u db"));
refuse(cmd("PGHOST=dpg-x.render.com PGPASSWORD=secret psql -U u db"));
refuse(cmd("psql 'host=dpg-x.render.com password=secret dbname=db'"));
refuse(cmd("psql 'postgresql://u" + "@dpg-x.render.com/db?sslmode=require&password=secret'"));
refuse(cmd("psql postgresql://:secret" + "@dpg-x.render.com/db"));
refuse(cmd("mysql -h db.example.com -u root -psecret app"));
refuse(cmd("mysql --host=db.example.com --password=secret app"));
refuse(ecr("/repo/x.ts", "postgresql://:secret" + "@dpg-x.render.com/db"));
refuse(ecr("/repo/x.ts", "postgresql://u" + "@dpg-x.render.com/db?password=secret"));
passe(cmd("PGPASSWORD=postgres psql -h localhost -U postgres app_test"));
passe(cmd("PGPASSWORD=postgres psql -U postgres app_test"));
passe(cmd('PGPASSWORD="$MOT_DE_PASSE" psql -h dpg-x.render.com -U u db'));
passe(cmd("psql 'host=localhost password=postgres dbname=app_test'"));
passe(cmd("psql 'postgresql://u" + "@localhost/db?password=postgres'"));
passe(cmd("psql -h dpg-x.render.com -U u db")); // sans mot de passe : psql le demande
passe(cmd("mysql -u root -psecret app")); // la machine locale, comme pour les URL
passe(cmd("find . -name '*.ts' -print"));

// Cas trouvés à la relecture de ce durcissement (2026-11-09).
// Le corps sort de `$(cat <<'EOF' …)` vers un interpréteur ; un heredoc non
// quoté ou une here-string `@"…"@` exécutent leurs `$( )`.
refuse(cmd(`bash -c "$(cat <<'EOF'\ngh pr merge 42\nEOF\n)"`));
refuse(cmd(`eval "$(cat <<'EOF'\nnpx tsx scripts/import.ts --confirmer\nEOF\n)"`));
refuse(cmd("cat <<EOF > notes.md\n$(gh pr merge 42)\nEOF"));
refuse(cmd('git commit -m @"\n$(gh pr merge 42)\n"@'));
passe(cmd(`git commit -m "$(cat <<'EOF'\nGardes : gh pr merge est refusé\nEOF\n)"`));
passe(cmd(`CORPS=$(cat <<'EOF'\ngh pr merge 42\nEOF\n)`));
// Un séparateur cité dans un titre ne change pas l'hôte du heredoc.
passe(cmd("gh pr create --title \"UI & thème | gardes\" --body-file - <<'EOF'\n--confirmer\nEOF"));
// Un corps de PR rangé dans une variable PowerShell reste du texte.
passe(cmd("$corps = @'\nRefuse --confirmer et gh pr merge\n'@\ngh pr create --title Gardes --body $corps"));
// Options de gh avant la sous-commande, numéro de PR dans une variable.
refuse(cmd("gh pr -R o/r merge 42"));
refuse(cmd('gh api -X PUT "repos/o/r/pulls/$PR/merge"'));
// L'hôte d'une URL de base compte comme hôte nommé.
refuse(cmd("PGPASSWORD=secret psql postgresql://u" + "@dpg-x.render.com/db"));
passe(cmd("PGPASSWORD=postgres psql postgresql://postgres" + "@localhost:5433/app_test"));
// Lire n'est pas écrire ; afficher --confirmer n'est pas le lancer.
passe(cmd(`python -c "print(open('.env.local').read())"`));
passe(cmd(`node -e "require('dotenv').config({ path: '.env.local' }); process.stdout.write('ok')"`));
passe(cmd("echo --confirmer"));
refuse(cmd(`python -c "open('.env.local', mode='a').write('A=1')"`));
refuse(cmd(`node -e "require('fs').appendFileSync('.env.local', 'A=1')"`));

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
// Un dépôt sans manifeste (le catalogue) : la garde n'y rappelle jamais rien.
// Sur un dossier temporaire, pas sur la racine de ce dépôt : dans une appli
// assemblée, cette racine a un manifeste, et le cas faisait échouer la CI dès le
// premier commit (appli assemblée à la recette du catalogue, le 2026-11-06).
const sansManifeste = fs.mkdtempSync(path.join(os.tmpdir(), "gardes-catalogue-"));
passe(rap(path.join(sansManifeste, "src", "app", "page.tsx"), sansManifeste));
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

// Le manifeste se cherche depuis le fichier écrit, pas depuis le dossier de la
// session. Le 2026-11-06, la recette de materiotheque s'est faite d'une session
// ouverte dans le catalogue qui écrivait aussi dans l'appli : les retouches de
// deux fichiers du manifeste n'ont déclenché aucun rappel, la racine vue étant
// celle du catalogue, sans manifeste.
const depot = fs.mkdtempSync(path.join(os.tmpdir(), "gardes-depot-"));
const catalogue = path.join(depot, "catalogue");
const appliVoisine = path.join(depot, "materiotheque");
fs.mkdirSync(path.join(catalogue, ".git"), { recursive: true });
fs.mkdirSync(path.join(appliVoisine, ".git"), { recursive: true });
fs.mkdirSync(path.join(appliVoisine, "src", "app"), { recursive: true });
fs.copyFileSync(dans("catalogue.empreintes.json"), path.join(appliVoisine, "catalogue.empreintes.json"));
const ecritureVoisine = (...parties) => ({
  tool_name: "Edit",
  tool_input: { file_path: path.join(appliVoisine, ...parties), new_string: "x" },
});
const dansLaVoisine = lancer(ecritureVoisine("src", "app", "page.tsx"), { CLAUDE_PROJECT_DIR: catalogue });
assert.match(
  JSON.parse(dansLaVoisine.stdout).hookSpecificOutput.additionalContext,
  /src\/app\/page\.tsx[\s\S]*ADAPTATIONS\.md/
);
// Le fichier et son dossier n'existent pas encore (un Write qui crée l'arbre) : même rappel.
assert.match(
  JSON.parse(lancer(ecritureVoisine("src", "lib", "navigation.ts"), { CLAUDE_PROJECT_DIR: catalogue }).stdout)
    .hookSpecificOutput.additionalContext,
  /src\/lib\/navigation\.ts/
);
// Un fichier de l'appli hors manifeste, ou la racine du catalogue lui-même : rien.
assert.equal(lancer(ecritureVoisine("src", "app", "coloc", "page.tsx"), { CLAUDE_PROJECT_DIR: catalogue }).stdout, "");
assert.equal(
  lancer(
    { tool_name: "Edit", tool_input: { file_path: path.join(catalogue, "src", "app", "page.tsx"), new_string: "x" } },
    { CLAUDE_PROJECT_DIR: catalogue }
  ).stdout,
  ""
);
// Un chemin relatif se lit depuis le dossier de la session, comme avant.
fs.mkdirSync(path.join(catalogue, "src", "app"), { recursive: true });
fs.copyFileSync(dans("catalogue.empreintes.json"), path.join(catalogue, "catalogue.empreintes.json"));
assert.match(
  JSON.parse(
    lancer(
      { tool_name: "Edit", tool_input: { file_path: path.join("src", "app", "page.tsx"), new_string: "x" } },
      { CLAUDE_PROJECT_DIR: catalogue }
    ).stdout
  ).hookSpecificOutput.additionalContext,
  /src\/app\/page\.tsx/
);
fs.rmSync(path.join(catalogue, "catalogue.empreintes.json"));
// La recherche s'arrête au dépôt git : le manifeste d'un dossier au-dessus
// d'un autre dépôt n'est pas le sien.
fs.copyFileSync(dans("catalogue.empreintes.json"), path.join(depot, "catalogue.empreintes.json"));
fs.rmSync(path.join(appliVoisine, "catalogue.empreintes.json"));
assert.equal(lancer(ecritureVoisine("src", "app", "page.tsx"), { CLAUDE_PROJECT_DIR: catalogue }).stdout, "");
// Un worktree git a un fichier .git, pas un dossier : il borne aussi la recherche.
fs.rmSync(path.join(appliVoisine, ".git"), { recursive: true });
fs.writeFileSync(path.join(appliVoisine, ".git"), "gitdir: ../.git/worktrees/materiotheque\n");
assert.equal(lancer(ecritureVoisine("src", "app", "page.tsx"), { CLAUDE_PROJECT_DIR: catalogue }).stdout, "");
// Une appli rangée dans un dossier d'un dépôt qui n'a pas de manifeste à sa racine : celui de l'appli compte.
fs.rmSync(path.join(appliVoisine, ".git"));
fs.rmSync(path.join(depot, "catalogue.empreintes.json"));
fs.copyFileSync(dans("catalogue.empreintes.json"), path.join(appliVoisine, "catalogue.empreintes.json"));
fs.renameSync(appliVoisine, path.join(catalogue, "apps-materiotheque"));
assert.match(
  JSON.parse(
    lancer(
      {
        tool_name: "Edit",
        tool_input: {
          file_path: path.join(catalogue, "apps-materiotheque", "src", "app", "page.tsx"),
          new_string: "x",
        },
      },
      { CLAUDE_PROJECT_DIR: catalogue }
    ).stdout
  ).hookSpecificOutput.additionalContext,
  /src\/app\/page\.tsx/
);
fs.rmSync(depot, { recursive: true, force: true });

fs.rmSync(appli, { recursive: true, force: true });
fs.rmSync(illisibleAppli, { recursive: true, force: true });
fs.rmSync(sansManifeste, { recursive: true, force: true });

const refus = lancer({ tool_name: "Bash", tool_input: { command: "gh pr merge 42" } });
assert.equal(refus.status, 0);
assert.equal(JSON.parse(refus.stdout).hookSpecificOutput.permissionDecision, "deny");

const accord = lancer({ tool_name: "Write", tool_input: { file_path: "/repo/a.ts", content: "x" } });
assert.equal(accord.status, 0);
assert.equal(accord.stdout, "");

// La commande se lit quel que soit l'outil : le terminal de l'appli de bureau
// lance des commandes comme Bash (audit du 2026-11-09).
const terminal = lancer({ tool_name: "mcp__terminal__run_in_terminal", tool_input: { command: "gh pr merge 42" } });
assert.equal(JSON.parse(terminal.stdout).hookSpecificOutput.permissionDecision, "deny");
const reglages = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
const matcher = new RegExp(`^(?:${reglages.hooks.PreToolUse[0].matcher})$`);
for (const outil of [
  "Bash",
  "PowerShell",
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
  "mcp__terminal__run_in_terminal",
])
  assert.ok(matcher.test(outil), `settings.json ne branche pas le garde sur ${outil}`);

// Une entrée illisible bloque (code 2, motif sur stderr) : laisser passer, c'est
// laisser passer sans regarder la commande.
const illisible = spawnSync(process.execPath, [script], { input: "pas du json", encoding: "utf8" });
assert.equal(illisible.status, 2);
assert.equal(illisible.stdout, "");
assert.match(illisible.stderr, /illisible/);
const sansCommande = lancer({ tool_name: "Bash", tool_input: {} });
assert.equal(sansCommande.status, 2);
assert.match(sansCommande.stderr, /illisible/);

console.log("Gardes : tous les cas passent.");
