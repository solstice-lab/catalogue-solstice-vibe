# Brique rgpd

L'export et l'effacement des données d'une personne : tout ce que l'appli
garde sur une adresse e-mail, dans un fichier JSON lisible (RGPD, droit
d'accès art. 15, droit à la portabilité art. 20), puis, sur sa demande,
effacé ou anonymisé (droit à l'effacement, art. 17).

Elle exige la **base** et la brique **comptes** : ses pages et ses droits
passent par `exiger`. L'assembleur du catalogue la garde d'office avec la
brique comptes : une appli qui a des comptes doit
pouvoir répondre à une demande d'accès ou d'effacement. Elle se garde donc sans
module (`--briques comptes,mails`).

La politique de confidentialité (`/confidentialite`, socle) est une autre
affaire : elle décrit les traitements, cette brique sort les données. Les deux
se rejoignent sur les durées de conservation : la politique les affiche, cette
brique les applique (« Durées de conservation et purge »).

## Ce qu'elle apporte

- **Deux portes, une seule fonction** (`exporterDonnees`) :
  - **`/mes-donnees`** : la personne connectée télécharge ses propres données.
    La route `GET /mes-donnees/export` ne lit que la session, jamais la
    requête : une adresse lue dans l'URL ouvrirait les données des autres à
    tout membre ;
  - **`/donnees-personnelles`** : l'admin saisit une adresse et télécharge ce
    que l'appli garde sur elle. Elle sert pour un compte désactivé (qui ne se
    connecte plus) et pour une personne sans compte (un responsable de
    contrat). La route est `POST /donnees-personnelles/export` : l'adresse
    passe dans le corps du formulaire, jamais dans l'URL, qui finirait dans les
    journaux de l'hébergeur. L'origine de l'envoi est contrôlée.
- **Un fichier JSON**, indenté, clés en français, jamais gardé en cache :
  `{ adresse, genere_le, explication, sources: [{ cle, titre, lignes, note }],
  non_exportees: [{ quoi, pourquoi }] }`. Écarté : le CSV, qui demanderait un
  fichier par source et n'a pas de place pour les notes.
- **Aucune empreinte dans le fichier** (jeton de session, code, adresse IP) :
  elles ne se lisent pas, et celle du jeton donnerait une prise de plus à qui
  récupère le fichier. Les notes le disent.
- **Les adresses e-mail d'autres personnes sont masquées** (RGPD art. 15.4 :
  le droit d'accès ne livre pas les données d'autrui). Une ligne sort entière :
  le contenu d'une demande peut nommer son décideur, une ligne importée
  d'autres contacts. Les **noms** ne sont pas masqués, rien ne les distinguant
  d'un autre texte : avant d'envoyer un fichier, l'admin le relit.
- **Ce que l'appli garde sans pouvoir le rattacher à une adresse** (un nom de
  client, une empreinte d'IP du formulaire de contact) est nommé dans
  `non_exportees`, avec la raison, plutôt que passé sous silence.

## L'effacement

- **Par l'admin seul** (`donnees.effacer`), sur `/donnees-personnelles`, après
  avoir vérifié que la demande vient de la personne. La page s'ouvre par
  `donnees.exporter` : un rôle qui efface doit aussi pouvoir exporter. Pas de bouton « effacer mon
  compte » : le geste ne se rattrape pas, et un compte volé suffirait à tout
  effacer. Un admin n'efface pas ses propres données : un autre le fait.
- **En deux temps.** L'aperçu joue l'effacement dans une transaction et
  l'annule : ce qu'il montre, source par source, est ce que la confirmation
  fera, refus compris. La confirmation se fait dans une Modale où l'admin
  retape l'adresse.
- **Même découpage que l'export.** Chaque source du registre dit ce que
  l'effacement fait de ses lignes (`effacement`, montré dans l'aperçu) et le
  fait (`effacer`), dans une seule transaction pour toutes : un refus ou un
  effet en échec annule tout. Le registre se parcourt à l'envers : le compte,
  première source, s'anonymise après ce qui le retrouve par son adresse.
