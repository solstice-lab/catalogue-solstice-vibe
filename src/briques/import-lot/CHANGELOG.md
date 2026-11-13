# Journal des changements : brique import-lot

Les changements observables de la brique depuis l'état d'avant
la GMAO (2026-10-15), du plus ancien au plus récent. La brique
n'existait pas à cette date : les premières entrées sont sa fiche, puis son code. La
section « Interface publique » du [README](README.md) dit ce qui compte comme
interface.

**Règle d'entretien** : tout changement d'interface publique ajoute une entrée
**en fin** de ce fichier, dans la PR qui le fait, comme toute correction de
sécurité (« Sécurité »), même sans changement d'interface. Une entrée dit ce qui change
pour l'appelant et pourquoi ; « Rupture » veut dire qu'un appelant existant doit
être modifié. Les changements de documentation seule n'y sont pas obligatoires :
ceux qui précèdent la règle sont listés pour mémoire.

Aucun changement de code depuis son arrivée sur `main` : le diff de
`src/briques/` contre l'état d'avant la Demande d'achat ne touche que des README, et
la brique a servi aux commandes telle que livrée
(bilan de la Demande d'achat).

## 2026-10-16 · Fiche de la brique · Documentation

- **Ce qui change** : le README de la brique, écrit avant tout code. Aucun
  fichier de code.
- **Pourquoi** : fiche d'abord, tests et code ensuite.

## 2026-10-19 · Le code de la brique arrive sur `main` · Ajout

- **Ce qui change** : le code de `src/briques/import-lot/` : lecture d'un `.xlsx`
  ou d'un CSV, lot à valider, confirmation tout ou rien. Interface : voir le
  README, « Interface publique » (dont `creerLot`, `confirmerLot`, `ignorerLot`,
  `supprimerLot`). `valeurRetenue` et le parseur CSV passent de
  `scripts/lib/cli.ts` à `src/lib/import-fusion.ts`, que `cli.ts` ré-exporte.
- **Appelant** : aucun, la brique est nouvelle sur `main`.
- **Pourquoi** : le code avait été écrit et relu dans une PR qui visait une
  branche déjà fusionnée : son contenu n'était jamais arrivé sur `main`. Il y
  arrive ici sans autre changement de code.

## 2026-10-19 · README après le branchement · Documentation

- **Ce qui change** : la limite d'envoi d'un fichier est marquée tranchée (Route
  Handler, décision du 2026-10-19 de la personne responsable du projet), avec les constats du branchement ;
  le vrai Excel anonymisé se demande avant le premier vrai fichier ; la colonne
  « Qui tranche » nomme la personne responsable du projet. Aucun code.
- **Pourquoi** : le bilan des demandes d'achat (section 1) relevait que le README
  décrivait l'avant-branchement.

## 2026-10-19 · Renvois d'avant-branchement · Documentation

- **Ce qui change** : « Aucune appli ne la branche encore » devient le
  branchement sur les commandes ; le composant commun attend une deuxième
  appli ; le téléversement passe par le Route Handler
  `src/app/importer/envoi/route.ts`, plus par une Server Action. Aucun code.
- **Pourquoi** : une relecture a relevé ces textes d'avant-branchement.

## 2026-10-20 · Écarter une ligne à la lecture selon une règle de l'appli · Ajout

- **Ce qui change** : le `Branchement` accepte un réglage facultatif `ecarter(valeurs)`
  (asynchrone, rend le motif ou `null`). `creerLot` l'appelle une fois par ligne
  retenue, après la validation du fichier : la ligne refusée rejoint les lignes
  écartées avec son motif et tous ses numéros, au lieu de bloquer le lot entier à
  la confirmation. Elle sort aussi de `lot.fusions`, et `ecarter` passe après
  l'ordre des renvois (écarter la cible d'un renvoi laisse la ligne qui la vise
  sans cible). README, « Ce qu'on configure », mis à jour.
- **Appelant** : sans effet pour un branchement qui ne le déclare pas. Le branchement
  `commandes` (`src/lib/imports-branches.ts`) l'utilise pour la date de commande
  antérieure à la demande.
- **Pourquoi** : la règle lit la base (la demande acceptée), ce que la validation du
  fichier, pure et sans base, ne peut pas faire. L'accroche est dans la brique et non
  dans l'appli parce que seule la brique construit la liste des lignes écartées et
  fixe le moment de la lecture ; sans elle, l'appli ne pourrait que refuser à la
  confirmation, ce que la recette a relevé.

## 2026-10-22 · La brique fournit ses écrans · Ajout

