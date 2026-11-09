# Ajouter une brique à une appli assemblée, et la tenir à jour

Note de conception, écrite avant tout code le 2026-11-03 ; ses questions ont été tranchées
le même jour (« Décisions prises »). Les quatre premières tranches sont outillées : la mise à
jour d'une appli, étapes de migration comprises, et l'ajout d'une brique (« Ce qui est
outillé »). Elle vit dans `outils/`, que
l'assembleur ne copie pas : une appli assemblée n'a ni l'outil ni ce qui le décrit.

## Le besoin

Une appli assemblée était une copie figée : ses briques se choisissaient une seule fois, à
l'assemblage (`outils/assembler.mjs`). Deux manques en découlaient :

1. **Ajouter ensuite une brique non choisie** n'était pas outillé avant la tranche 4 (README
   de la brique notifications, « Ce qu'elle ne fait pas (v1) » ; étape 2 de la skill
   `creer-appli` pour la base, qu'une appli « n'en recevra pas après coup »). La parade :
   prendre d'avance les briques probables, avec leur code, leurs tables et leurs traitements
   déclarés, sans usage.
2. **Les corrections et évolutions d'une brique** n'arrivaient dans l'appli, avant la
   tranche 2, que si quelqu'un lisait les `CHANGELOG.md` et les reportait à la main. Une
   correction de sécurité pouvait ne jamais arriver.

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
- **Mettre à jour** : A' = le commit visé du catalogue, B' = B pour les briques choisies,
  plus ce que l'assembleur du commit A' y ajoute d'office.

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
fichiers venus du catalogue : ni `NOTICE`, ni `ADAPTATIONS.md`, ni `blueprint.md`, que
l'assembleur écrit lui-même, n'y ont d'empreinte. L'origine de `NOTICE` n'est donc pas prouvée ; elle ne
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
| `catalogue.empreintes.json` de l'appli | Le commit A (`catalogue.commit`, et `catalogue.commitComplet` au format 2) ; au format 2, les réglages de l'assemblage (`assemblage`, « Ce qui est outillé ») ; au format 1, des réglages déduits : les briques B, valeurs d'`unite` qui sont des clés de `BRIQUES` d'`outils/modules.mjs` au commit A, ni `socle`, ni `donnees` (que `planifier` refuse dans `--briques`), ni les unités partagées `patron-dossiers` et `adresse-ip` (chaque brique a au moins son dossier, donc une entrée) ; Dependabot, par la présence de `.github/dependabot.yml` ; l'empreinte de chaque fichier venu du catalogue, hors `NOTICE`, `ADAPTATIONS.md` et `blueprint.md`. |
| `package.json` de l'appli | Au format 1, le nom du paquet, que l'assembleur y a reporté. Un nom changé depuis se voit à la vérification des empreintes (`package.json` et le verrou le portent). |
| `blueprint.md` de l'appli | `commit_reference`, recoupé avec le manifeste ; un désaccord se signale. Au format 1, son en-tête, que l'assembleur rejoué relit (`appli`, nom affiché, description, site, entrée, rôle par défaut, méthodes de connexion, personnes par réseau), sauf la blueprint minimale qu'il écrit sans `--blueprint`. |
| `PROJET.md` de l'appli (avec `--ajouter`) | Les briques ajoutées que la fiche écarte, avec leur raison, recopiées au rapport (« Ce qui est outillé », puce « L'ajout ») ; le reste de la fiche n'est jamais lu. |
| `ADAPTATIONS.md` de l'appli | La note qui couvre chaque fichier fusionné ou en conflit, et sa nature, citées au rapport (« Ce qu'il fait de chaque fichier ») ; lu comme la garde le lit, jamais écrit. |
| L'appli, à son `HEAD` | Le contenu de chaque fichier tel que git l'enregistre, comme le manifeste, pas le disque. L'arbre doit être propre. |
| Le catalogue, aux commits A et A' | L'assembleur et `modules.mjs` de chacun, rejoués dans un worktree temporaire (`git worktree add --detach`). `planifier` du commit A' valide B' (`exige`, `entraine`). |
| Les `CHANGELOG.md` des briques de B', entre A et A' | Les entrées ajoutées en fin de fichier (règle d'entretien des briques), recopiées au rapport. Une « Rupture » vient en tête : un appelant de l'appli doit changer. |
| L'historique du catalogue, de A à A' | Le sujet des commits qui touchent un fichier du socle que le report change : le socle n'a pas de `CHANGELOG.md` (décision 6). |
| L'historique du catalogue, de A à `origin/main` (avec `--ajouter`, où A' = A) | Les commits, fusions exclues, qui touchent le dossier de chaque brique reçue, et le nombre total : le retard de l'appli, dit en tête du rapport. |

Refus en clair, motif et geste à faire, sur le modèle de l'assembleur :

