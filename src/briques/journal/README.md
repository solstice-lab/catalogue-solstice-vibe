# Brique journal

Qui a créé, modifié ou supprimé quoi, et quand. Les entreprises
demandent souvent qui a modifié une fiche ; une fiche supprimée n'a plus de page
pour le dire.

La règle du catalogue est de ne rendre générique qu'au deuxième besoin réel
d'un client ; cette brique est née d'une demande explicite de la personne
responsable du projet.

## Ce qu'elle apporte (v1)

- **Une table `journal_audit`** : l'instant, l'auteur, l'action (*création*,
  *modification*, *suppression*, et *export* pour l'export des données d'une
  personne par l'admin), l'entité, son identifiant, sa référence au
  moment du geste et, pour une modification, les **noms** des champs changés.
- **Une trace écrite dans la transaction de l'écriture** (`journaliser`) : une
  écriture qui échoue ne laisse pas de trace, une trace qui échoue annule
  l'écriture. Sans personne connectée, ou pour une personne sans compte en base,
  `ErreurJournal` est levée : ni la fiche ni la trace ne s'écrivent.
- **L'écran `/journal`**, réservé à l'action `journal.consulter` (l'admin au
  catalogue) : les 1 000 dernières lignes dans un `Tableau`, avec tri et
  filtres, sans export : un fichier téléchargé copierait les adresses des
  auteurs hors d'atteinte de la purge et de l'anonymisation. C'est là qu'on
  retrouve une fiche supprimée.
- **L'historique d'une fiche** (`HistoriqueFiche`), sous ses champs, pour qui a
  le même droit ; rien pour les autres. La fiche reste en lecture seule.
- **Un journal qui ne s'efface pas depuis l'appli** :
  - la base refuse tout `UPDATE` sur la table (trigger) ;
  - un test-verrou (`tests/journal-isolement.test.ts`) interdit à `src/` et à
    `scripts/` tout `DELETE`, `TRUNCATE` ou `UPDATE` de la table ;
  - la base garde le `DELETE` pour la purge de la brique RGPD
    (`scripts/purger-donnees.ts`), qui bâtit sa requête depuis la durée que
    la brique déclare, sans nommer la table : le test-verrou n'a pas
    d'exemption, et `tests/journal.test.ts` vérifie que cette durée ne se
    purge jamais au passage d'une requête.

Au catalogue, elle est branchée sur le patron `dossiers` : création,
modification, suppression unitaire et en lot (une ligne par dossier). C'est le
modèle qu'un module copie. Une appli neuve ne reçoit pas ce patron : le journal
n'y trace d'abord que les gestes de `/comptes` ci-dessous, et son module métier
s'y branche sur ce modèle, lu au catalogue public.

Elle trace aussi les gestes de l'écran `/comptes` (brique gestion-comptes) :
inviter une adresse, changer un rôle, désactiver ou réactiver un compte
(entité `compte`), ouvrir ou fermer un domaine (entité `domaine`). La brique
comptes ne peut pas l'importer, puisqu'elle l'exige :
- invitation, rôle et domaines prennent une `trace` que les actions de
  `src/app/comptes/actions.ts` construisent avec `journaliser` ;
- désactivation, réactivation et effacement (brique rgpd) passent par le
  registre des effets de comptes (`src/config/effets-comptes.ts`), le même que
  celui des modules : la brique y a son entrée, `EFFETS_JOURNAL`
  (`effets-comptes.ts`), qui trace le geste au nom de son auteur.

Un compte s'y désigne par « compte n°12 », jamais par son adresse.

## Ce qu'elle ne fait pas (v1)

- **Les lectures**, sauf une : l'export des données d'une personne par l'admin
  (brique rgpd), tracé en action `export` sur « compte n°<id> », au nom de
  l'admin, par `tracerExport` de `SOURCES_JOURNAL`. Une adresse sans compte
  ne laisse rien. Ni les autres lectures sensibles ni les exports de tableaux :
  aucun module du catalogue ne les définit, et le volume serait sans commune
  mesure. Celui que la personne fait de ses propres données ne se trace pas.
- **Les connexions et déconnexions.** La brique comptes devrait exiger le
  journal, qui l'exige déjà : la dépendance serait circulaire.
  `utilisateurs.derniere_connexion` dit déjà la dernière entrée. Un journal de
  connexion est un autre traitement (la sécurité), avec sa propre durée : il
  passera par un point d'accroche de la brique comptes, si un client le demande.
- **Les valeurs.** Ni l'avant ni l'après : ce serait une copie des données
  personnelles d'une fiche (noms, notes), à effacer aussi lors d'un droit à
  l'effacement. Si un client en a besoin, l'extension prévue est une liste de
  champs que le module déclare non personnels (un statut, un montant), dont les
  valeurs seraient gardées.
