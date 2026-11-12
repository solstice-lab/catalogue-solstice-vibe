# Assembler une appli

Référence de l'assembleur (`outils/assembler.mjs`), de l'outil de mise à jour
et de l'outil des issues. Le [README](../../README.md) donne le démarrage
rapide ; ce fichier porte le détail. Il est propre au catalogue : une appli
assemblée ne le reçoit pas.

`outils/assembler.mjs` lit le dépôt tel quel et copie le socle et les briques
choisies vers un dossier vide hors du catalogue, et rien de ce qui
fait vivre le catalogue lui-même : ni le `README.md`, ni `docs/catalogue/` (dont ce fichier), `PROJET.md` (s'il existe),
`outils/`, ni la skill `creer-appli` et l'agent
`relecteur-blueprint`, ni les tests de l'assembleur, de l'outil des issues, de l'outil de mise à jour et de
l'outil des adaptations, ni le test des renvois de `docs/cicatrices.md`, ni
le workflow `assemblage.yml`, ni `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`,
`CODE_OF_CONDUCT.md`
et les modèles de ticket et de PR (liste `EXCLUS_DU_CATALOGUE` de
`outils/modules.mjs`).
Il écrit `blueprint.md` à la racine, avec le commit de référence du catalogue (celui du dépôt au
moment de la commande) ; `--blueprint` en donne une existante, dont seul le
commit est mis à jour ; `--nom` fixe le nom du paquet de l'appli, d'où celui
de ses bases locales ; `--fiche` copie une fiche projet en `PROJET.md` (les deux ne prennent qu'un fichier `.md`, sans clé
privée ni URL de base distante avec mot de passe : une faute de chemin n'envoie pas un secret dans
le premier commit) ;
il écrit aussi `NOTICE`, l'avis de licence (voir « Licence » du [README](../../README.md)), et `ADAPTATIONS.md`, vide
avec son en-tête, où l'appli note chaque retouche d'un fichier venu du catalogue, et remet en forme
par Prettier les fichiers qu'il a retouchés (il faut donc `npm ci` dans le catalogue) ;
il écrit aussi `catalogue.empreintes.json`, le manifeste d'empreintes : le commit du
catalogue, court et complet, et le champ `version` de son `package.json` (fixe tant qu'aucune version n'est
publiée), les réglages de l'assemblage (briques choisies, celles du profil comprises, et
ajoutées d'office, nom du paquet et nom donné, Dependabot, champs lus de l'en-tête de la
blueprint hors `profil`), puis, pour
chaque fichier venu du catalogue, son unité (brique, partagée ou
`socle`) et l'empreinte sha256 du fichier tel que l'appli le reçoit, après la mise en
forme et tel que git l'enregistre. `node outils/mettre-a-jour.mjs <appli>` le
lit : il rejoue l'assemblage d'origine au commit du manifeste, vérifie qu'il en redonne les
empreintes, rejoue l'assemblage au commit visé du catalogue, puis reporte l'écart dans
l'appli, sur une branche neuve et sans commit, en fusionnant à trois les fichiers qu'elle a
retouchés ; `--vers <commit>` vise un autre commit de `origin/main` que le HEAD du catalogue,
`--branche <nom>` nomme la branche neuve (sinon `feature/reporter-catalogue-<commit visé>`),
`--a-blanc` donne le rapport sans rien écrire ; `--aide` les détaille tous. Les étapes de migration neuves
s'ajoutent en fin de la liste de l'appli, après les siennes ; il s'arrête si une étape
reçue change au catalogue ou manque à l'appli, si le nom d'une étape à ajouter y existe
déjà, ou si `schema.sql` change entre les deux commits (note `outils/mise-a-jour.md`).
Avec `--ajouter <briques>`, il ajoute de même des briques à l'appli, au commit qu'elle a,
y compris une brique qui apporte la base, et `comptes`, que le rapport annonce en tête
avec ce qu'elles coûtent. Une brique arrive telle qu'elle était au commit de l'appli : le
rapport avertit en tête du retard de l'appli sur `origin/main` et des commits de la brique
depuis, des briques que son `PROJET.md` écarte, et, dans une appli avec `espaces`, des
tables arrivées sans `espace_id`, sans refuser. Côté assembleur, `--dependabot` garde `.github/dependabot.yml`, retiré par défaut parce qu'une appli que
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