- visant son `HEAD`, le catalogue a des modifications non commitées, ou son `HEAD` n'est
  pas `origin/main` (même vérification que l'étape 0 de `creer-appli`) ; un `--vers` hors
  d'`origin/main` ;
- l'appli n'a pas de manifeste, ou son commit porte `+arbre-modifie` : l'origine ne se
  rejoue pas ;
- le commit A est absent du catalogue (appli assemblée avant le dépôt public), ou n'est pas
  un ancêtre d'`origin/main` du catalogue : le rejeu importe l'assembleur de ce commit et
  installe son verrou, donc exécute son code, et seul ce que main a reçu a été relu (audit
  du 2026-11-09 : un manifeste retouché, ou la PR d'un fork fetchée dans le catalogue, y
  aurait fait exécuter du code arbitraire). `adaptations.mjs --rejouer` passe par le même
  contrôle et le dit en avertissement ;
- l'arbre de l'appli n'est pas propre, ou, sauf à blanc, son `HEAD` n'est pas son
  `origin/main` à jour (`solstice-livrer` §1 : une branche part de là) ;
- une brique de B est inconnue au commit A' (renommée ou retirée du catalogue) ;
- le Prettier du commit A ou A' ne s'installe pas dans le worktree ;
- l'origine rejouée ne redonne pas les empreintes du manifeste ;
- un fichier neuf de la cible a le chemin d'un fichier de l'appli : le manifeste réécrit
  donnerait ce fichier pour venu du catalogue, et l'opération suivante le fusionnerait avec
  celui du catalogue. L'appli renomme le sien d'abord.

## Ce qu'il fait de chaque fichier

Les fichiers que l'appli a créés, absents de l'origine comme de la cible, ne sont jamais
lus ni touchés. `PROJET.md` est à l'appli, jamais écrit (un ajout n'y lit que les briques
écartées, plus bas) ; `blueprint.md` aussi, hors deux champs de son en-tête (plus bas).
`ADAPTATIONS.md` aussi, hors de la table : jamais réécrit ni supprimé. À son arrivée (la
cible le donne, l'origine non : appli assemblée avant le 2026-11-05), l'appli qui ne l'a pas,
à la casse près, le reçoit avec l'en-tête de la cible, listé « ajouté » ; celle qui l'avait
reçu et l'a supprimé le reste. Celui qu'une appli d'avant son arrivée a écrit à la main, le
rappel de la garde l'y poussant, reste tel quel : par la table, il aurait fait refuser le
report (un fichier neuf de la cible au chemin d'un fichier de l'appli).
Pour les autres :

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

**Ce que l'assembleur a cessé de livrer** : la vitrine du kit (`/kit`) et les écrans du patron
`dossiers` (`src/app/dossiers/`), que l'essai tours-de-coloc a dû retirer lui-même le 2026-11-05.
Une appli assemblée avant ce changement suit la ligne « présent, puis absent » de la table : ses
fichiers intacts sont supprimés, ceux qu'elle a retouchés (le patron copié en premier module)
sont gardés et signalés. L'entrée « Dossiers » de son menu part de `src/lib/navigation.ts` par
la fusion à trois, ou crée un conflit si l'appli a retouché la ligne.

La couche données du patron a suivi le 2026-11-09, pour une appli neuve seulement :
`src/lib/db/dossiers.ts`, `src/lib/dossiers-domaine.ts`, `scripts/exemple-import.ts`, la table
`dossiers` de `schema.sql` et son étape « dossiers : champ notes », `ACTIONS_DOSSIERS` et le droit
`dossiers.acceder` de `src/config/acces.ts`, sa ligne du registre RGPD, `slugDossier` et
`cheminDossier` de `src/lib/slug.ts`, et `tests/journal-dossiers.test.ts` (unité `patron-donnees`
d'`outils/modules.mjs`). Le cas : l'appli materiotheque gardait une table vide et un droit sans
écran, que sa blueprint devait citer. **Une appli qui l'a reçue la garde** : la mise à jour n'y
touche pas. Son manifeste porte `src/lib/db/dossiers.ts` ; l'outil rejoue alors l'origine et la
cible avec l'option `patronDonnees` de l'assembleur, qui la garde comme avant. Sans elle, la
cible perdrait l'étape de la table, que les bases de l'appli ont jouée (arrêt, « Les
migrations »), `schema.sql` changerait (arrêt aussi), et les fichiers intacts seraient supprimés
par la table ci-dessus. La retirer d'une appli en ligne serait une étape de migration : la
supprimer à la mise à jour casserait le rejeu chez une appli qui a déjà supprimé sa table, ou qui
l'a renommée en premier module. Si l'appli n'en veut plus, c'est un ticket chez elle, sa propre
étape en fin de `MIGRATIONS` comprise.

`NOTICE` suit la même table, sans empreinte au manifeste : l'appli est jugée intacte si
elle égale l'origine rejouée. Ont un traitement propre, dit dans les sections suivantes :
`src/lib/db/migrations.ts`, `src/lib/db/schema.sql`, `package-lock.json`,
`catalogue.empreintes.json` et l'en-tête de `blueprint.md` ; `ADAPTATIONS.md`, ci-dessus.

Un conflit ne se tranche pas dans l'outil : les marqueurs restent, et la session ouverte
dans l'appli les résout (« Le circuit »). `git diff --check` les attrape dans tout fichier,
typecheck et build dans le code. Une fusion « sans conflit » peut être fausse sur le fond
(deux changements compatibles en texte, pas en logique) : elle est listée pour relecture,
pas donnée pour sûre.

Chaque fichier fusionné ou en conflit, `migrations.ts` compris, a été retouché par l'appli :
le rapport cite la note d'`ADAPTATIONS.md` qui le couvre (la plus récente, lue comme la garde
la lit), avec sa nature, ou dit « sans note » ; une appli sans `ADAPTATIONS.md` (assemblée
avant lui) le voit dit une fois. Pour un « défaut du catalogue », il ajoute que la cible
corrige peut-être ce défaut : comparer, et prendre la cible si elle suffit. Il dit aussi quand
l'appli avait déjà la version de la cible, ou quand les deux ne diffèrent que par des
commentaires (lignes de commentaire entières et lignes vides, dans un fichier JavaScript ou
TypeScript, `//` et `/* */`, ou CSS, `/* */` seul ; ailleurs, l'outil ne juge pas ; un retrait
changé compte, et une ligne de gabarit multiligne qui ressemble à un commentaire passe pour
un : le rapport conseille de comparer, il ne tranche pas). Le cas du 2026-11-06 :
materiotheque avait corrigé chez elle le test des gardes, noté « défaut du catalogue » ; le
catalogue a corrigé le même défaut, et le report a listé le fichier « en conflit » pour une
ligne de commentaire, sans rien dire de la note. Un fichier repris tel que la cible le donne
revient au catalogue : la session le note dans `ADAPTATIONS.md`, une entrée de plus en bas
qui le cite sur sa ligne « Fichiers » (« Nature : retour au catalogue », avec le commit A'),
comme l'en-tête du fichier le prévoit ; l'entrée d'origine reste. La garde lit cette nature
comme les deux autres. L'outil n'écrit jamais dans `ADAPTATIONS.md`.

## Les fichiers partagés du socle

À l'assemblage, `outils/modules.mjs` retouche des fichiers du socle et des briques gardées
selon les briques absentes : `migrations.ts`, `.env.example`, `render.yaml`,
`src/lib/confidentialite.ts`, `src/config/donnees-personnelles.ts`, `src/config/acces.ts`,
`src/config/effets-comptes.ts`,
`src/lib/navigation.ts`, `src/proxy.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`,
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
  dès que l'appli a touché ces lignes. Une mise à jour, elle, ne rejoue de retrait à
  l'envers que pour une brique que l'assembleur du commit A' ajoute d'office : les briques
  choisies ne changent pas ;
- l'écart vaut pour les fichiers du catalogue, pas pour les modules que l'appli a écrits en
  copiant le patron `dossiers`. Ajouter `journal` remet la trace dans
  `src/lib/db/dossiers.ts` d'une appli qui l'a reçu, pas dans les modules de l'appli : les y
  brancher est un ticket de l'appli.

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
  fusionné ne se retouche plus. Absent de l'origine, il arrive avec la base : ajouté ;
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

- les **traitements** ajoutés (`CONFIDENTIALITE.choix`), dont les choix sont à faire valider
  par le client ;
- les **durées de conservation** nouvelles (`CONFIDENTIALITE.durees`) : la brique en propose
  une valeur, à valider avec le client (`dureesRevues`), que le projet ne surcharge que si
  elle diffère ;
- les **sous-traitants** nouveaux (`CONFIDENTIALITE.lieux`) : leur lieu de traitement, que le
  code ne situe pas, est à remplir ; un sous-traitant que le code situe (`LIEUX_*` de la
  brique) ou dont l'appli a déjà rempli le lieu n'est pas listé ;
- les traitements dont le texte a changé entre A et A' (`src/briques/*/confidentialite.ts`) :
  la politique publiée change, elle est à relire avec le client. Un fichier absent de A
  n'en fait pas partie : il arrive entier, il n'est qu'ajouté ;
- la date de mise à jour de la politique (`miseAJour`), à changer avec l'un ou l'autre ;
- une durée réglée dans un branchement (`conservationMois` de la brique notifications), qui
  doit redire la durée annoncée.

Le registre des traitements du client lui-même, hors du code, est à tenir par lui : le
rapport le rappelle dès qu'un traitement est ajouté.

L'outil sépare les trois par la **forme** de l'entrée, pas par sa clé : une entrée `cle` suivie
de `titre` est un traitement, de `donnee` une durée, de `nom` un sous-traitant. Au premier
report réel (2026-11-05), toute clé neuve était prise pour un traitement : sept des neuf
clés à remplir dans les choix étaient six durées et un sous-traitant. Une entrée que
`methodes.includes("x") ? [NOM]` conditionne n'est pas lue si `x` n'est pas dans `METHODES`
de l'appli (`src/config/comptes.ts`) : la page ne l'affiche pas, ses durées et ses
sous-traitants non plus. Si `METHODES` ne se lit pas, rien n'est écarté : mieux vaut un traitement de trop à regarder qu'un oublié.
Une entrée dont la forme n'est pas reconnue (un `cle` suivi d'autre chose que `titre`,
`donnee` ou `nom`, ou dont la valeur n'est pas un texte) n'est jamais ignorée : le rapport la
liste « à vérifier à la main ». Ce repérage lit le
texte des fichiers, il ne les exécute pas : la page `/confidentialite` reste le contrôle (elle signale tout champ vide).

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
  Au format 1, les briques déduites des unités sont ramenées aux choisies avant le rejeu
  de A' (celles qu'une autre brique entraîne d'office au commit A' en sont retirées) :
  `rgpd`, venue avec `comptes`, passe en `ajouteesDOffice` au lieu de `briques` (le cas
  du 2026-11-05, appli d'essai de colocation), et le rapport le dit. Limite : une brique
  demandée ET entraînée se lit comme d'office, le format 1 ne les distinguant pas ; une
  appli déjà au format 2 n'est jamais recalculée.
- `blueprint.md` : `commit_reference` devient A', comme l'écrit l'assembleur, et
  `briques_assemblees` reçoit les briques ajoutées (décision 5). Le reste est à l'appli :
  chaque brique arrivée s'y note, dans la session de l'appli, par sa ligne dans `briques`
  de l'en-tête et sa ligne en section 3 ; une brique « à brancher » a en plus son ticket,
  repris en section 9 (`blueprint-modele.md` de `creer-appli`).
- Au format 2, l'en-tête noté au manifeste est **figé à l'assemblage** : une clé ajoutée à `blueprint.md`
  après coup ne se rejoue pas, et l'outil le dit dans le rapport quand le catalogue visé
  lit un champ que cet en-tête n'a pas (« Les variables et l'en-tête dans le rapport »).

## Les variables et l'en-tête dans le rapport

Deux constats du 2026-11-05, sur l'appli d'essai tours-de-coloc, au report vers un commit
plus récent.

- **Les variables.** Le rapport demandait toutes les variables nouvelles « si l'appli en a
  besoin » : `MICROSOFT_*` alors que `METHODES` ne proposait pas Microsoft,
  `NOTIFICATIONS_SECRET` pour une brique pas encore branchée, la vérification restant au
  lecteur. L'outil trie maintenant. Une variable `GOOGLE_*` ou `MICROSOFT_*` se demande
  quand la méthode est dans `METHODES` (celui de `src/config/comptes.ts` de l'appli, à
  défaut celui de la cible) ; sinon le rapport la met de côté, avec le fichier où la
  méthode se déclare. Une variable d'une brique à brancher est mise de côté de même : rien
  à déclarer avant son branchement. Sa brique est celle de la section `# Brique x` de
  `.env.example` ; « à brancher » veut dire, pour une brique que l'ajout apporte, que la
  section « La brancher » de son README commence par « Tout se déclare côté appli » (une
  brique branchée sur le patron `dossiers` arrive en service : ses variables se
  déclarent) ; pour toute autre, que `blueprint.md` de l'appli la note
  `branchement: à brancher`. Une variable que rien ne rattache à une méthode ou à une
  brique se demande toujours. L'outil ne déclare rien à la place de l'appli.
- **L'en-tête.** Au format 2, l'outil rejoue l'en-tête noté au manifeste, figé à
  l'assemblage, et ne rejoue pas un en-tête modifié après coup : choix de conception, le
  rejeu doit redonner les empreintes (au format 1, qui ne note pas l'en-tête, il relit
  celui de `blueprint.md` à son HEAD). Une clé ajoutée à `blueprint.md` après l'assemblage, comme
  `personnes_par_reseau` (née le 2026-11-05), n'a donc aucun effet sur les opérations
  suivantes ; sa valeur se règle dans le fichier de l'appli, comme une retouche
  (`src/config/comptes.ts` pour `LIMITES_PAR_RESEAU`, `METHODES` et `ENTREE`,
  `src/config/acces.ts` pour `ROLE_PAR_DEFAUT`). Le rapport le dit : quand l'assembleur du
  commit visé lit un réglage d'entrée (`entree`, `role_par_defaut`, `methodes`,
  `personnes_par_reseau`, d'après `CHAMPS_DE_L_ENTETE_LUS` de son `outils/assembler.mjs`)
  que l'assembleur du commit d'origine ne lisait pas et que l'en-tête rejoué n'a pas (la personne le lit une fois, au report qui l'introduit), la rubrique « En-tête de la blueprint » nomme le champ, le
  défaut que le catalogue laisse dans le fichier et le fichier à retoucher. Rien à dire
  pour une appli sans `comptes`, ni au format 1 du manifeste, qui ne note pas l'en-tête.
  À tenir à jour : la table champ, fichier, défaut de l'outil (`REGLAGES_DE_L_ENTETE` de
  `outils/mettre-a-jour.mjs`) se complète à chaque nouveau champ de réglage ajouté à
  `CHAMPS_DE_L_ENTETE_LUS`, sans quoi le rapport ne le dit pas. Un test lit cette constante
  dans le texte de l'assembleur, qui ne l'exporte pas, et la compare à ce que l'assembleur
  note au manifeste : si sa forme change, il casse au lieu de laisser le rapport muet.

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
  reprend (l'accueil passe derrière la connexion), et il faut un premier admin, `AUTH_SECRET` et l'envoi des
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
   node outils/mettre-a-jour.mjs <dossier-de-l-appli> [--branche <type>/<slug>] [--ajouter <briques>] [--vers <commit>] [--a-blanc]
   ```

   Sans `--ajouter`, l'outil met à jour vers `--vers`, par défaut le `HEAD` du
   catalogue. Avec `--ajouter`, il ajoute au commit de l'appli (A' = A) : une opération à
   la fois (« Options écartées »). Une brique qui n'existe pas au commit A se refuse :
   mettre à jour d'abord. Une brique qui existe à A mais a changé depuis arrive telle
   qu'elle était à A : le rapport l'avertit en tête (retard de l'appli, commits de la brique,
   commande `--vers` à lancer d'abord), sans refuser. La personne choisit l'ordre : mettre à
   jour puis ajouter, ou ajouter tout de suite et se rattraper à la mise à jour suivante.
   Le rapport avertit aussi, en tête, quand la ligne ou la rubrique « Écartées » de `PROJET.md`
   nomme une brique ajoutée : il recopie la raison, que la personne relit avant de fusionner.
   Il nomme enfin, dans une appli qui a déjà `espaces`, les tables arrivées sans `espace_id`,
   que le verrou d'isolation ne voit pas : à isoler par le branchement, ou à déclarer hors espace en connaissance de cause.
   `--a-blanc` donne le rapport et n'écrit rien. Sinon l'outil crée
   la branche nommée (par défaut `feature/reporter-catalogue-<A'>`, ou
   `feature/ajouter-<briques>`), y écrit, **ne commite
   pas** et imprime le rapport en Markdown, pour le corps de la PR ; il l'écrit aussi dans
   le dossier git du worktree (`git rev-parse --git-path catalogue-mise-a-jour.md`), hors
   de l'arbre suivi : il ne part pas au prochain `git add`. Il ne touche ni `main`, ni le
   remote, ni aucune base, ni aucun `.env*`.
3. **Dans une session ouverte dans ce worktree de l'appli**, avec `solstice-livrer` : la
   résolution des conflits listés (un fichier noté « défaut du catalogue » se compare
   d'abord à la cible ; repris tel quel, son retour se note dans `ADAPTATIONS.md`),
   `npm install` si le verrou est à régénérer, les
   vérifications du `CLAUDE.md` de l'appli (§6), la relecture par sous-agents
   (`relecteur-migrations` dès qu'une étape est ajoutée), le commit, la PR avec le rapport.

**Les adaptations, à chaque mise à jour** (« Ce qui est outillé ») : avant l'étape 2, sur le
même `HEAD` de l'appli, `node outils/adaptations.mjs <dossier-de-l-appli>`. Avant le report,
l'origine de chaque fichier est encore dans l'historique de l'appli : le diff est exact. Après un
report fusionné, celle des fichiers fusionnés n'y est plus : `--rejouer` la redonne. D'après
la liste, la session rédige les **brouillons de tickets du catalogue**, un par défaut et non un
par fichier (les onze fichiers de `/kit` et du patron retirés font un ticket), chacun avec le
cas réel daté et le diff qui le montre, et les remet à la personne qui pilote, qui les crée.
Une adaptation « propre à l'appli » n'en donne pas. Une adaptation « sans note » se note d'abord
dans l'appli, avec la personne qui l'a faite.

Restent à un humain :

- **fusionner** la PR de l'appli, en sachant ce que la fusion déclenche : déploiement, étapes
  de migration rejouées en production ;
- **déclarer chez l'hébergeur** les variables nouvelles que le rapport liste, lues dans
  l'écart de `.env.example` et de `render.yaml` (« Les variables et l'en-tête dans le
  rapport » : il met de côté celles d'une méthode absente de `METHODES` et d'une brique à
  brancher), et les comptes et secrets d'une brique ajoutée (le
  secret et la tâche planifiée de `notifications`, le compte Resend de `mails`) ;
- **faire valider par le client** les choix de confidentialité d'un traitement ajouté ou
  changé, les durées et les lieux de sous-traitants nouveaux ;
- **valider le rendu** d'un écran changé : Claude ne lance ni serveur ni navigateur
  (`CLAUDE.md` §6) ;
- **choisir la valeur du client** pour un token de thème que le catalogue ajoute :
  `tokens.css` est le contrat de thème, retouché dans toute appli thématisée ;
- **trancher** ce que l'outil signale sans écrire : fichier supprimé par l'appli et changé
  au catalogue, fichier retouché que le catalogue retire, binaire retouché. Un fichier de
  l'appli au chemin d'un fichier neuf du catalogue arrête l'outil avant toute écriture :
  l'appli renomme le sien d'abord.

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
| Refuser `--ajouter` tant que l'appli est en retard sur `origin/main` (enchaîner les deux est écarté plus haut) | Une mise à jour peut être lourde (ruptures, conflits, migrations) et attendre son propre ticket, quand l'ajout est urgent. L'ajout au commit A reste juste, et se rattrape à la mise à jour suivante : le rapport avertit du retard et laisse choisir l'ordre. |
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

1. **Reproduire l'origine d'une appli et lister ses écarts** (la fonction `examiner`, alors
   exposée par `--a-blanc` seul). Lire le
   manifeste, déduire B, rejouer l'assembleur du commit A dans un worktree temporaire avec
   le Prettier de ce commit, comparer les empreintes, les refus en clair, la liste des
   fichiers retouchés et supprimés par l'appli. Avec le
   format 2 du manifeste (briques choisies et ajoutées d'office, nom du paquet, Dependabot,
   commit complet), l'outil lisant encore le format 1 en déduisant. Utile seul : on voit ce
   qu'une appli a retouché. Fait quand l'origine d'une appli fraîchement assemblée se
   reproduit sans écart, qu'une retouche est listée, qu'un manifeste faussé est refusé, et
   que l'origine se reproduit encore quand le catalogue a monté Prettier depuis A. Outillée
   (« Ce qui est outillé »).
2. **Mettre à jour une appli, hors migrations.** Le rejeu au commit A', la table « Ce qu'il
   fait de chaque fichier », la fusion à trois et ses marqueurs, la branche nommée, le
   manifeste réécrit, l'en-tête de `blueprint.md`, les dépendances npm, le rapport (entrées
   des `CHANGELOG.md`, ruptures en tête, sujets des commits du socle, variables nouvelles,
   confidentialité, registre, ce que la fusion déclenche). Arrêt net si `migrations.ts` ou
   `schema.sql` diffèrent entre l'origine et la cible (levé par la tranche 3 pour
   `migrations.ts`). Les refus que la tranche 1 laisse
   (« Ce qui est outillé »). Les textes qui disent la mise à jour « hors v1 »
   (`creer-appli`, `choix.md`, README du catalogue). Fait quand un test couvre chaque ligne de la table, lecture en LF comprise,
   que `npm ci` passe dans l'appli d'essai après l'opération (après `npm install` quand le
   rapport le demande), et que le rapport d'un cas d'essai porte chaque rubrique. Outillée
   (« Ce qui est outillé »).
