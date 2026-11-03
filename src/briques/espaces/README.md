# Brique espaces

Des groupes de personnes dans une même appli : une personne crée un espace (une
coloc, une association, un club, une équipe, une famille), d'autres le
rejoignent par un code, un lien ou une invitation par e-mail. L'espace a ses
rôles (« gestionnaire », « membre », renommables), et chaque module métier ne
lit et n'écrit que dans l'espace de la personne connectée.

Née de l'essai tours-de-coloc (2026-11-03) : cinq tickets sur seize y
réécrivaient la même chose. Rien n'y est propre à une coloc. C'est aussi la
partie la plus risquée à réécrire à chaque appli, puisque l'isolation entre
groupes en dépend : la brique la porte une fois, et un test-verrou refuse un
module qui lirait sans elle.

La fiche a été écrite avant le code, puis les tests, un par piège, puis le
code.

Elle est **optionnelle** et exige les briques **comptes** (qui est connecté,
les effets d'un compte désactivé ou effacé) et **mails** (les invitations).

## Ce qu'elle apporte (v1)

- **Deux entités**, en base par une étape en fin de
  `src/lib/db/migrations.ts` :
  - l'**espace** : un nom et un **code d'invitation** de huit caractères, sans
    caractère ambigu (ni `0`/`O`, ni `1`/`I`/`L`), affiché `ABCD-EFGH`, lu
    sans tenir compte de la casse, des espaces ni du tiret. Un gestionnaire le
    **régénère** : l'ancien code et son lien cessent aussitôt de marcher ;
  - l'**adhésion** d'un compte à un espace : un **prénom affiché propre à
    l'espace** (jamais l'adresse e-mail, qui ne s'affiche nulle part), un rôle
    (gestionnaire ou membre), une **arrivée** et un **départ** avec son motif
    (parti, retiré, compte désactivé). Une adhésion terminée **ne se supprime
    pas** : revenir crée une nouvelle adhésion.
- **Les gestes**, tous côté serveur, chacun dans une transaction sous le verrou
  de l'espace :
  - **créer** un espace : la personne en devient gestionnaire ;
  - **rejoindre** par le code ou par le lien `/espace/rejoindre?code=…`, avec
    son prénom ; rejoindre un espace où l'on est déjà ne fait rien de plus ;
  - **quitter** ;
  - **retirer un membre**, **nommer** ou **retirer un gestionnaire**, réservés
    aux gestionnaires de l'espace ;
  - le **dernier gestionnaire** d'un espace qui a d'autres membres ne perd son
    rôle ni ne part : retirer son rôle, le retirer ou le laisser quitter est
    refusé, y compris par deux requêtes simultanées. Le refus dit quoi faire
    (« nommez d'abord un autre gestionnaire ») ;
  - un **espace sans membre** n'est pas supprimé : la prochaine personne qui
    le rejoint par son code en devient gestionnaire.
- **Les invitations par e-mail**, par la brique `mails` : un gestionnaire
  saisit une adresse, le mail part avec le nom de l'espace, le prénom de qui
  invite, le code et le lien. Deux **plafonds glissants sur 24 heures**,
  comptés en base sous verrou avant l'envoi : par espace, et pour toute
  l'appli. Une entrée ouverte (n'importe qui crée un compte, puis un espace) ne
  devient pas un relais d'envoi : un seul destinataire par invitation, aucun
  message libre, et un nom d'espace ou un prénom qui ressemble à un lien ou à
  une adresse est refusé à la saisie.
- **Les essais de code limités** par compte (plafond par heure, compté en
  base) : un compte ne parcourt pas les codes jusqu'à tomber sur un espace.
- **Les réglages** (`src/config/espaces.ts`) : un ou plusieurs espaces par
  compte, le vocabulaire, les plafonds.
- **L'isolation** : un accès unique, `exigerMonEspace(action)`, qui rend
  l'espace de la personne connectée, relu en base à chaque requête, et une
  `base` dont chaque requête reçoit l'identifiant de cet espace en `$1`. Un
  module métier rattaché à un espace (sa table a une colonne `espace_id`) ne
  lit et n'écrit que par elle. `tests/espaces-isolation.test.ts` le
  verrouille : il refuse un fichier qui interroge une telle table par
  `query`, `queryOne` ou `transaction` du client de base, et prouve sa
  sensibilité sur un cas fautif.
- **Les effets d'un compte** déclarés au registre
  `src/config/effets-comptes.ts` :
  - **désactivation** : ses adhésions se terminent (motif « compte
    désactivé ») ; s'il était le dernier gestionnaire d'un espace, le membre
    le plus ancien le devient ;
  - **effacement** : mêmes effets, puis son prénom devient « Ancien membre »
    dans toutes ses adhésions, terminées comprises ;
  - **réactivation** : rien. Une adhésion terminée ne revit pas ; la personne
    rejoint de nouveau par le code.
- **Deux écrans** sur le kit `src/ui/` :
  - **« Créer ou rejoindre »** (`/espace/rejoindre`) : deux `Carte`s, l'une
    pour créer (nom de l'espace, son prénom), l'autre pour rejoindre (code,
    prénom), le code prérempli par le lien. Une personne sans espace y arrive
    depuis toute page d'un module rattaché à un espace ;
  - **« Mon espace »** (`/espace`) : le nom, le code et le lien à copier, un
    `Tableau` des membres (prénom, rôle, arrivée) et, pour un gestionnaire,
    les gestes par membre, chacun dans une `Modale` qui dit ses effets et
    affiche le refus du serveur ; l'invitation par e-mail ; régénérer le code ;
    quitter. Avec plusieurs espaces par compte, le choix de l'espace courant.
- **RGPD** : la source « Espaces » de l'export et de l'effacement
  (`src/config/donnees-personnelles.ts`), le traitement « Espaces » de la
  politique de confidentialité (`src/lib/confidentialite.ts`), les tables sans
  donnée personnelle déclarées.
- **L'assembleur** : l'entrée `espaces` de `outils/modules.mjs` (fichiers,
  étape de migration, lignes des registres, droits, menu), la skill
  `creer-appli`, et un cas de `tests/assembleur.test.ts`.

## Hors v1

- **Renommer un espace**, **changer son prénom** : la saisie se fait à la
  création et à l'arrivée. Voir « Questions ouvertes ».
- **Supprimer un espace** : un espace vide reste, repris par la prochaine
  personne qui le rejoint.
- **Une invitation nominative** (lien à usage unique, lié à une adresse) :
  l'invitation donne le code de l'espace, que la personne peut transmettre.
  Régénérer le code ferme la porte.
- **Demander à rejoindre** (validation par un gestionnaire) : qui a le code
  entre.
- **Des rôles d'espace au-delà de deux** (gestionnaire, membre) : leurs noms se
  règlent, pas leur nombre.
- **Des droits d'appli par rôle d'espace** : un module qui réserve un geste aux
  gestionnaires lit `adhesion.role` de ce que rend `exigerMonEspace`.
- **L'historique des anciens membres à l'écran** : les adhésions terminées
  restent en base, « Mon espace » ne montre que les membres présents.
- **Un espace dans l'adresse** (`/coloc/12/taches`) : l'espace courant est
  celui de la personne, jamais lu dans l'URL.

## Les fichiers

| Fichier | Rôle |
| --- | --- |
| `domaine.ts` | `ACTIONS_ESPACES` ; les types `Espace`, `Adhesion`, `RoleEspace`, `MotifDepart`. Importable côté client. |
| `reglages.ts` | Le type `ReglagesEspaces` que remplit `src/config/espaces.ts`, et ses mots dérivés (« Créer un espace », « cet espace »). Importable côté client. |
| `code.ts` | Tirer un code, le normaliser à la saisie, l'afficher. Pur. |
| `saisie.ts` | Le contrôle d'un nom d'espace et d'un prénom (longueur, pas de lien ni d'adresse). Pur. |
| `espaces.ts` | Les gestes, par `transaction()` sous verrou : créer, rejoindre, quitter, retirer, nommer, retirer un gestionnaire, régénérer le code, lire un espace et ses membres. Serveur seulement. |
| `invitations.ts` | L'invitation par e-mail : plafonds comptés en base, puis envoi par la brique mails. Serveur seulement. |
| `acces.ts` | L'accès unique : `monEspace`, `exigerMonEspace`, le type `BaseEspace`. Serveur seulement. |
| `effets-comptes.ts` | `EFFETS_ESPACES`, l'entrée de la brique au registre des effets de comptes. Serveur seulement. |
| `donnees-personnelles.ts` | `SOURCES_ESPACES`, pour l'export et l'effacement (brique rgpd). Serveur seulement. |
| `confidentialite.ts` | `TRAITEMENTS_ESPACES`, pour la politique de confidentialité. N'importe pas la base. |
| `EcranCreerOuRejoindre.tsx`, `EcranMonEspace.tsx` | Les deux écrans, et leurs morceaux client (formulaires, modales). |

Hors du dossier, partis avec elle quand une copie ne la garde pas :
`src/config/espaces.ts` (les réglages), `src/app/espace/` (les deux pages et
leurs server actions) et les tests `tests/espaces*.test.ts`.

La brique n'importe que le socle (`@/ui`, `@/lib/format`, `@/lib/db/client`,
React, Next), la brique comptes (`roles.ts` pour `exiger` et
`utilisateurCourant`, `effets.ts` pour ses types) et la brique mails
(`envoi.ts`). `tests/espaces-isolement.test.ts` le verrouille par une liste
blanche, prouvée par un cas fautif.

