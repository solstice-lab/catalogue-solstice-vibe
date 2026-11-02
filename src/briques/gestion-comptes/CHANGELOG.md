# Journal des changements : brique gestion-comptes

Les changements observables de la brique, du plus ancien au plus récent. La
section « Interface publique » du [README](README.md) dit ce qui compte comme
interface.

**Règle d'entretien** : tout changement d'interface publique ajoute une entrée
**en fin** de ce fichier, dans la PR qui le fait. Une entrée dit ce qui change
pour l'appelant et pourquoi ; « Rupture » veut dire qu'un appelant existant doit
être modifié. Les changements de documentation seule n'y sont pas obligatoires.

## 2026-10-23 · Création de la brique · Ajout

- **Ce qui change** : l'écran `/comptes` (`EcranComptes`), ses six server
  actions et le droit `comptes.administrer` (`ACTIONS_GESTION_COMPTES`), avec
  son entrée de menu. Interface : voir le README, « Interface publique ».
- **Appelant** : aucun, la brique est nouvelle. Côté assembleur,
  `--briques gestion-comptes` exige `comptes` (donc `mails`).
- **Pourquoi** : le niveau 3 des droits, pour un client qui gère
  lui-même ses utilisateurs.