3. **Les étapes de migration en fin de liste.** À part, parce que c'est la partie qui peut
   mettre une appli à terre en production. Les étapes lues par `nom`, l'ajout en fin, les
   arrêts, `schema.sql`, et un verrou au catalogue : deux étapes n'y portent pas le même
   `nom`. Fait quand l'étape neuve se trouve après celles de l'appli et que le rejeu sur une
   base de test passe. Outillée (« Ce qui est outillé »).
4. **Ajouter une brique, simple ou lourde** (`--ajouter`). `planifier` sur B plus x, le
   refus d'une brique absente au commit A, les briques « à brancher » et les ajouts lourds
   en tête du rapport, avec, de même, les briques que la fiche projet écarte et les tables
   sans `espace_id` d'une appli avec `espaces`. Le cadrage de `creer-appli` insiste sur la base et les comptes (une
   décision à prendre maintenant, avec ce que coûterait de les ajouter plus tard), et les
   textes que l'ajout rend faux : « n'en recevra pas après coup » (`creer-appli`, étapes 1
   et 2), « pas outillé » (README de la brique notifications), et ceux qui disent l'en-tête
   de la blueprint lu pour `appli`, `profil`, `nom_affiche`, `description`, `site`, `entree`, `role_par_defaut`, `methodes`, `personnes_par_reseau` et `commit_reference` seulement (`blueprint-modele.md`,
   le commentaire de la blueprint minimale dans `assembler.mjs`). Fait quand deux cas
   d'essai passent :
   - une appli `comptes,mails` retouchée (droits, menu, registre, politique, une étape de
     migration à elle) reçoit `journal` puis `notifications` : les fichiers d'un
     assemblage direct avec elles, aux retouches de l'appli et à l'ordre des migrations
     près, puis typecheck, tests et rejeu des migrations ;
   - une vitrine sans base, avec une page à elle, reçoit `mails,contact` puis `comptes` :
     typecheck et rejeu des migrations passent, et `tests/gardes-acces.test.ts` échoue sur
     la seule page de l'appli, nommée au rapport.

   Outillée (« Ce qui est outillé »).
