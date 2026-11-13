# Le socle, la structure du dépôt et les vérifications

Référence de ce que contient le dépôt et de ce qu'il faut lancer avant une
pull request. Le [README](../../README.md) donne la vue d'ensemble ; ce
fichier porte le détail. Il est propre au catalogue : une appli assemblée ne
le reçoit pas.

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
  et contrat de thème : l'identité du client (tokens, marque de l'en-tête,
  polices) se règle dans le dossier du thème (`src/ui/theme/`), plus les
  appels de police de `src/app/layout.tsx`, les invariants ne se
  négocient pas.
- **Données** — la brique données (`src/lib/db/`), qu'une appli reçoit avec une
  brique qui lit la base et qu'un site sans en a pas : client Postgres à migrations idempotentes, module métier
  canonique à copier (`dossiers`, au catalogue seulement : ni ses écrans ni sa couche données ne sont livrés), squelette des scripts de données en dry-run (`scripts/lib/cli.ts`, l'import d'exemple au catalogue)
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

## Structure

- `src/ui/` — le kit visuel : `AppLayout` (en-tête, nav, signature, liens des
  mentions légales et de la confidentialité), `PageVitrine`, `SectionVitrine` et
  `AppelAction` (pages d'un site vitrine, même pied de page), `Tableau`
  (tri, filtres, hiérarchie, exports, vue conservée), `ListeCartes`, `GrilleMois` et
  `NavigationMois` (calendrier mensuel), `TuileKPI`, `Carte`,
  `Bouton`, `BoutonSupprimer`, `Badge`, champs de formulaire, `EtatVide`, `Modale`, `Squelette` ;
  `src/ui/theme/` — le contrat de thème : `tokens.css`, seule source de couleurs,
  polices et formes, `Marque.tsx`, la marque de l'en-tête (emblème de l'agence
  par défaut, logo client ou `null`), et `polices/`, les woff2 du thème et leur
  licence.
- `src/lib/db/` — brique données : client Postgres (`client.ts`, seul point d'accès),
  `schema.sql` (état initial) et `migrations.ts` (étapes idempotentes,
  rejouées à chaque démarrage).
- `src/app/dossiers/` — le patron `dossiers`, module métier canonique à copier (au catalogue seulement, avec sa couche données `src/lib/db/dossiers.ts` : l'assembleur n'en livre rien) : liste à actions en lot,
  fiche en lecture seule, `/nouveau`, `/modifier`, garde d'accès
  (`exiger` de `src/briques/comptes/roles.ts`, droits dans `src/config/acces.ts`), slugs
  (`src/lib/slug.ts`).
- `src/app/sante/` — la sonde `/sante`, ouverte sans session : commit en ligne et,
  avec la brique données, état de la base (`src/lib/db/sante.ts`), 503 si elle
  ne répond pas.
- `src/app/kit/` — la vitrine du kit, hors navigation, pour vérifier une
  thématisation. Au catalogue seulement : l'assembleur ne la livre à aucune appli,
  et le catalogue ne la sert pas en production (`next start`, en ligne comme en
  local : 404 depuis le proxy, `ROUTES_HORS_PRODUCTION` de
  `src/briques/comptes/protection.ts`) ; elle se regarde sous `npm run dev`.
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
  couleurs dans `tokens.css` (`src/lib/image-partage.ts`). En production sans
  `URL_PUBLIQUE` (une recette), aucune image d'aperçu n'est annoncée : Next
  la ferait pointer sur `localhost` et le port interne de l'hébergeur.
- `src/lib/adresse-ip.ts` — l'adresse IP du visiteur pour les limites par
  adresse (formulaire de contact, connexion par code), lue dans le seul
  en-tête que nomme `IP_EN_TETE_CLIENT`, réglée avec l'hébergeur. Une appli
  assemblée ne la garde qu'avec la brique `contact` ou `comptes`.
- `src/briques/<brique>/` — une brique par dossier (voir [briques.md](briques.md)) : son
  code, son `README.md` (comment la brancher, section « Interface
  publique ») et son `CHANGELOG.md` ; ses tests sont dans `tests/`. La
  brique `deploiement` vit surtout hors de son dossier : le job `deployer` de
  `ci.yml` et `render.yaml` (racine, adaptateur Render). Les droits
  de la brique `comptes` se déclarent dans `src/config/comptes.ts` (qui
  entre) et `src/config/acces.ts` (qui a droit à quoi).
- `outils/` — l'assembleur (`assembler.mjs`), la liste de retrait des
  briques et de la base qu'il applique (`modules.mjs`), l'outil des issues de la
  section 9 d'une blueprint (`creer-issues.mjs`), l'outil de mise à jour d'une appli
  assemblée (`mettre-a-jour.mjs`, qui reporte un catalogue plus récent ou ajoute une
  brique) et sa note de
  conception
  (`mise-a-jour.md`), l'outil des adaptations (`adaptations.mjs`, en lecture seule : les
  fichiers venus du catalogue qu'une appli a retouchés, avec leur diff et leur note ; `--json`
  pour les outils suivants, `--rejouer` pour un diff exact, voir son `--aide`) et la
  lecture du manifeste que `mettre-a-jour.mjs` et `adaptations.mjs` partagent (`manifeste.mjs`), propres au catalogue : une appli
  assemblée ne les reçoit pas.
