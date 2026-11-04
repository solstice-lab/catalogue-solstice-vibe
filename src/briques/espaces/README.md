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

La fiche a été écrite avant le code et validée par la responsable du projet le
2026-11-03, puis les tests, un par piège, puis le code.

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
    (« nommez d'abord quelqu'un d'autre à ce rôle ») ;
  - un **espace sans membre** n'est pas supprimé : la prochaine personne qui
    le rejoint par son code en devient gestionnaire.
- **Les invitations par e-mail**, par la brique `mails` : un gestionnaire
  saisit une adresse, le mail part avec le nom de l'espace, le prénom de qui
  invite, le code et le lien. Deux **plafonds glissants sur 24 heures**,
  comptés en base sous verrou avant l'envoi : par espace, et pour toute
  l'appli. Une entrée ouverte (n'importe qui crée un compte, puis un espace) ne
  devient pas un relais d'envoi : un seul destinataire par invitation, aucun
  message libre, aucun texte saisi dans l'objet, et un nom d'espace ou un
  prénom qui ressemble à un lien ou à une adresse est refusé à la saisie.
- **Les codes faux limités** par compte (plafond par heure, compté en base) :
  un compte ne parcourt pas les codes jusqu'à tomber sur un espace.
- **Les réglages** (`src/config/espaces.ts`) : un ou plusieurs espaces par
  compte, le vocabulaire, les plafonds.
- **L'isolation** : un accès unique, `exigerMonEspace()`, qui rend l'espace de
  la personne connectée, relu en base à chaque requête, et une `base` dont
  chaque requête reçoit l'identifiant de cet espace en `$1`. Un module métier
  rattaché à un espace (sa table a une colonne `espace_id`) ne lit et n'écrit
  que par elle. `tests/espaces-isolation.test.ts` le verrouille : il refuse un
  fichier de `src/` qui interroge une telle table par `query`, `queryOne` ou
  `transaction` du client de base, et prouve sa sensibilité sur des cas
  fautifs.
- **Les effets d'un compte** déclarés au registre
  `src/config/effets-comptes.ts` :
  - **désactivation** : ses adhésions se terminent (motif « compte
    désactivé ») ; s'il était le dernier gestionnaire d'un espace, le membre
    le plus ancien le devient ;
  - **effacement** : mêmes effets, puis son prénom devient « Ancien membre »
    dans toutes ses adhésions, terminées comprises ;
  - **réactivation** : rien. Une adhésion terminée ne revit pas ; la personne
    rejoint de nouveau par le code.
- **Les effets d'un départ**, au registre `src/config/effets-espaces.ts`, que
  chaque module de l'appli complète : quand une adhésion se termine (la
  personne quitte l'espace, un gestionnaire la retire, son compte est
  désactivé ou effacé), la brique joue les effets déclarés dans la
  transaction du geste, sous le verrou de l'espace, une fois l'adhésion
  terminée. Chaque effet reçoit l'exécuteur de la transaction, l'espace, le
  compte, l'adhésion et le motif (`parti`, `retire`, `compte-desactive`,
  `compte-efface`). Un effet qui lève annule le geste. Voir « La brancher ».
