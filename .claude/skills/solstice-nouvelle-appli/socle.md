# Le socle d'une appli prête pour la prod

Chargé par `SKILL.md` pour le premier ticket d'une appli à part. Le harnais en porte déjà
une partie (pages d'erreur, CSP à nonce, garde anti-prod des tests avec la brique données,
CI, gardes de Claude, mise en ligne avec la brique déploiement) ; le reste est
à poser. Vérifier chaque point plutôt que le supposer.

## Dans le code

- **`/sante`** (harnais : `src/app/sante/route.ts`) répond **sans session**
  `{"commit": …, "base": …}` avec `Cache-Control: no-store`. Le commit vient de
  `COMMIT_DEPLOYE`, que la brique déploiement pose au démarrage depuis la variable de
  l'hébergeur ; sans elle, la poser chez l'hébergeur, sinon `/sante` répond « inconnu » et
  l'attente du job `deployer` ci-dessous échoue. Avec la brique données, l'état
  de la base vient de `etatDeLaBase()` (`src/lib/db/sante.ts`) : `non-configuree` sans `DATABASE_URL` (200),
  `ok` après un vrai `SELECT 1` (200), `injoignable` sinon (503, la cause va aux journaux,
  jamais dans la réponse). La première sonde après un déploiement joue schéma et
  migrations : une migration longue peut dépasser le délai de la sonde de l'hébergeur. Sans
  la brique, la sonde répond toujours `non-configuree` (200).
  Derrière l'authentification, la sonde reçoit une redirection et chaque déploiement
  échoue ; sans le commit, la CI ne peut pas savoir si sa version est vraiment en ligne.
