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

## 2026-11-10 · Les champs de saisie sans cadre · Rupture

- **Ce qui change** : `Champ` (kit `src/ui/`) suit la charte « registre » :
  plus de cadre ni d'anneau au focus, une barre d'insertion signale le champ
  (teinte pâle de la structure au repos, couleur d'accent sur le prochain
  champ vide de la page, verte ou rouge selon le format). Nouvelle prop facultative `format` (`siren`, `cp`,
  `email`, `tel`, `date`, `int`, `num`, `pct`, `split`, `url`) ; un champ
  `type="email"`, `tel` ou `url` reçoit le format de son type. Le filtre de
  colonne du `Tableau` prend la même saisie. Le test-verrou
  `tests/champs-sans-cadre.test.ts` refuse tout `<input>` qui se tape écrit
  hors de `src/ui/Champ.tsx`.
- **Pour l'appli** : remplacer chaque `<input>` écrit à la main par un
  `Champ` (qui rend en natif date, nombre et mot de passe), sans quoi le
  test-verrou échoue ; seuls les inputs cachés, fichiers, cases à cocher et
  boutons radio restent permis hors du composant.
- **Pourquoi** : le 22/10/2026, une appli en React a été livrée avec des
  champs nus, invisibles au repos dans une page sans cadres. Le composant de
  la charte se porte, il ne se remplace pas par un `<input>` stylé.

## 2026-11-12 · Thème par défaut à la charte registre, trois tokens ajoutés au contrat · Rupture

- **Ce qui change** : le thème par défaut (`src/ui/theme/tokens.css`) passe à
  la charte Solstice Lab « registre » : papier `#FCFCFD` pour le fond et les
  surfaces, jaune pâle `#FFFBEA` pour `--couleur-accent-fond`, `#3B4A75` pour
  `--couleur-structure-2`, positif `#1F7A4D`, négatif `#B23A3A`, rayons à 0.
  Le contrat gagne trois tokens, que `src/ui/ui.css` lit désormais :
  `--fond-secondaire` (survol de ligne d'un `Tableau`, jours hors du mois de
  `GrilleMois`), `--texte-secondaire-sur-structure` (sous-titre de l'en-tête
  d'`AppLayout`, qui lisait jusque-là `--couleur-accent-fond`) et
  `--curseur-repos` (barre d'insertion d'un `Champ` au repos, `#B8C2D9` par
  défaut, jusque-là dérivée de la structure).
- **Pour l'appli** : une appli thématisée, dont `tokens.css` porte les valeurs
  du client, ajoute ces trois tokens avec une valeur à la charte du client
  (procédure de la skill `solstice-ui`, « Thématiser pour un client ») : sans
  les deux premiers, le survol de ligne et les jours hors du mois n'ont plus de
  fond, et le sous-titre de l'en-tête prend la couleur du texte sur structure ;
  sans `--curseur-repos`, la barre garde la teinte dérivée d'avant. Une appli
  restée au thème par défaut reçoit le nouveau `tokens.css` et n'a rien à
  faire.
- **Pourquoi** : l'agence est passée à la charte du site solstice-lab.com/new,
  qui abandonne le bleu clair, le fond `#F6F8FC`, l'ancien vert, l'ancien
  rouge et les coins arrondis. Avec le fond et les surfaces au même papier,
  le survol de ligne qui lisait `--fond-page` ne se voyait plus : il lui
  fallait un fond à part. Le sous-titre de l'en-tête lisait une couleur de
  fond, devenue jaune pâle : la charte donne au texte secondaire sur navy sa
  propre couleur, `#B8C2D9`. La même teinte est celle de la charte pour la
  barre d'insertion au repos, que les champs sans cadre dérivaient faute de
  token.

## 2026-11-12 · La forme du kit passe à la charte registre · Rupture

- **Ce qui change** : les composants de `src/ui/` prennent la forme de la
  charte « registre », sans token nouveau. Plus de liseré d'accent (en-tête,
  modale, appel à l'action, puce des titres), d'ombre (colonne figée d'un
  `Tableau`) ni de dégradé (`Squelette`). La page d'`AppLayout` est une
  feuille bordée de filets de structure où les blocs (`Carte`, `.sl-grille`,
  `.sl-note`) se touchent, au lieu de cartes espacées ; `Carte` et `TuileKPI`
  n'ont plus de cadre propre. L'en-tête d'`AppLayout` et de `PageVitrine` est
  une barre collante en cellules sur `--fond-secondaire`, avec l'emblème
  hexagonal sur aplat d'accent (lien vers l'accueil) ; l'entrée du menu de la
  page ouverte porte `aria-current="page"` et passe en accent. Le survol d'un
  élément cliquable remplit son fond d'accent. Libellés, en-têtes et chiffres
  passent en mono. `SectionVitrine` accepte `fond="secondaire"` et
  `fond="structure"` ; `fond="surface"` reste lu comme `secondaire`. La
  signature porte l'emblème et la mention « Agence-conseil Data & IA ».
  Quatre tokens changent de rôle, sans changer de nom :
  `--couleur-structure-2` ne sert plus aux survols, elle trace les filets
  d'une bande de structure ; `--fond-secondaire` colore aussi tout l'en-tête,
  le badge neutre et les éléments du calendrier ; `--couleur-accent-fond` ne
  porte plus le badge d'accent ni les éléments du calendrier, mais la note
  (`.sl-note`) ; le sous-titre de l'en-tête, posé désormais sur
  `--fond-secondaire`, lit `--texte-secondaire` et non plus
  `--texte-secondaire-sur-structure`, qui colore le chapô d'une bande de
  structure.