- **Deux écrans** sur le kit `src/ui/`, pour le téléphone comme pour
  l'ordinateur :
  - **« Créer ou rejoindre »** (`/espace/rejoindre`) : deux `Carte`s, l'une
    pour rejoindre (code, prénom), le code prérempli par le lien, l'autre pour
    créer (nom de l'espace, prénom). Une personne sans espace y arrive depuis
    toute page d'un module rattaché à un espace ;
  - **« Mon espace »** (`/espace`) : un `Tableau` des membres (prénom, rôle,
    arrivée) et, pour un gestionnaire, une colonne de gestes figée à droite,
    atteignable au téléphone ; le code et le lien à copier ; l'invitation par
    e-mail et un nouveau code pour un gestionnaire ; quitter. Chaque geste
    passe par une `Modale` qui dit ses effets et affiche le refus du serveur.
    Avec plusieurs espaces par compte, le passage d'un espace à l'autre.
- **RGPD** : les sources « Espaces » et « Codes d'espace faux saisis » de
  l'export et de l'effacement (`src/config/donnees-personnelles.ts`), le
  traitement « Espaces partagés » de la politique de confidentialité
  (`src/lib/confidentialite.ts`), la table des invitations déclarée sans
  donnée personnelle.
- **L'assembleur du catalogue** la garde ou la retire entière : ses fichiers,
  son étape de migration, ses lignes des registres, son droit et son entrée de
  menu.

## Hors v1

- **Renommer un espace**, **changer son prénom** : la saisie se fait à la
  création et à l'arrivée.
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
- **Un message au membre retiré** : il retombe sur « Créer ou rejoindre »,
  sans explication ; le motif reste en base.
- **Un espace dans l'adresse** (`/coloc/12/taches`) : l'espace courant est
  celui de la personne, jamais lu dans l'URL.

## Les fichiers

| Fichier | Rôle |
| --- | --- |
| `domaine.ts` | `ACTIONS_ESPACES` ; les types `Espace`, `Adhesion`, `RoleEspace`, `MotifDepart`, `Refus`, `RetourEspace`. Importable côté client. |
| `reglages.ts` | Le type `ReglagesEspaces` que remplit `src/config/espaces.ts`, et `majuscule`. Importable côté client. |
| `code.ts` | Normaliser un code saisi, l'afficher, le lien pour rejoindre. Pur. |
| `saisie.ts` | Le contrôle d'un nom d'espace et d'un prénom (longueur, pas de lien ni d'adresse). Pur. |
| `espaces.ts` | Les gestes, par `transaction()` sous verrou : créer, rejoindre, quitter, retirer, nommer, retirer un gestionnaire, régénérer le code ; lire les membres et les espaces d'une personne. Serveur seulement. |
| `invitations.ts` | L'invitation par e-mail : plafonds comptés en base, puis envoi par la brique mails. Serveur seulement. |
| `acces.ts` | L'accès unique : `monEspace`, `exigerMonEspace`, le type `BaseEspace`, et `choisirEspace` (plusieurs espaces par compte). Serveur seulement. |
| `effets-comptes.ts` | `EFFETS_ESPACES`, l'entrée de la brique au registre des effets de comptes. Serveur seulement. |
| `departs.ts` | Les types du registre des effets d'un départ (`EffetsDeDepart`, `DepartDEspace`) et `jouerLesEffetsDuDepart`, que les gestes appellent. Serveur seulement. |
| `donnees-personnelles.ts` | `SOURCES_ESPACES`, pour l'export et l'effacement (brique rgpd). Serveur seulement. |
| `confidentialite.ts` | `TRAITEMENTS_ESPACES`, pour la politique de confidentialité. N'importe pas la base. |
| `EcranCreerOuRejoindre.tsx`, `EcranMonEspace.tsx` | Les deux écrans, composants client. |

Hors du dossier, partis avec elle quand une copie ne la garde pas :
`src/config/espaces.ts` (les réglages), `src/config/effets-espaces.ts` (le
registre des effets d'un départ), `src/app/espace/` (les deux pages et leurs
server actions), `tests/aide-espaces.ts` et les tests `tests/espaces*.test.ts`.

La brique n'importe que le socle (`@/ui`, `@/lib/format`, `@/lib/db/client`,
React, Next, `node:crypto`), ses réglages (`@/config/espaces`), son registre
des effets d'un départ (`@/config/effets-espaces`), la brique
comptes (`roles.ts` pour `utilisateurCourant`, `effets.ts` pour ses types) et
la brique mails (`envoi.ts`). `tests/espaces-isolement.test.ts` le verrouille
par une liste blanche, prouvée par un cas fautif.

Quatre tables, créées par une étape en fin de `src/lib/db/migrations.ts` :

| Table | Ce qu'elle garde |
| --- | --- |
| `espaces` | Le nom, le code, la date de création. |
| `espaces_adhesions` | Le compte (`utilisateur_id`), l'espace, le prénom, le rôle, l'arrivée, le départ et son motif. Une seule adhésion en cours par compte et par espace (index unique partiel). Les clés étrangères refusent la suppression d'un espace ou d'un compte qui a des adhésions. |
| `espaces_invitations` | Une ligne par invitation envoyée : l'espace et l'heure, sans l'adresse. Sert les plafonds ; effacée au-delà de 24 heures, à l'invitation suivante. |
| `espaces_essais_code` | Une ligne par code faux saisi : le compte et l'heure. Effacée au-delà d'une heure, au code saisi suivant. |