- **Les décisions de la brique validation**, si l'appli l'a. Elle trace déjà les siennes
  (`propositions.decide_par`, `decide_le`) : le journal ne les recopie pas. Un
  applicateur qui écrit une entité peut appeler `journaliser` dans la
  transaction qu'il reçoit.
- **Les écritures sans session** (un script d'import, une tâche planifiée) :
  `auteurCourant` lève faute de personne connectée, et l'écriture n'a pas lieu.
  Un script qui écrit par une fonction tracée (`creerDossier` dans le patron)
  échoue donc tant que le journal y est branché. La trace d'un import (une
  ligne par lot, un auteur « script » nommé) est à cadrer avec le premier
  import réel.
- **Les modules métier d'une appli** et les imports en lot : branchés au
  besoin réel du client, sur le modèle des dossiers.

## Données personnelles et conservation

- **L'auteur** se désigne par son compte (`utilisateur_id`, clé étrangère vers
  `utilisateurs`, `ON DELETE RESTRICT`), jamais par son adresse. Anonymiser un
  compte anonymise donc le journal sans le réécrire. Un compte qui a laissé une
  trace ne se supprime plus (la brique comptes désactive, elle ne supprime pas) :
  l'administration des comptes désactive elle aussi, et une purge qui
  en supprimerait un efface d'abord ses lignes.
- **La référence** (`libelle`) est celle de la fiche au moment du geste : le
  module la choisit, jamais un nom ni une adresse. Un compte s'y désigne par
  son numéro (« compte n°12 »).
- **Durée de conservation : 12 mois après le geste**, déclarée dans
  `confidentialite.ts` (clé `journal`). La purge est le script de la brique
  rgpd (`scripts/purger-donnees.ts`), en dry-run par défaut, `--confirmer`
  tapé par un humain ; jamais au passage d'une requête (`tests/journal.test.ts`).
  L'index sur `le` la sert, et celui sur `utilisateur_id` sert l'export des
  gestes d'une personne. Une obligation légale plus longue chez un client se
  décide avec lui et s'écrit dans `CONFIDENTIALITE.durees`.
- **La politique de confidentialité** (`/confidentialite`, socle) décrit le
  traitement d'après `confidentialite.ts`, durée comprise, « à valider » tant
  que le projet ne l'a pas revue (`dureesRevues`). Sa base légale et ses
  destinataires restent vides dans `CONFIDENTIALITE.choix`
  (`src/lib/confidentialite.ts`), comme pour les autres briques.