5. **Essai réel** sur une appli assemblée : un ajout, puis une mise à jour. Fait quand les
   deux PR de l'appli sont fusionnées par un humain et que `/sante` répond après le
   déploiement.

Bloquées par : 2 par 1 ; 3 par 2 ; 4 par 3 ; 5 par 4.

## Ce qui est outillé

La tranche 1, le 2026-11-03 : retrouver l'origine d'une appli (la fonction `examiner` de
l'outil, première étape de toute opération). La tranche 2, le 2026-11-04 : la mise à jour,
`node outils/mettre-a-jour.mjs <appli> [--vers <commit>] [--branche <nom>] [--a-blanc]`,
depuis le catalogue (« Le circuit »). La tranche 3, le 2026-11-04 : les étapes de
migration, en fin de liste (« Les migrations »). La tranche 4, le 2026-11-04 : l'ajout
d'une brique, `--ajouter <briques>` à la place de `--vers` (« Le principe », « Les ajouts
lourds »). Le 2026-11-05, à l'essai réel de la tranche 5, un ajout a donné une brique
d'un commit en retard sans le dire : le rapport d'un ajout avertit désormais du retard de
l'appli sur `origin/main` (puce « L'ajout » ci-dessous).

- **Le manifeste au format 2** (décision 4), écrit par l'assembleur :
  `catalogue.commitComplet` à côté du commit court, et `assemblage` : `briques` (les
  choisies, celles du profil de l'en-tête comprises ; le profil lui-même n'est pas noté, et
  l'outil n'a pas besoin des profils pour rejouer), `ajouteesDOffice` (`{ nom, par }`), `paquet`, `nom` (le `--nom` donné, sinon
  `null`), `dependabot`, `entete` (les champs de l'en-tête de la blueprint que l'assembleur
  lit, hors `profil`, recopiés tels quels, guillemets compris ; `null` sans blueprint). `nom` et `entete`
  s'ajoutent à la liste de la décision : sans eux, l'assemblage ne se rejoue pas à
  l'identique, car le nom donné nomme le service de `render.yaml` et l'en-tête remplit
  `navigation.ts`, `referencement.ts`, `mentions-legales.ts` et la configuration de
  `comptes`. L'outil rejoue l'en-tête par une blueprint qui n'a que ces champs.