Quatre tables, créées par une étape en fin de `src/lib/db/migrations.ts` :

| Table | Ce qu'elle garde |
| --- | --- |
| `espaces` | Le nom, le code, la date de création. |
| `espaces_adhesions` | Le compte (`utilisateur_id`), l'espace, le prénom, le rôle, l'arrivée, le départ et son motif. Une seule adhésion en cours par compte et par espace (index unique partiel). Les clés étrangères refusent la suppression d'un espace ou d'un compte qui a des adhésions. |
| `espaces_invitations` | Une ligne par invitation envoyée : l'espace et l'heure, sans l'adresse. Sert les plafonds. |
| `espaces_essais_code` | Une ligne par code faux saisi : le compte et l'heure. Effacée au-delà d'une heure. |

## Interface publique

Ce qu'une appli peut importer et appeler : ce que ce README présente comme
appelable (« Les fichiers », « La brancher ») et les types qui composent ces
symboles. Tout autre export existe pour les fichiers de la brique ou ses
tests et peut changer sans entrée au journal.

| Import | Symboles | Rôle |
| --- | --- | --- |
| `domaine.ts` | `ACTIONS_ESPACES` ; types `Espace`, `Adhesion`, `RoleEspace`, `MotifDepart` | L'action `espaces.participer` (créer, rejoindre, voir son espace, quitter), à étendre dans `ACTIONS` de `src/config/acces.ts`. Les gestes de gestionnaire ne sont pas des droits d'appli : la brique les vérifie sur l'adhésion. |
| `reglages.ts` | type `ReglagesEspaces` | La forme de `ESPACES` dans `src/config/espaces.ts`. |
| `acces.ts` (serveur seulement) | `exigerMonEspace(...actions)` → `MonEspace` ; `monEspace()` → `MonEspace \| null` ; types `MonEspace`, `BaseEspace` | L'accès unique d'un module rattaché à un espace. `exigerMonEspace` appelle `exiger`, puis renvoie vers `/espace/rejoindre` une personne sans espace. `MonEspace` : `{ utilisateur, espace, adhesion, base }`. `base` a `query`, `queryOne`, `transaction`, qui passent l'identifiant de l'espace en `$1` et refusent une requête qui ne filtre pas `espace_id = $1`. |
| `espaces.ts` (serveur seulement) | `creerEspace`, `rejoindre`, `quitter`, `retirerMembre`, `nommerGestionnaire`, `retirerGestionnaire`, `regenererCode`, `choisirEspace` → `Refus \| …` ; `lireEspace`, `lireMembres` | Le corps des server actions de `src/app/espace/actions.ts`, appelé après `exiger`, avec la personne qu'il rend. `Refus` : `{ erreur }`, à afficher. |
| `invitations.ts` (serveur seulement) | `inviterParEmail` | Idem, pour l'invitation. |
| `effets-comptes.ts` | `EFFETS_ESPACES` | Son entrée de `src/config/effets-comptes.ts`. |
| `donnees-personnelles.ts` | `SOURCES_ESPACES` | Sa source de `src/config/donnees-personnelles.ts` (brique rgpd). |
| `confidentialite.ts` | `TRAITEMENTS_ESPACES` | Son traitement dans `src/lib/confidentialite.ts`. |
| `EcranCreerOuRejoindre.tsx` | `EcranCreerOuRejoindre({ codeInitial, actions })` | Le contenu de `/espace/rejoindre`, que la page entoure d'`AppLayout`. |
| `EcranMonEspace.tsx` | `EcranMonEspace({ monEspace, membres, autresEspaces, lienDInvitation, actions })` | Le contenu de `/espace`. Les server actions lui sont passées en `actions` : la brique n'importe rien de `src/app`. |

