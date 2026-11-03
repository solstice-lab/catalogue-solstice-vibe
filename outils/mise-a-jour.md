# Ajouter une brique à une appli assemblée, et la tenir à jour

Note de conception, écrite avant tout code le 2026-11-03 ; ses questions ont été tranchées
le même jour (« Décisions prises »). Rien ici n'est encore outillé. Elle vit dans `outils/`,
que l'assembleur ne copie pas : une appli assemblée n'a ni l'outil ni ce qui le décrit.

## Le besoin

Une appli assemblée est une copie figée : ses briques se choisissent une seule fois, à
l'assemblage (`outils/assembler.mjs`). Deux manques en découlent :

1. **Ajouter ensuite une brique non choisie** n'est pas outillé (README de la brique
   notifications, « Ce qu'elle ne fait pas (v1) » ; étape 2 de la skill `creer-appli` pour
   la base, qu'une appli « n'en recevra pas après coup »). La parade actuelle : prendre
   d'avance les briques probables, avec leur code, leurs tables et leurs traitements
   déclarés, sans usage.
2. **Les corrections et évolutions d'une brique** n'arrivent dans l'appli que si quelqu'un
   lit les `CHANGELOG.md` et les reporte à la main (« Hors v1 » de `creer-appli`). Une
   correction de sécurité peut ne jamais arriver.

Le cas : le 2026-11-03, au cadrage d'une appli de répartition des tâches en colocation, la
personne qui utilise le catalogue a demandé de pouvoir « piquer des briques au fur et à
mesure » et de recevoir leurs mises à jour : le catalogue est vivant, des briques y
apparaîtront et les existantes seront corrigées.

Le manifeste d'empreintes (`catalogue.empreintes.json`), que l'assembleur écrit dans le
premier commit de chaque appli depuis le 2026-11-02, a été posé pour préparer ce chantier.

## Le principe : rejouer l'assembleur, puis fusionner à trois

Les deux besoins sont une seule opération : faire passer l'appli de l'assemblage
(commit A, briques B) à l'assemblage (commit A', briques B').

- **Ajouter la brique x** : A' = A, B' = B plus x et ce que x entraîne.
- **Mettre à jour** : A' = le commit visé du catalogue, B' = B.

Pour chaque fichier venu du catalogue, trois versions :

- **l'origine** : le fichier tel que l'assembleur l'a produit au commit A pour les briques B ;
- **la cible** : tel que l'assembleur le produirait au commit A' pour les briques B' ;
- **l'appli** : tel qu'il est au `HEAD` de l'appli.

L'origine n'est pas le fichier du catalogue au commit A : l'assembleur retouche les
fichiers partagés selon les briques absentes (`outils/modules.mjs`), puis les remet en
forme. La seule façon exacte de la retrouver est de **rejouer l'assembleur du commit A**
(celui de ce commit, avec sa propre liste `modules.mjs`), avec les mêmes briques, le même
nom de paquet et la même option Dependabot, dans un dossier temporaire. La cible s'obtient
de même au commit A'.

Le manifeste prouve que la reproduction est exacte : les empreintes de l'origine rejouée
doivent être **toutes** égales à celles du manifeste de l'appli. Au premier écart, l'outil
s'arrête en nommant les fichiers : une fusion contre une origine fausse attribuerait à
l'appli des retouches qu'elle n'a pas faites, ou l'inverse. Le manifeste ne couvre que les
fichiers venus du catalogue : ni `NOTICE` ni `blueprint.md`, que l'assembleur écrit
lui-même, n'y ont d'empreinte. L'origine de `NOTICE` n'est donc pas prouvée ; elle ne
dépend que de `LICENSE` et de la licence des polices au commit A.

L'origine et la cible se lisent dans le commit que l'assembleur rejoué a fait, comme
l'appli à son `HEAD` : le contenu que git enregistre, en LF, jamais le disque. Sous
Windows, un fichier lu en CRLF d'un côté donnerait un conflit à chaque ligne.

