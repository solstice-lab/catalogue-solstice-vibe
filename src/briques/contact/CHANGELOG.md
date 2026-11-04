# Journal des changements : brique contact

Les changements observables de la brique, du plus ancien au plus récent. La
section « Interface publique » du [README](README.md) dit ce qui compte comme
interface.

**Règle d'entretien** : tout changement d'interface publique ajoute une entrée
**en fin** de ce fichier, dans la PR qui le fait. Une entrée dit ce qui change
pour l'appelant et pourquoi ; « Rupture » veut dire qu'un appelant existant doit
être modifié. Les changements de documentation seule n'y sont pas obligatoires.

## 2026-10-23 · Création de la brique · Ajout

- **Ce qui change** : la page publique `/contact`, avec son formulaire
  (`FormulaireContact`), l'envoi par la brique mails vers
  `CONTACT_DESTINATAIRE`, et trois filtres anti-spam (champ piège, délai
  minimal, limite par adresse IP et au total, en base). Table
  `contact_envois`. Interface : voir le README, « Interface publique ».
- **Appelant** : aucun, la brique est nouvelle.
- **Pourquoi** : le besoin le plus courant d'un site vitrine.

## 2026-10-23 · `TRAITEMENTS_CONTACT` · Ajout

- **Ce qui change** : `confidentialite.ts` exporte `TRAITEMENTS_CONTACT`, la
  description du traitement du formulaire que la politique de confidentialité
  (`src/lib/confidentialite.ts`) affiche. La mention sous le formulaire renvoie
  à `/confidentialite` au lieu des mentions légales.
- **Appelant** : rien à changer. Le projet remplit la base légale, la durée et les destinataires
  de la clé `contact` dans `CONFIDENTIALITE`.
- **Pourquoi** : le RGPD (art. 13) demande d'informer qui écrit par le
  formulaire.

## 2026-11-04 · Squelette de `/contact` · Changement de comportement

- **Ce qui change** : la page `/contact` prend `PageVitrine` quand l'appli n'a
  pas la brique comptes (un site public), et reste sous `AppLayout` avec elle.
  Le choix se lit dans `NAVIGATION` (une entrée à garde n'existe qu'avec
  comptes) : aucun réglage, aucun symbole ajouté ni retiré.
- **Appelant** : rien à changer. Une vitrine assemblée avec `mails` et
  `contact` voit son formulaire sous l'en-tête de site, avec le titre `Contact`
  et les entrées publiques de `src/lib/navigation.ts` ; son menu n'a plus de
  sous-titre d'écran.
- **Pourquoi** : dans un site vitrine, le formulaire avait l'allure d'un écran
  de gestion au milieu de pages publiques.
