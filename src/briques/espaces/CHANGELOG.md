# Journal des changements : brique espaces

Les changements observables de la brique, du plus ancien au plus récent. La
section « Interface publique » du [README](README.md) dit ce qui compte comme
interface.

**Règle d'entretien** : tout changement d'interface publique ajoute une entrée
**en fin** de ce fichier, dans la PR qui le fait. Une entrée dit ce qui change
pour l'appelant et pourquoi ; « Rupture » veut dire qu'un appelant existant doit
être modifié. Les changements de documentation seule n'y sont pas obligatoires.

## 2026-11-03 · Création de la brique · Ajout

- **Ce qui change** : des espaces qu'on crée ou rejoint par un code, avec leurs
  rôles, leurs invitations par e-mail plafonnées et l'accès unique
  `exigerMonEspace()` qui isole les fiches d'un module rattaché à un espace ;
  les écrans « Créer ou rejoindre » et « Mon espace », le droit
  `espaces.participer`, l'entrée de menu, les entrées des registres (effets de
  comptes, données personnelles, confidentialité). Interface : voir le README,
  « Interface publique ».
- **Appelant** : aucun, la brique est nouvelle. Côté assembleur,
  `--briques espaces` exige `comptes` et `mails`.
- **Pourquoi** : dans l'essai tours-de-coloc, cinq tickets sur seize
  réécrivaient les groupes, leurs invitations et le filtrage par groupe, la
  partie la plus risquée de l'appli.

## 2026-11-03 · Effets d'un départ d'espace · Ajout

- **Ce qui change** : un registre des effets d'un départ,
  `src/config/effets-espaces.ts` (`EFFETS_DEPARTS`), et ses types dans
  `departs.ts` (`EffetsDeDepart`, `EffetDeDepart`, `DepartDEspace`,
  `MotifDuDepart`). Quitter, retirer un membre, désactiver et effacer un
  compte jouent les effets déclarés dans la transaction du geste, sous le
  verrou de l'espace, une fois l'adhésion terminée ; chaque effet reçoit
  l'exécuteur, l'espace, le compte, l'adhésion et le motif (`parti`,
  `retire`, `compte-desactive`, `compte-efface`). Un effet qui lève annule le
  geste : `quitter` et `retirerMembre` lèvent alors au lieu de rendre un
  refus. `tests/espaces-departs.test.ts` verrouille qu'un effet écrit par
  l'exécuteur reçu.
- **Appelant** : rien à changer, le registre est livré vide. Un module qui
  sautait les adhésions terminées à la lecture peut déclarer son effet
  (README, « La brancher », point 4) ; la copie d'une appli assemblée avant
  cette entrée reçoit en plus `src/config/effets-espaces.ts`,
  `src/briques/espaces/departs.ts` et `tests/espaces-departs.test.ts`, et la
  liste blanche de `tests/espaces-isolement.test.ts` admet
  `@/config/effets-espaces`.
- **Pourquoi** : au réassemblage de tours-de-coloc, quitter et être retiré ne
  prévenaient aucun module, alors que la désactivation et l'effacement
  passaient par le registre des effets de comptes ; l'ordre des tours, les
  tours futurs et les échanges en attente gardaient l'ancien membre, sauf à
  y penser dans chaque lecture.

## 2026-11-04 · Durées de conservation déclarées par donnée · Ajout

- **Ce qui change** : chaque traitement de `confidentialite.ts` porte un
  champ `conservation` (type `Conservation[]` de `src/lib/confidentialite.ts`) :
  une adhésion terminée 12 mois après le départ (comptée par le script,
  effacée à la main), les codes faux une heure.
  La politique de confidentialité les affiche, « à valider » tant que le
  projet ne les a pas revues ; le script de purge de la brique rgpd les
  applique. Clés : `espaces-adhesions-terminees`, `espaces-essais-code`.
- **Appelant** : rien à changer pour la brique. Une appli qui a écrit son
  propre `Traitement` (dans `traitementsDuProjet`) ajoute `conservation`,
  vide ou rempli : le typecheck le signale. Une durée autre que celle proposée
  s'écrit dans `CONFIDENTIALITE.durees`, par sa clé.
- **Pourquoi** : une durée de conservation qui n'est qu'un texte de la
  politique n'est tenue par rien ; déclarée par donnée, elle se purge et se
  vérifie.