- **Ce qui change** : la brique fournit la page « Importer » (`EcranImporter`) et
  la page d'un lot (`EcranLot`), sur le kit `src/ui/`, ainsi que le corps des gestes
  (`actionConfirmer`, `actionIgnorer`, `actionSupprimer`, `lotDeLaPage` dans
  `gestes.ts`) et de l'envoi (`actionEnvoyer` dans `envoi.ts`). Le `Branchement`
  accepte un réglage facultatif `ecran` (chemin, obligatoire dans `ecran` et sans
  valeur par défaut ; pages revalidées, colonnes, textes de l'entité, traduction des
  erreurs de l'appli), que les écrans exigent. Nouveaux types publics :
  `EcranImport`, `ColonneEcran`, `TextesEcran`, `RetourGeste`, `ActionsDuLot`. Les
  écrans refusent un branchement qui déclare un champ de décision : ils ne savent pas
  encore le saisir. README : « Ce qu'elle apporte », « Les fichiers »,
  « Interface publique », « La brancher », « Ce qu'on configure ».
- **Appelant** : sans effet pour un branchement existant, qui garde ses propres
  pages (`ecran` est facultatif). Pour passer aux écrans de la brique : déclarer
  `ecran`, puis réduire les pages, server actions et route à leur garde suivi d'un
  appel à la brique (README, « La brancher »). Les commandes du catalogue le font
  dans cette PR ; leurs anciens composants et `src/lib/import-commandes-domaine.ts`
  disparaissent. Les tableaux prennent l'`id` du branchement dans le leur : la vue
  conservée (tri, filtres) d'un onglet ouvert repart de zéro une fois. La brique
  importe désormais `react`, `next/navigation`, `next/cache`, `@/ui` et
  `@/lib/format` : une copie qui la garde garde aussi le kit et les formats du
  socle (déjà présents dans toute copie).
- **Pourquoi** : chaque branchement recopiait environ 600 lignes d'écrans et
  réécrivait leurs tests (les commandes du catalogue, puis les équipements d'une
  appli assemblée le 2026-10-21), pour un même écran à des mots près. Les
  droits restent à l'appli : la brique ne connaît pas les rôles.

## 2026-10-22 · Dépendances entre briques · Documentation

- **Ce qui change** : la fiche dit qu'une brique n'importe une autre brique que
  si elle la déclare dans son `exige`. Rien ne change pour l'appelant.
- **Pourquoi** : la règle « une brique n'importe que le socle »
  s'assouplit pour la connexion par code, qui exigera la brique mails.

## 2026-10-23 · `SOURCES_IMPORT_LOT` · Ajout

- **Ce qui change** : `donnees-personnelles.ts` exporte `SOURCES_IMPORT_LOT`,
  les lignes de fichiers importés où une adresse figure, pour l'export des
  données d'une personne (brique rgpd).
- **Appelant** : rien à changer.
- **Pourquoi** : un lot garde les valeurs du fichier telles quelles,
  adresses comprises.

## 2026-10-28 · L'effacement des données d'une personne · Ajout

- **Ce qui change** : la source `lignes-importees` de `SOURCES_IMPORT_LOT`
  porte `effacement` et `effacer(executeur, adresse)`. La ligne reste ;
  l'adresse y est remplacée par « (adresse effacée) » dans les valeurs.
- **Appelant** : rien à changer.
- **Pourquoi** : répondre à une demande d'effacement (RGPD art. 17) sans
  défaire l'histoire du lot.

## 2026-11-09 · Borne sur la taille décompressée d'un classeur · Correction

- **Ce qui change** : `lireFichier` refuse un .xlsx dont l'archive dépasse
  100 Mo une fois décompressée (`OCTETS_DECOMPRESSES_MAX`, toutes feuilles
  comprises) par une `ErreurFichier` qui dit de le découper. Un classeur
  de 50 000 lignes de 20 colonnes (5 Mo envoyés, 55 Mo décompressés) reste
  lu : mesuré à la main, pas dans la suite, qui y passerait 26 s.
  Nouvelle dépendance directe : `jszip`, déjà présente sous `exceljs`.
- **Appelant** : rien à changer. Les symboles publics sont les mêmes ; seul un
  fichier qui aurait dépassé 100 Mo décompressé, auparavant lu (ou fatal pour
  le process), est maintenant refusé avec un message.
- **Pourquoi** : le plafond de 10 Mo porte sur le fichier compressé, et
  `exceljs` décompresse tout avant de compter les lignes : quelques Mo de XML
  répétitif suffisaient à faire tomber le process partagé par toute l'appli,
  pour toute personne qui a le droit d'importer.

## 2026-11-13 · L'envoi admet le proxy d'un Codespace, hors production · Comportement

- **Ce qui change** : le contrôle d'origine d'`actionEnvoyer` admet, dans un
  GitHub Codespace hors production, l'origine `http://localhost:3000` que son
  proxy transmet vers l'hôte redirigé du même Codespace. La brique importe
  pour cela `@/lib/codespaces`, fichier du socle. Hors Codespace et en
  production, rien ne change.
- **Appelant** : rien à changer. Une copie de la brique hors de l'assembleur
  prend aussi `src/lib/codespaces.ts`.
- **Pourquoi** : essai du 2026-11-13 dans GitHub Codespaces : le proxy change
  l'origine, et l'envoi d'un fichier aurait été refusé comme la connexion l'a
  été.