- **Pour l'appli** : rien à changer pour compiler, mais chaque écran se
  relit. Un bloc posé dans un `div` intermédiaire, et non directement dans la
  page ou dans une `.sl-grille`, n'a plus de cadre : le sortir du `div`. Une
  page vitrine qui alternait `page` et `surface` prend maintenant le fond
  secondaire une section sur deux. Une appli thématisée revoit
  `--fond-secondaire`, réglé pour le seul survol de ligne et qui colore
  maintenant l'en-tête, et vérifie les deux contrastes ajoutés aux garde-fous
  de la skill `solstice-ui` : structure sur accent, accent sur structure.
- **Pourquoi** : au passage des tokens à la charte registre, le fond de page
  est devenu égal à la surface et le jaune pâle presque invisible sur le
  papier (1,02:1) : les cartes ne se distinguaient plus du fond, ni le badge
  d'accent, les éléments du calendrier ou l'appel à l'action de leur page.
  La charte répond par les filets, pas par les fonds.

## 2026-11-12 · La marque de l'en-tête rejoint le contrat de thème · Ajout

- **Ce qui change** : la marque en tête de l'en-tête d'`AppLayout` et de
  `PageVitrine` se lit dans `src/ui/theme/Marque.tsx` (`MARQUE`), à côté de
  `tokens.css` et des polices. Par défaut, l'emblème de l'agence, aux couleurs
  des tokens. Un logo client (SVG ou image) ou `null` la remplace ; sans
  marque, la cellule de l'en-tête disparaît. La signature du pied de page n'en
  dépend pas : elle garde l'emblème de l'agence. Le test
  `tests/marque-du-theme.test.ts` refuse qu'un autre fichier que le thème et
  la signature importe l'emblème.
- **Pour l'appli** : rien à changer. Une appli qui veut le logo de son client,
  ou aucun, remplit `Marque.tsx` (procédure de la skill `solstice-ui`,
  « Thématiser pour un client ») ; comme `tokens.css`, c'est une retouche du
  thème, à noter dans `ADAPTATIONS.md`.
- **Pourquoi** : les couleurs, rayons et polices se changeaient dans le seul
  thème, mais l'emblème était écrit dans les deux squelettes : mettre le logo
  du client obligeait à retoucher le kit. La charte de l'agence vaut pour ses
  propres applis et pour les clients sans charte ; pour les autres, elle doit
  se remplacer simplement.
