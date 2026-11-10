# Journal des changements : socle

Les changements du socle qu'une appli assemblée doit connaître, du plus ancien
au plus récent. Le socle, c'est tout ce que l'assembleur livre hors des
briques de `src/briques/` : le kit `src/ui/`, `src/lib/` (brique données
comprise), les pages communes, la configuration, la CI et le harnais
(`CLAUDE.md`, `.claude/`). Chaque brique tient son propre `CHANGELOG.md`, dans
son dossier.

Ce fichier arrive dans l'appli avec le socle et suit ses mises à jour :
l'appli le lit, elle n'y écrit pas. Ses propres changements se notent ailleurs.

**Règle d'entretien** : une entrée s'ajoute **en fin** de ce fichier, dans la
PR qui fait le changement, quand il porte l'un de ces marqueurs :

- **Sécurité** : une correction à reporter vite dans les applis, même si
  aucune n'a rien à changer de son côté ;
- **Rupture** : une appli existante doit changer quelque chose (son code, sa
  configuration, une variable chez l'hébergeur) pour recevoir le changement.

Une correction de sécurité qui oblige aussi l'appli à changer porte
« Rupture, Sécurité ». Les autres changements du socle peuvent y figurer
(« Ajout », « Correction »), sans obligation ; la documentation seule n'y va
pas. Une entrée dit ce qui change, ce que l'appli doit faire et pourquoi, sur
le modèle des journaux des briques. Les changements d'avant ce fichier n'y
sont pas repris : aucune appli réelle n'avait encore été assemblée.

## 2026-11-10 · Création du journal du socle · Ajout

- **Ce qui change** : le socle a son journal des changements, ce fichier, avec
  les marqueurs « Sécurité » et « Rupture ». `CLAUDE.md` (§7) en donne la règle
  d'entretien, et l'étend aux briques : une correction de sécurité ajoute une
  entrée « Sécurité » au `CHANGELOG.md` de la brique touchée, même sans
  changement d'interface.
- **Pour l'appli** : rien à changer. L'outil de mise à jour du catalogue ne lit
  pas encore ce fichier : il arrive dans l'appli comme tout fichier du socle,
  et se lit à la main lors d'une mise à jour, entre le commit noté au
  manifeste et le commit visé.
- **Pourquoi** : sans lui, rien ne disait qu'un commit du catalogue était une
  correction de sécurité, et une correction pressée ne se reconnaissait pas
  parmi les autres le jour où il faudrait la reporter. Décidé le 2026-11-03,
  à la conception de la mise à jour des applis ; commencé avant la première
  appli réelle, il n'y a pas d'historique à trier.