- **Le format 1, déduit** : les briques des unités (pour la cible, ramenées aux choisies :
  « Le manifeste et la blueprint après l'opération »), le paquet par `package.json`, Dependabot
  par son fichier, la blueprint de l'appli à son `HEAD`, sans le `profil:` de son en-tête
  (ses briques sont déjà dans les unités), avec le paquet à `--nom` (il redonne
  le paquet et le nom du service de `render.yaml`). La blueprint minimale que l'assembleur
  écrit sans `--blueprint` ne se redonne pas : elle remplirait l'hébergeur et l'entrée.
  L'assemblage se rejoue dans un dossier nommé comme le paquet, d'où l'assembleur le tire
  sans nom donné. Ne se rejouent pas ainsi, et l'écart des empreintes le dit : un en-tête
  changé depuis ; avec la brique `deploiement`, une blueprint sans `appli` ni `--nom`, ou
  `--nom` sans blueprint.
- **Le rejeu** : l'assembleur du commit A, puis celui du commit A' pour la cible, chacun
  dans son worktree temporaire, est appelé par sa fonction `assembler`, dans un
  Node à part, et non par sa ligne de commande, qui refuse un catalogue dont l'arbre n'est
  pas propre : la jonction vers `node_modules` en est une modification pour git (le motif
  `node_modules/` ne vise pas un lien). Le `npm ci` du Prettier se fait sans les scripts
  d'installation. Les worktrees temporaires sont retirés à la fin, refus compris.
- **La comparaison** : le manifeste que l'assembleur rejoué écrit, contre celui de l'appli,
  unité et empreinte de chaque fichier ; `NOTICE` contre l'origine rejouée.
- **Les refus outillés** : dossier qui n'est pas la racine d'un dépôt git, arbre pas
  propre, manifeste absent, illisible ou d'un format inconnu, `+arbre-modifie`, commit A
  absent du catalogue ou hors d'`origin/main`, worktree temporaire impossible à créer, verrou du commit A (ou A')
  sans Prettier, Prettier du commit A (ou A') qui ne s'installe pas, assembleur du commit A
  (ou A') qui refuse,
  au format 1 une unité inconnue au commit A ou un `package.json` sans nom de paquet,
  empreintes qui ne se retrouvent pas.
  Le désaccord de `commit_reference` se signale.
- **La cible** (tranche 2) : l'assembleur du commit A' rejoué de même, avec les réglages
  de l'origine, puis la table « Ce qu'il fait de chaque fichier », `NOTICE` compris. Un
  fichier est binaire, à la façon de git, s'il porte un octet nul dans ses 8 000 premiers.
  La fusion à trois est celle de `git merge-file`, au style diff3 : un conflit montre aussi
  l'origine, que l'appli n'a nulle part ailleurs. Le manifeste écrit est celui de la cible ;
  l'en-tête de `blueprint.md` reçoit `commit_reference` et, si des briques arrivent,
  `briques_assemblees`.
- **Le rapport** : les fichiers par sort, chaque fichier fusionné ou en conflit avec la note
  d'`ADAPTATIONS.md` qui le couvre et ce qui le sépare de la cible (« Ce qu'il fait de
  chaque fichier »), ceux que l'appli a retouchés ou supprimés et que
  le catalogue ne change pas, les dépendances npm, les entrées neuves des `CHANGELOG.md`
  des briques reçues (les sections « ## » de la cible absentes de l'origine, ruptures en
  tête : un titre dont le dernier segment commence par « Rupture »), les sujets des
  commits de A à A' qui touchent un fichier du socle que le report change (un fichier que
  l'assembleur rend identique, comme le script de test de `package.json`, n'en fait pas
  venir), les variables nouvelles de `.env.example` et `render.yaml` (triées), les champs
  d'en-tête que l'assembleur visé lit, que l'origine ne lisait pas et que l'en-tête rejoué n'a pas (voir « Les variables
  et l'en-tête dans le rapport »), les traitements ajoutés, les durées de conservation et les
  sous-traitants nouveaux (repérés par la forme des entrées des `confidentialite.ts` de brique)
  et les fichiers dont le texte change, le registre RGPD, ce que la fusion
  déclenche, le manifeste et la blueprint réécrits avec les avertissements, la suite. À blanc, une appli déjà au commit visé reçoit le rapport, sans
  aucun fichier à reporter : il dit ce qu'elle a retouché, l'usage seul de la tranche 1.
