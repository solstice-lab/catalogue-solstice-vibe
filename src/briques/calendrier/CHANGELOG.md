# Journal des changements : brique calendrier

Les changements observables de la brique depuis l'état d'avant
la GMAO (2026-10-15), du plus ancien au plus récent. La brique
n'existait pas à cette date : la première entrée est sa création. La section
« Interface publique » du [README](README.md) dit ce qui compte comme interface.

**Règle d'entretien** : tout changement d'interface publique ajoute une entrée
**en fin** de ce fichier, dans la PR qui le fait, comme toute correction de
sécurité (« Sécurité »), même sans changement d'interface. Une entrée dit ce qui change
pour l'appelant et pourquoi ; « Rupture » veut dire qu'un appelant existant doit
être modifié. Les changements de documentation seule n'y sont pas obligatoires.

Aucun changement depuis sa création : les trois seuls commits qui touchent
`src/briques/calendrier/` sont ceux de sa création.

## 2026-10-16 · Création de la brique · Ajout

- **Ce qui change** : les événements d'une entité datée sur un mois, en grille sur
  ordinateur et en cartes sur téléphone. Interface : voir le README, « Interface
  publique » (dont `lireEvenements`, `lireMois`, `VueCalendrier`). Les composants
  `GrilleMois` et `NavigationMois` entrent au kit (`src/ui/`), hors de la brique.
- **Appelant** : aucun, la brique est nouvelle. Premier branchement : les
  interventions de la GMAO (`src/lib/calendrier-gmao.ts`, page `/calendrier`).
- **Pourquoi** : une brique nouvelle livrée après le bilan GMAO ; le
  calendrier montre les réalisations passées et ne planifie rien.

## 2026-10-22 · Dépendances entre briques · Documentation

- **Ce qui change** : la fiche dit qu'une brique n'importe une autre brique que
  si elle la déclare dans son `exige`. Rien ne change pour l'appelant.
- **Pourquoi** : la règle « une brique n'importe que le socle »
  s'assouplit pour la connexion par code, qui exigera la brique mails.
