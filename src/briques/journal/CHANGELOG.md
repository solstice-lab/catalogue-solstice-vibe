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