- **Les refus de la tranche 2**, avant toute écriture : le catalogue sans `origin/main`, ou un commit A de l'appli qui n'en est pas un ancêtre (le code de ce commit est exécuté par le rejeu) ;
  visant son `HEAD`, le catalogue aux modifications non commitées ou dont le `HEAD` n'est
  pas `origin/main` ; `--vers` introuvable ou hors d'`origin/main` ; un commit visé qui ne
  descend pas de celui de l'appli ; sauf à blanc, l'appli déjà au commit visé, une appli
  sans `origin/main` ou dont le `HEAD` n'est pas lui (l'outil ne fait pas de `fetch`), un
  nom de branche que git refuse ou qui existe ; une brique de l'appli inconnue au commit
  A' ; un fichier neuf de la cible au chemin d'un fichier de l'appli, à la casse près (un
  disque Windows ou macOS ne les distingue pas), ou au chemin d'un de ses dossiers, ou
  sous un de ses fichiers. Une écriture qui échoue en route (un fichier verrouillé) le dit,
  avec le geste pour revenir au `main` de l'appli.
- **Les migrations** (tranche 3) : les étapes de `MIGRATIONS` se lisent dans l'arbre
  syntaxique du fichier, par le parseur de TypeScript qu'a installé le catalogue, sans
  exécuter le fichier : une expression régulière se tromperait sur une accolade ou une
  virgule d'un SQL ou d'un commentaire, et importer le module ferait tourner du code de
  l'appli dans l'outil. Une étape est un objet écrit dans la liste, son `nom` une chaîne
  en clair, et d'un seul tenant : elle ne lit aucune valeur déclarée ou importée hors de
  la liste, sans quoi ce qu'elle joue changerait avec cette valeur sans que son texte
  change. Son texte va de la ligne de son premier commentaire à son accolade fermante, et
  son code est ce texte sans commentaires ni mise en page, qui dit si elle a changé
  autrement. Les étapes ajoutées gardent leur texte de la cible. Le reste du fichier passe
  par la fusion à trois, la liste réduite à une marque dans les trois versions. Absent de
  l'origine (la base arrive), le fichier passe par la table, ajouté. Le rapport a sa
  rubrique « Migrations » : les étapes ajoutées, dont celles que la cible place avant une
  étape que l'appli a déjà (une brique ajoutée d'office), mises en fin et signalées ;
  celles dont seuls le commentaire ou la mise en page ont changé ; celles que l'appli a
  changées, laissées telles quelles ; un reste du fichier qui change ; ce que la fusion
  déclenche (rejeu au démarrage suivant, qu'un *Revert* ne défait pas) ;
  `tests/migrations.test.ts` et `relecteur-migrations` dans la suite. Les arrêts, avant
  toute écriture, chacun avec son geste, ceux qui comparent les étapes dits d'un coup :
  une étape de l'origine dont le code change dans la cible ou qui en disparaît, des
  étapes de l'origine dans un autre ordre, une étape de l'origine qui manque à l'appli, le
  nom d'une étape à ajouter qui existe déjà dans l'appli ; et, chacun seul, deux étapes
  du même nom dans une version, une liste illisible (fichier qui ne se lit pas, pas de
  `MIGRATIONS` écrit en liste, étape qui n'est pas un objet, dont le nom n'est pas en
  clair ou qui lit une valeur du dehors), `migrations.ts` supprimé par l'appli ou retiré
  par le catalogue, une fusion du reste du fichier dont les conflits touchent la liste,
  et `schema.sql` qui change de l'origine à la cible (un `schema.sql` qui arrive avec la
  base est ajouté). Le verrou du catalogue,
  `tests/mettre-a-jour-migrations.test.ts`, lit `migrations.ts` comme l'outil : il échoue
  si deux étapes portent le même nom, si une étape ne se lit pas, ou s'il n'en lit
  aucune, et compare les noms lus à ceux du tableau chargé. Ce fichier, sans assemblage ni base, tourne avec `npm test` ;
  le rejeu des étapes reportées sur Postgres, d'abord celles d'avant la fusion puis celles
  d'après sur la même base, est dans `tests/mettre-a-jour.test.ts`.