## Interface publique

Ce qu'une appli peut importer et appeler : ce que ce README présente comme
appelable (« Les fichiers », « La brancher ») et les types qui composent ces
symboles. Tout autre export existe pour les fichiers de la brique ou ses
tests et peut changer sans entrée au journal.

| Import | Symboles | Rôle |
| --- | --- | --- |
| `domaine.ts` | `ACTIONS_ESPACES` ; types `Espace`, `Adhesion`, `RoleEspace`, `MotifDepart`, `Refus`, `RetourEspace` | L'action `espaces.participer` (créer, rejoindre, voir son espace, le quitter), à étendre dans `ACTIONS` de `src/config/acces.ts`. Les gestes de gestionnaire ne sont pas des droits d'appli : la brique les vérifie sur l'adhésion. `RetourEspace` : ce que rend une server action de `/espace`. |
| `reglages.ts` | type `ReglagesEspaces` ; `majuscule(texte)` | La forme de `ESPACES` dans `src/config/espaces.ts` ; l'entrée de menu dit `majuscule(ESPACES.vocabulaire.mon)`. |
| `code.ts` | `lienPourRejoindre(site, code)` | Le lien qui ouvre « Créer ou rejoindre » avec le code prérempli. |
| `acces.ts` (serveur seulement) | `exigerMonEspace()` → `MonEspace` ; `monEspace()` → `MonEspace \| null` ; `choisirEspace(personne, espaceId)` ; types `MonEspace`, `BaseEspace` | L'accès unique d'un module rattaché à un espace, appelé juste après `exiger(action)`. `exigerMonEspace` renvoie vers `/espace/rejoindre` une personne sans espace. `MonEspace` : `{ utilisateur, espace, adhesion, base }`. `base` a `query`, `queryOne`, `transaction`, qui passent l'identifiant de l'espace en `$1` (les paramètres de l'appelant suivent en `$2`…) et refusent une requête qui ne nomme pas `espace_id` et `$1`. |
| `espaces.ts` (serveur seulement) | `creerEspace`, `rejoindre`, `quitter`, `retirerMembre`, `nommerGestionnaire`, `retirerGestionnaire`, `regenererCode` → `Refus` ou le résultat du geste (`quitter` et `retirerMembre` lèvent si un effet de départ lève : le geste est annulé) ; `lireMembres(espaceId)`, `lireMesEspaces(personne)` | Le corps des server actions de `src/app/espace/actions.ts`, appelé après `exiger`, avec la personne qu'il rend. |
| `invitations.ts` (serveur seulement) | `inviterParEmail(personne, espaceId, adresse, contexte)` → `RetourEspace` ; type `ContexteInvitation` | Idem, pour l'invitation. `contexte` : le nom de l'appli et son adresse publique (`null` : le mail part sans lien). |
| `effets-comptes.ts` | `EFFETS_ESPACES` | Son entrée de `src/config/effets-comptes.ts`, avant celle du journal. |
| `departs.ts` (serveur seulement) | types `EffetsDeDepart`, `EffetDeDepart`, `DepartDEspace`, `MotifDuDepart` | La forme d'une entrée de `EFFETS_DEPARTS` dans `src/config/effets-espaces.ts` : `{ unite, depart }`, où `depart(tx, { espaceId, utilisateurId, adhesionId, motif })` écrit par `tx`. `MotifDuDepart` : `MotifDepart` et `compte-efface` (la base garde `compte-desactive` pour un compte effacé). `jouerLesEffetsDuDepart` est interne à la brique. |
| `donnees-personnelles.ts` | `SOURCES_ESPACES` | Ses sources de `src/config/donnees-personnelles.ts` (brique rgpd). |
| `confidentialite.ts` | `TRAITEMENTS_ESPACES` | Son traitement dans `src/lib/confidentialite.ts`, dont les choix se remplissent sous la clé `espaces`, avec sa `conservation` (clés `espaces-adhesions-terminees` et `espaces-essais-code`). |
| `EcranCreerOuRejoindre.tsx` | `EcranCreerOuRejoindre({ codeInitial, actions })`, type `ActionsCreerOuRejoindre` | Le contenu de `/espace/rejoindre`, que la page entoure d'`AppLayout`. |
| `EcranMonEspace.tsx` | `EcranMonEspace({ espace, adhesion, membres, autresEspaces, lienDInvitation, actions })`, type `ActionsMonEspace` | Le contenu de `/espace`. Les server actions lui sont passées en `actions` : la brique n'importe rien de `src/app`. |

**Règle d'entretien.** Tout changement d'interface publique met à jour cette
section et ajoute une entrée **en fin** de [`CHANGELOG.md`](CHANGELOG.md),
dans la pull request qui le fait : date, ce qui change pour l'appelant,
raison.

## La brancher : un module rattaché à un espace

L'assembleur branche la brique (pages, droit, menu, registres). Ce qui reste à
l'appli, c'est chaque module métier dont les fiches appartiennent à un espace.
Il copie le patron `dossiers` (`CLAUDE.md` §3), avec trois différences, et
une quatrième s'il garde des données par membre :

1. **Sa table** a `espace_id INTEGER NOT NULL REFERENCES espaces (id)` et un
   index qui commence par `espace_id`. Une référence unique l'est par espace
   (`UNIQUE (espace_id, reference)`). Avec la brique rgpd, elle se déclare
   dans `src/config/donnees-personnelles.ts` comme toute table.
2. **Ses fonctions de données** prennent la `base` de l'espace au lieu
   d'importer `query` :

   ```ts
   import type { BaseEspace } from "@/briques/espaces/acces";

   export function listerTaches(base: BaseEspace) {
     return base.query<Tache>("SELECT * FROM taches WHERE espace_id = $1 ORDER BY echeance");
   }

   export function creerTache(base: BaseEspace, titre: string) {
     return base.queryOne<Tache>("INSERT INTO taches (espace_id, titre) VALUES ($1, $2) RETURNING *", [titre]);
   }
   ```

3. **Ses pages et server actions** appellent `exigerMonEspace()` juste après
   leur garde (`tests/gardes-acces.test.ts` veut toujours `exiger` en
   première ligne) :

   ```ts
   await exiger("taches.acceder");
   const { base, adhesion } = await exigerMonEspace();
   ```

Une fiche se retrouve par `espace_id = $1 AND id = $2` : un identifiant d'un
autre espace donne « introuvable », comme un identifiant qui n'existe pas.

4. **S'il garde des données par membre** (un ordre de passage, des tâches
   attribuées, des demandes en attente entre deux membres), il déclare son
   effet de départ dans `src/config/effets-espaces.ts` plutôt que de sauter
   les adhésions terminées à chaque lecture. L'effet vit dans un fichier du
   module, écrit par la transaction reçue, et n'importe ni `query`, ni
   `queryOne`, ni `transaction` (`tests/espaces-departs.test.ts` le refuse) :

   ```ts
   import type { EffetsDeDepart } from "@/briques/espaces/departs";

   export const DEPART_TACHES: EffetsDeDepart = {
     unite: "taches",
     depart: async (tx, { espaceId, adhesionId }) => {
       await tx.query("DELETE FROM taches_ordre WHERE espace_id = $1 AND adhesion_id = $2", [espaceId, adhesionId]);
     },
   };
   ```

   L'effet voit le geste fait : l'adhésion terminée, le successeur nommé à
   la désactivation, le prénom « Ancien membre » à l'effacement. Il se joue
   sous le verrou de l'espace : aucune arrivée ni aucun autre départ du même
   espace ne passe entre le geste et lui. Un compte effacé après sa
   désactivation n'a plus d'adhésion en cours : son départ a été joué à la
   désactivation, il ne l'est pas une seconde fois. Ce que le module garde
   de personnel sur un membre s'efface donc par sa source de la brique rgpd
   (`src/config/donnees-personnelles.ts`), comme toute table, pas par l'effet
   de départ.

