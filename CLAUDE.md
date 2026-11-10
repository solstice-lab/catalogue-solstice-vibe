# Catalogue Solstice-vibe — règles de travail

Règles du catalogue `catalogue-solstice-vibe` et des applis web qu'il assemble
(Next.js 16, React 19, TypeScript) : une appli assemblée reçoit ce fichier
avec son code. Le *harnais*, c'est le socle et sa méthode : ces règles, les
skills de `.claude/skills/` et les gardes de `.claude/hooks/` qui encadrent
le travail de Claude.

Ce fichier est lu par Claude à chaque session. Il grandira par domaines
(RGPD, infra…) ; les briques UI, données et méthode (livraison, relecture,
gardes) existent à ce jour.

---

## 1. UI — règle absolue

**Toute interface se construit avec les composants de `src/ui/`**, jamais en
HTML/CSS ad hoc. Avant de construire ou modifier un écran, un tableau, un
formulaire ou un style, **charger la skill `solstice-ui`**
(`.claude/skills/solstice-ui/`) : elle décrit le kit et ses règles d'usage.

- **Aucune couleur, police ou rayon en dur** dans un composant ou un style :
  tout passe par les tokens de `src/ui/theme/tokens.css`. Ce fichier est le
  contrat de thème — le remplir est la SEULE façon de thématiser un client.
- **Un tableau se fait avec `Tableau`** : tri, filtre par colonne et vue gardée
  à la navigation (sessionStorage) intégrés d'office ; pas de `<table>` à la
  main. Hiérarchie, volets figés, clic-détail et exports : skill `solstice-ui`.
- **La signature Solstice Lab** (pied d'`AppLayout` et de `PageVitrine`) ne se
  retire d'aucune livraison Solstice Lab, même un proto : règle de l'agence, pas
  de la licence. Ses couleurs sont volontairement hors thème (ui.css).
- **Composant manquant au kit** : le construire dans `src/ui/` sur les tokens
  (jamais en local dans une page). Dans une appli assemblée, signaler en plus
  qu'il est candidat à remonter dans le catalogue.

## 2. Thème

- Le thème par défaut est la charte Solstice Lab (thème de repli).
- La thématisation client (depuis une charte PDF ou un site existant) suit la
  procédure de la skill `solstice-ui`. Livrable : `tokens.css` rempli et,
  si besoin, les polices remplacées dans `src/app/layout.tsx`.
- Garde-fous quel que soit le thème : contrastes AA sur le texte, sémantique
  des couleurs d'état préservée (`--positif` reste un vert, `--negatif` un
  rouge, même si la marque du client est rouge), l'accent se dose (une à deux
  touches par écran).

## 3. Données

Cette section ne vaut que si l'appli a la brique données (`src/lib/db/`).
Une appli assemblée sans brique qui lit la base (`comptes`, `contact`, `echeances`…) n'en a pas : ni base, ni `DATABASE_URL`.

Avant de toucher à la base, au schéma, à un module métier ou à un script de
données, **charger la skill `solstice-donnees`**. Les règles courtes :

- **Tout accès à la base passe par `query()`/`queryOne()`/`transaction()` de
  `src/lib/db/client.ts`** — aucun autre fichier n'importe `pg`.