- `scripts/` — squelette des imports et correctifs de données : dry-run par
  défaut, `--confirmer` à la main ; `bases-locales.ts`, qui crée les bases locales (voir
  [demarrer.md](demarrer.md#démarrer-en-local)) ; et `verifier-audit.mjs`, lancé par la
  CI, qui échoue sur toute vulnérabilité haute ou critique absente de
  `exceptions-audit.json` (racine).
- `docker-compose.yml` — le Postgres local du poste.
- `.devcontainer/` — l'environnement prêt à l'emploi de GitHub Codespaces (Node, npm,
  Postgres, Claude Code), à l'essai : voir [codespaces.md](codespaces.md).
- `tests/` + `vitest.config.ts` — règles verrouillées, et le garde qui refuse
  toute base non locale.
- `.claude/skills/` — `solstice-ui` (kit et thématisation),
  `solstice-donnees` (base, modules, imports et leurs pièges),
  `solstice-nouvelle-appli` (cadrage, fiche projet, socle prêt pour la prod,
  découpage), `solstice-livrer` (du ticket à la mise en ligne) et
  `creer-appli` (le dialogue de cadrage, la blueprint, l'appel de l'assembleur, puis
  le dépôt distant privé créé après accord, puis les issues de la section 9, puis,
  ces tickets faits, les brouillons de tickets du catalogue tirés des adaptations de
  l'appli ; propre au catalogue, une appli assemblée ne la reçoit pas).
- `.claude/agents/` — `relecteur-migrations` et `relecteur-docs`, lancés
  avant une PR selon ce que touche le diff ; `relecteur-blueprint`, lancé par
  la skill `creer-appli` sur la blueprint, avant l'assembleur (propre au
  catalogue, une appli assemblée ne le reçoit pas).
- `.claude/settings.json` + `.claude/hooks/gardes.mjs` — refusent à Claude
  (voir [le hook en détail](#le-hook-des-gardes-en-détail)) :
  écrire un `.env*` (hors `.env.example`), `.envrc` ou `.npmrc`, un secret de base distante,
  `git add -f`, `--confirmer`, la fusion d'une PR, `git push --force`
  (`--force-with-lease` passe), les hooks git sautés. Testés par
  `node .claude/hooks/gardes.test.mjs` (lancé par la CI). Le hook demande
  Node sur le poste.
- `CLAUDE.md` — les règles du harnais, lues par Claude à chaque session.
- `docs/catalogue/` — la référence longue du catalogue (démarrage, assembleur,
  briques, structure), propre au catalogue : l'assembleur ne la livre pas.
- `docs/cicatrices.md` — le registre des leçons des projets précédents : la
  règle, le cas, et ce qui la tient dans le catalogue.
- `docs/CHANGELOG-socle.md` — le journal des changements du socle (hors des
  briques, qui ont chacune le leur) : ruptures et corrections de sécurité à
  reporter. Une appli assemblée le reçoit, et ses mises à jour aussi.

## Vérifier

```
node .claude/hooks/gardes.test.mjs
npm run format:check   # npm run format met en forme
npm run lint
npm run typecheck
DATABASE_URL=postgresql://postgres@localhost:5433/catalogue_solstice_vibe_test PGSSLMODE=disable npm test
DATABASE_URL=postgresql://postgres@localhost:5433/catalogue_solstice_vibe_test PGSSLMODE=disable npm run test:assembleur   # long (plus de 10 min) ; la CI ne lance qu'un échantillon des combinaisons de l'assembleur sur chaque pull request, le complet la nuit
npm run build
```

La signature « Conçu par Solstice Lab » en pied de page fait partie de toute
livraison Solstice Lab et ne s'y retire pas ; hors de ce cadre, voir
`CONTRIBUTING.md`, « La signature Solstice Lab ».

## Le hook des gardes, en détail

Le [README](../../README.md) dit que le hook de `.claude/settings.json` s'applique
d'office. Détail de ce qu'il refuse et de la façon de s'en passer.

`node .claude/hooks/gardes.mjs` lit la commande ou le fichier visé, sans
dépendance ni réseau, avant chaque commande (Bash, PowerShell, terminal de
l'appli de bureau) et chaque écriture de fichier (Write, Edit, MultiEdit,
NotebookEdit). Il refuse : écrire un `.env*` (hors `.env.example`), `.envrc` ou
`.npmrc`, un mot de passe de base distante dans une commande, une URL de base
distante avec mot de passe dans un fichier, `git add -f`, `--confirmer`, la
fusion d'une PR (`gh pr merge` ou l'API), `git push --force`
(`--force-with-lease` passe) et `--no-verify`, y compris confiés à un
interpréteur (`sh -c`, `pwsh -Command`, heredoc exécuté). En `claude -p`, les
hooks tournent d'office, sans demande de confiance.

Les `hooks` déclarés dans `.claude/settings.local.json` s'ajoutent à ceux du
dépôt sans les remplacer. Pour couper les hooks d'une seule session :
`claude --settings <fichier>`, avec un fichier JSON qui contient
`{ "disableAllHooks": true }` (le JSON en ligne de commande perd ses guillemets
sous Windows PowerShell 5.1).

## Versions

Il n'y a pas de version publiée. La version d'une brique est le commit du
catalogue noté dans la blueprint de l'appli et dans son manifeste d'empreintes
(`catalogue.empreintes.json`) ; chaque changement d'interface publique est
inscrit au `CHANGELOG.md` de la brique.