**Règle d'entretien.** Tout changement d'interface publique met à jour cette
section et ajoute une entrée **en fin** de [`CHANGELOG.md`](CHANGELOG.md),
dans la pull request qui le fait : date, ce qui change pour l'appelant,
raison.

## La brancher : un module rattaché à un espace

L'assembleur branche la brique (droits, menu, registres, pages). Ce qui reste à
l'appli, c'est chaque module métier dont les fiches appartiennent à un espace.
Il copie le patron `dossiers` (`CLAUDE.md` §3), avec trois différences :

1. **Sa table** a `espace_id BIGINT NOT NULL REFERENCES espaces(id)` et un
   index qui commence par `espace_id`. Une référence unique l'est par espace
   (`UNIQUE (espace_id, reference)`).
2. **Ses fonctions de données** prennent la `base` de l'espace au lieu
   d'importer `query` :

   ```ts
   import type { BaseEspace } from "@/briques/espaces/acces";

   export function listerTaches(base: BaseEspace) {
     return base.query<Tache>("SELECT * FROM taches WHERE espace_id = $1 ORDER BY echeance", []);
   }

   export function creerTache(base: BaseEspace, titre: string) {
     return base.queryOne<Tache>("INSERT INTO taches (espace_id, titre) VALUES ($1, $2) RETURNING *", [titre]);
   }
   ```