- Briques : aucune, une ou plusieurs, parmi celles de [briques.md](briques.md).
  L'assembleur refuse un appel auquel manque une brique exigée.
- Profils de départ (`PROFILS` d'`outils/modules.mjs`) : le champ `profil:` de
  l'en-tête de la blueprint en donne les briques, auxquelles `--briques` ajoute.
  `vitrine` : le socle seul, `mails`, `contact` et `deploiement` au plus (une autre
  brique est refusée) ; `outil-interne` : `comptes` et `mails`, donc la base, et
  `rgpd` d'office ; `portail`, où un admin ajoute et retire les personnes à l'écran : le même, avec
  `gestion-comptes`. Le manifeste note les briques, pas le profil.

  ```
  node outils/assembler.mjs ../mon-portail --blueprint ../mon-portail-blueprint.md --briques espaces
  ```
- `comptes` (avec `mails`) donne la base
  et les droits, avec un accueil de départ (nom, description, lien d'entrée) ; `contact` (avec `mails`) donne
  la base pour la limite d'envois, sans connexion ; aucune brique ne livre le
  patron `dossiers`, ni ses écrans ni sa couche données ; `rgpd` vient
  d'office avec `comptes`, `journal`, `gestion-comptes` et `espaces` s'y ajoutent. Une
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
  `npm test`, qui l'écarte : il dure plus de 10 minutes. `tests/mettre-a-jour.test.ts`,
  celui de l'outil de mise à jour, l'accompagne : il rejoue des assemblages, lance un
  vrai `npm ci` et rejoue sur Postgres les étapes de migration qu'il reporte ; ses cas
  sans base ni assemblage (`tests/mettre-a-jour-migrations.test.ts`) tournent avec
  `npm test`. Le job `assembleur` de
  `.github/workflows/assemblage.yml` lance le test de l'assembleur sur chaque pull request prête à
  relire, réduit à un échantillon de combinaisons (`ECHANTILLON`), et en entier
  chaque nuit si main a changé, ou à la main ; celui de l'outil de mise à jour y passe en
  entier à chaque fois. En entier, il assemble des combinaisons de briques, la vide
  comprise, dans un dossier temporaire et vérifie les fichiers présents et
  absents, les imports, les références aux unités retirées, la présence de
  chaque extrait de la liste dans le catalogue, la mise en forme que vérifie sa CI, le typecheck de l'appli assemblée et,
  avec la base, le rejeu de ses migrations sur une base vide. Sans la brique
  données, il lance aussi lint et tests sans `DATABASE_URL` ; le build de ce cas est fait
  par le job `socle-seul` de `.github/workflows/assemblage.yml`, après un vrai `npm ci`. Pour les
  autres combinaisons, lint, tests et build se lancent dans le dossier assemblé
  (`npm ci` puis les vérifications ci-dessous, sauf `npm run test:assembleur`,
  que l'appli n'a pas).
- Ce que l'assembleur ne fait pas : mettre à jour une brique déjà installée, ou
  en ajouter une à une appli assemblée (c'est `outils/mettre-a-jour.mjs`), déployer, lire la
  blueprint pour choisir ce qui s'assemble.

## Les issues de la section 9

`outils/creer-issues.mjs` lit la section 9 d'une blueprint (une étape par `### 9.n Titre`,
avec son contenu, `Vérifiable à l'écran :` et `Bloqué par :` : format dans
`.claude/skills/creer-appli/blueprint-modele.md`) et crée une issue GitHub par étape, par
`gh`, sans dépendance. Il tourne à blanc : il affiche chaque issue (titre, corps, dépendances)
et ne crée rien. Le dépôt se nomme toujours (`--depot`), aucun n'est pris par défaut.
`--confirmer`, tapé à la main, crée les issues et vérifie que chacune prend le numéro
qu'annoncent les lignes « Bloqué par #n » ; au premier écart, il s'arrête et dit quoi faire.

```
node outils/creer-issues.mjs --blueprint ../mon-appli/blueprint.md --depot moi/mon-appli
node outils/creer-issues.mjs --blueprint ../mon-appli/blueprint.md --depot moi/mon-appli --confirmer
```

Il est propre au catalogue, comme l'assembleur : une appli assemblée ne le reçoit pas.
