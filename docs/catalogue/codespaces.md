# Essai : le catalogue dans GitHub Codespaces

Note de travail, propre au catalogue : une appli assemblée ne la reçoit pas. Elle
accompagne `.devcontainer/` et sert à un essai réel avant toute promesse sur la page de
présentation ou dans le README. Après l'essai, elle se réduit à ce qui reste vrai (ou
disparaît si la piste est abandonnée).

Le problème : le démarrage rapide du README exige git configuré, Node 24, npm 11.16 et,
pour une appli avec base, Docker. Une personne non développeuse s'arrête avant la première
commande. La piste : un
environnement prêt à l'emploi dans GitHub Codespaces, décrit par `.devcontainer/`, ouvert
depuis le navigateur, sans rien installer sur le poste.

## Ce que fait `.devcontainer/`

- **Image** : Node 24 sur Debian (celle de `.nvmrc` et de la CI), avec git.
- **`creation.sh`**, une fois à la création : met npm à jour (11.16 ou plus, exigé par
  `engine-strict` du `.npmrc`), refait le contrôle de version de la CI, puis `npm ci`.
  L'éditeur n'ouvre qu'une fois `npm ci` fini et Postgres démarré.
- **`demarrage.sh`**, à chaque démarrage et à chaque réveil : si le projet a un
  `docker-compose.yml`, attend le démon Docker, lance `docker compose up -d --wait`
  (conteneur `catalogue-postgres`, `127.0.0.1:5433`), puis `scripts/bases-locales.ts`, qui
  crée les bases `_dev` et `_test` manquantes et affiche la ligne `DATABASE_URL`.
- **Docker dans le conteneur** (feature `docker-in-docker`), pas celui de l'hôte : le port
  `127.0.0.1:5433` est alors celui du conteneur, là où les tests et `.env.local` le
  cherchent, et `docker exec catalogue-postgres …` marche comme sur un poste.
- **gh** (dépôt distant et issues d'une appli assemblée) et **Claude Code** (commande
  `claude` et extension VS Code, feature publiée par Anthropic).
- **Ports** : 3000 redirigé (l'appli de `npm run dev`, ouverte dans le navigateur) ; 5433
  jamais redirigé (Postgres sans mot de passe, pour le seul conteneur).
- **Gardes** : `.claude/settings.json` les lance avec `node`, présent dans l'image.

Image et features sont épinglées par digest, comme l'image Postgres (les actions de la CI
le sont par SHA) ; l'étiquette suivie est en commentaire dans `devcontainer.json`. L'image
porte la majeure de Node : elle change avec `.nvmrc`, comme le disent `ci.yml` et
`dependabot.yml`.

## Liste d'essai

L'essai se fait sur la branche de la pull request : tant qu'elle n'est pas fusionnée,
`main` n'a pas de `.devcontainer/`. Les commandes ci-dessous se tapent **dans le terminal
du Codespace**, qui est un terminal Linux (bash), pas dans PowerShell sur le poste. Rien
n'est à installer sur le poste : un navigateur connecté à GitHub suffit.

Noter pour chaque étape : la durée, ce qui s'affiche, ce qui bloque.

### 1. Créer le Codespace

1. Sur la page GitHub du catalogue : bouton **Code**, onglet **Codespaces**, menu **…**,
   **New with options**.
2. Choisir la branche de la pull request, la région **Europe West**, la machine
   **2-core**. Le compte qui paie est affiché sous « Billed to » : le noter.
3. **Create codespace**. Attendre l'éditeur (la création lance `npm ci` puis démarre
   Postgres) : noter la durée.
4. Vérifier, dans le terminal (menu **Terminal**, **New Terminal**) :

   ```bash
   node --version
   ```

   Doit afficher `v24.…`.

   ```bash
   npm --version
   ```

   Doit afficher `11.16.0` ou plus. Si la création a échoué sur la version de npm, le
   journal (voir plus bas) liste les npm trouvés : le copier.

   ```bash
   docker compose ps --format "{{.Name}} {{.Status}}"
   ```

   Doit afficher `catalogue-postgres Up … (healthy)`.

   ```bash
   git config user.name
   ```

   Doit afficher le nom du compte GitHub (Codespaces configure git d'office : l'assembleur
   en a besoin pour son premier commit).

   ```bash
   node .claude/hooks/gardes.test.mjs
   ```

   Doit finir sans échec.

   Si une vérification échoue : ouvrir la palette (**Ctrl+Maj+P**), **Codespaces: View
   Creation Log**, et copier la fin du journal dans le compte rendu.