3. **Ses pages et server actions** commencent par `exigerMonEspace` à la place
   d'`exiger` (`tests/gardes-acces.test.ts` accepte l'une ou l'autre) :

   ```ts
   const { base, adhesion } = await exigerMonEspace("taches.acceder");
   ```

Une fiche se retrouve par `espace_id = $1 AND id = $2` : un identifiant d'un
autre espace donne « introuvable », comme un identifiant qui n'existe pas.

## Ce qu'on configure (`src/config/espaces.ts`)

| Réglage | Défaut | Effet |
| --- | --- | --- |
| `plusieursParCompte` | `false` | Faux : rejoindre ou créer est refusé à qui a déjà un espace (« quittez d'abord… »). Vrai : « Mon espace » propose de passer d'un espace à l'autre ; l'espace courant est gardé dans un cookie, revérifié en base à chaque requête, et à défaut c'est l'espace rejoint le plus récemment. |
| `vocabulaire` | « espace », « Gestionnaire », « Membre » | Les mots de l'interface et des mails : `un` (« une coloc »), `le` (« la coloc »), `mon` (« ma coloc »), `ce` (« cette coloc »), et les noms des deux rôles (« Admin de la coloc », « Membre »). Écrits en entier, pour l'élision et le genre. |
| `plafonds` | 10 invitations par espace et 100 pour l'appli sur 24 heures ; 10 codes faux par compte et par heure | Voir « Questions ouvertes ». |

Les adresses des pages (`/espace`, `/espace/rejoindre`) ne changent pas avec le
vocabulaire ; l'entrée de menu dit « Mon espace » ou « Ma coloc ».

## Décisions prises

- **L'espace courant n'est jamais lu dans l'URL ni dans un champ de
  formulaire** : il vient de l'adhésion en cours de la personne connectée,
  relue en base à chaque requête. Un membre retiré perd l'accès à la requête
  suivante, comme un compte désactivé.
- **Les rôles d'espace ne sont pas des rôles d'appli** : `ROLES` de
  `src/config/acces.ts` dit ce que l'on peut faire dans l'appli,
  `adhesion.role` ce que l'on peut faire dans son espace. Un admin de l'appli
  n'est gestionnaire d'aucun espace d'office.
- **Le verrou est celui de la ligne de l'espace** (`SELECT … FOR UPDATE`), pris
  avant toute lecture des adhésions : le comptage des gestionnaires et
  l'écriture se font dans la même transaction (cicatrice A10). Rejoindre ou
  créer, avec un seul espace par compte, verrouille aussi le compte.
- **Une invitation se compte avant l'envoi** et reste comptée si l'envoi
  échoue : un envoi en échec répété ne contourne pas le plafond.
- **Le mail d'invitation part hors de la transaction**, après l'écriture du
  compteur : un verrou ne s'attend pas pendant l'appel au prestataire.

## Pièges retenus et leurs tests

Les tests sont dans `tests/espaces*.test.ts`, intitulés d'après la règle.

| Piège | Règle verrouillée | Source |
| --- | --- | --- |
| Un module lit les fiches de tous les espaces | « un module rattaché à un espace ne lit sa table que par l'accès de l'espace », test-verrou prouvé sur un cas fautif, et qui échoue s'il ne lit aucun fichier | ticket ; cicatrice T5 (un verrou qui ne trouve rien passe au vert) |
| Une fiche d'un autre espace ouverte par son identifiant | « un identifiant d'un autre espace est introuvable » | tours-de-coloc, isolation entre colocs |
| Un membre retiré garde l'accès jusqu'à sa reconnexion | « l'espace se relit en base à chaque requête » | cicatrice A11 (un rôle porté par le jeton) |
| Le dernier gestionnaire rétrogradé, retiré ou parti | « le dernier gestionnaire ne perd son rôle ni ne part », dont deux rétrogradations simultanées | ticket ; cicatrice A10 |
| Deux espaces rejoints en même temps avec le réglage « un seul » | « un seul espace par compte, tenu sous verrou » | règle déduite |
| Une page périmée soumise deux fois | « rejoindre deux fois ne crée qu'une adhésion » | cicatrices I8, V4 |
| Un code lu de travers (`O` pour `0`) | « un code n'a aucun caractère ambigu, se lit sans casse ni tiret » | ticket |
| Un ancien code qui ouvre encore l'espace | « un code régénéré ferme l'ancien » | ticket |
| Les codes parcourus jusqu'à tomber sur un espace | « les codes faux sont plafonnés par compte, comptés en base » | cicatrices A7, A8 |
| Une adhésion terminée effacée, et l'historique avec | « une adhésion terminée ne se supprime pas » (aucun `DELETE`) | ticket ; cicatrice A12 |
| Un espace vide que personne ne peut plus gérer | « la prochaine personne qui rejoint un espace vide en devient gestionnaire » | ticket |
| L'appli devenue relais d'envoi | « les invitations sont plafonnées par espace et pour l'appli, comptées en base avant l'envoi » ; « un nom ou un prénom qui ressemble à un lien ou à une adresse est refusé » | ticket ; cicatrice A8 ; M1 pour l'échappement (brique mails) |
| L'adresse e-mail affichée à d'autres membres | « l'écran et les mails ne montrent que le prénom de l'espace » | ticket |
| Un compte désactivé reste gestionnaire unique | « désactiver termine l'adhésion et nomme le membre le plus ancien » | ticket ; tours-de-coloc |
| Un prénom qui survit à l'effacement | « effacer remplace le prénom par « Ancien membre », adhésions terminées comprises » | ticket |
| Un effet qui écrit hors de la transaction du geste | couvert par le verrou du registre (`tests/comptes-effets.test.ts`), qui joue `EFFETS_ESPACES` sous un pool qui refuse toute requête | brique comptes |
| Une table neuve oubliée de l'export | couvert par `tests/rgpd-export.test.ts` | brique rgpd |
| Une page ou une action sans garde | couvert par `tests/gardes-acces.test.ts` | cicatrice A1 |

## Questions ouvertes

| Question | Proposition de la fiche | Qui tranche | Avant quelle étape |
| --- | --- | --- | --- |
| **La cible des écrans** : téléphone, ordinateur ou les deux ? | Les deux : une coloc s'utilise surtout au téléphone. Le `Tableau` des membres reste un tableau sur ordinateur, des `ListeCartes` sur téléphone. | Responsable du projet | Avant les écrans |
| **Le dernier gestionnaire qui quitte** un espace qui a d'autres membres : refus, ou le plus ancien membre lui succède comme à la désactivation ? | Refus, avec le message « nommez d'abord un autre gestionnaire » : un geste volontaire n'a pas d'effet caché. | Responsable du projet | Avant le code |
| **Qui invite** par e-mail et qui voit le code : tous les membres, ou les gestionnaires ? | Tout membre voit le code et le lien (dans une coloc, chacun fait entrer quelqu'un) ; inviter par e-mail et régénérer le code sont réservés aux gestionnaires. | Responsable du projet | Avant le code |
| **Les plafonds** : 10 invitations par espace et 100 pour l'appli sur 24 heures, 10 codes faux par compte et par heure. | Ces valeurs, réglables. Un plafond par compte (qui créerait de nombreux espaces pour inviter) n'est pas prévu : le plafond de l'appli le couvre. | Responsable du projet | Avant la mise en ligne d'une appli à entrée ouverte |
| **Changer son prénom**, renommer l'espace : en v1 ? | Hors v1, pour garder la brique à la taille du ticket. Une ligne de plus chacun si tours-de-coloc le demande. | Responsable du projet | Avant le code |
| **Ce que voit un membre retiré** : « Créer ou rejoindre », sans message, ou un mot (« vous avez été retiré de la coloc ») ? | Sans message en v1 : le motif reste en base. | Responsable du projet | Avant les écrans |

## Sources

- Le ticket de la brique et l'essai tours-de-coloc (2026-11-03).
- `docs/cicatrices.md`, sections données, tests, accès et comptes, mails.
- La brique comptes : le dernier admin protégé sous verrou
  (`administration.ts`), le registre des effets de comptes (`effets.ts`).
- Les briques gestion-comptes et import-lot : la forme de cette fiche.