**Le Prettier du commit A.** L'assembleur remet en forme avec le Prettier de la racine du
catalogue rejoué, et refuse sans lui ; un worktree neuf n'a pas de `node_modules`. Les
empreintes dépendent de cette version : celle du commit A, pas celle du jour, que
Dependabot monte. L'outil compare la version de Prettier du verrou au commit A à celle
qu'a installée le catalogue : égales, le worktree emprunte les `node_modules` du
catalogue ; différentes, il lance `npm ci` dans le worktree. C'est le seul appel au réseau
de l'outil, du côté du catalogue et pour ses propres dépendances, jamais pour l'appli. La
comparaison des empreintes attrape toute version qui ne serait pas la bonne.

## Ce que l'outil lit

| Source | Ce qu'il en tire |
| --- | --- |
| `catalogue.empreintes.json` de l'appli | Le commit A (`catalogue.commit`) ; les briques B, valeurs d'`unite` qui sont des clés de `BRIQUES` d'`outils/modules.mjs` au commit A, ni `socle`, ni `donnees` (que `planifier` refuse dans `--briques`), ni les unités partagées `patron-dossiers` et `adresse-ip` (chaque brique a au moins son dossier, donc une entrée) ; Dependabot, par la présence de `.github/dependabot.yml` ; l'empreinte de chaque fichier venu du catalogue, hors `NOTICE` et `blueprint.md`. |
| `package.json` de l'appli | Le nom du paquet, que l'assembleur y a reporté. Un nom changé depuis se voit à la vérification des empreintes (`package.json` et le verrou le portent). |
| `blueprint.md` de l'appli | `commit_reference`, recoupé avec le manifeste ; un désaccord se signale. |
| L'appli, à son `HEAD` | Le contenu de chaque fichier tel que git l'enregistre, comme le manifeste, pas le disque. L'arbre doit être propre. |
| Le catalogue, aux commits A et A' | L'assembleur et `modules.mjs` de chacun, rejoués dans un worktree temporaire (`git worktree add --detach`). `planifier` du commit A' valide B' (`exige`, `entraine`). |
| Les `CHANGELOG.md` des briques de B', entre A et A' | Les entrées ajoutées en fin de fichier (règle d'entretien des briques), recopiées au rapport. Une « Rupture » vient en tête : un appelant de l'appli doit changer. |
| L'historique du catalogue, de A à A' | Le sujet des commits qui touchent un fichier du socle reçu par l'appli : le socle n'a pas de `CHANGELOG.md` (décision 6). |

Refus en clair, motif et geste à faire, sur le modèle de l'assembleur :

- le catalogue a des modifications non commitées, ou son `HEAD` n'est pas `origin/main`
  (même vérification que l'étape 0 de `creer-appli`) ;
- l'appli n'a pas de manifeste, ou son commit porte `+arbre-modifie` : l'origine ne se
  rejoue pas ;
- le commit A est absent du catalogue (appli assemblée avant le dépôt public) ;
- l'arbre de l'appli n'est pas propre, ou son `HEAD` n'est pas son `origin/main` à jour
  (`solstice-livrer` §1 : une branche part de là) ;
- une brique de B est inconnue au commit A' (renommée ou retirée du catalogue) ;
- le Prettier du commit A ne s'installe pas dans le worktree ;
- l'origine rejouée ne redonne pas les empreintes du manifeste ;
- un fichier neuf de la cible a le chemin d'un fichier de l'appli : le manifeste réécrit
  donnerait ce fichier pour venu du catalogue, et l'opération suivante le fusionnerait avec
  celui du catalogue. L'appli renomme le sien d'abord.

## Ce qu'il fait de chaque fichier

Les fichiers que l'appli a créés, absents de l'origine comme de la cible, ne sont jamais
lus ni touchés. `PROJET.md` est à l'appli ; `blueprint.md` aussi, hors deux champs de son
en-tête (plus bas). Pour les autres :

| De l'origine à la cible | Dans l'appli | Ce que fait l'outil |
| --- | --- | --- |
| identique | quel qu'il soit | rien |
| changé | intact (égal à l'origine) | remplacé par la cible |
| changé | retouché | fusion à trois (`git merge-file`). Sans conflit : écrit, listé « fusionné, à relire ». Avec conflits : écrit avec les marqueurs, listé « en conflit ». |
| changé | supprimé par l'appli | laissé absent, signalé |
| absent, puis présent | absent | ajouté |
| absent, puis présent | présent (un fichier de l'appli au même chemin) | arrêt, avant toute écriture (refus ci-dessus) |
| présent, puis absent | intact | supprimé |
| présent, puis absent | retouché | gardé, signalé : un renommage au catalogue perdrait sinon les retouches de l'appli |
| changé, binaire (police, image) | retouché | gardé, signalé : un binaire ne se fusionne pas |

`NOTICE` suit la même table, sans empreinte au manifeste : l'appli est jugée intacte si
elle égale l'origine rejouée. Ont un traitement propre, dit dans les sections suivantes :
`src/lib/db/migrations.ts`, `src/lib/db/schema.sql`, `package-lock.json`,
`catalogue.empreintes.json` et l'en-tête de `blueprint.md`.

Un conflit ne se tranche pas dans l'outil : les marqueurs restent, et la session ouverte
dans l'appli les résout (« Le circuit »). `git diff --check` les attrape dans tout fichier,
typecheck et build dans le code. Une fusion « sans conflit » peut être fausse sur le fond
(deux changements compatibles en texte, pas en logique) : elle est listée pour relecture,
pas donnée pour sûre.

## Les fichiers partagés du socle

À l'assemblage, `outils/modules.mjs` retouche des fichiers du socle et des briques gardées
selon les briques absentes : `migrations.ts`, `.env.example`, `render.yaml`,
`src/lib/confidentialite.ts`, `src/config/donnees-personnelles.ts`, `src/config/acces.ts`,
`src/lib/navigation.ts`, `src/proxy.ts`, `src/app/layout.tsx`, `src/app/globals.css`,
`src/lib/referencement.ts`, `vitest.config.ts`, `.github/workflows/ci.yml`,
`package.json`, `CLAUDE.md` et plusieurs tests, entre autres. Le manifeste les marque de
l'unité qui les possède, souvent `socle`, avec l'empreinte prise après les retraits et la
mise en forme.

C'est pour eux que l'outil rejoue l'assembleur. Ajouter la brique x revient, sur l'origine,
à remettre les extraits que ses retraits avaient ôtés ; la fusion à trois applique ce même
écart à la version de l'appli. Ces fichiers sont ceux que l'appli remplit (droits, menu,
registre, politique), donc presque toujours retouchés : l'écart passe sans conflit tant que
l'appli n'a pas réécrit les lignes voisines.

Deux limites, que le rapport redit :

- un `remplace` de la liste, rejoué à l'envers par l'ajout de sa brique, réécrit un texte
  que l'appli a pu changer : ajouter `journal` remet `tracer(personne)` dans les gestes de
  `src/app/comptes/actions.ts` ; ajouter `comptes`, un ajout lourd (plus bas), réécrirait la
  liste des pages publiques de `referencement.ts`, que toute appli remplit. Conflit attendu
  dès que l'appli a touché ces lignes. Une mise à jour, elle, ne rejoue aucun retrait à
  l'envers : les briques ne changent pas ;
- l'écart vaut pour les fichiers du catalogue, pas pour les modules que l'appli a écrits en
  copiant le patron `dossiers`. Ajouter `journal` remet la trace dans
  `src/lib/db/dossiers.ts`, pas dans les modules de l'appli : les y brancher est un ticket
  de l'appli.

## Les migrations

`src/lib/db/migrations.ts` ne passe pas par la fusion à trois. La règle (`CLAUDE.md` §3) :
une étape fusionnée ne se retouche plus, une étape neuve s'ajoute **en fin** de liste, car
une base déployée a déjà rejoué les autres dans leur ordre. Une fusion de texte placerait
les étapes d'une brique ajoutée à leur rang dans le catalogue, au milieu des étapes de
l'appli, et une étape ajoutée en fin du catalogue heurterait celles de l'appli au même
endroit.

L'outil lit les étapes des trois versions par leur `nom`, dans le tableau `MIGRATIONS`, que
Prettier ne remet pas en forme (`.prettierignore`), puis :

- il **ajoute en fin** de la liste de l'appli, après ses propres étapes, les étapes de la
  cible absentes de l'origine, dans l'ordre de la cible : celles des briques ajoutées et
  celles que le catalogue a ajoutées depuis A. L'ordre de la cible garde leurs dépendances
  (l'étape de `journal` après celle de `comptes`, qui crée `utilisateurs`) ;
- il **s'arrête** si une étape de l'origine a changé de code dans la cible (le catalogue
  aurait enfreint sa propre règle), si une étape de l'origine manque à l'appli, ou si le
  `nom` d'une étape à ajouter existe déjà dans l'appli. Un commentaire seul changé se
  signale, sans rien reporter ;
- il **s'arrête** si `schema.sql` diffère entre l'origine et la cible : un `CREATE TABLE`
  fusionné ne se retouche plus ;
- le reste du fichier (en-tête, fonction qui rejoue les étapes) passe par la fusion à
  trois.

Le rapport le redit : fusionner la PR de l'appli rejoue ces étapes en production, au
démarrage suivant. Une étape qui vise une table que l'appli a retirée (une étape du patron
`dossiers` dans une appli qui a supprimé sa table) casse le rejeu :
`tests/migrations.test.ts` de l'appli, qui rejoue le schéma et toutes les étapes sur la base
de test, l'attrape avant la fusion, et l'agent `relecteur-migrations`, reçu avec la base,
relit l'ajout.

## Le registre RGPD et la politique de confidentialité

**Le registre** (`src/config/donnees-personnelles.ts`, avec la brique `rgpd`) déclare toute
table de la base : source de l'export et de l'effacement, donnée non exportée, ou table sans
donnée personnelle. Ajouter une brique y remet ses lignes par la fusion à trois : son import
et son `...SOURCES_X`, ses entrées de `NON_EXPORTEES` et de
`TABLES_SANS_DONNEE_PERSONNELLE`. L'appli y déclare ses propres tables : le fichier est
retouché, un conflit probable. Il se tranche en gardant l'ordre de `SOURCES` (l'effacement
le parcourt à l'envers, `SOURCES_COMPTES` en tête). Les verrous sont déjà dans l'appli :
`tests/rgpd-export.test.ts` refuse une table oubliée, `tests/rgpd-effacement.test.ts`
vérifie l'ordre. Une appli sans `rgpd` (sans comptes) n'a pas de registre : rien à faire.

**La politique de confidentialité** (`src/lib/confidentialite.ts`) : ajouter une brique y
remet son `TRAITEMENTS_X` et sa clé dans `CONFIDENTIALITE.choix`, **vide** (base légale,
durée, destinataires). L'outil ne remplit aucun choix : ils engagent le client et se font
valider par lui, comme au cadrage (`creer-appli`, étape 1). La page `/confidentialite`
signale les champs manquants. Le rapport liste :

- les traitements ajoutés, dont les choix sont à faire valider par le client ;
- les traitements dont le texte a changé entre A et A' (`src/briques/*/confidentialite.ts`) :
  la politique publiée change, elle est à relire avec le client ;
- la date de mise à jour de la politique (`miseAJour`), à changer avec l'un ou l'autre ;
- une durée réglée dans un branchement (`conservationMois` de la brique notifications), qui
  doit redire la durée annoncée.

Le registre des traitements du client lui-même, hors du code, est à tenir par lui : le
rapport le rappelle dès qu'un traitement est ajouté.

## Les dépendances npm

`package.json` passe par la fusion à trois : une dépendance qu'apporte une brique, une
version changée au catalogue. `package-lock.json` ne se fusionne pas en texte :

- intact dans l'appli, il est remplacé par celui de la cible ;
- retouché (l'appli a ajouté un paquet, Dependabot a monté une version), il est laissé tel
  quel, et le rapport demande `npm install` dans l'appli pour le régénérer, puis `npm ci`.
  Comme l'assembleur, l'outil n'appelle pas le réseau pour l'appli.

## Le manifeste et la blueprint après l'opération

- `catalogue.empreintes.json` est **réécrit** : celui de la cible, tel que l'assembleur du
  commit A' l'écrirait (commit A', version, une empreinte par fichier venu du catalogue dans
  la cible, y compris ceux que l'appli a retouchés ou supprimés). Il dit toujours ce que
  l'appli a reçu du catalogue, et l'opération suivante le reproduira à l'identique.
- `blueprint.md` : `commit_reference` devient A', comme l'écrit l'assembleur, et
  `briques_assemblees` reçoit les briques ajoutées (décision 5). Le corps reste à l'appli :
  une brique ajoutée « à brancher » s'y note en section 3 avec le ticket qui la branche,
  repris en section 9 (`blueprint-modele.md` de `creer-appli`), dans la session de l'appli.

## Les ajouts lourds : la base et `comptes`

Le mécanisme ne distingue pas `echeances` de la base ou de `comptes` : l'assembleur sait
produire une appli avec l'une ou l'autre, et l'outil fusionne de même. Aucun ajout n'est
refusé. Deux ajouts changent pourtant l'appli entière, et leur coût est dans ce qui suit
l'opération, pas dans les fichiers. L'outil les nomme « ajout lourd », et son rapport dit
en tête ce qui change pour toute l'appli, puis les décisions et les gestes qui restent.

- **La base, dans une appli qui n'en a pas** (toute brique qui l'exige : `contact`,
  `echeances`, `comptes`…). Ses fichiers arrivent presque tous neufs (`src/lib/db/`, les
  scripts, `docker-compose.yml`, la skill `solstice-donnees`) ; les fichiers partagés
  qu'elle touche (la CI et son Postgres, `vitest.config.ts`, `.env.example`, `render.yaml`,
  la route `/sante`, `package.json`), une appli y touche rarement : peu de conflits
  attendus. Restent les gestes d'une appli neuve avec base (`creer-appli`, étape 5.3) :
  créer la base chez l'hébergeur, payante, donc décidée par le client ; déclarer
  `DATABASE_URL` ; les bases locales et `.env.local`.
- **`comptes`**, avec `mails`, `rgpd` d'office et la base s'il le faut. Dès la fusion,
  toutes les pages de l'appli passent derrière la connexion, sauf `ROUTES_OUVERTES`.
  L'appli a été écrite sans droits : `tests/gardes-acces.test.ts` refuse chacune de ses
  pages qui n'appelle pas `exiger`, et donne ainsi la liste exacte des pages à trancher une
  à une (publique, ou derrière quel droit). La liste des pages publiques du référencement se
  reprend (l'accueil passe derrière la connexion), les écrans du patron `dossiers` arrivent
  (l'appli peut les supprimer), et il faut un premier admin, `AUTH_SECRET` et l'envoi des
  codes par Resend. C'est un ticket de l'appli à part entière, pas une retouche.

Parce que l'ajout reste coûteux, **le cadrage insiste** : `creer-appli` pose la question de
la base et des comptes comme une décision à prendre maintenant, en disant ce que coûterait
de les ajouter plus tard, plutôt que comme une porte fermée (tranche 4).

## Le circuit, et ce qui reste un geste humain

Le circuit suit `solstice-livrer` : le ticket d'abord, puis une branche depuis un
`origin/main` à jour, dans un worktree.

1. **Le ticket, dans le dépôt de l'appli** : « ajouter la brique x » ou « reporter le
   catalogue au commit A' ». Un `--a-blanc` préalable (étape 2) en donne le contenu.
2. **Depuis une session ouverte dans le catalogue** (l'appli n'a pas l'outil), sur un
   worktree de l'appli dont le `HEAD` est son `origin/main` à jour :

   ```
   node outils/mettre-a-jour.mjs <dossier-de-l-appli> --branche <type>/<slug> [--ajouter <briques>] [--vers <commit>] [--a-blanc]
   ```

   Sans `--ajouter`, l'outil met à jour vers `--vers`, par défaut le `HEAD` du catalogue.
   Avec `--ajouter`, il ajoute au commit de l'appli (A' = A) : une opération à la fois
   (« Options écartées »). Une brique qui n'existe pas au commit A se refuse : mettre à
   jour d'abord. `--a-blanc` donne le rapport et n'écrit rien. Sinon l'outil crée la
   branche nommée, y écrit, **ne commite pas** et imprime le rapport en Markdown, pour le
   corps de la PR. Il ne touche ni `main`, ni le remote, ni aucune base, ni aucun `.env*`.
3. **Dans une session ouverte dans ce worktree de l'appli**, avec `solstice-livrer` : la
   résolution des conflits listés, `npm install` si le verrou est à régénérer, les
   vérifications du `CLAUDE.md` de l'appli (§6), la relecture par sous-agents
   (`relecteur-migrations` dès qu'une étape est ajoutée), le commit, la PR avec le rapport.

Restent à un humain :

- **fusionner** la PR de l'appli, en sachant ce que la fusion déclenche : déploiement, étapes
  de migration rejouées en production ;
- **déclarer chez l'hébergeur** les variables nouvelles, que l'outil lit dans l'écart de
  `.env.example` et de `render.yaml`, et les comptes et secrets d'une brique ajoutée (le
  secret et la tâche planifiée de `notifications`, le compte Resend de `mails`) ;
- **faire valider par le client** les choix de confidentialité d'un traitement ajouté ou
  changé ;
- **valider le rendu** d'un écran changé : Claude ne lance ni serveur ni navigateur
  (`CLAUDE.md` §6) ;
- **choisir la valeur du client** pour un token de thème que le catalogue ajoute :
  `tokens.css` est le contrat de thème, retouché dans toute appli thématisée ;
- **trancher** ce que l'outil signale sans écrire : fichier supprimé par l'appli et changé
  au catalogue, fichier retouché que le catalogue retire, binaire retouché, fichier de
  l'appli au chemin d'un fichier neuf du catalogue.

## Hors v1

- **Retirer une brique** d'une appli assemblée. Ses tables resteraient dans la base
  déployée : les supprimer est un geste humain (README de la brique notifications).
- **Les applis sans manifeste**, assemblées avant le 2026-11-02 : leur premier commit
  pourrait servir d'origine, s'il n'a pas été réécrit.
- **Prévenir** une appli qu'une correction l'attend : l'outil se lance à la demande, et rien
  ne tient la liste des applis assemblées (décision 7).
- **Un script de l'appli qui liste ses écarts au manifeste**, sans le catalogue : chantier
  voisin, que cet outil ne remplace pas.

## Options écartées

| Option | Pourquoi |
| --- | --- |
| Comparer l'appli aux fichiers du catalogue au commit A | Faux pour chaque fichier que l'assembleur retouche : l'origine dépend des briques retirées et de la mise en forme. |
| Prendre l'origine dans le premier commit de l'appli | Exacte une seule fois. Après une première opération, l'origine est la cible d'alors, que l'historique de l'appli ne contient pas seule : elle y est fusionnée avec les retouches de l'appli. Un historique réécrit la perd aussi. Reste une piste pour les applis sans manifeste. |
| Garder dans l'appli une copie de l'origine (un dossier `.catalogue/`) | Double les fichiers, que les recherches et Claude liraient comme du code, et qu'une retouche fausserait sans bruit. Le manifeste et le rejeu suffisent. |
| Une branche « fournisseur » dans l'appli : la sortie brute de l'assembleur, fusionnée dans `main` à chaque mise à jour, git faisant la fusion à trois | Les PR se fusionnent en squash (`solstice-livrer` §6) : le lien de fusion se perd, la base de la fusion suivante redevient le premier commit, et les écarts déjà reportés reviennent en conflit. Les migrations demanderaient de toute façon leur traitement propre. |
| Le catalogue comme remote de l'appli, puis `git merge` | Historiques sans lien ; la fusion apporterait ce que l'appli ne doit pas avoir (`outils/`, tests de l'assembleur, briques non choisies) et ignorerait les retraits. |
| Rejouer dans l'appli les commits du catalogue (`git format-patch`, puis `git am -3`) | Un commit du catalogue mêle briques gardées, briques absentes et fichiers propres au catalogue ; ses chemins et son contenu ne correspondent pas aux fichiers partagés retouchés de l'appli. |
| Copier l'outil dans l'appli | Il lui faut de toute façon le catalogue (son historique, l'assembleur du commit A), et l'appli ne reçoit pas `outils/`, par choix (`creer-appli`). |
| Fusionner `migrations.ts` comme du texte | Placerait les étapes d'une brique ajoutée au milieu de celles de l'appli, contre la règle « en fin ». |
| Laisser Claude réécrire les fichiers retouchés, sans fusion | Ni reproductible ni vérifiable. L'outil est déterministe ; Claude n'intervient que sur les conflits qu'il liste, et un humain relit. |
| Ajout et mise à jour dans la même opération | Une PR qui mêle une brique neuve et les évolutions de toutes les autres se relit mal (`CLAUDE.md` §5 : une demande, un changement). Deux opérations, deux PR. |
| Un paquet npm versionné par brique | Une brique retouche des fichiers du socle (menu, droits, registre, migrations, variables) : elle ne s'isole pas en paquet sans refondre le catalogue. |
| Continuer à prendre d'avance les briques probables | Du code et des tables sans usage en production, des traitements déclarés pour rien dans la politique, des variables et une surface d'attaque en plus. Reste possible ; ce n'est pas une réponse. |

## Découpage en tickets

Cinq tranches, un ticket chacune, vérifiables dans le catalogue avec leurs tests. Les textes
que chaque tranche rend faux changent dans sa PR, pas dans un ticket de documentation à
part. Le fichier de tests de l'outil s'ajoute à `EXCLUS_DU_CATALOGUE`, comme celui de
l'assembleur. S'il est long, il sort aussi de `npm test` : le script `"test"` de
`package.json` et le `remplace` de `RETRAITS_DU_SOCLE` qui le réécrit dans les copies
changent ensemble. Ses cas qui rejouent des migrations tournent avec Postgres, dans le job
qui lance le test de l'assembleur (`assemblage.yml`). Les tests construisent leur propre
catalogue d'essai à deux commits : la CI ne clone pas l'historique.

1. **Reproduire l'origine d'une appli et lister ses écarts** (`--a-blanc` seul). Lire le
   manifeste, déduire B, rejouer l'assembleur du commit A dans un worktree temporaire avec
   le Prettier de ce commit, comparer les empreintes, les refus en clair, la liste des
   fichiers retouchés et supprimés par l'appli. Avec le
   format 2 du manifeste (briques choisies et ajoutées d'office, nom du paquet, Dependabot,
   commit complet), l'outil lisant encore le format 1 en déduisant. Utile seul : on voit ce
   qu'une appli a retouché. Fait quand l'origine d'une appli fraîchement assemblée se
   reproduit sans écart, qu'une retouche est listée, qu'un manifeste faussé est refusé, et
   que l'origine se reproduit encore quand le catalogue a monté Prettier depuis A.
2. **Mettre à jour une appli, hors migrations.** Le rejeu au commit A', la table « Ce qu'il
   fait de chaque fichier », la fusion à trois et ses marqueurs, la branche nommée, le
   manifeste réécrit, l'en-tête de `blueprint.md`, les dépendances npm, le rapport (entrées
   des `CHANGELOG.md`, ruptures en tête, sujets des commits du socle, variables nouvelles,
   confidentialité, registre, ce que la fusion déclenche). Arrêt net si `migrations.ts` ou
   `schema.sql` diffèrent entre l'origine et la cible. Les textes qui disent la mise à jour
   « hors v1 » ou le manifeste lu par aucun outil (`creer-appli`, `choix.md`, README du
   catalogue). Fait quand un test couvre chaque ligne de la table, lecture en LF comprise,
   que `npm ci` passe dans l'appli d'essai après l'opération (après `npm install` quand le
   rapport le demande), et que le rapport d'un cas d'essai porte chaque rubrique.
3. **Les étapes de migration en fin de liste.** À part, parce que c'est la partie qui peut
   mettre une appli à terre en production. Les étapes lues par `nom`, l'ajout en fin, les
   arrêts, `schema.sql`, et un verrou au catalogue : deux étapes n'y portent pas le même
   `nom`. Fait quand l'étape neuve se trouve après celles de l'appli et que le rejeu sur une
   base de test passe.
4. **Ajouter une brique, simple ou lourde** (`--ajouter`). `planifier` sur B plus x, le
   refus d'une brique absente au commit A, les briques « à brancher » et les ajouts lourds
   en tête du rapport. Le cadrage de `creer-appli` insiste sur la base et les comptes (une
   décision à prendre maintenant, avec ce que coûterait de les ajouter plus tard), et les
   textes que l'ajout rend faux : « n'en recevra pas après coup » (`creer-appli`, étapes 1
   et 2), « pas outillé » (README de la brique notifications), et ceux qui disent l'en-tête
   de la blueprint lu pour `appli` et `commit_reference` seulement (`blueprint-modele.md`,
   le commentaire de la blueprint minimale dans `assembler.mjs`). Fait quand deux cas
   d'essai passent :
   - une appli `comptes,mails` retouchée (droits, menu, registre, politique, une étape de
     migration à elle) reçoit `journal` puis `notifications` : les fichiers d'un
     assemblage direct avec elles, aux retouches de l'appli et à l'ordre des migrations
     près, puis typecheck, tests et rejeu des migrations ;
   - une vitrine sans base, avec une page à elle, reçoit `mails,contact` puis `comptes` :
     typecheck et rejeu des migrations passent, et `tests/gardes-acces.test.ts` échoue sur
     la seule page de l'appli, nommée au rapport.
5. **Essai réel** sur une appli assemblée : un ajout, puis une mise à jour. Fait quand les
   deux PR de l'appli sont fusionnées par un humain et que `/sante` répond après le
   déploiement.

Bloquées par : 2 par 1 ; 3 par 2 ; 4 par 3 ; 5 par 4.

## Décisions prises

Par la personne qui pilote le catalogue, le 2026-11-03, sur les recommandations de cette
note :

| N° | Question | Décision |
| --- | --- | --- |
| 1 | Une appli sans base peut-elle recevoir une brique qui l'exige ? | Oui, comme ajout lourd (« Les ajouts lourds »). Un cadrage se trompe parfois : mieux vaut ne rien interdire, et le cadrage insiste pour en décider dès l'assemblage. |
| 2 | Ajouter `comptes` après coup ? | Oui, comme ajout lourd : `tests/gardes-acces.test.ts` nomme chaque page de l'appli à trancher. Le cadrage insiste de même. |
| 3 | Les PR des applis restent-elles fusionnées en squash ? | Oui : rien ne change pour qui fusionne. C'est ce qui écarte la branche fournisseur et fait rejouer l'assembleur. |
| 4 | Manifeste au format 2, versions numérotées du catalogue ? | Format 2 dans la tranche 1 ; l'outil lit encore le format 1. Les versions numérotées viendront plus tard, pour dire où se trouve une correction : l'outil n'en a pas besoin. |
| 5 | L'outil réécrit-il l'en-tête de `blueprint.md` ? | Oui, `commit_reference` et `briques_assemblees`, jamais le corps. |
| 6 | Un `CHANGELOG.md` du socle ? | Oui, au moins pour les ruptures et la sécurité, dans un ticket à part de ce chantier. |
| 7 | Une liste des applis assemblées, pour prévenir d'une correction ? | Plus tard, hors de ce chantier et hors du dépôt public. |
| 8 | L'outil écrit-il par défaut ? | Oui, sur une branche neuve d'un arbre propre, sans base et sans réseau pour l'appli ; `--a-blanc` donne le rapport seul. |

## Sources

- `outils/assembler.mjs` et `outils/modules.mjs` ; le manifeste et ses tests
  (`tests/assembleur.test.ts`).
- La skill `creer-appli` (« Hors v1 », étapes 0 et 4) et son `choix.md`.
- `src/lib/db/migrations.ts`, la skill `solstice-donnees`, `docs/cicatrices.md` (D1, D2).
- Les README et `CHANGELOG.md` des briques, dont la brique notifications (« Ce qu'elle ne
  fait pas (v1) », « Décisions prises »).
- `src/config/donnees-personnelles.ts` et `src/lib/confidentialite.ts`.