- **Le compte s'anonymise, il ne se supprime pas** : son adresse devient
  `efface-<numéro>@efface.invalid`, il est désactivé, sa dernière connexion
  oubliée. Ce qui le désigne par son numéro (le journal d'audit, dont la base
  refuse tout `UPDATE`) reste en place et ne mène plus à l'adresse. Le
  dernier admin actif ne s'efface pas, comme il ne se désactive pas.
- **Les données métier restent, sans l'adresse** : une proposition, une ligne
  importée sont des pièces de gestion. L'adresse y est remplacée par
  « (adresse effacée) » ; une entité de l'appli qui porte un responsable fait
  de même dans sa propre source. Le journal des notifications garde ses
  lignes, destinataire vidé.
- **Ce que l'effacement ne trouve pas** (les données non exportées : un nom de
  client, un texte libre) est rappelé dans l'aperçu et le bilan, à chercher à
  la main. Une adresse écrite dans la configuration des comptes (ou dans
  `COMPTES_PREMIER_ADMIN`) est effacée en base, et le bilan dit de la retirer :
  sinon elle reste dans le code, et entre avec un compte neuf à sa prochaine
  connexion. L'effacement n'interdit pas une nouvelle connexion à qui y a droit.
- **Ce que l'effacement d'un compte entraîne ailleurs** passe par le registre
  des effets de comptes (`src/config/effets-comptes.ts`, brique comptes) : la
  source du compte joue ses effets d'effacement dans la transaction, au nom de
  l'admin qui efface, aperçu compris (ils s'annulent avec lui). Un module qui
  affiche un prénom l'anonymise ainsi. Avec la brique journal, son entrée du
  registre trace l'anonymisation comme les autres gestes de l'administration
  des comptes, une modification de « compte n°<id> », au nom de l'admin. Une
  adresse sans compte ne joue aucun effet : le journal ne garde aucune adresse.

Hors v1 : une recherche par nom.

## L'export de l'admin se trace

Chaque export de `/donnees-personnelles` se trace avant que le fichier parte,
par les sources du registre qui déclarent `tracerExport` : avec la brique
journal, une ligne `export` sur « compte n°<id> », au nom de l'admin ; sans
elle, rien ne se trace. Une trace qui échoue lève, et le fichier ne part pas.
Une adresse sans compte ne laisse rien : le journal ne garde aucune adresse.
L'export que la personne fait de ses propres données (`/mes-donnees`) ne se
trace pas.

Décision (question ouverte de la v1, tranchée avec la purge) : l'export sort
toutes les données d'une personne pour une autre, il doit se retrouver. Il
passe par le registre existant, pour que la brique ne connaisse pas le journal.

## Durées de conservation et purge

**Les durées se déclarent par donnée**, à côté de la description des
traitements que chaque brique porte (`conservation` de son
`confidentialite.ts`, type `Conservation` de `src/lib/confidentialite.ts`) :
la donnée, la durée (`{ heures }`, `{ jours }` ou `{ mois }`), d'où elle
court, et comment elle s'efface :

