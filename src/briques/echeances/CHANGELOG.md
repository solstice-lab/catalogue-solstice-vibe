# Journal des changements : brique échéances

Les changements observables de la brique depuis l'état d'avant
la GMAO (2026-10-15), du plus ancien au plus récent. Cet état est
la référence du bilan de la GMAO ; la section
« Interface publique » du [README](README.md) dit ce qui compte comme interface.

**Règle d'entretien** : tout changement d'interface publique ajoute une entrée
**en fin** de ce fichier, dans la PR qui le fait. Une entrée dit ce qui change
pour l'appelant et pourquoi ; « Rupture » veut dire qu'un appelant existant doit
être modifié. Les changements de documentation seule n'y sont pas obligatoires :
ceux qui précèdent la règle sont listés pour mémoire.

L'état de départ est celui d'avant la GMAO. Les entrées du 2026-10-16 décrivent
l'effet net sur `main`.

## 2026-10-16 · Option `retardSansLimite` · Ajout, compatible

- **Ce qui change** : `Branchement.retardSansLimite?: boolean`, absente par
  défaut. `PresentationEcheances` et `presentationDe` la reprennent.
  `statutEcheance` et `echeanceVisible` reçoivent un quatrième paramètre
  facultatif, `retardSansLimite` (faux par défaut) ; `bornesDeLaVue` est
  inchangée. Avec l'option, `lireEcheances` et `compterEcheances` lisent sans
  borne basse (une échéance passée ne quitte jamais la vue), le statut se dit
  « En retard » (nouvelle fonction `libelleStatut`) et la tuile et l'état vide
  parlent de retards.
- **Appelant** : rien à changer. Sans l'option, le comportement est celui d'avant
  (contrats : J−(`delai`−1) au plus loin).
- **Pourquoi** : la GMAO exige qu'un retard ne disparaisse jamais de la vue ;
  un plan en retard de 30 jours ou
  plus sortait de la fenêtre. La limite n'était pas que dans la requête : elle
  est aussi dans le calcul, la tuile et les textes.

## 2026-10-16 · `TuileEcheances` reçoit `presentation` · Rupture

- **Ce qui change** : la prop `delaiAlerteJours` disparaît ; la tuile reçoit
  `presentation` (le résultat de `presentationDe(branchement)`), comme la vue.
  Props de la tuile : `compte`, `presentation`, `href`. Le délai, l'option
  `retardSansLimite` et le libellé viennent désormais du branchement.
- **Appelant** : remplacer `delaiAlerteJours={X.delaiAlerteJours}` par
  `presentation={presentationDe(X)}`. Le seul appel existant alors, celui des
  contrats (`src/app/page.tsx`), a été modifié dans la PR ; rien ne signalait le
  changement à un appelant d'une autre appli.
- **Pourquoi** : recopier à la main le délai, l'option et le libellé permettait
  à un branchement d'oublier `retardSansLimite` : vue « En retard », tuile
  « échues récemment », sans aucune erreur.

## 2026-10-16 · `Intitules.tuile` · Ajout, compatible

- **Ce qui change** : `Intitules.tuile?: string`, le libellé de la tuile.
- **Appelant** : rien à changer. Absent, le libellé reste « Échéances à N jours ».
- **Pourquoi** : deux tuiles sur le même accueil (contrats, GMAO) auraient eu le
  même texte.

## 2026-10-16 · `LIBELLES_STATUT` n'est plus exporté · Rupture pour qui l'importait

- **Ce qui change** : la constante `LIBELLES_STATUT` de `calcul.ts` devient
  locale. Afficher un statut passe par `libelleStatut(statut, retardSansLimite?)`
  (interne : voir le README).
- **Appelant** : avant la GMAO, seule `VueAVenir.tsx` l'importait ; elle a été modifiée
  dans la PR. Un import de `LIBELLES_STATUT` ailleurs ne compile plus.
- **Pourquoi** : afficher « Échue récemment » pour un retard de 35 jours serait
  faux ; le libellé doit venir de la fonction qui connaît l'option.

## 2026-10-19 · README : le contrat de lecture · Documentation

- **Ce qui change** : le README écrit ce que la brique attend de la table lue (une
  vue SQL convient, une date vide exclut la ligne) et liste les textes codés.
  Aucun code.
- **Pourquoi** : le bilan GMAO (section 3) a dû vérifier ces points par lecture du
  code puis par test, la documentation ne les disant pas.

## 2026-10-22 · Dépendances entre briques · Documentation

- **Ce qui change** : la fiche dit qu'une brique n'importe une autre brique que
  si elle la déclare dans son `exige`. Rien ne change pour l'appelant.
- **Pourquoi** : la règle « une brique n'importe que le socle »
  s'assouplit pour la connexion par code, qui exigera la brique mails.
