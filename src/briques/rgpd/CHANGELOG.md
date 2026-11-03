# Journal des changements : brique rgpd

Les changements observables de la brique, du plus ancien au plus récent. La
section « Interface publique » du [README](README.md) dit ce qui compte comme
interface.

**Règle d'entretien** : tout changement d'interface publique ajoute une entrée
**en fin** de ce fichier, dans la PR qui le fait. Une entrée dit ce qui change
pour l'appelant et pourquoi ; « Rupture » veut dire qu'un appelant existant doit
être modifié. Les changements de documentation seule n'y sont pas obligatoires.

## 2026-10-23 · Création de la brique · Ajout

- **Ce qui change** : l'export des données d'une personne, en JSON.
  - `/mes-donnees` : la personne connectée télécharge ses propres données.
  - `/donnees-personnelles` : l'admin télécharge celles d'une adresse donnée.
  - Le registre `src/config/donnees-personnelles.ts` déclare chaque table de
    la base.
  - Interface : voir le README, « Interface publique ».
- **Appelant** : aucun, la brique est nouvelle. Une table neuve se déclare dans
  le registre.
- **Pourquoi** : le RGPD donne à chacun l'accès à ses données
  et leur portabilité.

## 2026-10-28 · L'effacement des données d'une personne · Rupture

- **Ce qui change** :
  - `effacement.ts` : `apercevoirEffacement` et `effacerDonnees`, et leurs
    types ;
  - `SourceDonnees` exige `effacement` (texte montré à l'admin) et
    `effacer(executeur, adresse)` ;
  - `ACTIONS_RGPD` ajoute `donnees.effacer` ;
  - `/donnees-personnelles` porte l'écran de l'effacement, pour qui a ce droit.
- **Appelant** : une source déclarée dans le registre sans `effacement` ni
  `effacer` ne compile plus : les ajouter, sur le modèle des sources du
  catalogue. `src/config/acces.ts` donne un rôle à `donnees.effacer`.
- **Pourquoi** : répondre à une demande d'effacement (RGPD art. 17). Une source
  qui ne dirait pas comment s'effacer resterait après l'effacement sans que rien
  ne le signale.

## 2026-10-29 · Gardée d'office avec la brique comptes · Assemblage

- **Ce qui change** : l'assembleur garde la brique dès que comptes est prise,
  sans qu'on la nomme dans `--briques` ; la nommer reste permis.
- **Appelant** : rien à changer.
- **Pourquoi** : une appli qui a des comptes doit pouvoir répondre à une
  demande d'accès ou d'effacement ; la recommandation de la skill creer-appli
  ne suffisait pas.

## 2026-11-03 · Le journal passe par le registre des effets de comptes · Rupture

- **Ce qui change** :
  - `OptionsEffacement` perd `trace`, `EffacementSource` perd `gestes`, et le
    type `GesteEffacement` disparaît : la source du compte joue les effets
    d'effacement du registre des effets de comptes
    (`src/config/effets-comptes.ts`, brique comptes), où le journal d'audit a
    son entrée ;
  - `SourceDonnees.effacer` reçoit un troisième argument, `auteur`
    (`AuteurEffacement`, `{ email }`) : l'admin qui efface, l'adresse
    normalisée du demandeur ;
  - les effets se jouent aussi dans l'aperçu, et s'annulent avec lui : un effet
    qui lève se voit dès l'aperçu.
- **Appelant** : un appel d'`effacerDonnees` qui passait `trace` la retire
  (le typecheck le signale) ; l'effacement reste tracé au journal. Une source
  qui rendait des `gestes` déclare plutôt un effet d'effacement au registre.
  Une source qui ne lit pas `auteur` n'a rien à changer.
- **Pourquoi** : un module qui affiche un prénom doit l'anonymiser quand le
  compte est effacé (tours-de-coloc), comme le journal trace le geste. Un seul
  registre pour les deux, et pour la désactivation, évite une prise par geste
  à brancher dans les actions de l'appli.