| `purge` | Ce qui se passe au terme |
| --- | --- |
| `{ table, colonne }` | Le script efface les lignes dont `colonne` a passé la durée. |
| `{ table, colonne, auPassage: true }` | Pareil, et `purgerAuPassage` aussi, au détour d'une lecture. |
| `{ table, colonne, aLaMain }` | Rien ne l'efface d'office : le script compte les lignes échues et rappelle `aLaMain` (un compte s'anonymise par l'effacement, il ne se supprime pas). |
| `{ horsBase }` | Hors de la base (la boîte de l'éditeur) : le script la rappelle. |

**La politique les affiche**, donnée par donnée, et les dit « à valider »
tant que le projet ne les a pas revues (`CONFIDENTIALITE.dureesRevues`). Une
durée autre que celle que la brique propose s'écrit dans
`CONFIDENTIALITE.durees`, par la clé de la conservation : la page et la purge
lisent la même. Un traitement sans conservation (l'hébergement, l'envoi des
e-mails, que le site ne garde pas) garde sa durée écrite par le projet dans
`CONFIDENTIALITE.choix`.

Durées proposées par le catalogue, **à valider** :

| Brique | Clé | Donnée | Durée | Purge |
| --- | --- | --- | --- | --- |
| `comptes` | `comptes-inactifs` | Compte | 24 mois après la dernière connexion | À la main (effacement) |
| `comptes` | `sessions` | Sessions | 1 jour après leur expiration | Script |
| `comptes` | `codes-connexion`, `codes-connexion-essais` | Empreintes des demandes et des saisies de code | 1 heure | Script (et le code, à la demande suivante) |
| `contact` | `contact-envois` | Empreinte de l'adresse IP | 1 heure | Script (et le code, au message suivant) |
| `contact` | `contact-messages` | Messages reçus par e-mail | 36 mois après le dernier échange | Hors base |
| `journal` | `journal` | Lignes du journal | 12 mois après le geste | Script seul, jamais au passage |
| `notifications` | `notifications` | Trace de chaque notification | 12 mois après l'envoi | Script (et la route, à chaque envoi) |
| `espaces` | `espaces-adhesions-terminees` | Adhésion terminée | 12 mois après le départ | À la main |
| `espaces` | `espaces-essais-code` | Codes faux saisis | 1 heure | Script (et le code) |

Les briques `validation` et `import-lot` gardent des adresses (décideur,
lignes importées) sans décrire de traitement : leur durée se décide avec le
traitement du projet qui les emploie.

**Le script** : `npx tsx --env-file=<fichier> scripts/purger-donnees.ts`,
dry-run par défaut. Il nomme la base en première ligne, joue la purge dans une
transaction et l'annule, et liste ce qu'il effacerait, les lignes échues à
traiter à la main et les durées hors base. `--confirmer` se tape à la main,
par un humain, après relecture. Une clé de `CONFIDENTIALITE.durees` que rien
ne déclare l'arrête avant tout. Le journal d'audit, dont la base garde le
`DELETE` pour cette purge, n'est purgé que par lui.

**Au passage**, pour une appli sans tâche planifiée : `purgerAuPassage({
transaction })`, appelée au détour d'une lecture (tours-de-coloc : au moment où
une lecture crée les tours d'une nouvelle semaine), ne purge que les données
marquées `auPassage`. Un verrou consultatif pris dans la transaction fait
passer son chemin à une seconde purge simultanée (`{ occupee: true }`) ;
rejouée, elle ne trouve plus rien.

## Les gabarits (`gabarits/`)

Hors code, en Markdown, à copier dans les documents du client et à faire
valider par lui, champs à remplir marqués `[À REMPLIR : …]` :

| Fichier | Contenu |
| --- | --- |
| `registre-des-traitements.md` | Le registre de l'article 30 : une fiche par traitement, reprise de la politique de confidentialité, et les mesures de sécurité communes. |
| `accord-de-sous-traitance.md` | Les clauses de l'article 28, à joindre au contrat de prestation ou à comparer à l'accord d'un prestataire. |
| `hebergement-ue.md` | La checklist d'un hébergement dans l'Union européenne : lieu des données et des sauvegardes, accès, contrat, sécurité. |

## Le registre : `src/config/donnees-personnelles.ts`

La brique ne connaît aucune table. Chaque unité décrit ce qu'elle garde chez
elle, et ce registre les rassemble, comme `src/config/acces.ts` rassemble les
actions. Il part avec la brique ; dans le catalogue, l'assembleur y retire la
ligne de chaque unité qu'une appli ne garde pas.

Toute table de la base y est déclarée, d'une des trois façons :

| Déclaration | Où | Effet dans le fichier |
| --- | --- | --- |
| `SOURCES` | `SourceDonnees` décrite par l'unité (`src/briques/<brique>/donnees-personnelles.ts`, ou le fichier de base du module) | Ses lignes sortent, retrouvées par l'adresse. |
| `NON_EXPORTEES` | Une ligne du registre | `quoi` et `pourquoi` dans `non_exportees`. |
| `TABLES_SANS_DONNEE_PERSONNELLE` | Une ligne du registre, avec la raison | Rien. |

`tests/rgpd-export.test.ts` refuse une table de la base que le registre ne
déclare pas, et une déclaration sans table. **Une table neuve se déclare donc
avec elle**, dans la même PR.

Sources du catalogue (une appli n'a que celles des unités qu'elle garde) :

| Unité | Source | Comment elle retrouve l'adresse |
| --- | --- | --- |
| `comptes` | `compte`, `sessions`, `codes-connexion` | Le compte par son adresse ; ses sessions par le compte ; les demandes de code en recalculant l'empreinte à clé de l'adresse. |
| `validation` | `propositions` | Décidées par elle (`decide_par`), ou dont le contenu cite l'adresse comme valeur entière (le demandeur d'une demande d'achat). |
| `import-lot` | `lignes-importees` | Les lignes d'un fichier importé où l'adresse figure comme valeur entière. |
| `journal` | `journal` | Les lignes dont elle est l'auteur, par son compte (`utilisateur_id`, joint à `utilisateurs`). |
| `notifications` | `notifications` | Les envois qui lui ont été adressés, par le destinataire. |

Ce que l'effacement en fait :

| Unité | Source | Effacement |
| --- | --- | --- |
| `comptes` | `compte` | Anonymisé et désactivé, jamais supprimé ; refusé pour le dernier admin actif et un compte de démo. |
| `comptes` | `sessions`, `codes-connexion` | Supprimées. |
| `validation` | `propositions` | Gardées ; l'adresse remplacée, comme décideur et comme valeur du contenu. |
| `import-lot` | `lignes-importees` | Gardées ; l'adresse remplacée dans les valeurs. |
| `journal` | `journal` | Rien n'est réécrit : l'anonymisation du compte le détache de l'adresse. |
| `notifications` | `notifications` | Gardées ; le destinataire retiré. |

L'administration des comptes : la source `compte` sort aussi
`gere_par_l_appli` (un rôle fixé dans l'appli par un admin), et la table
`domaines_admis` est déclarée sans donnée personnelle.

## Les fichiers

| Fichier | Rôle |
| --- | --- |
| `export.ts` | `exporterDonnees`, `reponseFichier`, `normaliserAdresse`, `adresseLisible`, `tablesNonDeclarees`, le masquage des autres adresses, et les types `SourceDonnees`, `DonneeNonExportee`, `ExportDonnees`. |
| `effacement.ts` | `apercevoirEffacement`, `effacerDonnees`, et les types de l'effacement. |
| `origine.ts` | `vientDUnAutreSite` : le contrôle d'origine du formulaire de l'admin, sur le modèle de celui de l'import (brique import-lot). |
| `actions.ts` | `ACTIONS_RGPD`. |
| `purge.ts` | `apercevoirPurge`, `purger`, `purgerAuPassage` et leurs types. |
| `gabarits/` | Les trois gabarits hors code. |

Les pages `src/app/mes-donnees/` et `src/app/donnees-personnelles/` partent
avec la brique ; la seconde porte l'écran de l'effacement
(`EffacementDonnees.tsx`) et ses server actions (`actions.ts`).

La brique n'importe que ses fichiers, le registre, `@/lib/confidentialite`
(les durées déclarées) et `@/lib/format`. Elle n'importe pas la base :
l'appelant de l'effacement, de la trace de l'export et de la purge lui passe sa
fonction de transaction. Le script `scripts/purger-donnees.ts` part avec
elle.
`tests/rgpd-isolement.test.ts` refuse tout autre import : ni la base, ni un
module, ni une autre brique.

## Interface publique

Ce qu'une appli peut importer et appeler. Tout autre export existe pour les
fichiers de la brique ou pour ses tests : il peut changer sans entrée au
journal.

| Import | Symboles | Rôle |
| --- | --- | --- |
| `export.ts` | `exporterDonnees(adresse, maintenant?)` → `Promise<ExportDonnees>` | Le contenu du fichier pour une adresse, normalisée (minuscules, sans espaces), les adresses d'autrui masquées. Une adresse inconnue donne toutes les sources, vides, et les notes. `maintenant` : l'heure de `genere_le`, pour les tests. |
| `export.ts` | `reponseFichier(donnees, maintenant?)` → `Response` | Le fichier en pièce jointe (`donnees-personnelles-aaaa-mm-jj.json`, jour de `maintenant`), `Cache-Control: no-store`. |
| `export.ts` | `normaliserAdresse(adresse)` → `string`, `adresseLisible(adresse)` → `boolean` | L'adresse telle qu'elle est rangée ; le refus d'une saisie qui n'est pas une adresse (la route de l'admin). |
| `export.ts` | types `SourceDonnees`, `DonneeNonExportee`, `ExportDonnees` | `SourceDonnees` : `{ cle, titre, tables, lire(adresse), note?, effacement, effacer(executeur, adresse, auteur) }`, où `lire` reçoit l'adresse normalisée et ne rend jamais une empreinte ; `effacement` dit à l'admin ce que l'effacement fait des lignes, et `effacer` le fait dans la transaction reçue, en rendant `EffacementSource`. `auteur` (`AuteurEffacement`, `{ email }`) est l'admin qui efface : la source du compte le passe aux effets d'effacement du registre des effets de comptes. `tracerExport(executeur, adresse, auteur)`, facultatif : ce que la source fait quand l'admin exporte l'adresse (la source du journal y trace l'export). `DonneeNonExportee` : `{ quoi, pourquoi, tables }`. |
| `export.ts` | `tablesNonDeclarees(tables)` → `{ oubliees, fantomes }` | Le verrou du registre, pour le test d'une appli. |
| `export.ts` | `tracerExportDeLAdmin(adresse, { transaction, demandeur })` → `Promise<void>` | Trace l'export de l'admin par les sources qui déclarent `tracerExport`, dans une transaction ; lève si une trace échoue (le fichier ne part pas). Rien sans source qui trace. |
| `origine.ts` | `vientDUnAutreSite(request)` → `boolean` | Vrai si l'en-tête Origin désigne un autre site (la route de l'admin répond alors 403). Sans en-tête Origin : faux, un appel hors navigateur n'a pas de session à voler. |
| `effacement.ts` | `apercevoirEffacement(adresse, options)`, `effacerDonnees(adresse, options)` → `Promise<BilanEffacement \| { erreur }>` | L'aperçu joue l'effacement et l'annule ; `effacerDonnees` le fait. Tout se passe dans une transaction : un refus d'une source (`{ erreur }`, à afficher tel quel) ou un effet du registre des effets de comptes qui lève annule tout. `options` : `{ transaction, demandeur }`, où `transaction` est celle de la base (`transaction` de `src/lib/db/client.ts`) et `demandeur` l'adresse de l'admin : la sienne est refusée, et il est l'auteur que reçoit chaque source. |
| `effacement.ts` | types `BilanEffacement`, `EffacementSource`, `AuteurEffacement`, `ExecuteurEffacement`, `OptionsEffacement` | `BilanEffacement` : `{ adresse, effectue, sources: [{ cle, titre, lignes, effacement }], avertissements, nonEffacees: [{ quoi, pourquoi }] }`. `EffacementSource` : `{ lignes, avertissement? }` ou `{ erreur }`. `AuteurEffacement` : `{ email }`, l'adresse normalisée du demandeur. |
| `purge.ts` | `apercevoirPurge(options)`, `purger(options)`, `purgerAuPassage(options)` → `Promise<BilanPurge \| PurgeOccupee>` | L'aperçu joue la purge et l'annule ; `purger` efface tout ce qui a passé sa durée déclarée ; `purgerAuPassage` seulement les données marquées `auPassage`. Une purge en cours ailleurs rend `{ occupee: true }`. `options` : `{ transaction, conservations? }` (`conservations` : celles de l'appli par défaut, pour les tests). Lève `ErreurPurge` sur une table ou une colonne qui n'est pas un identifiant simple, avant toute requête. |
| `purge.ts` | types `OptionsPurge`, `BilanPurge`, `PurgeOccupee` ; classe `ErreurPurge` | `BilanPurge` : `{ effectue, effacees, aLaMain, horsBase }`, chaque ligne avec `cle`, `traitement`, `donnee` et `duree` (« 12 mois après le geste ») ; `effacees` et `aLaMain` ajoutent `table` et `lignes`, `aLaMain` et `horsBase` la `raison`. |
| `actions.ts` | `ACTIONS_RGPD` | `mes-donnees.exporter` (catalogue : membre et admin), `donnees.exporter` et `donnees.effacer` (catalogue : admin). |

**Interne** : `masquerAutresAdresses` et `CLE_VERROU_PURGE`, exportées pour leurs tests.

**Ce que l'appli remplit** :
- `src/config/acces.ts` : `...ACTIONS_RGPD` dans `ACTIONS`, et le rôle de chaque
  action dans `DROITS`. **Avec un seul rôle** (connexion seule), toute personne
  connectée a `donnees.exporter` et `donnees.effacer`, donc l'export et
  l'effacement des données de n'importe quelle adresse : le dire dans la
  blueprint, ou réserver ces actions ;
- `src/config/donnees-personnelles.ts` : une ligne par source, donnée non
  exportée ou table sans donnée personnelle ;
- `src/lib/confidentialite.ts` : `durees` (les durées choisies autrement que
  par les briques) et `dureesRevues`, une fois les durées validées avec le
  client ; la `conservation` de chaque traitement du projet.

**Règle d'entretien.** Tout changement d'interface publique (symbole ajouté,
retiré ou renommé, signature modifiée) met à jour cette section et ajoute une
entrée **en fin** de [`CHANGELOG.md`](CHANGELOG.md), dans la pull request qui
le fait : date, ce qui change pour l'appelant, raison.

## La brancher

Rien à faire dans le catalogue : les deux pages, l'écran de l'effacement, les
droits, les entrées de menu (« Mes données », « Données personnelles ») et le
script de purge sont en place. Le journal d'audit, quand l'appli l'a, trace
chaque export de l'admin, par sa source du registre, et l'effacement par le
registre des effets de comptes, sans rien brancher sur les actions de
l'effacement.

**Avant de répondre à une demande** (admin) : s'assurer que la demande vient
bien de la personne, et relire le fichier (les noms d'autres personnes n'y
sont pas masqués), avant de l'envoyer. Le délai de réponse et la procédure
sont à faire valider par le client.

**Avant d'effacer** (admin) : la même vérification de la demande. Proposer
l'export d'abord, si la personne veut garder ses données. Relire l'aperçu, puis
faire à la main ce que le bilan liste (adresse dans la configuration, données
non retrouvées par l'adresse).

**Purger** (équipe technique) : lancer le script en dry-run sur la base
visée, relire la première ligne et le rapport, puis relancer avec
`--confirmer`, à la main ; traiter ensuite ce qu'il liste à la main. La
fréquence (par exemple chaque mois) se décide avec le client et s'écrit dans
le registre des traitements.

**Un module neuf ou une table neuve** : décrire sa source chez lui, avec son
effacement (sur le modèle de `SOURCES_COMPTES`,
`src/briques/comptes/donnees-personnelles.ts`, et de `SOURCES_CONTRATS` pour
des données métier qui restent sans l'adresse), le tester dans ses propres
tests,
ou sa ligne dans `NON_EXPORTEES` ou `TABLES_SANS_DONNEE_PERSONNELLE`, puis
l'ajouter au registre. Déclarer aussi la durée de ses données, dans la
`conservation` de son traitement. Dans le catalogue, déclarer aussi son retrait dans la
liste de l'assembleur.

## Pièges verrouillés

Tests dans `tests/rgpd-export.test.ts`, `tests/rgpd-effacement.test.ts`,
`tests/rgpd-routes.test.ts` et `tests/rgpd-purge.test.ts` ; l'effacement de chaque source, dans les tests de
son unité.

| Piège | Test |
| --- | --- |
| Une table neuve oubliée par l'export | « chaque table de la base est déclarée… », prouvé par « attrape une table oubliée et une déclaration sans table » |
| Une empreinte dans le fichier | « ne sort aucune empreinte, et dit pourquoi dans les notes » |
| L'adresse d'une autre personne dans le fichier | « masque toute adresse autre que celle exportée, à toute profondeur, et garde les dates » (et, avec la brique validation, « masque toute autre adresse e-mail que celle exportée ») |
| Une adresse qui en contient une autre passe pour elle (avec la brique validation) | « ne confond pas l'adresse avec une adresse qui la contient » |
| Un membre qui lit les données d'un autre | « exporte l'adresse de la session, sans lire la requête » ; « répond 404 à un membre » |
| L'adresse dans l'URL, donc dans les journaux | « n'a pas de GET » |
| Un formulaire posté depuis un autre site | « refuse un envoi venu d'un autre site » |
| Un effacement à moitié fait | « refuse d'effacer le dernier admin actif, et n'efface alors rien d'aucune source » ; « un effet qui échoue annule tout l'effacement » ; « joue les effets dès l'aperçu, et les annule avec lui » |
| Un aperçu qui ne dit pas ce que fera la confirmation | « l'aperçu dit ce qui serait effacé, source par source, sans rien changer » ; « dit le refus dès l'aperçu » |
| Le journal réécrit, ou supprimé avec le compte | « anonymise le compte sans le supprimer… » ; « compte les gestes de l'adresse sans réécrire aucune ligne du journal » (`tests/journal.test.ts`) |
| Une adresse lue de travers | « refuse une confirmation qui ne redit pas l'adresse, et n'efface rien » |
| Un admin qui s'efface lui-même | « refuse qu'un admin efface ses propres données » |
| Un membre qui efface | « répond 404 à un membre, à l'aperçu comme à l'effacement » |
| Une durée annoncée que rien ne tient | « efface ce qui a passé sa durée et garde le reste… » ; « chaque purge déclarée vise une table et une colonne de date qui existent dans la base » |
| Une durée sans purge passée sous silence | « une durée déclarée sans purge possible est signalée, jamais ignorée… » |
| Une purge lancée sans relecture | « l'aperçu compte ce qui serait effacé, sans rien effacer… » ; « en dry-run, nomme la base en première ligne… » |
| Deux purges au passage simultanées | « au passage, une purge déjà en cours ailleurs fait passer son chemin à la seconde… » |
| Le journal purgé par une requête | « le journal déclare 12 mois après le geste, purgés par le script seul, jamais au passage » (`tests/journal.test.ts`) |
| Une surcharge de durée mal tapée | « chaque durée surchargée par le projet désigne une conservation déclarée… » |
| Un export de l'admin sans trace | « trace l'export au journal, au nom de l'admin… » |

## Questions ouvertes

| Question | Qui tranche | Avant quelle étape |
| --- | --- | --- |
| Une recherche par nom pour les données sans adresse (client d'un dossier, intervenant) ? | Personne responsable du projet | Au premier besoin réel d'un client |