## Ce qu'on configure (`src/config/espaces.ts`)

| Réglage | Défaut | Effet |
| --- | --- | --- |
| `plusieursParCompte` | `false` | Faux : rejoindre ou créer est refusé à qui a déjà un espace (« Quittez d'abord… »), et « Créer ou rejoindre » renvoie vers « Mon espace ». Vrai : « Mon espace » propose de passer d'un espace à l'autre ; l'espace courant est gardé dans un cookie, revérifié en base à chaque requête, et à défaut c'est l'espace rejoint le plus récemment. |
| `vocabulaire` | « espace », « Gestionnaire », « Membre » | Les mots de l'interface et des mails : `un` (« une coloc »), `le` (« la coloc »), `du` (« de la coloc », « du club »), `mon` (« ma coloc »), `ce` (« cette coloc »), et les noms des deux rôles (« Admin de la coloc », « Membre »). Écrits en entier, pour l'élision et le genre. |
| `plafonds` | 10 invitations par espace et 100 pour l'appli sur 24 heures ; 10 codes faux par compte et par heure | Voir « Décisions prises ». |

Les adresses des pages (`/espace`, `/espace/rejoindre`) ne changent pas avec le
vocabulaire ; l'entrée de menu dit « Mon espace » ou « Ma coloc ».

## Décisions prises

Le 2026-11-03, par la responsable du projet, sur les propositions de la fiche :

- **Cible des écrans** : le téléphone et l'ordinateur. Le `Tableau` des membres
  sert aux deux, sa colonne de gestes figée à droite : les gestes ne tiennent
  pas dans une `ListeCartes`, qui n'en porte pas.
- **Le dernier gestionnaire qui veut quitter** un espace qui a d'autres
  membres est refusé, avec « nommez d'abord quelqu'un d'autre à ce rôle » : un
  geste volontaire n'a pas d'effet caché. La succession automatique ne joue
  qu'à la désactivation et à l'effacement d'un compte.
- **Qui invite** : tout membre voit le code et le lien ; inviter par e-mail et
  régénérer le code sont réservés aux gestionnaires.
- **Les plafonds** : 10 invitations par espace et 100 pour l'appli sur
  24 heures, 10 codes faux par compte et par heure, réglables. Pas de plafond
  par compte : celui de l'appli couvre qui créerait de nombreux espaces.
- **Changer son prénom, renommer l'espace** : hors v1.
- **Un membre retiré** retombe sur « Créer ou rejoindre », sans message.

Et de conception :

- **L'espace courant n'est jamais lu dans l'URL ni dans un champ de
  formulaire** : il vient de l'adhésion en cours de la personne connectée,
  relue en base à chaque requête. Un membre retiré perd l'accès à la requête
  suivante, comme un compte désactivé.
- **Les rôles d'espace ne sont pas des rôles d'appli** : `ROLES` de
  `src/config/acces.ts` dit ce que l'on peut faire dans l'appli,
  `adhesion.role` ce que l'on peut faire dans son espace. Un admin de l'appli
  n'est gestionnaire d'aucun espace d'office.
- **Les verrous, toujours dans le même ordre** : pour créer et rejoindre, la
  ligne du compte (`FOR SHARE`, qui le garde actif jusqu'à la fin du geste)
  et un verrou consultatif du compte ; pour tous les gestes, la ligne de
  l'espace (`SELECT … FOR UPDATE`), prise avant toute lecture des adhésions ;
  pour l'invitation, enfin, un verrou consultatif commun à l'appli. Le
  comptage des gestionnaires et l'écriture se font dans la même transaction
  (`docs/cicatrices.md`, A10). Les effets d'un compte désactivé tiennent la
  ligne du compte, puis prennent celles des espaces : le même ordre. Les
  autres gestes lisent le compte sans le verrouiller, pour ne pas l'inverser.
- **`exigerMonEspace` vient après `exiger`**, sans le remplacer : le verrou des
  gardes du socle reste tel quel, et l'action d'appli se lit toujours en
  première ligne.
- **Une invitation se compte avant l'envoi** et reste comptée si l'envoi
  échoue : des échecs répétés ne contournent pas le plafond. Le mail part hors
  de la transaction : le verrou ne s'attend pas pendant l'appel au prestataire.
- **Au plafond des codes faux, même le bon code est refusé** : sinon le plafond
  ne dirait rien au compte qui parcourt les codes.

Le 2026-11-03 aussi, au réassemblage de tours-de-coloc, pour les effets d'un
départ :

- **Le registre reçoit le motif** (`parti`, `retire`, `compte-desactive`,
  `compte-efface`), décidé par la responsable du projet : un module peut
  traiter un départ volontaire autrement qu'un retrait. L'effacement a son
  motif dans le registre, pas en base, qui garde `compte-desactive` : sa
  contrainte n'a pas eu à changer.
- **Un seul point d'entrée pour tout départ** : la désactivation et
  l'effacement d'un compte jouent aussi le registre des départs, après leur
  propre travail, plutôt que de laisser le module déclarer en plus un effet
  de compte qui retrouverait les adhésions.
- **Écarté : un événement ou une file traitée hors de la transaction.** Le
  module verrait encore l'ancien membre entre le départ et le traitement, et
  un traitement en échec laisserait le départ fait sans son effet. Dans la
  transaction, un effet qui lève annule le départ, et le refus remonte à qui
  faisait le geste.

## À savoir

- **L'invitation ne crée pas de compte.** La personne invitée se connecte avec
  son adresse, puis saisit le code. Avec une entrée fermée
  (`src/config/comptes.ts`), son adresse doit être admise : par la
  configuration, son domaine, ou l'écran `/comptes` (brique gestion-comptes).
  La blueprint le dit.
- **Le lien d'invitation** n'existe que si `URL_PUBLIQUE` est réglée
  (référencement). En local ou sur une recette, le mail et l'écran donnent le
  code seul.
- **Retirer un membre** ne change pas le code : avec lui, la personne peut
  revenir. La modale le dit et propose d'en créer un nouveau.
- **Les choix du traitement** (base légale, destinataires) se remplissent
  dans `CONFIDENTIALITE.choix.espaces` (`src/lib/confidentialite.ts`) avant
  toute mise en ligne, comme ceux des autres briques. Les durées de
  conservation sont proposées par `confidentialite.ts`, à valider : une heure
  pour les codes faux (purgés par la brique rgpd), 12 mois après le départ
  pour une adhésion terminée, que le script de purge compte sans l'effacer
  (les données d'un module peuvent la citer).

## Pièges retenus et leurs tests

Les tests sont dans `tests/espaces*.test.ts`, intitulés d'après la règle.

| Piège | Règle verrouillée | Source |
| --- | --- | --- |
| Un module lit les fiches de tous les espaces | « aucun fichier de src/ n'interroge une table rattachée à un espace par le client de base » (`espaces-isolation`), prouvé sur des cas fautifs, et qui échoue s'il ne relit aucun fichier | ticket ; `docs/cicatrices.md`, T5 (un verrou qui ne trouve rien passe au vert) |
| Une fiche d'un autre espace ouverte par son identifiant | « une fiche d'un autre espace est introuvable par son identifiant » ; « refuse une requête qui ne nomme ni espace_id ni $1 » (`espaces-acces`) | tours-de-coloc, isolation entre colocs |
| Un membre retiré garde l'accès jusqu'à sa reconnexion | « l'espace se relit en base à chaque requête » (`espaces-acces`) | `docs/cicatrices.md`, A11 (un rôle porté par le jeton) |
| Le dernier gestionnaire rétrogradé, retiré ou parti | « le dernier gestionnaire ne retire pas son propre rôle, ne quitte pas l'espace et n'en est pas retiré », deux rétrogradations et deux retraits simultanés (`espaces`) | ticket ; `docs/cicatrices.md`, A10 |
| Deux espaces rejoints en même temps avec le réglage « un seul » | « un seul espace par compte, y compris deux demandes simultanées » (`espaces`) | règle déduite |
| Une page périmée soumise deux fois | « rejoindre deux fois le même espace ne crée qu'une adhésion » (`espaces`) | `docs/cicatrices.md`, I8 et V4 |
| Un code lu de travers (`O` pour `0`) | « le code n'a aucun caractère ambigu », « se lit sans casse, espaces ni tiret » (`espaces-saisie`) | ticket |
| Un ancien code qui ouvre encore l'espace | « un code régénéré ferme l'ancien » (`espaces`) | ticket |
| Les codes parcourus jusqu'à tomber sur un espace | « les codes faux sont plafonnés par compte, comptés en base » (`espaces`) | `docs/cicatrices.md`, A7 et A8 |
| Une adhésion terminée effacée, et l'historique avec | « une personne partie puis revenue a une nouvelle adhésion, l'ancienne reste » ; « la base refuse de supprimer un espace qui a des adhésions, et aucun fichier de la brique ne supprime une adhésion » (`espaces`) | ticket ; `docs/cicatrices.md`, A12 et D7 |
| Un espace vide que personne ne peut plus gérer | « la prochaine personne qui le rejoint en devient gestionnaire » (`espaces`, `espaces-effets`) | ticket |
| L'appli devenue relais d'envoi | plafonds par espace et pour l'appli, comptés avant l'envoi, sous verrou, et maintenus après un échec (`espaces-invitations`) ; « refusent ce qui ressemble à une adresse ou à un lien » (`espaces-saisie`) | ticket ; `docs/cicatrices.md`, A8, et M1 pour l'échappement (brique mails) |
| L'adresse e-mail affichée à d'autres membres | « sous le prénom qu'elle porte dans l'espace, jamais son adresse » (`espaces`) ; le mail n'a pas l'adresse de qui invite (`espaces-invitations`) | ticket |
| Un compte désactivé reste gestionnaire unique | « désactiver termine l'adhésion et nomme le membre le plus ancien » (`espaces-effets`) | ticket ; tours-de-coloc |
| Une adhésion née pendant la désactivation ou l'effacement du compte, que l'effet n'a pas vue | « rejoindre pendant qu'une désactivation du compte est en cours attend sa fin, et n'ouvre pas d'adhésion sur un compte désactivé » (`espaces-effets`) | relevé à la relecture du code de la brique |
| Un prénom qui survit à l'effacement | « effacer […] remplace le prénom par « Ancien membre », adhésions terminées comprises » (`espaces-effets`) | ticket |
| Un effet qui écrit hors de la transaction du geste | couvert par le verrou du registre (`tests/comptes-effets.test.ts`), qui joue `EFFETS_ESPACES` sous un pool qui refuse toute requête | brique comptes |
| Un module qui garde un membre parti dans ses listes (l'ordre des tours, les tours futurs, les échanges en attente) | « quitter les joue dans sa transaction, avec le motif « parti » […] », de même pour retirer, désactiver et effacer ; « annulent le geste quand l'un d'eux lève » ; « se jouent sous le verrou de l'espace » (`espaces-departs`) | tours-de-coloc, réassemblage avec la brique |
| Un effet de départ qui écrit hors de la transaction du geste | « chaque effet du registre de l'appli écrit et lit par la transaction reçue, jamais par le pool », prouvé sur un cas fautif, et « ni le registre ni aucun fichier d'effets qu'il importe n'importe query […] », qui échoue s'il ne lit pas le registre (`espaces-departs`) | brique comptes ; `docs/cicatrices.md`, T5 |
| Une table neuve oubliée de l'export | couvert par `tests/rgpd-export.test.ts` | brique rgpd |
| Une page ou une action sans garde | couvert par `tests/gardes-acces.test.ts` | `docs/cicatrices.md`, A1 |

## Questions ouvertes

| Question | Qui tranche | Avant quelle étape |
| --- | --- | --- |
| **Le rendu des deux écrans** au téléphone et à l'ordinateur n'a pas été vu : à vérifier sur une appli assemblée avec la brique. | Responsable du projet | Avant de réassembler tours-de-coloc |
| **Un plafond par compte.** Sans lui, une seule personne peut épuiser le plafond de l'appli (créer un espace, y envoyer ses invitations, le quitter, recommencer) et priver les autres d'invitations pour 24 heures. Le relais d'envoi reste fermé ; c'est une gêne, pas une fuite. | Responsable du projet | Avant la mise en ligne d'une appli à entrée ouverte |
| **Un espace devenu inutile** reste en base, vide. Le supprimer (avec ses adhésions terminées) demanderait de trancher ce que devient leur trace. | Responsable du projet | Si une appli le demande |

## Sources

- Le ticket de la brique et l'essai tours-de-coloc (2026-11-03).
- `docs/cicatrices.md`, sections données, tests, accès et comptes, mails.
- La brique comptes : le dernier admin protégé sous verrou
  (`administration.ts`), le registre des effets de comptes (`effets.ts`).
- Les briques gestion-comptes et import-lot : la forme de cette fiche.
