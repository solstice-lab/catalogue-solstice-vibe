# Journal des changements : brique notifications

Les changements observables de la brique, du plus ancien au plus récent. La
section « Interface publique » du [README](README.md) dit ce qui compte comme
interface.

**Règle d'entretien** : tout changement d'interface publique ajoute une entrée
**en fin** de ce fichier, dans la PR qui le fait. Une entrée dit ce qui change
pour l'appelant et pourquoi ; « Rupture » veut dire qu'un appelant existant doit
être modifié. Les changements de documentation seule n'y sont pas obligatoires.

## 2026-10-28 · Création de la brique · Ajout

- **Ce qui change** : la table `notifications_envois` (journal des envois,
  purgé au-delà de 12 mois) et la table `notifications_lancements` (un envoi
  réel par jour et par branchement), la boucle d'envoi `envoyerNotifications` et ses
  modes réel, à blanc et essai, le jour d'envoi (`jour.ts`), et le
  gestionnaire de route `routeNotifications`, protégé par
  `NOTIFICATIONS_SECRET`. Pour le socle : sa description de traitement
  (`TRAITEMENTS_NOTIFICATIONS`) et sa source de l'export des données d'une
  personne (`SOURCES_NOTIFICATIONS`). Variables ajoutées :
  `NOTIFICATIONS_SECRET`, `NOTIFICATIONS_ADRESSES_ESSAI`. Interface : voir le
  README, « Interface publique ».
- **Appelant** : aucun, la brique est nouvelle et n'est encore branchée sur
  aucun module.
- **Pourquoi** : prévenir par e-mail avant une échéance, à commencer par la fin
  des contrats.

## 2026-10-29 · L'effacement des données d'une personne · Ajout

- **Ce qui change** : la source `notifications` de `SOURCES_NOTIFICATIONS`
  porte `effacement` et `effacer(executeur, adresse)`. La ligne du journal
  reste ; son destinataire est vidé.
- **Appelant** : rien à changer.
- **Pourquoi** : la brique rgpd exige désormais que chaque source dise comment
  elle s'efface. Sans cela, une appli avec les notifications et la brique rgpd
  ne passait plus le typecheck.

## 2026-11-04 · Durées de conservation déclarées par donnée · Ajout

- **Ce qui change** : chaque traitement de `confidentialite.ts` porte un
  champ `conservation` (type `Conservation[]` de `src/lib/confidentialite.ts`) :
  la trace de chaque notification 12 mois après l'envoi.
  La politique de confidentialité les affiche, « à valider » tant que le
  projet ne les a pas revues ; le script de purge de la brique rgpd les
  applique. Clé : `notifications` ; une autre durée se règle aussi dans `conservationMois` de la route.
- **Appelant** : rien à changer pour la brique. Une appli qui a écrit son
  propre `Traitement` (dans `traitementsDuProjet`) ajoute `conservation`,
  vide ou rempli : le typecheck le signale. Une durée autre que celle proposée
  s'écrit dans `CONFIDENTIALITE.durees`, par sa clé.
- **Pourquoi** : une durée de conservation qui n'est qu'un texte de la
  politique n'est tenue par rien ; déclarée par donnée, elle se purge et se
  vérifie.
