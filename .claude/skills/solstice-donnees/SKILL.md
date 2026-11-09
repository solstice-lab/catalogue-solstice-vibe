---
name: solstice-donnees
description: Brique données — base Postgres, schéma et migrations, module métier canonique, scripts d'import et de correctif, tests avec base locale. Charger avant de toucher à la base, au schéma, à un module métier, à un script de données, ou de préparer un import.
---

# solstice-donnees — la base, les modules, les imports

Chaque règle ici a été payée une fois sur un projet précédent : la cicatrice
est citée quand elle existe.

## Architecture (`src/lib/db/`)

- `client.ts` — LE point d'accès : `query()`/`queryOne()`/`transaction()`.
  Aucun autre fichier n'importe `pg`. Le pool naît à la première requête, pas
  au chargement : le build passe sans `DATABASE_URL`, c'est la première
  requête qui lève si elle manque. L'initialisation (schema.sql puis
  migrations) se joue aussi à la première requête et un échec d'init n'est
  jamais mis en cache — la requête suivante retente. Elle se joue sous un
  verrou consultatif Postgres (`VERROU_DU_REJEU`) : deux instances qui
  démarrent ensemble levaient « already exists » sur un `CREATE … IF NOT
  EXISTS` concurrent ; la seconde attend désormais la première.