- **L'export des données d'une personne** (brique rgpd, gardée d'office avec comptes) sort
  les lignes dont elle est l'auteur, par `donnees-personnelles.ts` : la date,
  l'action, la fiche, sa référence et le nom des champs changés. Les gestes
  d'autres personnes sur une fiche qui la concerne n'y sont pas : le journal se
  retrouve par son auteur. Les gestes d'un admin sur son compte à elle
  (« compte n°12 » : invitation, rôle, désactivation) n'y sont pas non plus.
- **L'effacement des données d'une personne** (brique rgpd) ne réécrit aucune
  ligne : l'anonymisation de son compte (brique comptes) détache ses gestes de
  l'adresse. La source les compte, pour l'aperçu de l'admin. L'anonymisation se
  trace elle-même, en modification de « compte n°<id> », par l'entrée de la
  brique au registre des effets de comptes.

## Les fichiers

| Fichier | Rôle |
| --- | --- |
| `evenements.ts` | Pur : `ACTIONS_JOURNAL` (le droit de lecture), `ACTIONS_JOURNALISEES`, `libelleAction`, `champsModifies`. Importé aussi par `src/config/acces.ts`. |
| `journal.ts` | Serveur : `auteurCourant`, `journaliser`, `lireJournal`, `historiqueSiPermis`, `ErreurJournal`, les limites de lecture. |
| `TableauJournal.tsx` | Client : le `Tableau` des lignes, pour l'écran et pour la fiche. |
| `HistoriqueFiche.tsx` | Serveur : la section « Historique » d'une fiche, ou rien sans le droit. |
| `confidentialite.ts` | La description du traitement, pour la politique de confidentialité. N'importe rien : la page publique ne doit pas atteindre la base. |
| `effets-comptes.ts` | `EFFETS_JOURNAL` : la trace d'un compte désactivé, réactivé ou effacé, pour le registre des effets de comptes (`src/config/effets-comptes.ts`). Serveur seulement. |
| `donnees-personnelles.ts` | Ce que le journal garde sur une adresse, pour l'export et l'effacement des données d'une personne de la brique rgpd, gardée d'office avec comptes. Serveur seulement. |

Hors du dossier, partis avec elle quand une copie ne la garde pas : la page
`src/app/journal/` et les tests `tests/journal*.test.ts`. L'assembleur retire
aussi les étapes `journal_audit` de `src/lib/db/migrations.ts` (la table, puis l'action `export`), ses lignes de
`src/config/acces.ts` et de `src/lib/navigation.ts`, ses lignes de
`src/lib/confidentialite.ts` (le traitement et ses choix) et de
`src/config/donnees-personnelles.ts` (la source de l'export) avec son cas de
`tests/rgpd-export.test.ts`, sa ligne du nettoyage des comptes de
`tests/aide-comptes.ts` et, dans une appli qui a reçu le patron `dossiers`,
l'historique de la fiche dossier, et rend aux écritures de son
`src/lib/db/dossiers.ts` leurs simples requêtes, sans transaction ni trace. Il
retire enfin la trace que les actions de `src/app/comptes/actions.ts` passent
à l'administration des comptes, son entrée de `src/config/effets-comptes.ts`,
et le cas de
`tests/rgpd-routes.test.ts` qui trace l'effacement.

La table naît par l'étape « journal_audit : … » de `src/lib/db/migrations.ts`,
jamais dans `schema.sql`, avec ses trois index et son trigger dans la même
étape. La liste des actions du code est comparée à la contrainte
`journal_audit_action_check` par un test.

La brique exige `donnees` et `comptes` : elle lit la personne de la session
(`utilisateurCourant`) et les droits (`peut`) de `roles.ts`, et la table
`utilisateurs`. Elle n'importe que le socle, le client de base, `roles.ts` et le type des
effets de comptes (`effets.ts`) :
`tests/journal-isolement.test.ts` le verrouille.

## Interface publique

Ce qu'une appli peut importer et appeler. Les autres exports servent aux
fichiers de la brique ou à ses tests : ils peuvent changer sans entrée au
journal des changements.

| Import | Symboles | Rôle |
| --- | --- | --- |
| `journal.ts` (serveur) | `auteurCourant()` → `Promise<Auteur>` | La personne de la session, à lire **avant** d'ouvrir la transaction : la lecture de session prend sa propre connexion au pool, et la prendre pendant la transaction ferait s'attendre les écritures quand le pool est plein. Lève `ErreurJournal` sans personne connectée. |
| `journal.ts` (serveur) | `journaliser(tx, auteur, evenement)` → `Promise<void>` | Trace une écriture dans sa transaction (`tx`, celle que donne `transaction()` de `src/lib/db/client.ts`, ou l'exécuteur qu'un effet du registre des effets de comptes reçoit : `query` lui suffit). Une modification sans champ changé n'écrit rien. Lève `ErreurJournal` (action inconnue, entité qui n'est pas un identifiant simple, auteur sans compte en base), ce qui annule la transaction. |
| `journal.ts` | `lireJournal({ entite?, entiteId?, limite? })` → `Promise<LigneJournal[]>` | Les lignes, de la plus récente à la plus ancienne. Sans garde : la page qui l'appelle a exigé `journal.consulter`. |
| `journal.ts` | `historiqueSiPermis(entite, entiteId)` → `Promise<LigneJournal[] \| null>` | L'historique d'une fiche, ou `null` sans le droit `journal.consulter`. |
| `journal.ts` | types `Auteur`, `Evenement`, `LigneJournal`, `Transaction` ; classe `ErreurJournal` ; `LIMITE_ECRAN`, `LIMITE_FICHE` | Entrées, retours et limites de ces fonctions. Le message de l'erreur commence par « Brique journal : ». |
| `evenements.ts` (pur) | `ACTIONS_JOURNAL`, `ACTIONS_JOURNALISEES`, `libelleAction(action)`, `champsModifies(avant, apres)` ; type `ActionJournalisee` | Le droit à déclarer, les actions (`creation`, `modification`, `suppression`, `export`), leur libellé (une action inconnue se dit telle quelle), les noms des champs changés. |
| `TableauJournal.tsx` | `TableauJournal({ id, lignes, avecEntite })` | Le tableau des lignes, sans export. |
| `HistoriqueFiche.tsx` | `HistoriqueFiche({ entite, entiteId })` | À placer sous la `Carte` d'une fiche. |
| `confidentialite.ts` | `TRAITEMENTS_JOURNAL` | Le traitement du journal (clé `journal`), au format `Traitement` de `src/lib/confidentialite.ts`, qui l'importe, avec sa `conservation` : 12 mois après le geste (clé `journal`), purgés par le script de la brique rgpd seul. L'assembleur retire cet import et la ligne `journal` des choix quand la brique part. |
| `effets-comptes.ts` (serveur seulement) | `EFFETS_JOURNAL` | L'entrée de la brique au registre des effets de comptes (`src/config/effets-comptes.ts`) : un compte désactivé, réactivé ou effacé se trace en modification de « compte n°<id> », au nom de l'auteur du geste. L'assembleur retire cet import et la ligne du registre quand la brique part. |
| `donnees-personnelles.ts` (serveur seulement) | `SOURCES_JOURNAL` | Pour la brique rgpd, gardée d'office avec comptes : la source `journal` de son export, que son registre rassemble. Les lignes dont la personne est l'auteur. Son `effacer` les compte sans en réécrire aucune ; son `tracerExport` trace l'export de l'admin. L'assembleur retire cet import et la ligne du registre quand la brique part. |

**Interne** : `estActionJournalisee`. La table `journal_audit` n'est pas une
interface : l'appli passe par les fonctions ci-dessus, et seule la purge de la
brique RGPD y supprimera des lignes.

**Règle d'entretien.** Tout changement d'interface publique (symbole ajouté,
retiré ou renommé, signature ou forme d'un retour modifiée) met à jour cette
section et ajoute une entrée **en fin** de [`CHANGELOG.md`](CHANGELOG.md), dans
la pull request qui le fait : date, ce qui change pour l'appelant, raison.

## La brancher

Sur le modèle de `src/lib/db/dossiers.ts`, qui se lit dans le catalogue public
(dépôt `solstice-lab/catalogue-solstice-vibe`), pas dans une appli neuve :

1. La server action garde `exiger(action)` en première ligne : c'est elle qui
   établit la personne. Rien d'autre ne change dans l'action.
2. Dans la couche données du module, l'auteur se lit avant la transaction, puis
   l'écriture et sa trace passent dans une même `transaction()` :

   ```ts
   const auteur = await auteurCourant();
   return transaction(async (tx) => {
     const avant = await tx.queryOne<Contrat>(`SELECT ${COLONNES} FROM contrats WHERE id = $1 FOR UPDATE`, [id]);
     const [contrat] = await tx.query<Contrat>(MISE_A_JOUR, [id, ...parametres(champs)]);
     if (avant && contrat) {
       await journaliser(tx, auteur, {
         action: "modification",
         entite: "contrats",
         entiteId: id,
         libelle: contrat.reference,
         champs: champsModifies(avant, champs),
       });
     }
     return contrat;
   });
   ```

   - L'entité porte le nom de sa table, en identifiant simple.
   - Le libellé est la référence métier, jamais un nom de personne.
   - Une suppression en lot écrit une ligne par fiche (`DELETE … RETURNING`).

   Une brique que le journal exige ne peut pas l'importer : ses écritures
   prennent alors une trace, que l'appelant construit avec `journaliser` et la
   personne que lui rend `exiger`. C'est le cas de la brique comptes, dont les
   actions de `/comptes` passent la trace (README de comptes, « La trace d'un
   geste ») ; les entités y sont `compte` et `domaine`, sans fiche. Ce
   qu'un module fait d'un compte désactivé ou effacé se trace dans son effet du
   registre des effets de comptes, avec l'auteur que l'effet reçoit.
3. Sous la fiche : `<HistoriqueFiche entite="contrats" entiteId={contrat.id} />`.

Le droit `journal.consulter` se déclare dans `src/config/acces.ts` (`DROITS`),
comme une action de module. L'entrée « Journal » de `src/lib/navigation.ts`
porte `visiblePour("journal.consulter")`.

## Décisions prises

Plan validé par délégation de la personne responsable du projet,
avec toutes ses recommandations.

| Décision | Retenu | Écarté |
| --- | --- | --- |
| Où se branche l'appel | Dans la transaction de l'écriture, dans la couche données, l'auteur lu juste avant ; la server action garde `exiger` en première ligne | Juste après `exiger` : une écriture qui échoue laisserait une trace fausse |
| Ce qu'on journalise | Les écritures seulement | Les lectures sensibles, les connexions (voir plus haut) |
| Le détail | Objet, action, référence, noms des champs changés | L'avant et l'après en valeurs |
| Qui | `utilisateur_id`, retrouvé par l'adresse de la session | L'adresse en clair (le choix de la brique validation) |
| Conservation | 12 mois, purge par la brique RGPD | Une durée égale à la vie de la fiche |
| Un écran | `/journal` pour l'admin, et l'historique sur la fiche | La table seule |
| Effacement | Aucun depuis l'appli : trigger contre l'`UPDATE`, test-verrou contre le reste | Un trigger contre le `DELETE` aussi : il bloquerait la purge du RGPD |

## Sources

- Le plan validé (section « Décisions prises »).
- Le README de la brique validation (au catalogue) : la décision tracée dans la transaction
  de son effet, et le contrôle d'une liste du code contre une contrainte.
- `.claude/skills/solstice-donnees/SKILL.md` : l'étape de migration en fin, ses
  index dans la même étape, et le patron `dossiers`.