### 2. Lancer Claude Code

1. Dans le terminal :

   ```bash
   claude
   ```

   Se connecter avec le compte Claude (un lien s'ouvre dans le navigateur, puis un code
   à recoller). Noter si la connexion passe sans difficulté. L'extension Claude Code
   (icône dans la barre de gauche) est l'autre porte d'entrée : noter laquelle est la plus
   simple pour une personne non développeuse.
2. Vérifier que les gardes tournent : demander à Claude d'écrire un fichier `.env.local`.
   Il doit être refusé par le garde, avec son message.
3. Facultatif, pour éprouver la base : quitter Claude (`/exit`), puis

   ```bash
   DATABASE_URL=postgresql://postgres@localhost:5433/catalogue_solstice_vibe_test PGSSLMODE=disable npm test
   ```

   Doit finir vert (quelques minutes sur une machine 2 cœurs : noter la durée).

### 3. Assembler une appli sans base, la voir tourner

1. Dans le terminal, depuis le catalogue :

   ```bash
   node outils/assembler.mjs ../essai-site
   ```

   ```bash
   cd ../essai-site && npm ci
   ```

   ```bash
   npm run dev
   ```

2. Une notification propose d'ouvrir le port 3000 dans le navigateur (sinon : onglet
   **Ports**, ligne 3000, icône du globe). L'accueil doit s'afficher, sur une adresse en
   `….app.github.dev`. Ouvrir la même adresse dans une fenêtre privée : GitHub doit
   demander de se connecter (le port est privé).
3. Vérifier que l'appli a reçu `.devcontainer/` (voir « Appli assemblée ou catalogue
   seul » plus bas) :

   ```bash
   ls .devcontainer
   ```

4. Arrêter le serveur (**Ctrl+C**) et revenir au catalogue : `cd ../catalogue-solstice-vibe`
   (le dossier porte le nom du dépôt).

### 4. Assembler une appli avec base

**4a. Directement**, pour éprouver la base sans dépendre de la skill :

```bash
node outils/assembler.mjs ../essai-base --briques echeances
```

```bash
cd ../essai-base && npm ci
```

```bash
npx tsx scripts/bases-locales.ts
```

Doit afficher `essai_base_dev` et `essai_base_test` « créée » (Postgres tourne déjà :
c'est celui du catalogue, partagé), puis la ligne `DATABASE_URL`. Copier `.env.example` en
`.env.local` et y remplacer la ligne `DATABASE_URL` par celle affichée (dans l'éditeur :
clic droit sur `.env.example`, **Copy**, **Paste**, renommer), puis :

```bash
npm run dev
```

Ouvrir le port 3000 : l'accueil doit s'afficher. Dans un second terminal,
`curl -s localhost:3000/sante` doit répondre avec une base `ok`. Arrêter le serveur
(**Ctrl+C**) et revenir au catalogue.

**4b. Par la skill `creer-appli`**, le parcours réel : la conversation de cadrage, la
blueprint, l'assemblage.

1. Lancer `claude` depuis le catalogue et demander une petite appli d'essai avec connexion
   et échéances (briques `comptes`, `mails`, `echeances`). Écart attendu, propre à l'essai
   sur une branche : la skill vérifie d'abord que le catalogue est au niveau de `main`
   (sa section 0) et le signalera. Lui répondre que c'est un essai de la branche et de
   continuer ; l'appli d'essai notera le commit de la branche. Après la fusion, cette
   étape se refait sans écart. Quand la skill demande le système, répondre : « Linux,
   terminal bash de GitHub Codespaces ». Elle doit alors donner les commandes bash (sa
   section 5.4) et des chemins en `/workspaces/…`.
2. **Dépôt distant** : accepter la création d'un dépôt privé de test sous son propre
   compte. Point attendu, non vérifié : le jeton GitHub du Codespace ne vaut que pour le
   dépôt du catalogue, et `gh repo create` peut échouer (« Resource not accessible by
   integration », 403). Dans ce cas, quitter Claude puis, dans le terminal :

   ```bash
   unset GITHUB_TOKEN
   ```

   ```bash
   gh auth login --web --git-protocol https
   ```

   ```bash
   gh auth setup-git
   ```

   puis relancer `claude` **depuis ce même terminal** et reprendre l'étape. Noter le
   message exact.
3. Suivre les commandes que donne la skill : bases locales (Postgres tourne déjà, la
   commande `docker compose up` doit répondre tout de suite), `.env.local`, `npm run dev`.
   Ouvrir l'appli par le port 3000.
4. Se connecter : le code de connexion s'affiche dans le terminal du serveur
   (`MAILS_FOURNISSEUR=console`). Point attendu, non vérifié : l'envoi d'un formulaire
   (Server Action) passe par le proxy de Codespaces, et Next.js peut le refuser si l'adresse
   d'origine (`….app.github.dev`) ne correspond pas à l'hôte transmis. Symptôme : rien ne se
   passe au clic, et le terminal du serveur affiche un message contenant
   `` does not match `origin` header `` ou `Blocked cross-origin request`. Le noter
   tel quel : la correction (autoriser la seule adresse de ce Codespace dans
   `next.config.ts`) touche le socle de toutes les applis et reste à décider.
5. Ouvrir un Codespace **sur le dépôt de l'appli d'essai** (bouton **Code** de ce dépôt) :
   il doit se créer avec le même environnement, Postgres compris. Puis le supprimer.

### 5. Mise en veille

1. Fermer l'onglet du Codespace et revenir après 35 minutes (le délai d'inactivité par
   défaut est de 30 minutes).