- **Le certificat de la base se vérifie par défaut** (`optionsSsl()` de
  `client.ts`) : par les CA que Node reconnaît, ou par celui dont `PGSSLROOTCERT`
  donne le chemin. `PGSSLMODE=disable` en local (pas de SSL), **refusé en
  production vers un hôte distant** (un `.env.local` recopié chez l'hébergeur
  ferait circuler mot de passe et données en clair : erreur à la première
  requête, qui dit quoi poser ; de même pour `sslmode=disable` dans l'URL) ;
  `PGSSLMODE=no-verify` chiffre sans vérifier, à poser en toutes lettres
  pour un hébergeur dont le certificat ne se vérifie pas. Le client coupait
  la vérification d'office : chiffré, mais vers n'importe quel serveur. Un
  certificat refusé au démarrage se dit avec ces deux variables. Pas de
  `sslmode` dans `DATABASE_URL` : pg le lit après ces options et il gagne.
- `bornes.ts` — `ENTIER_MAX`, le plus grand INTEGER, à comparer avant toute
  requête sur un id lu dans une URL ou un montant saisi. Sans `pg` :
  importable côté client. Ne pas le recopier dans un module (quatre copies
  avaient poussé).
- `schema.sql` — l'état INITIAL d'une base neuve, rien d'autre. Rejoué à
  chaque démarrage (idempotent).
- `migrations.ts` — tableau ordonné d'étapes nommées, idempotentes, rejouées
  à CHAQUE démarrage. Pas de table de suivi : l'idempotence fait foi. Chaque
  étape est un objet écrit dans le tableau, d'un seul tenant (son SQL en elle),
  son `nom` une chaîne en clair, à elle seule : la mise à jour depuis le
  catalogue reconnaît une étape à son nom et la compare par son texte.

### Faire évoluer le schéma

1. **Un `CREATE TABLE` fusionné sur main ne se retouche PLUS** — la table
   existe déjà en prod, `IF NOT EXISTS` ne la corrigera jamais.
2. Ajouter une étape EN FIN de `MIGRATIONS`, jamais au milieu, jamais
   réordonner : les bases déployées ont rejoué l'ordre existant.
3. Chaque étape est idempotente (`ADD COLUMN IF NOT EXISTS`,
   `DROP CONSTRAINT IF EXISTS` puis `ADD`, backfill qui ne matche que les
   lignes à rattraper) et commente son POURQUOI.
4. **L'index d'une colonne ajoutée après coup se crée dans la MÊME étape**,
   jamais dans schema.sql : sur une base ancienne, schema.sql tourne AVANT
   les migrations, la colonne n'existe pas encore quand il s'exécute
   (incident du 2026-09-04 — toute l'application à terre).
   **Un index UNIQUE ne se pose pas sur une table qui a déjà des doublons** :
   sur une table de production qui en contenait, il aurait fait échouer chaque
   démarrage. L'étape cherche les doublons, n'écrit rien (ni suppression ni
   fusion) et les signale ; l'index se pose quand un humain les a réglés.
5. **Pas de donnée de référence semée par migration** (comptes, listes
   d'accès, catégories) : rejouée, elle a recréé une catégorie qu'un
   administrateur avait supprimée. Ces données s'administrent depuis
   l'interface ; une migration de données rattrape l'existant, elle n'invente
   rien. **Un semis gardé par « si la table est vide »** (mode démonstration,
   jeu d'essai) ne rattrape pas une table ajoutée ensuite : la table de chiffre
   d'affaires d'un mode démonstration, née après le premier semis, est restée
   vide en production. Chaque table se teste elle-même.
6. Échappements : un `'\s+'` écrit dans une chaîne TypeScript est arrivé en
   base sans sa barre oblique, et l'index d'unicité était faux en prod.
   Relire le SQL tel qu'il part, pas tel qu'il s'écrit.
7. Une suppression en cascade se vérifie sur ce qu'elle emporte : la
   suppression d'un lot d'import effaçait les publications d'autres lots.
8. Conventions : montants en centimes entiers, dates métier en `aaaa-mm-jj`
   sorties en `::text`, clés métier (référence) `UNIQUE` pour servir de clé
   d'import — jamais l'id technique. On désactive un compte, on ne le
   supprime pas.
   **Les statuts que le code écrit et la contrainte `CHECK` de la base
   restent synchrones** : une valeur ajoutée côté code sans la contrainte
   est refusée en production. Ajouter un statut, c'est une étape de migration
   (`DROP CONSTRAINT IF EXISTS` puis `ADD`) dans la même PR. Retirer une
   valeur de la contrainte : seulement si plus aucune ligne ne la porte, sinon
   l'`ADD` échoue à chaque démarrage (même piège que l'index unique) ; l'étape
   migre ces lignes ou les signale, et la valeur reste admise en attendant.
9. **Avec la brique rgpd, une table neuve se déclare dans
   `src/config/donnees-personnelles.ts`**, dans la même PR : comme source de l'export des
   données d'une personne, comme donnée non exportée avec sa raison, ou comme
   table sans donnée personnelle. Une source dit aussi comment elle s'efface
   (`effacer`, testé dans les tests de son unité) : on anonymise ou on retire
   l'adresse, on ne supprime pas une pièce de gestion. `tests/rgpd-export.test.ts` refuse une
   table oubliée : sinon, elle manquerait à l'export sans que rien le dise. Sa
   durée de conservation se déclare aussi, dans la `conservation` de son
   traitement (`confidentialite.ts`), que la purge de la brique applique.

Avant la PR, l'agent `relecteur-migrations` relit toute évolution de schéma.

## Le module métier canonique (`src/app/dossiers/`)

Tout nouveau module se construit en COPIANT ce patron, puis « dossiers » se
remplace par le premier module réel. Une appli assemblée n'en a que la couche données
(`src/lib/db/dossiers.ts`) : ses écrans, qui appellent `exiger`, se lisent dans le dépôt public
du catalogue, et sans la brique comptes elle la prend avant son premier module. Avec la brique
journal, ses écritures (`src/lib/db/dossiers.ts`) passent en `transaction()` avec
leur trace, et sa fiche porte l'historique : à la copie, renommer l'entité ;
sans la brique, ces blocs sont déjà retirés (README de la brique, « La
brancher ») :

- **Fiche en LECTURE SEULE** (`/dossiers/[slug]`) : elle affiche exactement
  les champs du formulaire (parité) et ne porte que des actions annexes
  (modifier, supprimer). Toute mutation passe par `/nouveau` ou `/modifier`.
- **UN composant de formulaire partagé** par /nouveau et /modifier, UNE
  validation partagée dans les server actions : la parité est mécanique.
- **Un champ dérivé ne se lit jamais depuis le formulaire** : il se recalcule
  côté serveur après l'écriture, même s'il s'affiche en lecture seule dans le
  formulaire. Un montant affiché sans être modifiable était quand même
  renvoyé, et sa valeur périmée écrasait la somme des montants mensuels.
- **Les bornes font partie du patron : la base ne lève jamais à la place d'un
  message** (audit du 2026-11-09 : un montant géant, « 2026-06-31 » ou
  `/dossiers/99999999999` donnaient la page d'erreur). À copier avec le module :
  un montant se borne à `ENTIER_MAX` (`lib/db/bornes.ts`) et se refuse négatif
  sauf raison métier écrite ; une date se valide par `estDateIso`
  (`lib/date-iso.ts`), pas par sa seule forme ; chaque texte a une longueur
  maximale (`LONGUEUR_MAX_DOSSIER` du domaine, reprise en `maxLength` du
  formulaire) ; un id d'URL ou posté se contrôle (`estIdDossier`) avant la
  requête, un id hors plage valant « introuvable » (404 à la lecture, message à
  l'écriture, écarté d'un lot). La clé métier `UNIQUE` se contrôle d'avance pour
  le message rapide ET se rattrape à l'écriture : deux envois simultanés passent
  le pré-contrôle, la violation `23505` se traduit par `estRefusDeLaBase`
  (`lib/db/client.ts`). `tests/dossiers-bornes.test.ts`, à lire au catalogue
  public (il part avec les écrans), est le modèle des tests.
- **Garde d'accès** : `exiger("objet.verbe")` de `briques/comptes/roles.ts` en PREMIÈRE
  ligne de chaque page ET server action (une action se poste sans passer par
  l'écran) ; `tests/gardes-acces.test.ts` le vérifie. Le module déclare ses
  actions dans son fichier de domaine (`ACTIONS_…`, sans rôle) ; qui y a droit
  se dit dans `src/config/acces.ts` (`DROITS`), jamais réimplémenté
  localement : ailleurs, `peut(utilisateur, action)`. Refus par défaut : sans
  utilisateur ou avec un rôle non déclaré, rien ne passe. Masquer une entrée
  de navigation ne protège rien. Refus = 404, pas 403. L'entrée de
  `lib/navigation.ts` déclare `visible: visiblePour(action)` avec la MÊME
  action que la page : sinon un membre voit un lien qui mène à un 404.
- **Une table rattachée à un espace** (colonne `espace_id`, avec la brique
  espaces) : ses fonctions de données prennent la `base` que rend
  `exigerMonEspace()`, appelé juste après `exiger`, et n'importent pas `query` ;
  un test-verrou refuse le contraire (README de la brique, « La brancher »).
- **Slugs** : `lib/slug.ts`, recalculés jamais stockés. Déclarer les segments
  statiques du module dans `SEGMENTS_RESERVES_PAR_MODULE`.
- **Un compte désactivé, réactivé ou effacé** qui doit changer quelque chose
  au module (une appartenance terminée, un prénom anonymisé) : un effet déclaré
  dans `src/config/effets-comptes.ts`, écrit par l'exécuteur reçu, jamais par
  `query()`. Jamais une retouche de `src/app/comptes/actions.ts`, fichier de la
  brique gestion-comptes (README de comptes, « Les effets d'un compte… »).
  Avec la brique espaces, une appartenance à un espace n'y passe pas : voir
  le point suivant.
- **Un membre qui quitte un espace** (avec la brique espaces : parti, retiré,
  compte désactivé ou effacé) et que le module garde dans ses données (un
  ordre de passage, une demande en attente) : un effet déclaré dans
  `src/config/effets-espaces.ts`, joué dans la transaction du départ, plutôt
  que de sauter les adhésions terminées à chaque lecture (README d'espaces,
  « La brancher », point 4).
- **Les gestes de masse appartiennent aux LISTES** (sélection + actions en
  lot), pas aux fiches. Toute suppression se confirme par une `Modale`.
- **Toutes les pages du module en `force-dynamic`** : le build n'interroge
  jamais la base, les listes se lisent à chaque requête.
- Le `Tableau` reçoit libellés et euros, pas les valeurs de stockage : tri et
  filtres parlent la langue de l'écran.

## Scripts d'import et de correctif (`scripts/`)

Copier le squelette `exemple-import.ts` + `lib/cli.ts`. Les fichiers du client se
déposent dans `donnees-reelles/`, ignoré par git ; un exemple fictif suivi va dans
`scripts/exemples/` (dossier à créer au premier exemple ; `.gitignore` le laisse passer). Le protocole :

1. **Dry-run par défaut** — sans option, rien ne s'écrit. Relire le rapport.
2. `--confirmer` pour écrire, tapé À LA MAIN par un humain. **Un agent ne
   lance JAMAIS un script d'écriture contre la prod** — les gardes du harnais
   (`.claude/hooks/gardes.mjs`) refusent `--confirmer` à Claude.
3. La base se choisit par `--env-file=…` à l'invocation, jamais
   implicitement. Pas de script npm `db:*` qui fige un env-file.
   `modeEcriture()` la nomme en PREMIÈRE ligne du rapport (hôte, port, nom,
   jamais le mot de passe) avec le mode : l'appeler avant tout `console.log`
   (un test-verrou le vérifie), et relire cette ligne avant `--confirmer`.
   `--env-file` lit le fichier du dossier où la commande est lancée : un
   `--confirmer` lancé depuis un autre dossier a lu un autre `.env.local`,
   et la base de l'appli est restée vide sans que rien ne le signale
   (2026-10-21).
4. **Additif et idempotent** : le vide se remplit, le plein se garde, le
   conflit part au rapport (`valeurRetenue`) — jamais une valeur pleine
   dégradée, jamais une valeur perdue en silence. Relancer ne change rien.
5. `--vider` pour rejouer un import de zéro sur une table déjà remplie.
6. **Écrire par les fonctions de l'appli** (`src/lib/db/*.ts`), jamais en SQL
   à la main : elles remplissent ce qu'un `INSERT` oublie.

Lancement : `npx tsx --env-file=<fichier> scripts/<script>.ts`, puis le même
avec `--confirmer`, tapé par un humain. `--env-file` AVANT le script : placé
après, tsx le passe au script comme argument et le fichier n'est pas lu.

### Checklist des pièges d'import (tous vécus en production)

- **Les URLs de pièces jointes du système source expirent** (Airtable, par
  exemple) : télécharger les fichiers AVANT de planifier l'import.
- **L'import prod se fait APRÈS le déploiement de la migration** qui crée les
  colonnes — jamais avant.
- **Un identifiant à zéros de tête reste du texte** : un export réenregistré
  par un tableur a perdu les zéros de tête de matricules. Lire la colonne
  comme du texte, ne jamais la convertir en nombre.
- **Une date peut arriver en nombre de série** (le tableur convertit les dates
  écrites en texte) : la relire comme une date, ne pas l'écrire telle quelle.
- **Une chaîne vide dans une colonne de date est une date absente** : l'envoyer
  à la base fait échouer l'insertion, et rejeter la ligne pour si peu en
  perd toute la ligne.
- **Collision de clés d'upsert : sommer ou rejeter, jamais écraser**
  (cicatrice : plusieurs centaines de milliers d'euros de chiffre d'affaires
  écrasés en silence par une collision de codes).
- **Normaliser casse et espaces des clés de rapprochement** (« AB13 » vs
  « AB 13 » : deux lignes au lieu d'une au re-sync).
- **Réconcilier les TOTAUX métier, pas le nombre de lignes** : un
  dédoublonnage légitime change le compte de lignes sans toucher au total
  (cicatrice : environ 150 lignes d'écart sur 4 500, total de jours intact).

## Tests et base locale

- `npm test` exige une base LOCALE : `vitest.config.ts` refuse toute
  `DATABASE_URL` hors localhost. C'est un garde volontaire — ne pas le
  contourner, ne pas l'assouplir. Il refuse aussi une base dont le nom ne
  finit pas par `_test` ou `_test_<n>` : un `npm test` lancé sur la base de
  dev a effacé le compte admin, elle était locale elle aussi.
- Base locale (Docker requis, rien d'autre) : `docker compose up -d --wait`
  monte le Postgres 18 de `docker-compose.yml` (conteneur
  `catalogue-postgres`, `127.0.0.1:5433`, `trust`, volume nommé), un seul par
  poste pour toutes les applis. Puis `npx tsx scripts/bases-locales.ts` crée
  `<appli>_dev` et `<appli>_test` (nom de `package.json`) s'ils manquent et
  affiche la ligne `DATABASE_URL` pour `.env.local` — il ne l'écrit pas, les
  gardes refusent d'écrire un `.env*` — et la commande des tests. Une base
  VIDE suffit : le schéma s'applique à la première requête. L'appli en dev
  pointe `<appli>_dev`, jamais la base de test. Pas de dry-run ici : le script
  ne joint que le conteneur local par `docker exec` et ne crée que des bases
  vides. Une session parallèle sur la même appli prend sa propre base de
  test, les tests vidant celle qu'ils visent (règle du `CLAUDE.md` §6, `n` =
  numéro du ticket) :
  `docker exec catalogue-postgres createdb -U postgres <appli>_test_<n>`.
  `scripts/bases-locales.ts` ne crée pas ces bases-là.
- Lancement :
  `DATABASE_URL=postgresql://postgres@localhost:5433/<appli>_test PGSSLMODE=disable npm test`
  Les fichiers tournent en parallèle, chaque worker sur sa base `<base de test>_w<k>`
  (`k` : numéro du worker ; `tests/bases-des-workers.ts` les crée et les supprime à la fin) : un test ne
  compte jamais sur ce qu'un autre fichier a laissé en base.
- Les intitulés de tests énoncent la RÈGLE qu'ils verrouillent et citent le
  cas d'origine entre parenthèses — pas « ça marche », mais « ce qui ne doit
  jamais se reproduire ».
- La CI a son propre Postgres jetable (conteneur de l'étape « Démarrer
  Postgres », image épinglée par digest dans sa variable `IMAGE`, la même que
  `docker-compose.yml` ; `ci.yml` dit comment la renouveler), alignée sur la prod.
- Une connexion à la prod pour « regarder » passe par une variable saisie
  sans écho, jamais une URL collée : l'historique du shell la garde, et les
  gardes du harnais refusent une URL distante avec mot de passe.
