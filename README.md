# Catalogue Solstice Lab

[![Vérification du code](https://github.com/solstice-lab/catalogue-solstice-vibe/actions/workflows/ci.yml/badge.svg)](https://github.com/solstice-lab/catalogue-solstice-vibe/actions/workflows/ci.yml)
[![Assemblage](https://github.com/solstice-lab/catalogue-solstice-vibe/actions/workflows/assemblage.yml/badge.svg)](https://github.com/solstice-lab/catalogue-solstice-vibe/actions/workflows/assemblage.yml)

Du code ouvert, éprouvé et testé pour qu'une petite ou moyenne entreprise
construise elle-même, avec Claude, l'application web dont elle a besoin :
remplacer un tableur devenu critique, une base Airtable bricolée ou des
allers-retours de mails.

## Ce que c'est, pour qui

Ce catalogue est écrit et entretenu par Solstice Lab, une agence qui en tire ses
propres livraisons. Il est publié en code ouvert (licence MIT : chacun peut
l'utiliser, le copier et le modifier) pour qu'une entreprise de 5 à 50 personnes
puisse construire elle-même une application propre à son métier, sans repartir
de zéro. Il contient :

- un **socle** commun (le code que toute appli reprend) et la méthode de travail
  qui va avec, lue par Claude ;
- des **briques** réutilisables (connexion, échéances, e-mails, import
  Excel…) ;
- un **assembleur**, un programme qui copie ce que vous avez choisi dans un
  dossier neuf, qui devient un _dépôt_ (l'espace où vit le code de votre appli,
  sur GitHub) ; Claude y écrit ensuite ce qui est propre à votre métier.

Les applications visées servent de 5 à 50 personnes, ne sont soumises à aucune
contrainte réglementaire particulière et supportent une heure de panne sans
conséquence grave.

Ce sur quoi vous vous appuyez :

- du code lisible, que vous gardez : l'appli est à vous, dans votre dépôt, sans
  plateforme à louer ;
- des briques utilisées dans une appli avant d'entrer au catalogue : une
  brique naît dans une appli (réelle ou d'essai) et n'y entre que quand une
  deuxième en a besoin ;
- des tests lancés à chaque changement, et des règles de construction qui
  viennent de leçons payées sur des projets précédents ;
- un thème à vos couleurs : tout le visuel (couleurs, logo, polices) se règle
  dans un seul dossier.

Ce projet est **expérimental** (voir « Statut du projet ») : ce parcours n'a
pas encore été fait de bout en bout par une équipe sans développeur. Prévoyez de
pouvoir vous faire aider. Solstice Lab, qui écrit et entretient le catalogue,
peut accompagner une entreprise qui ne veut pas le faire seule : voir
[solstice-lab.com](https://solstice-lab.com).

### À qui est le code

- **Le catalogue** est sous licence MIT ([`LICENSE`](LICENSE)) : vous pouvez
  l'utiliser, le copier et le modifier, à condition de garder l'avis de droit
  d'auteur et le texte de la
  licence.
- **L'appli que vous assemblez** est marquée `UNLICENSED` dans son
  `package.json` : elle n'est pas publiée sous licence libre, et ses droits relèvent de son propriétaire et, le cas échéant, d'un contrat, non de la licence du catalogue.
  Elle ne reçoit
  pas `LICENSE` mais un fichier `NOTICE`, écrit par l'assembleur, qui porte
  l'avis de droit d'auteur et le texte MIT du catalogue, puis l'avis des
  polices IBM Plex (licence OFL). La licence MIT exige que cet avis suive toute
  copie du code repris : gardez `NOTICE` si vous transmettez ou publiez
  l'appli. Il ne donne aucune licence à l'appli.
- **La signature** « Conçu par Solstice Lab », en pied de page, est une règle
  des livraisons de l'agence, pas une obligation de la licence : pour une appli
  que vous construisez pour vous, vous pouvez la retirer (voir
  [`CONTRIBUTING.md`](CONTRIBUTING.md), « La signature Solstice Lab »).

Ceci décrit ce que fait le code ; ce n'est pas un conseil juridique.

Le dépôt est entretenu par l'équipe Solstice Lab et n'accepte pas de pull
request extérieure (une proposition de modification de code) : un problème se
signale par un ticket, une faille par [`SECURITY.md`](SECURITY.md), et
[`CONTRIBUTING.md`](CONTRIBUTING.md) est le mode d'emploi de l'équipe. Les
échanges suivent le [code de conduite](CODE_OF_CONDUCT.md).

## Les trois niveaux d'une appli

Une appli assemblée se lit en trois niveaux. La métaphore de la maison aide à
les distinguer : on ne refait pas les fondations à chaque chantier, on pose des
éléments qui ont déjà tenu, et c'est l'aménagement qui rend la maison propre à
ses occupants.

| Niveau        | Ce que c'est                                                                                                                | Dans la maison | Dans une appli assemblée                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------- |
| Socle         | Le code commun (kit d'interface et thème, mentions légales et confidentialité, sonde `/sante`, CI) et sa méthode de travail | Les fondations | Toujours présent                                                                 |
| Briques       | Un comportement réutilisable : échéances, calendrier, validation, import par lot, e-mails, comptes…                         | Les éléments   | Choisies d'une appli à l'autre                                                   |
| Module métier | Vos entités (contrats, équipements, demandes…) et leurs écrans, écrits sur le patron `dossiers`| L'aménagement  | Propre à chaque appli, écrit après l'assemblage ; le catalogue n'en livre aucun |

Le socle ne livre pas seulement du code de départ, il livre la **méthode** :
des composants qui portent les règles de construction, des règles courtes dans
[`CLAUDE.md`](CLAUDE.md), des skills de Claude qui documentent chaque domaine
et des garde-fous en code. Socle et méthode forment le _harnais_. Chaque règle
vient d'une leçon payée sur un projet précédent ; [`docs/cicatrices.md`](docs/cicatrices.md)
en tient le registre.

## Les briques

Ce sont exactement celles que l'assembleur sait assembler. Chacune a son dossier
dans `src/briques/<nom>/`, avec un `README.md` qui dit comment l'utiliser. Le
tableau qui dit ce que chacune exige et où elle se branche est dans
[`docs/catalogue/briques.md`](docs/catalogue/briques.md).

| Brique                                                    | Ce qu'elle apporte                                                                                       |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [`comptes`](src/briques/comptes/README.md)                | La connexion des personnes (code reçu par e-mail, Google, Microsoft), tout protégé par défaut, des droits par rôle |
| [`gestion-comptes`](src/briques/gestion-comptes/README.md) | Un écran où un administrateur invite, change le rôle, désactive ou réactive un compte                   |
| [`espaces`](src/briques/espaces/README.md)                | Des groupes de personnes (une coloc, une association) qui ne voient que leurs propres fiches             |
| [`rgpd`](src/briques/rgpd/README.md)                      | L'export et l'effacement des données d'une personne, la purge au terme de la durée de conservation      |
| [`journal`](src/briques/journal/README.md)                | Le journal d'audit : qui a créé, modifié ou supprimé quoi, et quand                                      |
| [`mails`](src/briques/mails/README.md)                    | L'envoi d'e-mails automatiques ; rien ne part sans réglage explicite                                     |
| [`notifications`](src/briques/notifications/README.md)    | Un récapitulatif envoyé par e-mail à jour fixe                                                           |
| [`contact`](src/briques/contact/README.md)                | Le formulaire de contact public, protégé contre le courrier indésirable sans captcha                     |
| [`echeances`](src/briques/echeances/README.md)            | Le suivi de dates limites (à venir, en retard) sur ce que l'appli gère, avec une vue « À venir »         |
| [`calendrier`](src/briques/calendrier/README.md)          | Les événements d'un mois : grille sur ordinateur, cartes sur téléphone                                   |
| [`validation`](src/briques/validation/README.md)          | Une file de propositions à accepter ou refuser, la décision étant tracée                                 |
| [`import-lot`](src/briques/import-lot/README.md)          | L'import d'un fichier Excel ou CSV, contrôlé avant d'être confirmé tout ou rien                          |
| [`deploiement`](src/briques/deploiement/README.md)        | La mise en ligne automatique après les vérifications de la CI (adaptateur Render)                        |

Une brique qui en exige une autre ne se garde pas sans elle : l'assembleur
refuse l'appel et nomme la brique à ajouter. Pour partir d'un jeu de briques
cohérent, trois profils existent : `vitrine` (un site sans connexion),
`outil-interne` (des comptes) et `portail` (des comptes qu'un administrateur
gère à l'écran).

## Claude Code : un hook s'applique d'office

`.claude/settings.json` est suivi dans le dépôt et branche un hook
`PreToolUse` : quiconque ouvre le dépôt dans Claude Code le reçoit. Avant
chaque commande et chaque écriture de fichier de Claude, il lance
`node .claude/hooks/gardes.mjs`, sans dépendance ni réseau, qui refuse
notamment d'écrire un `.env*` ou un `.npmrc`, de verser un mot de passe de base
distante dans une commande ou un fichier, de forcer un push, de sauter les
hooks git ou de fusionner une pull request. La liste complète est dans
[`CLAUDE.md`](CLAUDE.md), section 8.

Il arrête l'inadvertance d'une session, pas qui veut passer : la barrière réelle
est la protection de `main` et l'absence de secrets de production sur le poste.
Il ne touche pas aux commandes que vous tapez vous-même. En session
interactive, Claude Code ne lance les hooks d'un dossier qu'une fois sa demande
de confiance acceptée.

Pour s'en passer sur son poste, mettre `{ "disableAllHooks": true }` dans
`.claude/settings.local.json` (ignoré par git). Ce réglage coupe tous les
hooks, les vôtres compris : Claude Code ne permet pas d'en retirer un seul.

## Ce qu'il vous faut

Le catalogue lui-même ne se paie pas ; ce sur quoi il s'appuie, pas toujours.
Aucun prix n'est donné ici : ils changent, à lire chez chaque fournisseur.

- **Un ordinateur** avec git (et une identité configurée), Node 24 ou plus et
  npm 11.16 ou plus ; pour une appli qui garde des données, Docker, qui fait
  tourner la base sur votre poste.
- **Un compte GitHub**, pour héberger le dépôt de l'appli. Sur un dépôt privé,
  exiger qu'une personne relise avant la mise en ligne demande un plan GitHub
  payant (d'après sa documentation).
- **Un compte Claude**, pour Claude Code : le catalogue est fait pour être
  utilisé avec lui (ses règles sont dans `CLAUDE.md` et `.claude/`). L'offre et
  ses conditions sont celles d'Anthropic.
- **Un hébergeur**, pour mettre l'appli en ligne. La brique `deploiement`
  prévoit Render : le service web et la base sont facturés chaque mois, et la
  base gratuite de Render, supprimée au bout de 30 jours, est refusée par la
  brique.
- **Un service d'envoi d'e-mails**, si l'appli a des comptes ou envoie des
  messages : la brique `mails` utilise Resend, avec un compte et une adresse
  d'expéditeur vérifiée.

## Démarrage rapide

Les prérequis sont ceux de « Ce qu'il vous faut » ; l'assembleur commite
l'appli, d'où l'identité git. Dans la suite, « assembler » veut dire copier le
socle et les briques choisies dans un dossier neuf. Les commandes sont les mêmes
sous PowerShell et sous bash, sauf la copie de `.env.example`.

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

Copier le modèle des variables en `.env.local`, y remplacer `DATABASE_URL` par la
ligne qu'affiche `bases-locales.ts` (et, avec `comptes`, remplir `AUTH_SECRET` :
la commande est dans `.env.example`), puis lancer l'appli. PowerShell :

```powershell
Copy-Item .env.example .env.local
npm run dev
```

bash :

```bash
cp .env.example .env.local
npm run dev
```

L'accueil est sur http://localhost:3000. Sans brique,
`node outils/assembler.mjs ../mon-site` donne un site sans base : ni Docker ni
`.env.local`, `npm ci` puis `npm run dev` suffisent.

Une appli ne se copie pas depuis GitHub : elle s'assemble depuis ce
dépôt, avec la skill `creer-appli`, lancée dans une session Claude Code ouverte
à la racine du catalogue. Elle mène le cadrage, écrit la blueprint de l'appli
(le document qui décrit ses entités et ses briques), lance l'assembleur, crée le
dépôt distant après accord, puis les tickets de la première étape. Le
déroulement complet est dans [`docs/catalogue/demarrer.md`](docs/catalogue/demarrer.md).

## Statut du projet

- **Expérimental.** Le catalogue est celui de Solstice Lab et change
  avec ses propres projets. Des combinaisons de briques s'assemblent dans les tests (fichiers,
  imports, typecheck, migrations) ; la brique `deploiement` a été éprouvée sur
  une appli d'essai.
- **Pas de version publiée** : ni tag, ni release, ni paquet npm. Seule la
  branche `main` est entretenue. `package.json` porte `"private": true` : c'est
  le dépôt qui est sous licence MIT, pas un paquet distribué.
- **Interfaces des briques non stabilisées.** Chaque changement d'interface
  publique est inscrit au `CHANGELOG.md` de la brique, sans promesse de
  compatibilité d'un commit à l'autre.

## Aller plus loin

| Pour                                         | Lire                                                                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Démarrer une appli en local, mener un projet du cadrage à la mise en ligne | [`docs/catalogue/demarrer.md`](docs/catalogue/demarrer.md)                                                                          |
| Tout savoir de l'assembleur : options, profils, mise à jour d'une appli, création des tickets d'une blueprint | [`docs/catalogue/assembler.md`](docs/catalogue/assembler.md)                                                       |
| Connaître ce que chaque brique exige et où elle se branche | [`docs/catalogue/briques.md`](docs/catalogue/briques.md)                                                                              |
| Se repérer dans le dépôt, connaître les vérifications à lancer avant une pull request | [`docs/catalogue/structure.md`](docs/catalogue/structure.md)                                                          |
| Les règles de travail de Claude sur le dépôt | [`CLAUDE.md`](CLAUDE.md)                                                                                                                                           |
| Travailler sur le dépôt (équipe)             | [`CONTRIBUTING.md`](CONTRIBUTING.md)                                                                                                                               |
| Les leçons des projets précédents            | [`docs/cicatrices.md`](docs/cicatrices.md), et [`docs/CHANGELOG-socle.md`](docs/CHANGELOG-socle.md) pour les changements du socle                                  |

## Licence

Le catalogue est publié sous licence MIT ([`LICENSE`](LICENSE)). Les polices
IBM Plex de `src/ui/theme/polices/` sont sous SIL Open Font License 1.1
(`src/ui/theme/polices/LICENCE-OFL.txt`). Ce que cela veut dire pour l'appli que
vous assemblez est dans « À qui est le code ».