- **L'ajout** (tranche 4) : `--ajouter`, des briques séparées par des virgules, rejoue la
  cible au commit A avec les briques choisies plus les ajoutées ; l'assembleur rejoué y
  ajoute ce qu'elles entraînent (`rgpd` avec `comptes`), et le reste suit le même chemin
  qu'une mise à jour : la table, les étapes en fin de liste, le manifeste et l'en-tête de la
  blueprint (`briques_assemblees` reçoit les briques arrivées). Branche par défaut
  `feature/ajouter-<briques>`. Refusés avant toute lecture de l'appli : `--ajouter` avec
  `--vers`, une liste vide, `donnees` (la base arrive avec la brique qui l'exige) ; dans
  le worktree du commit A, avant le Prettier et l'assemblage : une brique qui n'y existe
  pas (mettre à jour d'abord), une brique déjà dans l'appli, une brique ajoutée (ou
  entraînée) qui en exige une que l'appli n'a pas et qui n'est pas demandée avec elle, le
  refus disant quoi passer à `--ajouter`. `--retirer` se refuse (« Hors v1 »). Le rapport
  porte en tête, avant les fichiers, le **retard sur le catalogue** (le 2026-11-05, l'ajout
  de `notifications` à un commit en retard de 50 commits sur `origin/main`, dont trois sur la
  brique, l'avait donnée telle qu'elle était à A sans un mot) : à blanc comme en écriture, le
  nombre de commits de retard de l'appli (fusions exclues) et, pour chaque brique ajoutée ou
  entraînée, ceux qui touchent son dossier entre A et `origin/main`, avec leurs sujets jusqu'à
  cinq, et la commande `node outils/mettre-a-jour.mjs <appli> --vers <origin/main>` à lancer
  d'abord : une fois cette mise à jour fusionnée, l'ajout reçoit directement la brique du
  jour. Sans retard, ou sans commit sur les briques reçues, une seule ligne le dit. L'outil avertit du
  retard, il ne le refuse pas (A est sur `origin/main`, le rejeu l'exige). Puis, de même avertis sans refus et à blanc comme en
  écriture, les **briques écartées par la fiche projet** (le 2026-11-05, `--ajouter validation`
  sur l'appli d'essai tours-de-coloc, dont `PROJET.md` écartait la brique avec sa raison,
  s'était fait sans un mot) : l'outil lit dans le `PROJET.md` de l'appli à son HEAD ce qui
  s'annonce écarté, une ligne « Écartées : … » (sa raison est le texte après les deux-points
  ou ses sous-puces), une rubrique titrée « Briques écartées » (une puce ou une ligne de
  tableau par brique) ou une ligne de tableau dont une cellule commence par « écartée »
  (« | validation | écartée : … | », la forme de la fiche de tours-de-coloc), nomme
  chaque brique ajoutée ou entraînée qu'il y trouve en mot entier et recopie l'entrée qui la
  nomme ; le gabarit de la fiche ne fixe pas cette forme, le corps de la fiche n'est jamais
  analysé, et sans fiche ou sans la ligne il n'y a rien à dire. Et, quand l'appli avait déjà
  `espaces` (sans quoi il n'y a pas de verrou, et les tables d'une brique arrivée avec lui,
  `utilisateurs` de `comptes` par exemple, feraient du bruit), les **tables sans `espace_id`** : celles que créent les étapes de migration
  arrivées (hors `espaces` et ses tables), sans cette colonne dans leur `CREATE TABLE` ni par
  un `ALTER TABLE`. Le verrou `tests/espaces-isolation.test.ts` ne repère une table à
  protéger que par cette colonne : une table de brique qui ne l'a pas passe le verrou sans
  être isolée ; le rapport la nomme, à isoler par le branchement ou à déclarer hors espace en
  connaissance de cause, et ne l'ajoute pas lui-même. Puis les **ajouts lourds** : la base arrivée (`migrations.ts`
  absent de l'origine), avec la décision de la créer chez l'hébergeur, `DATABASE_URL` et les
  bases locales ; `comptes` arrivée, avec les fichiers de l'appli que
  `tests/gardes-acces.test.ts` refusera, nommés un à un (les pages, routes et fichiers « use
  server » de `src/app/` que l'appli a écrits, absents de l'origine comme de la cible), les
  pages publiques du référencement, les entrées de `OUVERTS` du verrou dont l'appli a
  supprimé le fichier (une page publique qu'elle a retirée), l'entrée et les méthodes de connexion prises
  par défaut (l'en-tête de la blueprint ne pouvait pas les régler sans la brique), `rgpd` d'office,
  le premier admin et `AUTH_SECRET`. Puis
  les **briques à brancher**, lues dans la section « La brancher » du README de la cible :
  celles dont elle commence par « Tout se déclare côté appli » arrivent sans appelant
  (`echeances`, `calendrier`, `validation`, `import-lot`, `notifications`, le vocabulaire
  de `creer-appli`, hors `mails` seule, que ce repérage ne voit pas), chacune avec son
  ticket de l'appli ; celles dont elle part seulement du patron `dossiers` arrivent branchées sur le
  catalogue, à rattacher aux modules que l'appli a écrits (`journal`, `espaces`). Une appli
  assemblée par profil reçoit une brique comme une autre (les briques du profil sont au
  manifeste) ; si son profil n'admet pas une brique arrivée (`permises` de `PROFILS` au
  commit A : `comptes` dans une `vitrine`), le rapport avertit que `profil:` de l'en-tête
  est à reprendre à la main. Au
  même commit, le rapport ne recopie ni les
  entrées des `CHANGELOG.md` des briques ni les commits du socle : la seule histoire qu'il
  porte est le retard sur `origin/main`, en tête. Les deux cas d'essai de la tranche sont
  dans `tests/mettre-a-jour.test.ts`, avec un assemblage direct au commit A pour comparer,
  le typecheck, les tests de l'appli sur une base de test neuve, et le rejeu des étapes
  version après version.
- **Les adaptations de l'appli** (le 2026-11-05) : trois retouches de tours-de-coloc à des
  fichiers venus du catalogue (`/kit` et les écrans du patron retirés, l'accueil livré vide
  rempli, l'onglet de la coloc) n'étaient remontées au catalogue qu'une fois vues à
  l'écran. Trois pièces, et le geste du « Circuit » :
  - **le rappel** : dans une appli assemblée, la garde (`.claude/hooks/gardes.mjs`) laisse
    passer toute écriture d'un fichier au manifeste et rappelle de la noter dans
    `ADAPTATIONS.md`, tant qu'aucune entrée ne la couvre (son chemin, ou un dossier cité avec
    sa barre finale). Un rappel, jamais un refus : le texte arrive dans le contexte de Claude
    sans décision de permission. Le manifeste se cherche depuis le fichier écrit (jusqu'au premier dépôt git), pas depuis
    le dossier de la session : une session ouverte dans le catalogue qui écrit dans une appli
    reçoit le rappel. Le catalogue, sans manifeste, n'en reçoit aucun. Un
    fichier écrit ou supprimé par une commande (`sed -i`, `Set-Content`, `rm`, `git rm`)
    échappe à la garde, qui ne voit que les outils d'écriture : seul l'outil le voit ;
  - **`ADAPTATIONS.md`**, que l'assembleur écrit vide avec son en-tête, hors manifeste comme
    `NOTICE` : une entrée par adaptation, cinq lignes au plus (`## date`, `Fichiers`, ce qui
    change, pourquoi, `Nature : défaut du catalogue` ou `propre à l'appli`) ;
  - **`node outils/adaptations.mjs <appli> [--json] [--rejouer]`**, en lecture seule : les
    fichiers du manifeste retouchés ou supprimés au `HEAD` de l'appli, chacun avec son diff et
    sa note, ou « sans note ». Le diff part de l'origine retrouvée par son empreinte : dans
    l'historique de l'appli, sinon au catalogue au commit noté. Faute de quoi il est dit
    **approché** (depuis le fichier du catalogue au commit noté) : un fichier qu'une mise à
    jour a fusionné n'a jamais eu son origine commitée chez l'appli, et l'assembleur retouche
    les fichiers que l'en-tête remplit. Sur tours-de-coloc, les quatre fichiers retouchés
    (`confidentialite.ts`, `mentions-legales.ts`, `referencement.ts`, `migrations.ts`) sont
    de ce cas, et le diff approché de `migrations.ts` passait 300 lignes, presque toutes dues
    aux étapes que l'assembleur retire. **`--rejouer`** donne alors l'origine exacte : l'outil
    rejoue l'assemblage noté au manifeste comme cet outil-ci (`origineRejouee`), au prix d'un
    worktree temporaire du catalogue et de Prettier, et d'un `npm ci` (le réseau) si le
    Prettier de ce commit n'est pas celui du catalogue. Un rejeu qui échoue (commit absent du
    catalogue, empreintes qui ne se retrouvent pas) se dit en avertissement, et les diffs
    restent approchés. Sans l'option, ni rejeu ni réseau. La lecture du manifeste et la
    comparaison des empreintes sont dans `outils/manifeste.mjs`, que les deux outils
    partagent : cet outil-ci n'y ajoute que ce que le rejeu exige (les réglages du format 2,
    pas de `+arbre-modifie`), et ses refus gardent ses mots.

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
  (`tests/assembleur.test.ts`, `tests/mettre-a-jour.test.ts`,
  `tests/mettre-a-jour-migrations.test.ts`) ; l'outil
  `outils/mettre-a-jour.mjs`.
- La skill `creer-appli` (« Hors v1 », étapes 0 et 4) et son `choix.md`.
- `src/lib/db/migrations.ts`, la skill `solstice-donnees`, `docs/cicatrices.md` (D1, D2).
- Les README et `CHANGELOG.md` des briques, dont la brique notifications (« Ce qu'elle ne
  fait pas (v1) », « Décisions prises »).
- `src/config/donnees-personnelles.ts` et `src/lib/confidentialite.ts`.