- **Protégé par défaut** (avec la brique comptes) : sans session, `src/proxy.ts` renvoie
  toute route vers `/connexion`, sauf `/connexion`, `/sante`, `/mentions-legales`,
  `/confidentialite`,
  les adresses des robots (`/robots.txt`, `/sitemap.xml`, image de partage) et
  `/contact` avec la brique contact ; la liste fait foi dans `ROUTES_OUVERTES`
  (`tests/comptes-proxy.test.ts` parcourt toutes les routes). Puis `exiger(action)` (`src/briques/comptes/roles.ts`) en première ligne de
  chaque page et server action, `peut()` en tête de chaque route ; les droits se déclarent
  dans `src/config/acces.ts`, et sans utilisateur rien ne passe. Deux listes, chacune
  avec ses raisons : `ROUTES_OUVERTES` (`src/briques/comptes/protection.ts`) dit ce que
  le proxy laisse passer sans session ; `OUVERTS` (`tests/gardes-acces.test.ts`) dit
  quels fichiers de `src/app` se passent d'`exiger` (l'accueil, `/kit`…). **Un test vérifie**
  (`tests/gardes-acces.test.ts`) que chaque point d'entrée a son garde et que la liste des
  routes ouvertes est exactement celle déclarée. Il lit le code avec le
  compilateur TypeScript (« première instruction » est une notion de syntaxe, pas
  d'expression régulière) et contient un cas fautif qu'il doit attraper. Tant que la règle
  n'était qu'une convention relue par un agent, elle a fini oubliée : rien ne lançait
  l'agent.
- **Avec la brique données, les tests refusent une base qui n'est pas locale et
  jetable** : hôte `localhost` et nom en `_test` ou `_test_<n>` (base dédiée d'une session parallèle), vérifiés tous deux dans `vitest.config.ts`.
  Un `npm test` lancé sur la base de dev a effacé le compte admin ; sur un
  autre projet, `.env.local` pointait la prod.
- **CSP à nonce, rendu à la demande** (harnais : `src/proxy.ts`, `next.config.ts` pour les
  autres en-têtes). Le proxy tire un nonce à chaque requête. Next l'appose sur ses propres
  scripts en ligne, et la CSP refuse tous les autres. Ce nonce n'existe que dans une page
  rendue à la requête : `await connection()` dans `src/app/layout.tsx` l'impose à toutes
  les pages, et `tests/en-tetes-securite.test.ts` vérifie que l'appel est là. Sans lui,
  une page rendue au build n'aurait aucun nonce, et aucun de ses scripts ne tournerait,
  sans erreur nulle part.
  - Le compromis : pas de page statique, pas de cache CDN du HTML ; les fichiers de
    `_next/static` restent cachables. Un site vitrine le paie aussi.
  - Écartés : une CSP par hachages (`experimental.sri` de Next, encore expérimental) et
    `'unsafe-inline'` sur les scripts, qui ne protège plus contre un script injecté.
  - Revenir sur ce choix est une décision de la personne responsable technique du projet.
- Pages d'erreur et de page absente : jamais une page blanche, le digest reste affiché.
- **Référencement fermé par défaut** (`src/lib/referencement.ts`) : `noindex` sur chaque
  page et `robots.txt` qui interdit tout, sauf pour un site déclaré public, en production,
  avec `URL_PUBLIQUE` et sans valeur « À compléter ». Une recette tourne aussi en
  `NODE_ENV=production` : seul le service de production déclare `URL_PUBLIQUE`. Les pages
  du sitemap s'ouvrent sans connexion (`tests/referencement.test.ts`).
- **Pas d'état en mémoire** pour ce qui doit survivre (tâches longues, limites de
  tentatives) : il est perdu à chaque déploiement et interdit d'avoir plus d'un worker.
- **L'adresse IP du visiteur se lit par `src/lib/adresse-ip.ts`**, dans le seul en-tête
  que nomme `IP_EN_TETE_CLIENT`, réglée avec l'hébergeur (Render : `cf-connecting-ip`),
  jamais dans `X-Forwarded-For`, qui garde ce que le visiteur envoie. Obligatoire en production avec la connexion par code ou lien (brique comptes), qui refuse de démarrer sans elle : ses limites par IP sautaient, et un tiers invalidait les codes de n'importe qui.
  Avec le seul formulaire de contact, sans elle, pas de limite par adresse plutôt qu'un compte commun à tous les
  visiteurs, qui bloquerait tout le monde dès qu'un seul insiste.

## Dans le dépôt

- `.gitignore` : celui du harnais, verrouillé par `tests/gitignore.test.ts` — `.env*` (sauf
  `.env.example`), documents bureautiques et `*.csv`, dumps (`*.sql`, sauf `schema.sql` avec la brique données),
  exports, `donnees-reelles/`, `*.pem`, `*.key`, `*.crx`, `.claude/settings.local.json` et `.claude/worktrees/`. Une clé d'extension commitée
  puis retirée reste lisible par son SHA.
- `.env.example` : la liste des variables, chacune avec une ligne de commentaire et une
  valeur factice, jamais une vraie URL ni un vrai mot de passe.
- `CLAUDE.md` de 150 lignes au plus, **des règles seulement** : au-delà, il n'est plus lu
  attentivement. Le descriptif va dans `PROJET.md` ou le README. Chaque règle enfreinte
  puis corrigée y devient une ligne.
- `.claude/` du harnais conservé tel quel : skills, agents relecteurs et gardes
  (`settings.json` + `hooks/gardes.mjs`). Un projet qui les retire perd les refus
  automatiques (secret versé, `.envrc` et `.npmrc` compris, `--confirmer`, fusion d'une
  PR, `git push --force`, hooks git sautés).

## La CI (`.github/workflows/ci.yml`)

- Sur chaque PR et chaque arrivée sur `main` : mise en forme, lint, typage, tests (avec la brique données, sur un
  **Postgres jetable de la même version que la prod**), build (construction de l'image si l'appli tourne en
  Docker : un binaire qui marchait en Docker local a refusé de démarrer sur Render).
- `permissions: contents: read`, actions épinglées par SHA complet, version en commentaire.
- `.github/dependabot.yml` (`github-actions` et `npm`, chaque semaine) est **optionnel** : une
  appli assemblée ne l'a que si quelqu'un l'entretient après la livraison (réponse notée dans
  la rubrique « Entretien après livraison » de `PROJET.md`). Sans personne pour fusionner,
  il ouvrait une PR par semaine qui restait sans réponse. Sans lui, un SHA épinglé ne bouge
  jamais, failles comprises : la mise à jour des actions et des dépendances est alors une
  tâche à la main, à décider avec la personne responsable. Quand il est gardé, les majeures
  de `@types/node` y sont ignorées : elles suivent `node-version`, `.nvmrc` et
  `engines.node`, à la main.
- `node scripts/verifier-audit.mjs` avant `npm ci` : échoue sur toute vulnérabilité haute ou
  critique absente de `exceptions-audit.json`. Une exception se décide par la personne
  responsable du projet et se trace dans ce fichier (raison, portée `dev` ou `production`,
  condition de réexamen), jamais pour faire passer la CI. Un échec « registre npm
  injoignable » n'est pas une faille : relancer la CI.
