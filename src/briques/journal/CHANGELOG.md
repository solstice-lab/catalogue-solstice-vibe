# Journal des changements : brique journal

Les changements observables de la brique, du plus ancien au plus récent. La
section « Interface publique » du [README](README.md) dit ce qui compte comme
interface.

**Règle d'entretien** : tout changement d'interface publique ajoute une entrée
**en fin** de ce fichier, dans la PR qui le fait. Une entrée dit ce qui change
pour l'appelant et pourquoi ; « Rupture » veut dire qu'un appelant existant doit
être modifié. Les changements de documentation seule n'y sont pas obligatoires.

## 2026-10-23 · Création de la brique · Ajout

- **Ce qui change** : la table `journal_audit` (sans `UPDATE` possible),
  `journaliser` à appeler dans la transaction d'une écriture, la lecture
  (`lireJournal`, `historiqueSiPermis`), l'écran `/journal` réservé à
  `journal.consulter`, et l'historique d'une fiche (`HistoriqueFiche`).
  Pour le socle : sa description de traitement (`TRAITEMENTS_JOURNAL`) et sa
  source de l'export des données d'une personne (`SOURCES_JOURNAL`).
  Branchée sur le patron `dossiers`. Interface : voir le README, « Interface
  publique ».
- **Appelant** : aucun, la brique est nouvelle.
- **Pourquoi** : savoir qui a modifié ou supprimé une fiche.

## 2026-10-28 · L'effacement des données d'une personne · Ajout

- **Ce qui change** : la source `journal` de `SOURCES_JOURNAL` porte
  `effacement` et `effacer(executeur, adresse)`, qui compte les lignes de
  l'adresse sans en réécrire aucune.
- **Appelant** : rien à changer.
- **Pourquoi** : l'effacement de la brique rgpd parcourt chaque source. Le
  journal se détache de l'adresse par l'anonymisation du compte : la base
  refuse tout `UPDATE`.

## 2026-11-03 · Les gestes d'un compte passent par le registre des effets · Ajout

- **Ce qui change** : `effets-comptes.ts` exporte `EFFETS_JOURNAL`, l'entrée
  de la brique au registre des effets de comptes
  (`src/config/effets-comptes.ts`) : la désactivation, la réactivation et
  l'effacement d'un compte se tracent par elle, et non plus par une trace
  passée depuis les actions de `/comptes` et de `/donnees-personnelles`.
  `journaliser(tx, auteur, evenement)` accepte un exécuteur qui n'a que
  `query` (`ExecuteurSql`), celui que reçoit un effet.
- **Appelant** : rien à changer ; une transaction de `transaction()` convient
  toujours.
- **Pourquoi** : un module qui réagit à un compte désactivé ou effacé
  (tours-de-coloc) se déclare au même registre ; le journal y passe pour
  qu'aucun de ces gestes ne demande de brancher une trace dans les actions.

## 2026-11-04 · Durées de conservation déclarées par donnée · Ajout

- **Ce qui change** : chaque traitement de `confidentialite.ts` porte un
  champ `conservation` (type `Conservation[]` de `src/lib/confidentialite.ts`) :
  les lignes du journal 12 mois après le geste, purgées par le script seul,
  jamais au passage d'une requête.
  La politique de confidentialité les affiche, « à valider » tant que le
  projet ne les a pas revues ; le script de purge de la brique rgpd les
  applique. Clé : `journal`.
- **Appelant** : rien à changer pour la brique. Une appli qui a écrit son
  propre `Traitement` (dans `traitementsDuProjet`) ajoute `conservation`,
  vide ou rempli : le typecheck le signale. Une durée autre que celle proposée
  s'écrit dans `CONFIDENTIALITE.durees`, par sa clé.
- **Pourquoi** : une durée de conservation qui n'est qu'un texte de la
  politique n'est tenue par rien ; déclarée par donnée, elle se purge et se
  vérifie.

## 2026-11-04 · L'export des données d'une personne par l'admin se trace · Ajout

- **Ce qui change** :
  - `ACTIONS_JOURNALISEES` ajoute `export` (libellé « Export des données »),
    que la contrainte `journal_audit_action_check` admet par une étape de
    migration ajoutée en fin de liste ;
  - la source `SOURCES_JOURNAL` porte `tracerExport` : l'export d'une
    adresse par l'admin (brique rgpd) s'y trace sur « compte n°<id> », au nom
    de l'admin. Une adresse sans compte ne laisse rien.
- **Appelant** : rien à changer. Un code qui énumère les actions du journal
  (un filtre, un libellé) reçoit la quatrième.
- **Pourquoi** : la question ouverte de la brique rgpd, tranchée : l'export
  sort toutes les données d'une personne pour une autre, il doit se retrouver.
