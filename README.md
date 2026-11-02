# catalogue-solstice-vibe

[![Vérification du code](https://github.com/solstice-lab/catalogue-solstice-vibe/actions/workflows/ci.yml/badge.svg)](https://github.com/solstice-lab/catalogue-solstice-vibe/actions/workflows/ci.yml)
[![Assemblage](https://github.com/solstice-lab/catalogue-solstice-vibe/actions/workflows/assemblage.yml/badge.svg)](https://github.com/solstice-lab/catalogue-solstice-vibe/actions/workflows/assemblage.yml)

Le catalogue de Solstice Lab : de quoi assembler, avec Claude, de petites
applis web pour les outils internes d'une entreprise. Il contient le socle
commun (Next.js, kit d'interface) et sa méthode de travail pour Claude, des briques
réutilisables, et l'assembleur (`outils/assembler.mjs`) qui copie ce qu'un
client a choisi vers un dossier neuf : l'appli assemblée, livrée dans son propre
dépôt, où s'écrit ensuite son module métier.

Le dépôt est entretenu par l'équipe Solstice Lab et n'accepte pas de pull
request extérieure : un problème se signale par un ticket, une faille par
[`SECURITY.md`](SECURITY.md), et [`CONTRIBUTING.md`](CONTRIBUTING.md) est le
mode d'emploi de l'équipe.

## Démarrage rapide

Il faut git, avec une identité configurée (`user.name`, `user.email` :
l'assembleur commite l'appli), Node 24 ou plus, npm 11.16 ou plus (raisons dans
« Démarrer en local ») et, pour une appli avec base, Docker lancé (Docker
Desktop sous Windows et macOS). Les commandes sont les mêmes sous PowerShell et
sous bash.

Cloner le catalogue et assembler une appli à côté, ici avec la connexion
(`comptes`, qui exige `mails`) et les échéances :

```
git clone https://github.com/solstice-lab/catalogue-solstice-vibe.git
cd catalogue-solstice-vibe
npm ci
node outils/assembler.mjs ../mon-appli --briques comptes,mails,echeances
```

Puis, dans l'appli assemblée, installer et créer ses bases locales :

```
cd ../mon-appli
npm ci
docker compose up -d --wait
npx tsx scripts/bases-locales.ts
```

Pour lancer cette appli (`.env.local`, `npm run dev`), voir « Démarrer en
local ». Sans brique, `node outils/assembler.mjs ../mon-site` donne un site sans
base : ni Docker ni `.env.local`, `npm ci` puis `npm run dev` dans `../mon-site`.
Pour choisir les briques, voir « Briques » ; pour mener un projet client du
cadrage à la livraison, « Démarrer un projet client ».

<!-- Capture d'écran d'une appli assemblée, à ajouter : docs/captures/appli-assemblee.png -->

## Statut du projet

- **Expérimental.** Le catalogue sert aux livraisons de Solstice Lab et
  change avec elles. Des combinaisons de briques s'assemblent dans les tests
  (fichiers, imports, mise en forme, typecheck, migrations), mais lint, tests et build ne
  sont rejoués que sur l'appli sans base. La brique `deploiement` n'a pas
  été éprouvée par une mise en ligne réelle.
- **Pas de version publiée** : ni tag, ni release, ni paquet npm. Seule la
  branche `main` est entretenue. `package.json` porte `"private": true` pour
  que npm refuse de publier le paquet : c'est le dépôt qui est sous licence
  MIT (`LICENSE`), pas un paquet distribué.
- **Interfaces des briques non stabilisées.** La version d'une brique est le
  commit du catalogue noté dans la blueprint de l'appli et dans son manifeste
  d'empreintes (`catalogue.empreintes.json`) ; chaque changement
  d'interface publique est inscrit au `CHANGELOG.md` de la brique, sans
  promesse de compatibilité d'un commit à l'autre.

## Claude Code : un hook s'applique d'office

`.claude/settings.json` est suivi dans le dépôt et branche un hook
`PreToolUse` : quiconque ouvre le dépôt dans Claude Code le reçoit. Avant
chaque commande (Bash, PowerShell) et chaque écriture de fichier (Write, Edit,
MultiEdit, NotebookEdit) de Claude, Claude Code lance
`node .claude/hooks/gardes.mjs`, qui lit la commande ou le fichier visé, sans
dépendance ni réseau, et refuse : écrire un `.env*` (hors `.env.example`), une
URL de base distante avec mot de passe (dans une commande ou un fichier),
`git add -f`, `--confirmer`, `gh pr merge` (et la fusion par `gh api`), `git push --force`
(`--force-with-lease` passe) et `--no-verify` sur `git commit` et `git push`. Il ne touche pas aux commandes que
vous tapez vous-même. En session interactive, Claude Code ne lance les hooks
d'un dossier qu'une fois sa demande de confiance acceptée ; en `claude -p`, ils
tournent d'office.

Pour s'en passer sur son poste, mettre `{ "disableAllHooks": true }` dans
`.claude/settings.local.json` (réglages personnels, appliqués par-dessus
`.claude/settings.json`, ignorés par git). Ce réglage coupe tous les hooks, les
vôtres compris : Claude Code ne permet pas d'en retirer un seul, et des `hooks`
déclarés dans le fichier local s'ajoutent à ceux du dépôt sans les remplacer.
Pour une seule session : `claude --settings <fichier>`, avec un fichier JSON
qui contient `{ "disableAllHooks": true }` (le JSON en ligne de commande perd
ses guillemets sous Windows PowerShell 5.1).

## Ce que le catalogue assemble

Les applis visées remplacent un Excel critique, un Airtable bricolé ou des
allers-retours de mails. Elles sont propres au métier de l'entreprise, servent
5 à 50 personnes, ne sont soumises à aucune contrainte réglementaire et
supportent une heure de panne sans conséquence grave.

Une appli assemblée se lit en trois niveaux :

| Niveau | Ce que c'est | Dans une appli assemblée |
| --- | --- | --- |
| Socle | Le code commun (kit d'interface et thème, mentions légales et confidentialité, sonde `/sante`, CI) et sa méthode (règles, skills, gardes de Claude) : ensemble, le harnais | Toujours présent |
| Module métier | Les entités du client et leurs écrans, construits sur le patron `dossiers` | Propre à chaque appli, écrit après l'assemblage ; le catalogue n'en livre aucun |
| Briques | Un comportement réutilisable, branché sur une entité ou sur le socle : échéances, calendrier, validation, import par lot, e-mails, comptes… | Choisies d'une appli à l'autre |

Chaque brique vit dans `src/briques/<brique>/` avec son code, un `README.md`
dont la section « Interface publique » dit ce qu'une appli peut importer, et
un `CHANGELOG.md` ; ses tests sont dans `tests/`, sur leurs propres tables. Une
brique ne se conçoit pas dans le vide : elle naît dans une vraie appli, puis
s'extrait vers le catalogue quand une deuxième en a besoin (les échéances sont
nées dans une appli de suivi de contrats, puis ont servi à une maintenance
préventive et à des demandes d'achat ; ces trois applis de test ont été le banc
d'essai des briques, hors du catalogue depuis).

Un seul dépôt catalogue, un dépôt par appli assemblée : chaque brique
n'existe qu'une fois, et le client ne reçoit que ce qu'il a choisi. La skill
`creer-appli` mène le cadrage, écrit la blueprint de l'appli, un `.md` à
en-tête YAML (commit de référence du catalogue, entités, briques et leurs
branchements), et lance l'assembleur.

## Briques

Ce sont exactement celles que l'assembleur sait livrer (`BRIQUES` de
`outils/modules.mjs`, que `node outils/assembler.mjs --aide` énumère).

| Brique | Ce qu'elle fait | Exige | Se branche sur |
| --- | --- | --- | --- |
| `echeances` | Statuts des échéances d'une entité datée, vue « À venir » et tuile d'accueil | la base | une entité de l'appli, à brancher |
| `calendrier` | Les événements d'une entité datée sur un mois : grille sur ordinateur, cartes sur téléphone | la base | une entité de l'appli, à brancher |
| `validation` | Une file de propositions acceptées ou refusées, décision tracée et en lot | la base | une entité de l'appli, à brancher |
| `import-lot` | Un Excel ou un CSV devient un lot à valider, confirmé tout ou rien ou ignoré ; fournit ses écrans, l'appli garde son branchement, ses droits et les pages qui les appellent | la base | une entité de l'appli, à brancher |
| `mails` | L'envoi d'e-mails transactionnels par Resend, sans base ni session ; console en local, capture en test, rien ne part sans réglage explicite | — | le socle |
| `deploiement` | La mise en ligne après la CI : job `deployer` qui déclenche le commit vérifié et l'attend sur `/sante` ; adaptateur Render (`render.yaml`) remplaçable seul | — | la CI |
| `notifications` | Prévenir par e-mail à jour fixe : un récapitulatif fabriqué par l'appli, envoyé par `mails` depuis une route qu'une tâche planifiée appelle chaque jour, protégée par un secret ; modes à blanc et essai, journal des envois purgé au-delà de 12 mois. Ne connaît pas `echeances` : l'appli fait le lien | la base, `mails` | une entité de l'appli, à brancher |
| `contact` | Le formulaire de contact public (`/contact`) : envoi par `mails`, champ piège, délai minimal et limite par adresse IP en base, sans captcha | la base, `mails` | le socle |
| `comptes` | Session en base, tout protégé par défaut, page `/connexion`, droits (`exiger`, `peut`, `visiblePour`) ; connexion par code à 6 chiffres envoyé par e-mail (par défaut) ou avec Google ; la démo est une méthode, refusée en production. Pas encore : Microsoft, lien magique | la base, `mails` | le socle |
| `rgpd` | L'export des données d'une personne en JSON, par elle-même (`/mes-donnees`) ou par l'admin (`/donnees-personnelles`), et leur effacement ou anonymisation, par l'admin seul (`/donnees-personnelles`) ; chaque table se déclare dans `src/config/donnees-personnelles.ts`. Pas encore : la purge | la base, `comptes` | le socle |
| `journal` | Le journal d'audit : qui a créé, modifié ou supprimé quoi, et quand, dans la transaction de l'écriture, sans valeur de champ ; écran `/journal` et historique de fiche pour l'admin ; branché sur le patron `dossiers` et, avec `gestion-comptes`, sur les gestes de `/comptes` | la base, `comptes` | le patron `dossiers` |
| `gestion-comptes` | L'écran `/comptes`, où un admin invite, change un rôle, désactive ou réactive un compte et ouvre un domaine ; le dernier admin actif y est protégé | la base, `comptes` | le socle |

La base (brique données, `src/lib/db/`) ne se choisit pas : l'assembleur la
garde dès qu'une brique gardée l'exige. Une brique qui en exige
une autre ne se garde pas sans elle : l'assembleur refuse l'appel en nommant
la brique à ajouter, sans jamais l'ajouter en silence. Seule exception, déclarée
dans `outils/modules.mjs` (`entraine`) : `rgpd` est gardée d'office avec
`comptes`, car une appli à comptes doit pouvoir répondre à une demande d'accès
ou d'effacement ; l'assembleur le dit dans sa sortie et dans le premier commit
de l'appli. Une brique n'importe une autre brique que si elle l'exige :
`tests/assembleur.test.ts` le verrouille. « À brancher » : la brique arrive
installée, sans branchement ; l'appli la branche sur l'entité de son module
métier en suivant la section « La brancher » de son README, qui porte un
exemple complet.

### Le module métier

Le catalogue ne livre aucun module métier : les entités du client (ses
contrats, ses équipements, ses demandes…) s'écrivent dans l'appli assemblée, en
copiant le patron `dossiers` (`src/app/dossiers/`, règles dans `CLAUDE.md` §3),
puis les briques à brancher s'y branchent. Trois modules de test ont vécu dans
le catalogue le temps d'éprouver les briques ; ils l'ont quitté avant sa
publication, et ne manquent à aucune brique, dont les tests tiennent sur leurs
propres tables.

## Le socle

Le socle est le code commun à toute appli assemblée (Next.js 16, React 19, TypeScript ;
Postgres avec la brique données). Il ne livre pas seulement du code de départ, il livre la
**méthode** : des composants qui portent les invariants de construction en
dur, des règles courtes dans `CLAUDE.md`, des skills qui documentent chaque
domaine, et des garde-fous en code plutôt qu'en consigne : socle et méthode forment le
*harnais*. Chaque règle vient
d'une leçon payée sur un projet précédent ; `docs/cicatrices.md` en tient le
registre.

Trois volets :

- **Visuel** — kit `src/ui/` (tableaux avec tri, filtres, exports et
  conservation de vue intégrés, états vides explicites, signature de l'agence)
  et contrat de thème en tokens : l'identité du client se règle dans un seul
  fichier, les invariants ne se négocient pas.
- **Données** — la brique données (`src/lib/db/`), qu'une appli reçoit avec une
  brique qui lit la base et qu'un site sans en a pas : client Postgres à migrations idempotentes, module métier
  canonique à copier (`dossiers`, ses écrans avec `comptes` seulement), squelette de scripts d'import en dry-run
  par défaut, tests avec garde anti-prod : impossible de les lancer contre
  autre chose qu'une base locale.
- **Méthode** — skills de cadrage (`solstice-nouvelle-appli`) et de livraison
  (`solstice-livrer`), agents relecteurs avant PR, et gardes qui refusent à
  Claude les gestes qui versent un secret, touchent la prod ou écrasent le travail
  d'une autre session.

Assemblé sans brique qui lit la base (au plus `mails` et `deploiement`), le socle suffit à un
**site vitrine** : ni base, ni connexion, `src/proxy.ts` ne pose que la
Content-Security-Policy. Un formulaire de contact (`--briques mails,contact`) y ajoute la
base, pas la connexion. Son nonce impose
un rendu à chaque requête : pas de page statique ni de cache CDN du HTML. Le compromis et
les options écartées sont dans `.claude/skills/solstice-nouvelle-appli/socle.md`.

### Démarrer un projet client

Une appli client ne se copie pas depuis GitHub : elle s'assemble depuis ce
dépôt, avec la skill `creer-appli`, lancée dans une session Claude Code
ouverte à la racine du catalogue.

1. **Cadrer**, sans code : la skill s'appuie sur `solstice-nouvelle-appli`
   pour mener aux réponses du client, à la fiche projet validée et à la forme
   retenue.
2. **Assembler** : elle choisit les briques, écrit la
   blueprint, la fait relire par l'agent `relecteur-blueprint`, puis lance
   `outils/assembler.mjs` vers un dossier vide hors du catalogue (voir
   « Assembler une appli »). Elle crée ensuite le dépôt distant, privé par
   défaut, après un accord explicite, et dit quoi taper.
3. **Régler l'appli assemblée**, ce que l'assembleur ne fait pas :
   `NOM_APP` dans `src/lib/navigation.ts` (repris par le titre de chaque
   page ; `package.json` porte déjà le nom de l'appli), `LOCALE`, `DEVISE` et
   `FUSEAU` en tête de `src/lib/format.ts` (le fuseau décide du jour qui
   compte pour les échéances). Avant toute mise en ligne, remplir
   `src/lib/mentions-legales.ts` (éditeur, directeur de la publication,
   hébergeur), `src/lib/confidentialite.ts` (contact, base légale, durée et
   destinataires de chaque traitement, validés par le client) et
   `src/lib/referencement.ts` (site public ou non, description).
4. `npm ci` et, si l'appli a la base, les bases locales (voir « Démarrer en
   local ») : `DATABASE_URL` est requise par les tests et l'appli, pas par le
   build.
5. **Thématiser** : suivre la procédure de la skill `solstice-ui` pour remplir
   `src/ui/theme/tokens.css` depuis la charte du client (PDF ou site). Sans
   charte client, garder le thème de repli, la charte Solstice Lab.
6. Vérifier la vitrine du kit (`/kit`, hors navigation, gardée pour les
   thématisations suivantes) et, avec la brique `comptes`, le patron
   `dossiers` ; puis remplacer `dossiers` et l'accueil (`/`) par les premiers
   écrans réels, en copiant le patron `dossiers` pour chaque module métier.

### Démarrer en local

Il faut Docker, Node 24 ou plus (`.nvmrc`, comme la CI) et npm 11.16 ou plus :
c'est la première version de npm qui lit `allowScripts` de `package.json` ;
une version antérieure ignore le champ et lance les scripts d'installation
qu'il refuse (esbuild, unrs-resolver). `engines` n'en fait qu'un
avertissement, sauf réglage `engine-strict`. Docker doit tourner (Docker Desktop lancé sous Windows
et macOS) : tant que `docker info` échoue, `docker compose up` échoue aussi. `docker-compose.yml` monte un Postgres 18 sur
`127.0.0.1:5433`, sans mot de passe (`trust`, publié sur le poste seulement),
partagé par toutes les applis du poste ; ses données vivent dans le volume
`solstice-postgres-donnees`. `scripts/bases-locales.ts` crée `<appli>_dev` et
`<appli>_test` (nom de `package.json`) s'ils manquent, puis affiche la ligne
`DATABASE_URL` à mettre dans `.env.local` et la commande des tests : il ne
l'écrit pas, c'est à coller.

PowerShell :

```powershell
npm ci
docker compose up -d --wait
npx tsx scripts/bases-locales.ts
Copy-Item .env.example .env.local   # y remplacer DATABASE_URL par la ligne affichée, et remplir AUTH_SECRET (commande dans .env.example)
npm run dev                         # accueil sur http://localhost:3000
```

bash :

```bash
npm ci
docker compose up -d --wait
npx tsx scripts/bases-locales.ts
cp .env.example .env.local          # y remplacer DATABASE_URL par la ligne affichée, et remplir AUTH_SECRET (commande dans .env.example)
npm run dev                         # accueil sur http://localhost:3000
```

Un autre Postgres déjà publié sur le 5433 fait échouer `docker compose up` :
l'arrêter d'abord.

### Assembler une appli

`outils/assembler.mjs` lit le dépôt tel quel et copie le socle et les briques
choisies vers un dossier vide hors du catalogue, et rien de ce qui
fait vivre le catalogue lui-même : ni ce `README.md`, `PROJET.md`,
`outils/`, ni la skill `creer-appli` et l'agent
`relecteur-blueprint`, ni le test de l'assembleur, ni
le workflow `assemblage.yml`, ni `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`
et les modèles de ticket et de PR, ni les captures du README, `docs/captures/`
(liste `EXCLUS_DU_CATALOGUE` de
`outils/modules.mjs`).
Il écrit `blueprint.md` à la racine, avec le commit de référence du catalogue (celui du dépôt au
moment de la commande) ; `--blueprint` en donne une existante, dont seul le
commit est mis à jour ; `--nom` fixe le nom du paquet de l'appli, d'où celui
de ses bases locales ; `--fiche` copie une fiche projet en `PROJET.md` ;
il écrit aussi `NOTICE`, l'avis de licence (voir « Licence »), et remet en forme
par Prettier les fichiers qu'il a retouchés (il faut donc `npm ci` dans le catalogue) ;
il écrit aussi `catalogue.empreintes.json`, le manifeste d'empreintes : le commit du
catalogue et le champ `version` de son `package.json` (fixe tant qu'aucune version n'est
publiée), puis, pour chaque fichier venu du catalogue, son unité (brique, partagée ou
`socle`) et l'empreinte sha256 du fichier tel que l'appli le reçoit, après la mise en
forme et tel que git l'enregistre. Il permet de comparer l'appli à ce qu'elle a reçu ;
aucun outil ne le lit encore ;
`--dependabot` garde `.github/dependabot.yml`, retiré par défaut parce qu'une appli que
personne n'entretient en recevait une PR de mise à jour par semaine, jamais fusionnée
(le catalogue garde le sien). Il fait
ensuite du dossier un dépôt git local d'un seul commit, sur la branche `main`
(il faut une identité git configurée), sans remote : rien n'est poussé. Il ne
déploie rien, ne touche à aucune base et ne lit aucun secret.

```
node outils/assembler.mjs ../mon-appli --briques comptes,mails,echeances
node outils/assembler.mjs ../mon-site
node outils/assembler.mjs --aide
```

Le commit de référence noté est celui du dépôt : l'assembleur refuse un
catalogue qui a des modifications non commitées, sauf avec
`--tolerer-arbre-modifie` (le commit noté porte alors « +arbre-modifie »).

- Briques : aucune, une ou plusieurs, parmi celles de « Briques ».
  L'assembleur refuse un appel auquel manque une brique exigée.
- `comptes` (avec `mails`) donne la base, le patron `dossiers`
  et les droits, avec un accueil à écrire ; `contact` (avec `mails`) donne
  la base pour la limite d'envois, sans les écrans du patron `dossiers`, qui
  appellent `exiger` et ne se gardent qu'avec `comptes` ; `rgpd` vient
  d'office avec `comptes`, `journal` et `gestion-comptes` s'y ajoutent. Une
  brique à brancher (`echeances`, `calendrier`, `validation`, `import-lot`,
  `notifications`) donne la base et attend son branchement dans l'appli.
- Le retrait est une liste déclarative, `outils/modules.mjs` : pour
  chaque brique et pour la base, les fichiers à supprimer et, dans chaque fichier partagé, le
  texte à retirer ou à remplacer. Aucun marqueur dans le code de l'appli :
  l'assembleur n'y lit que les extraits de cette liste. Seuls sont permis les
  commentaires qui bornent un bloc (« Brique X … », « Fin de la brique X. »)
  et disent pourquoi il est là : ils ne font que servir de début et de fin à
  un `bloc` de la liste, qui reste seule à dire quoi retirer. Quand la brique
  est prise, ils restent dans le code de l'appli, où ils disent d'où vient le
  bloc. Aucune autre balise de début ou de fin de brique. Un extrait de cette liste qui n'existe plus, ou
  qui existe deux fois, fait échouer l'assemblage : à corriger dans la liste
  en même temps que le code qu'elle désigne.
- Une unité y déclare aussi ses paquets npm (`dependances` : `pg` et
  `@types/pg` pour la base). Retirée, elle les emporte de `package.json` et
  du verrou, élagué de ce que plus rien n'atteint, sans réseau : le verrou
  reste celui qu'écrirait npm, et `npm ci` l'accepte.
- `tests/assembleur.test.ts` se lance par `npm run test:assembleur`, pas par
  `npm test`, qui l'écarte : il dure plus de 10 minutes. Le job `assembleur` de
  `.github/workflows/assemblage.yml` le lance sur chaque pull request prête à
  relire, réduit à un échantillon de combinaisons (`ECHANTILLON`), et en entier
  chaque nuit si main a changé, ou à la main. En entier, il assemble des combinaisons de briques, la vide
  comprise, dans un dossier temporaire et vérifie les fichiers présents et
  absents, les imports, les références aux unités retirées, la présence de
  chaque extrait de la liste dans le catalogue, la mise en forme que vérifie sa CI, le typecheck de l'appli assemblée et,
  avec la base, le rejeu de ses migrations sur une base vide. Sans la brique
  données, il lance aussi lint et tests sans `DATABASE_URL` ; le build de ce cas est fait
  par le job `socle-seul` de `.github/workflows/assemblage.yml`, après un vrai `npm ci`. Pour les
  autres combinaisons, lint, tests et build se lancent dans le dossier assemblé
  (`npm ci` puis les vérifications ci-dessous, sauf `npm run test:assembleur`,
  que l'appli n'a pas).
- Ce que l'assembleur ne fait pas : mettre à jour une brique déjà installée,
  déployer, lire la blueprint pour choisir ce qui s'assemble.

### Structure

- `src/ui/` — le kit visuel : `AppLayout` (en-tête, nav, signature, liens des
  mentions légales et de la confidentialité), `PageVitrine`, `SectionVitrine` et
  `AppelAction` (pages d'un site vitrine, même pied de page), `Tableau`
  (tri, filtres, hiérarchie, exports, vue conservée), `ListeCartes`, `GrilleMois` et
  `NavigationMois` (calendrier mensuel), `TuileKPI`, `Carte`,
  `Bouton`, `BoutonSupprimer`, `Badge`, champs de formulaire, `EtatVide`, `Modale`, `Squelette` ;
  `src/ui/theme/tokens.css` — le contrat de thème, seule source de couleurs,
  polices et formes ; `src/ui/theme/polices/` — les woff2 du thème et leur
  licence.
- `src/lib/db/` — brique données : client Postgres (`client.ts`, seul point d'accès),
  `schema.sql` (état initial) et `migrations.ts` (étapes idempotentes,
  rejouées à chaque démarrage).
- `src/app/dossiers/` — le patron `dossiers`, module métier canonique à copier : liste à actions en lot,
  fiche en lecture seule, `/nouveau`, `/modifier`, garde d'accès
  (`exiger` de `src/briques/comptes/roles.ts`, droits dans `src/config/acces.ts`), slugs
  (`src/lib/slug.ts`).
- `src/app/sante/` — la sonde `/sante`, ouverte sans session : commit en ligne et,
  avec la brique données, état de la base (`src/lib/db/sante.ts`), 503 si elle
  ne répond pas.
- `src/app/kit/` — la vitrine du kit, hors navigation, pour vérifier une
  thématisation.
- `src/app/mentions-legales/` — les mentions légales (LCEN), ouvertes sans
  connexion, remplies depuis `src/lib/mentions-legales.ts`.
- `src/app/confidentialite/` — la politique de confidentialité (RGPD,
  art. 13), ouverte sans connexion. Les faits viennent des briques gardées
  (`src/briques/*/confidentialite.ts`), les choix du responsable de
  `src/lib/confidentialite.ts`.
- `src/app/robots.ts`, `sitemap.ts`, `opengraph-image.tsx`, `twitter-image.tsx`
  — référencement et aperçu au partage, remplis depuis
  `src/lib/referencement.ts`. Fermés aux moteurs (`noindex`, `robots.txt` qui
  interdit tout) hors production, sans `URL_PUBLIQUE`, pour un site qui n'est
  pas public ou tant qu'une valeur reste « À compléter ». L'image lit ses
  couleurs dans `tokens.css` (`src/lib/image-partage.ts`).
- `src/lib/adresse-ip.ts` — l'adresse IP du visiteur pour les limites par
  adresse (formulaire de contact, connexion par code), lue dans le seul
  en-tête que nomme `IP_EN_TETE_CLIENT`, réglée avec l'hébergeur. Une appli
  assemblée ne la garde qu'avec la brique `contact` ou `comptes`.
- `src/briques/<brique>/` — une brique par dossier (voir « Briques ») : son
  code, son `README.md` (comment la brancher, section « Interface
  publique ») et son `CHANGELOG.md` ; ses tests sont dans `tests/`. La
  brique `deploiement` vit surtout hors de son dossier : le job `deployer` de
  `ci.yml` et `render.yaml` (racine, adaptateur Render). Les droits
  de la brique `comptes` se déclarent dans `src/config/comptes.ts` (qui
  entre) et `src/config/acces.ts` (qui a droit à quoi).
- `outils/` — l'assembleur (`assembler.mjs`) et la liste de retrait des
  briques et de la base qu'il applique (`modules.mjs`), propres au catalogue : une appli assemblée ne
  les reçoit pas.
- `scripts/` — squelette des imports et correctifs de données : dry-run par
  défaut, `--confirmer` à la main ; `bases-locales.ts`, qui crée les bases locales (voir
  « Démarrer en local ») ; et `verifier-audit.mjs`, lancé par la
  CI, qui échoue sur toute vulnérabilité haute ou critique absente de
  `exceptions-audit.json` (racine).
- `docker-compose.yml` — le Postgres local du poste.
- `tests/` + `vitest.config.ts` — règles verrouillées, et le garde qui refuse
  toute base non locale.
- `.claude/skills/` — `solstice-ui` (kit et thématisation),
  `solstice-donnees` (base, modules, imports et leurs pièges),
  `solstice-nouvelle-appli` (cadrage, fiche projet, socle prêt pour la prod,
  découpage), `solstice-livrer` (du ticket à la mise en ligne) et
  `creer-appli` (le dialogue de cadrage, la blueprint, l'appel de l'assembleur, puis
  le dépôt distant privé créé après accord ;
  propre au catalogue, une appli assemblée ne la reçoit pas).
- `.claude/agents/` — `relecteur-migrations` et `relecteur-docs`, lancés
  avant une PR selon ce que touche le diff ; `relecteur-blueprint`, lancé par
  la skill `creer-appli` sur la blueprint, avant l'assembleur (propre au
  catalogue, une appli assemblée ne le reçoit pas).
- `.claude/settings.json` + `.claude/hooks/gardes.mjs` — refusent à Claude
  (voir « Claude Code : un hook s'applique d'office ») :
  écrire un `.env*` (hors `.env.example`), une URL de base distante avec mot de passe,
  `git add -f`, `--confirmer`, `gh pr merge` (et la fusion par `gh api`), `git push --force`
  (`--force-with-lease` passe), `--no-verify` sur `git commit` et `git push`. Testés par
  `node .claude/hooks/gardes.test.mjs` (lancé par la CI). Le hook demande
  Node sur le poste.
- `CLAUDE.md` — les règles du harnais, lues par Claude à chaque session.
- `docs/cicatrices.md` — le registre des leçons des projets précédents : la
  règle, le cas, et ce qui la tient dans le catalogue.

### Vérifier

```
node .claude/hooks/gardes.test.mjs
npm run format:check   # npm run format met en forme
npm run lint
npm run typecheck
DATABASE_URL=postgresql://postgres@localhost:5433/catalogue_solstice_vibe_test PGSSLMODE=disable npm test
DATABASE_URL=postgresql://postgres@localhost:5433/catalogue_solstice_vibe_test PGSSLMODE=disable npm run test:assembleur   # long (plus de 10 min) ; la CI n'en lance qu'un échantillon sur chaque pull request, le complet la nuit
npm run build
```

La signature « Conçu par Solstice Lab » en pied de page fait partie de toute
livraison Solstice Lab et ne s'y retire pas ; hors de ce cadre, voir
`CONTRIBUTING.md`, « La signature Solstice Lab ».

## Licence

Le catalogue est publié sous licence MIT (`LICENSE`). Les polices IBM Plex de
`src/ui/theme/polices/` sont sous SIL Open Font License 1.1, dont le texte est
dans `src/ui/theme/polices/LICENCE-OFL.txt`.

Une appli assemblée n'est pas sous MIT : livrée sous le contrat du client, elle
est marquée `UNLICENSED` et ne reçoit pas `LICENSE`. L'assembleur y écrit un
fichier `NOTICE` qui porte l'avis de droit d'auteur et le texte MIT du
catalogue, puis l'avis OFL des polices : la licence MIT exige que son avis
accompagne toute copie du code repris. Ce fichier ne donne aucune licence à
l'appli.
