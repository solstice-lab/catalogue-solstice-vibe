# Journal des changements : brique validation

Les changements observables de la brique depuis l'état d'avant
la GMAO (2026-10-15), du plus ancien au plus récent. La brique
n'existait pas à cette date : la première entrée est sa création. La section
« Interface publique » du [README](README.md) dit ce qui compte comme interface.

**Règle d'entretien** : tout changement d'interface publique ajoute une entrée
**en fin** de ce fichier, dans la PR qui le fait. Une entrée dit ce qui change
pour l'appelant et pourquoi ; « Rupture » veut dire qu'un appelant existant doit
être modifié. Les changements de documentation seule n'y sont pas obligatoires :
ceux qui précèdent la règle sont listés pour mémoire.

Aucun changement de comportement de sa création au 2026-10-22 (`peutDecider`
asynchrone) : jusque-là, le diff de `src/briques/` contre l'état d'avant la
Demande d'achat ne touchait que des README, et la brique a servi aux demandes
d'achat telle que livrée (bilan de la Demande d'achat).

## 2026-10-16 · Création de la brique · Ajout

- **Ce qui change** : le noyau d'un circuit de validation, une file de
  propositions acceptées ou refusées. Interface : voir le README, « Interface
  publique » (dont `proposer`, `decider`, `leverRefus`, `deciderEnLot`).
- **Appelant** : aucun, la brique est nouvelle.
- **Pourquoi** : brique retenue par l'inventaire des applis déjà livrées, tenu hors de ce dépôt ; noyau
  seul, variantes et écran hors v1 (README, « Décisions prises »).

## 2026-10-19 · README aligné sur import-lot codée · Documentation

- **Ce qui change** : la frontière avec import-lot ne parle plus d'une brique à
  venir : la convergence des deux cycles « reste à décider ». Aucun code.
- **Pourquoi** : import-lot venait d'arriver sur `main`, avec son propre cycle de
  lot.

## 2026-10-19 · README après le branchement · Documentation

- **Ce qui change** : la convergence avec import-lot ne se décide plus « avant le
  premier branchement » (elle reste ouverte) ; le « stub » de `lib/roles.ts` est
  dit tel qu'il est (un cookie de démo, sans authentification) ; la colonne « Qui
  tranche » nomme la personne responsable du projet. Aucun code.
- **Pourquoi** : le bilan des demandes d'achat (section 1) relevait que le README
  décrivait l'avant-branchement.

## 2026-10-19 · Renvois d'avant-branchement et décideur · Documentation

- **Ce qui change** : « servira » devient « sert » (branchée depuis sur les demandes d'achat) ; deux
  renvois pointent vers « Décisions prises », la seule section qui existe ; deux
  échéances de décision dépassées sont remplacées (retrait de la table : avant la
  prochaine copie client ; schéma par type : au prochain type de proposition).
  Aucun code.
- **Pourquoi** : une relecture a relevé ces textes d'avant-branchement.

## 2026-10-22 · `peutDecider` peut rendre une promesse · Interface

- **Ce qui change** : `Branchement.peutDecider` peut rendre `boolean` ou
  `Promise<boolean>` ; `decider`, `leverRefus` et `deciderEnLot` l'attendent
  avant toute écriture. Un `peutDecider` synchrone existant n'a rien à changer.
- **Pourquoi** : les droits de l'appli se déclarent dans
  `src/config/acces.ts`, et avec la brique comptes le rôle se relira en
  base à chaque requête : une fonction synchrone ne pourrait pas l'interroger.
  Le test « attend un peutDecider asynchrone qui refuse » vérifie qu'une
  promesse n'est jamais prise pour un « oui ».

## 2026-10-22 · Dépendances entre briques · Documentation

- **Ce qui change** : la fiche dit qu'une brique n'importe une autre brique que
  si elle la déclare dans son `exige`. Rien ne change pour l'appelant.
- **Pourquoi** : la règle « une brique n'importe que le socle »
  s'assouplit pour la connexion par code, qui exigera la brique mails.

## 2026-10-23 · `SOURCES_VALIDATION` · Ajout

- **Ce qui change** : `donnees-personnelles.ts` exporte `SOURCES_VALIDATION`,
  les propositions qu'une adresse a décidées ou que son contenu cite, pour
  l'export des données d'une personne (brique rgpd).
- **Appelant** : rien à changer. Le contenu d'une proposition est parcouru
  comme du texte : une adresse qui y figure sort avec elle, quel que soit le
  type.
- **Pourquoi** : la file garde l'adresse du décideur en clair, et le
  contenu peut porter celle d'un demandeur.

## 2026-10-28 · Rescan, contenu et décideur · Interface

- **Ce qui change** :
  - `proposer` sur une clé encore en attente rafraîchit le contenu et le groupe
    de la proposition. L'issue reste `deja_en_attente`, avec le même id. Une
    proposition décidée n'est jamais réécrite, et un refus ne se relit
    toujours que par `leverRefus`.
  - `proposer` et `leverRefus` refusent un contenu qui n'est pas un objet
    (`undefined`, `null`, tableau, scalaire), avant toute écriture.
    `proposer` lève une `Error`, comme pour une clé vide ; `leverRefus` lève
    une `ErreurDecision`.
  - `peutDecider` et les applicateurs reçoivent le décideur passé par
    l'appli avec tous ses champs (le rôle), l'e-mail débarrassé des espaces
    autour. Jusque-là, ils ne recevaient que `{ email }`.
  - `Transaction` est dérivé de `transaction()` de `src/lib/db/client.ts`. Sa
    forme ne change pas aujourd'hui.
  - `lireGroupes` groupe en base ; résultat et ordre inchangés.
- **Appelant** : rien à changer. Les demandes d'achat proposent toujours une
  clé neuve, avec un contenu objet, et leur `peutDecider` relit le compte par
  l'e-mail. Un appelant qui comptait sur un rescan pour garder l'ancien
  contenu d'une proposition en attente doit le savoir : ce n'est plus le cas.
- **Pourquoi** : un rescan laissait la personne décider sur un contenu
  périmé ; un contenu `undefined` finissait en violation NOT NULL brute ; un
  `peutDecider` branché sur `peut()` de `briques/comptes/roles.ts`, qui lit
  `role`, refusait tout le monde.

## 2026-10-28 · L'effacement des données d'une personne · Ajout

- **Ce qui change** : la source `propositions` de `SOURCES_VALIDATION` porte
  `effacement` et `effacer(executeur, adresse)`. La proposition reste ;
  l'adresse y est remplacée par « (adresse effacée) », dans `decide_par` et
  partout où elle est une valeur entière du contenu.
- **Appelant** : rien à changer. Un module qui lit le contenu doit accepter ce
  texte à la place d'une adresse (le demandeur d'une demande d'achat l'accepte).
- **Pourquoi** : répondre à une demande d'effacement (RGPD art. 17) sans
  défaire l'histoire des décisions.