- `working-directory` au niveau du **job**, jamais du workflow : le job de déploiement,
  sans checkout, le suivait vers un dossier absent et le déploiement n'était jamais appelé.
- Le job `deployer` (brique déploiement, `src/briques/deploiement/README.md`), sur un push
  de `main` seulement, après `verifier` : il déclenche le commit vérifié chez l'hébergeur,
  puis attend de le lire sur `/sante`. Il déclare l'environnement GitHub `production` : suspendu
  jusqu'à l'approbation de ses relecteurs obligatoires. Le `ref` compte : sans lui, Render construit la tête
  de `main` au moment de l'appel, pas le commit vérifié.

## GitHub

Protection de `main` (ruleset) : PR obligatoire, check `verifier` requis (pas `deployer`,
qui ne tourne qu'après la fusion), branche à jour
avant fusion, fusion en squash seulement, et seules les personnes responsables des fusions
peuvent fusionner.

**GitHub refuse ce ruleset sur un dépôt privé du forfait gratuit** (« Upgrade to GitHub Pro or
make this repository public », vu sur un dépôt privé le 2026-11-03) : il faut un dépôt public,
ou un forfait Pro, Team ou Enterprise. À vérifier avant de créer le dépôt, pas après : sans
protection, rien n'empêche une fusion sans CI verte. Choix possibles : dépôt public, forfait
payant, ou dépôt privé sans protection en connaissance de cause (la CI tourne mais ne bloque
pas : la personne qui fusionne lit le check `verifier` avant chaque fusion).

## Render (`render.yaml`)

La brique déploiement le porte, commenté de ses pièges et verrouillé par
`tests/deploiement.test.ts` : service et base à Francfort, base payante (la gratuite est
supprimée après 30 jours), base créée sur 1 Go avec agrandissement automatique (sans
`diskSizeGB`, Render la crée à 15 Go, qui ne se réduisent jamais), auto-déploiement coupé (`autoDeployTrigger: "off"` ;
`autoDeploy` est déprécié, et à `true` déployait sans attendre la CI).

- Un service renommé dans le tableau de bord quitte le Blueprint : « Manual sync » ne fait
  plus rien, sans message. Il est revenu en reprenant son nom.
- Toute variable lue par l'appli figure ici, sauf les exemptées du test (`COMMIT_DEPLOYE`,
  posée au démarrage ; `PGSSLROOTCERT`, posée au besoin) ; un secret porte `generateValue`
  ou `sync: false`.

## L'ordre de mise en ligne

Chaque étape est réversible tant que la suivante n'a pas eu lieu. Les étapes humaines sont
listées clic par clic dans le ticket, Claude ne les fait pas.

1. L'appli sur sa branche, CI verte. Rien n'est en ligne. Avec la brique comptes, le retrait
   de `"demo"` de `METHODES` est fusionné sur `main` : la création du Blueprint déploie la
   tête de `main`, et la démo refuse la production.
2. **Humain** : les gestes du README de la brique déploiement : vérifier le nom du service
   avant le Blueprint (l'assembleur l'a écrit d'après `appli`), créer le Blueprint, saisir les variables `sync: false`, puis l'environnement GitHub `production` avec ses relecteurs obligatoires, le secret
   `DEPLOIEMENT_DECLENCHEUR` (dans cet environnement) et la variable `DEPLOIEMENT_URL` chez GitHub.
3. Fusion : la CI vérifie, un relecteur de `production` approuve le déploiement (*Review
   deployments*), puis la CI déclenche et attend `/sante`.
4. **Humain** : le domaine. Baisser d'abord le TTL du CNAME à 300 s (retour arrière rapide),
   puis *Custom Domains* sur Render, puis le CNAME chez le registrar, puis `DEPLOIEMENT_URL`,
   puis `URL_PUBLIQUE` (`https://<domaine>`) sur le service.
5. Vérifier `https://<domaine>/sante`, une connexion, le parcours principal, et
   `https://<domaine>/robots.txt` : fermé (`Disallow: /`) sauf pour un site public complet.
6. Retour arrière : retirer le domaine, *Revert* sur la PR (sans défaire les migrations).

Reprise de données existantes : **restaurer avant** de faire pointer l'appli sur la base.
Démarrée sur une base vide, l'appli l'initialise, puis la restauration est refusée.