2. Rouvrir le Codespace (page **github.com/codespaces**). Vérifier : les fichiers sont
   là ; `docker compose ps` remontre Postgres sain ; les bases de l'appli d'essai sont
   intactes (`npx tsx scripts/bases-locales.ts` depuis son dossier doit dire « existe
   déjà ») ; `claude --continue` reprend la conversation précédente.
3. Lancer une tâche longue de Claude (par exemple lui demander de lancer
   `npm run lint` puis `npm run typecheck` puis `npm run build` dans l'appli d'essai, et
   d'en résumer les sorties), fermer l'onglet, revenir 35 minutes plus tard : noter si la
   tâche a fini ou a été coupée.

### 6. Ranger et relever le coût

1. Supprimer le dépôt d'essai sur GitHub s'il a été créé (réglages du dépôt, « Delete this
   repository ») : c'est un geste que Claude ne fait pas.
2. Arrêter puis supprimer le Codespace (**github.com/codespaces**, menu **…**, **Delete**).
3. Relever le temps consommé : réglages du compte qui paie, **Billing**, **Codespaces**.

## Appli assemblée ou catalogue seul

Question : l'appli assemblée doit-elle recevoir `.devcontainer/` ? **Décision à prendre**,
de préférence après l'essai.

**État de cette branche** : `.devcontainer/` n'est pas dans `EXCLUS_DU_CATALOGUE`
(`outils/modules.mjs`), donc l'assembleur le copie dans toute appli, comme le reste du
socle. Aucune ligne de l'assembleur ne change ; c'est son résultat qui change.

Ce qui plaide pour le socle :

- l'appli vit ensuite dans son propre dépôt ; la PME qui y revient sans rien sur son poste
  ouvre un Codespace **sur ce dépôt**, pas sur le catalogue. Sans `.devcontainer/`, elle
  tombe sur l'image générique de Codespaces : npm probablement plus ancien que 11.16
  (`npm ci` refusé par `engine-strict`), pas de Claude Code, pas de Postgres prêt ;
- `demarrage.sh` ne démarre rien sans `docker-compose.yml`, que l'assembleur retire avec la
  base, et les commentaires de `.devcontainer/` sont écrits pour les deux cas (« un projet
  avec base… ») : une appli sans base n'a rien à retoucher ;
- le fichier est suivi comme le reste du socle : `catalogue.empreintes.json` le liste, une
  retouche se note dans `ADAPTATIONS.md`, l'outil de mise à jour reporte un digest
  renouvelé.

Ce qui plaide contre : une appli qui n'utilise jamais Codespaces porte trois fichiers de
plus, et la feature Docker alourdit la création d'un Codespace même sans base.

Conséquences sur les vérifications, dans l'état de cette branche :

- `tests/assembleur.test.ts` : rien à changer. Le test « chaque fichier du catalogue hors
  vie du catalogue est copié à l'identique » lit `git ls-files` et couvre les nouveaux
  fichiers d'office. Le verrou des renvois à `outils/` passe : les fichiers de
  `.devcontainer/` n'en citent aucun.
- Job `socle-seul` (`.github/workflows/assemblage.yml`) : `npm run format:check` lit
  `devcontainer.json` dans l'appli assemblée ; lint, typecheck, tests et build ne lisent
  pas `.devcontainer/`. Rien à changer.

Pour garder `.devcontainer/` au catalogue seul : ajouter `".devcontainer/"` à
`EXCLUS_DU_CATALOGUE` ; le test « copié à l'identique » lit cette liste et suit sans
retouche. Une option de l'assembleur (`OPTIONS_DU_SOCLE`, comme Dependabot) serait une
troisième voie, avec du code et des tests en plus.

## Limites relevées

Pages de GitHub lues le 2026-11-13 ; à revérifier avant toute promesse.

- **Quota puis facturation** : un compte personnel GitHub Free a 120 heures-cœur et
  15 Go-mois de stockage gratuits par mois, soit 60 heures sur une machine 2 cœurs. Sans
  moyen de paiement, l'usage est bloqué une fois le quota épuisé ; avec, la machine
  2 cœurs coûte 0,18 $ de l'heure (4 cœurs : 0,36 $), stockage en plus. Un Codespace créé
  depuis le dépôt public du catalogue est, selon toute vraisemblance, facturé à la
  personne qui le crée (la page ne traite pas ce cas mot pour mot : à constater pendant
  l'essai, « Billed to »). L'abonnement ou la clé de Claude se paient à part, comme sur
  un poste.
- **Mise en veille** : 30 minutes d'inactivité par défaut, réglable de 5 à 240 minutes
  dans les réglages du compte. Selon GitHub, l'activité du terminal, saisie ou sortie,
  repousse la veille : une session de Claude qui écrit dans le terminal devrait tenir ;
  l'étape 5 de l'essai le vérifie. La même page indique une durée maximale de
  fonctionnement continu : à relire avant de promettre de longues sessions. À la veille,
  les processus s'arrêtent (`npm run dev`, Claude), les fichiers restent.
- **Suppression automatique** : un Codespace arrêté et inactif est supprimé après
  30 jours par défaut, avec ce qui n'a pas été poussé sur GitHub. Pour une PME, c'est
  le risque principal : un travail non commité disparaît. La consigne « commiter et
  pousser à chaque fin de séance » devient obligatoire.
- **Région et données réelles (RGPD)** : la région se choisit automatiquement selon la
  localisation, ou à la main dans les réglages (Europe West existe). Le Codespace est
  hébergé par GitHub, société américaine, même en région Europe : transfert hors UE au
  sens du RGPD, à couvrir par le contrat GitHub de l'entreprise (vérifier que son accord
  de traitement des données couvre Codespaces). Recommandation : **aucune donnée réelle
  dans un Codespace**, comme sur un poste (le `docker-compose.yml` le dit déjà de la
  base locale) ; les données réelles vivent seulement en production, chez l'hébergeur
  choisi. Rappel : avec ou sans Codespaces, Claude Code envoie à Anthropic les fichiers
  qu'il lit.
- **Dépendance à GitHub** : compte GitHub obligatoire, panne de GitHub = plus
  d'environnement de travail, quotas et prix fixés par GitHub. Le code reste dans un
  dépôt git ordinaire et `.devcontainer/` est un format ouvert : le même environnement
  s'ouvre en local (VS Code et Docker) ou chez un autre fournisseur de dev containers.
  La sortie est possible, mais elle redemande des installations sur le poste.
- **Jeton GitHub du Codespace** : il ne vaut que pour le dépôt d'où le Codespace est
  créé. Créer le dépôt d'une appli assemblée demande une connexion `gh` de plus (étape
  4.2), à confirmer par l'essai.
- **Formulaires derrière le proxy** : voir l'étape 4.4. Les briques `rgpd` et `import-lot`
  comparent elles aussi l'origine d'une requête à l'hôte : même risque.
- **Lien de connexion par e-mail** : en développement, le lien se construit sur l'hôte
  reçu, qui peut être `localhost:3000`, injoignable depuis le navigateur. La connexion
  par code, méthode par défaut, n'est pas concernée.

## À reprendre après l'essai

- Dire dans la skill `creer-appli` que Codespaces est un Linux en bash (variable
  `CODESPACES`), pour qu'elle ne demande pas le système et donne les commandes de sa
  section 5.4.
- Selon l'étape 4.4, autoriser dans `next.config.ts` la seule adresse du Codespace en
  cours (décision : touche le socle de toutes les applis).
- Ajouter l'écosystème `devcontainers` à `.github/dependabot.yml` pour renouveler les
  digests.
- Réécrire le démarrage rapide du README et la page de présentation, si l'essai est
  concluant.