- **Un `CREATE TABLE` fusionné sur main ne se retouche plus.** Toute
  évolution est une étape idempotente ajoutée EN FIN de
  `src/lib/db/migrations.ts` — y compris l'index d'une colonne ajoutée après
  coup (incident du 2026-09-04 : un index dans schema.sql sur une colonne
  née en migration a mis toute l'application à terre).
- **Un module métier se construit en copiant le patron `dossiers`** : fiche
  en LECTURE SEULE, parité stricte fiche/formulaire (un seul composant de
  formulaire pour /nouveau et /modifier), `exiger(action)` de `briques/comptes/roles.ts`
  en première ligne de chaque page ET server action (droits déclarés dans
  `src/config/acces.ts`, refus par défaut), slugs par `lib/slug.ts`, bornes (la base ne lève jamais à la place d'un message : skill). Une appli neuve n'en reçoit rien, ni écrans, ni table, ni droit : le lire au catalogue public.
- **Les tests exigent une base LOCALE jetable** — `vitest.config.ts` refuse
  toute `DATABASE_URL` hors localhost, c'est voulu et ça ne se contourne pas.
  Il refuse aussi une base dont le nom ne finit pas par `_test` ou `_test_<n>`.
- **Scripts de données** : copier le squelette (`scripts/lib/cli.ts`),
  dry-run par défaut, `--confirmer` tapé À LA MAIN par un humain après
  relecture du rapport — un agent ne lance jamais un script d'écriture contre
  la prod. La base se choisit explicitement par `--env-file` à l'invocation ;
  pas de script npm `db:*` qui la fige (piège vécu sur un projet précédent).

## 4. Conventions

- **Tout en français** : variables, fonctions, commentaires, intitulés de
  tests, messages de commit, libellés d'interface. Adapter les libellés
  d'interface à la langue de travail du client si elle n'est pas le français.
- **Les commentaires expliquent le POURQUOI, pas le QUOI**, et citent le cas
  réel qui a motivé la règle quand il existe.
- Un commentaire, un README ou un CHANGELOG cite le cas, jamais un numéro de
  ticket, de PR ou un hash : le dépôt public n'a pas l'historique.
- **Messages de commit** : sujet `Domaine : ce que ça change`, sans point
  final ; corps substantiel (problème, solution retenue, écartées, effets de
  bord).
- Registre sobre dans l'interface : pas de superlatifs, pas d'emojis.

## 5. Portée d'une demande

- Une demande d'affichage reste de l'affichage : pas de refactor ni de
  changement structurel entrepris au passage. Si un changement structurel
  semble nécessaire, escalader vers la personne responsable technique du
  projet plutôt que le faire.
- Une demande = un changement : pas de corrections sans rapport dans un même commit.

## 6. Vérifier avant de livrer

```
node .claude/hooks/gardes.test.mjs   # si .claude/hooks/ a changé
npm run format:check   # npm run format corrige ; le Markdown n'est pas mis en forme
npm run lint
npm run typecheck
DATABASE_URL=postgresql://postgres@localhost:5433/<nom>_test PGSSLMODE=disable npm test   # brique données : <nom> = name de package.json, tirets en _ (catalogue_solstice_vibe_test dans le catalogue), base créée par scripts/bases-locales.ts ; sans elle, npm test seul
DATABASE_URL=<la même> PGSSLMODE=disable npm run test:assembleur   # catalogue : si outils/ ou un extrait qu'il retire change (plus de 10 min ; la CI le lance sur chaque PR)
npm run build   # sans DATABASE_URL (brique données : le pool naît à la première requête, le build n'en fait aucune)
```

Brique données : `npm test` répartit les fichiers sur des workers, chacun vidant sa base
`<base>_w<k>` (k : n° du worker ; créée puis supprimée par `tests/bases-des-workers.ts`). Donc
**un seul lancement de tests à la fois par base de test** : deux sur la même base se
perturbent (29 échecs le 2026-10-20). Sessions ou personnes en parallèle :
**une base dédiée chacune**, `<nom>_test_<n>` (n = numéro du ticket), créée
par `docker exec catalogue-postgres createdb -U postgres <nom>_test_<n>`
(conteneur du `docker-compose.yml`), puis la commande ci-dessus avec ce nom.

Ne pas lancer le serveur de développement ni tenter de vérification dans un
navigateur : la personne qui pilote le projet vérifie elle-même le rendu.

## 7. Méthode : démarrer, livrer, relire

- **Nouveau projet ou nouveau module** : charger la skill
  `solstice-nouvelle-appli` avant toute ligne de code ou d'infra (cadrage,
  fiche projet `PROJET.md`, socle, découpage en tickets).
- **Toute tâche qui modifie le code** : charger la skill `solstice-livrer`
  (ticket, branche, test d'abord, relecture, PR). Un humain fusionne.
- **Avant une PR**, relire par sous-agents : l'agent `relecteur-migrations` si
  le diff touche `src/lib/db/` (brique données) ; l'agent `relecteur-docs` s'il renomme ou
  retire un fichier, un symbole, une route, une variable, ou touche un `.md`.
- **Appli assemblée** : toute retouche d'un fichier au `catalogue.empreintes.json` se note dans `ADAPTATIONS.md` (la garde le rappelle) ; l'outil des adaptations du catalogue les liste, à la fin du premier cycle de tickets et à chaque mise à jour, et chaque défaut du catalogue y devient un brouillon de ticket remis à la personne qui pilote.
- **Interface d'une brique** (`src/briques/*/`) : tout changement d'interface
  publique (symbole, signature, props, option, forme d'un retour) met à jour la
  section « Interface publique » de son README et ajoute une entrée en fin de
  son `CHANGELOG.md`, dans la même PR : date, ce qui change pour l'appelant, raison. La documentation seule n'en demande pas.
- **Sécurité et ruptures** (au catalogue) : une correction de sécurité ajoute une entrée « Sécurité » en fin du `CHANGELOG.md` de la brique touchée, ou de `docs/CHANGELOG-socle.md` hors des briques, **même sans changement d'interface** ; hors des briques, ce qui oblige une appli à changer y ajoute une entrée « Rupture ».

## 8. Gardes de Claude

`.claude/settings.json` branche `.claude/hooks/gardes.mjs` avant chaque commande et chaque
écriture. Il refuse, même confiés à un interpréteur : écrire un `.env*` (hors `.env.example`),
`.envrc` ou `.npmrc`, un mot de passe de base distante, `git add -f`, `--confirmer`, la fusion
d'une PR (`gh pr merge`, API), `git push --force` (`--force-with-lease` passe), `--no-verify`.
Il arrête l'inadvertance, pas qui veut passer : la barrière réelle est le ruleset GitHub de `main`
et l'absence de secrets de prod sur le poste. Un refus ne se cherche pas de détour : dire à l'humain
quoi taper. Un garde qui bloque à tort se corrige par un cas dans `gardes.test.mjs` (lancé par la CI).

## 9. Entretien de ce fichier

Chaque règle enfreinte puis corrigée devient une ligne ici. Garder le fichier
court : au-delà de 150 lignes, il n'est plus lu attentivement.
