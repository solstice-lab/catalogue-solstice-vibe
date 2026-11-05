---
name: solstice-ui
description: Kit UI Solstice et thématisation client. Charger avant de construire ou modifier tout écran, page, tableau, formulaire, composant ou style de cette app, et pour extraire la charte graphique d'un client (PDF ou site web) vers les tokens du thème.
---

# solstice-ui — le kit UI et sa thématisation

Deux couches, à ne jamais mélanger :

1. **Les invariants Solstice** — la construction et le comportement, en dur
   dans les composants de `src/ui/`. Identiques chez tous les clients : c'est
   la signature de qualité de l'agence.
2. **Le thème client** — l'identité visuelle, entièrement dans
   `src/ui/theme/tokens.css` (+ les polices : `src/app/layout.tsx` et les
   fichiers de `src/ui/theme/polices/`).
   C'est la seule chose qui change d'un client à l'autre.

## Le kit (`src/ui/`)

| Composant | Usage |
| --- | --- |
| `AppLayout` | Squelette de tout écran d'outil : en-tête (nom, sous-titre, nav, badge de contexte), contenu, **signature Solstice Lab** (gardée dans toute livraison Solstice Lab, couleurs hors thème). À côté d'elle, les liens « Mentions légales » vers `/mentions-legales` et « Confidentialité » vers `/confidentialite`, pages du socle ouvertes sans connexion : leurs valeurs se remplissent dans `src/lib/mentions-legales.ts` et `src/lib/confidentialite.ts` avant toute mise en ligne, chaque page signale chaque champ requis resté vide. Une entrée de `navigation` peut porter `visible` (fonction, éventuellement asynchrone) : le menu ne propose que celles qui répondent vrai. Le kit ne connaît aucune règle, c'est `lib/navigation.ts` qui branche chaque entrée sur `visiblePour(action)` de `briques/comptes/roles.ts` (avec la brique comptes), la même action que celle que la page exige (droits dans `src/config/acces.ts`). Le menu se replie derrière un bouton « Menu » sous 720 px (composant client `MenuNavigation`, interne au kit) : seuls libellé et adresse lui sont passés. |
| `PageVitrine` | Squelette d'une page publique de site vitrine : en-tête horizontal (`nom` vers l'accueil, `liens` à droite, repliés derrière « Menu » sous 720 px, `action` facultative : un `LienBouton variante="secondaire"`, le primaire se fondrait dans l'en-tête), contenu, puis le même pied qu'`AppLayout` (signature, mentions légales, confidentialité). Liens publics, sans garde `visible`. |
| `SectionVitrine` | Une section de `PageVitrine`, pleine largeur, contenu centré : `titre`, `intro` (chapô), `id` (ancre visée par un lien de l'en-tête), `fond` (`page` ou `surface`, à alterner). `principale` : le titre de la page (h1), une seule, la première ; les autres sont des h2. Dedans : texte, `Carte`s dans `.sl-grille`, `.sl-liste-simple`, `AppelAction`. |
| `AppelAction` | Bloc d'appel à l'action d'une page vitrine : `titre`, `texte`, `actions` (`LienBouton`, le primaire d'abord). Un seul par écran. Actions empilées sur téléphone. |
| `Tableau` | Tout affichage tabulaire. Tri au clic sur l'en-tête (asc → desc → aucun) et filtre par colonne **intégrés d'office**, et la **vue (tri, filtres, déplis) survit à la navigation dans l'onglet** — `id` (obligatoire) la rattache au tableau : stable, unique dans l'app, jamais dérivé des données ; sessionStorage, donc fermer l'onglet remet à zéro. `chiffres: true` pour les colonnes numériques (chasse fixe, alignées à droite), `rendu` pour les cellules riches — le tri et le filtre restent sur la valeur brute. `actionsLot` ajoute la sélection de lignes et une barre d'actions en lot (c'est aux LISTES que reviennent les gestes de masse, pas aux fiches). `enfants` passe en **mode hiérarchique** : sous-lignes dépliables, PAS de tri (ordre structurel), le filtre MASQUE sans recalculer les agrégats — fournir `cleLigne`, c'est elle qui rend les déplis stables. `voletsFiges` fige en-tête et première colonne (croisées, tableaux longs). `figee: "droite"` sur une colonne la garde visible à droite quand le tableau défile (la colonne d'actions d'une file de décision : sur téléphone, Accepter/Refuser restent atteignables) ; une seule, la dernière. `auClicLigne` rend la ligne cliquable (détail). `exports={{ nomFichier, titre? }}` ajoute les boutons .xlsx et PNG — l'export dit ce que l'écran montre, et suit le thème client (couleurs lues dans les tokens au clic). Dans l'.xlsx, une colonne dont l'écran formate une date (`date()`) se déclare `format: "date"` (vraie date au format de l'écran, sinon du texte) et `exporter` donne la valeur écrite quand elle diffère de la valeur brute (le libellé d'un statut, pas sa clé) ; une cellule sans valeur reste vide. Le PNG écarte filtres, barre d'actions en lot et colonne de sélection. |
| `ListeCartes` | Liste courte et déjà ordonnée, en cartes empilées pour le téléphone : `cle` (obligatoire, stable), `titre`, `badge`, `champs`, `lien` (la carte entière mène à la fiche). Pas de tri ni de filtre : une liste à explorer reste un `Tableau`. Pour une même vue en tableau sur ordinateur et en cartes sur téléphone, rendre les deux dans `.sl-seulement-ordinateur` et `.sl-seulement-telephone` (bascule en CSS à 720 px, juste dès le rendu serveur). |
| `GrilleMois`, `NavigationMois` | Un mois en calendrier, pour l'ordinateur. `GrilleMois` reçoit les semaines déjà construites (`semaines`, du lundi au dimanche : elle ne calcule aucune date) et rend chaque élément en lien vers sa fiche ; `NavigationMois` porte le titre du mois et les liens précédent, suivant, aujourd'hui (adresses `?mois=…`, visibles aussi sur téléphone). Sur téléphone, une `ListeCartes` prend le relais (`.sl-seulement-ordinateur` / `.sl-seulement-telephone`). |
| `TuileKPI` | Indicateur de tête d'écran : libellé, valeur en chasse fixe, variation en badge. En rangée dans `.sl-grille--serree`. `href` rend la tuile entière cliquable vers l'écran qui détaille le chiffre. |
| `Squelette` | Zone en chargement (barres scintillantes). Utilisé par les `loading.tsx`. |
| `Carte` | Bloc de contenu : carte blanche, titre de section en petites capitales à puce d'accent. |
| `Bouton` | `primaire` (une action principale par écran), `secondaire`, `danger` (destructif uniquement). |
| `LienBouton` | Un lien à l'allure d'un bouton (« Nouveau contrat », « Annuler » d'un formulaire, « Modifier » d'une fiche), mêmes variantes que `Bouton`, qui reste pour les gestes. Un `Link` de Next ; un `<a>` simple avec `download` (fichier à télécharger) ou `natif` (route qui redirige ailleurs, comme la connexion Google) : rien ne se précharge. Jamais les classes `sl-bouton` recopiées sur un lien. |
| `BoutonSupprimer` | Suppression depuis une fiche, confirmée dans une `Modale` : `titre` (la question), `action` (la server action liée à l'id ; si la suppression est refusée, elle renvoie `{ erreur }`, affiché dans la `Modale`), `explication` facultative (texte de la `Modale` à la place de « Cette action est définitive. », à n'employer que si la suppression a des effets à dire, et qui redit alors que l'action est définitive). Ne pas recopier la confirmation dans chaque module. |
| `Badge` | Statuts et variations. `positif`/`negatif` portent la sémantique des données, `accent` un simple relief. |
| `Champ`, `ChampSelect`, `ChampTexteLong` | Champs de formulaire avec label et aide. |
| `ChampCase` | Case à cocher, son libellé sur la même ligne, aide dessous (« Prévenir par e-mail »). Pas de `Champ type="checkbox"`, qui met la case dans un cadre de saisie. |
| `ChampPiege` | Champ piège anti-robot d'un formulaire public (`name` seul) : hors de l'écran, masqué aux lecteurs d'écran, sauté à la tabulation. Le serveur traite tout envoi où il n'est pas vide comme un robot (brique contact). |
| `EtatVide` | Toute liste ou zone potentiellement vide : titre, description, action de démarrage. Un blanc silencieux ressemble à un bug. |
| `Modale` | Confirmation ou saisie courte. Fermeture par Échap, voile et croix. |

## `AppLayout` ou `PageVitrine`

- **`PageVitrine`** pour une page qu'un visiteur lit sans compte : présentation,
  offre, références, contact. Un site vitrine assemblé sans base n'a que
  celles-là.
- **`AppLayout`** pour un écran d'outil, celui où l'on travaille : listes,
  fiches, formulaires, tableaux de bord, le plus souvent derrière la connexion.
  Son sous-titre d'écran et son badge de contexte n'ont pas de sens pour un
  visiteur.
- Une appli qui a les deux (site public et espace connecté) prend `PageVitrine`
  pour ses pages publiques, `AppLayout` pour le reste. Jamais les deux dans une
  même page.
- Les deux squelettes posent le même pied de page (`PiedDePage`, interne au
  kit) : aucune page ne pose le sien.
- À ce jour, les pages publiques livrées par le socle (`/mentions-legales`,
  `/confidentialite`) et l'accueil d'une appli sans module métier restent sous
  `AppLayout`. Dans un site vitrine, l'accueil se réécrit avec `PageVitrine` ;
  les autres attendent leur propre passage. `/contact` (brique contact) choisit
  seule : `PageVitrine` sans la brique comptes, `AppLayout` avec (README de la
  brique, « Le squelette de la page »). C'est l'exception à « `PageVitrine`
  pour ses pages publiques » ci-dessus : une appli avec comptes garde `AppLayout`
  pour `/contact`, même si elle a d'autres pages publiques sous `PageVitrine`.
- Démonstration : `/kit/site-vitrine`, liée depuis `/kit`.

## Règles de construction

- **Avant de coder, demander la cible** (téléphone, ordinateur ou les deux),
  sauf si le `CLAUDE.md` ou le `PROJET.md` du projet la fixe : les
  allers-retours d'interface venaient de cibles devinées.
- **Jamais de HTML/CSS ad hoc** pour ce que le kit couvre ; jamais de couleur,
  police ou rayon en dur — uniquement les tokens. Une variante teintée se
  dérive d'un token (`color-mix(in srgb, var(--token) X%, transparent)`).
  Pas de `style={{…}}` pour la mise en page : une classe du kit
  (`sl-formulaire` pour la pile des champs, `sl-rangee-actions` pour les
  boutons, `sl-texte-long` pour un texte libre dans une fiche, `sl-liste-simple` pour
  une courte liste de phrases dans une fiche ou une carte), ou une
  primitive ajoutée au kit.
- **Un tableau = `Tableau`.** Ne pas recoder tri ou filtres, ne pas les
  retirer. C'est la règle d'origine du kit. Deux tableaux qui partagent un
  `id` mélangent leurs vues ; avec `actionsLot`, fournir `cleLigne`, sinon
  une ligne recréée à chaque rendu perd sa case cochée.
- Composant manquant : le construire dans `src/ui/` sur les tokens, l'exporter
  dans `index.ts`. Dans une appli assemblée, signaler en plus qu'il est
  candidat à remonter dans le catalogue.
- **Tout montant, date ou pourcentage affiché passe par `src/lib/format.ts`**
  (jamais de `toLocaleString` inline) : la langue, la devise et le fuseau du
  client (`LOCALE`, `DEVISE`, `FUSEAU`) s'y règlent une seule fois, en tête
  de fichier, à la mise en route du projet. Le jour courant se prend par
  `aujourdhui()`, jamais par `new Date()` côté serveur (UTC chez l'hébergeur).
  Une date `aaaa-mm-jj` lue comme un instant UTC s'affiche la veille dans un
  fuseau négatif.
- **Pages d'erreur** : `error.tsx`, `global-error.tsx`, `not-found.tsx` et
  `loading.tsx` existent à la racine de `src/app/` — ne pas les supprimer.
  Sans elles, une erreur en prod est une page blanche avec un digest
  cryptique. Le digest reste affiché : c'est la référence à chercher dans les
  logs. Les messages ne nomment jamais une personne — dire « l'équipe
  technique ».
- **La limite de taille annoncée est celle qui s'applique** : un champ fichier
  annonçait 10 Mo alors que le plafond réel était de 3 Mo, et refusait sans
  explication. Le texte à l'écran et le contrôle lisent la même valeur, plafond
  du framework ou de l'hébergeur compris ; un refus dit la limite.
- **Un statut inconnu ne s'affiche jamais comme un état sain** : un statut que
  l'écran ne sait pas lire se montre tel quel, avec sa valeur, jamais derrière
  le libellé ou le ton d'un état sain (un « tout va bien » sur un écran de
  règlement).
- **Un pas de saisie ne contraint pas la valeur** : un champ montant à pas de
  100 € refusait un reliquat légitime de 3 334 €. Pas de `step` plus gros que
  la plus petite unité admise (le centime) ; la règle métier se contrôle côté
  serveur.
- Registre sobre : pas de superlatifs, pas d'emojis, une à deux touches
  d'accent par écran.
- Flux secondaires (confirmation, saisie courte, détail rapide) : préférer
  une `Modale` ou un overlay à une navigation plein écran — indispensable si
  l'app est utilisée en PWA mobile, où une navigation piège l'utilisateur.
- Candidats à ajouter au kit quand un projet le réclame (ne pas anticiper) :
  pagination (`parPage`), onglets, tableau croisé (avec le détail au clic par
  cellule).

## Contrat de thème (`src/ui/theme/tokens.css`)

Identité : `--couleur-structure(-2)`, `--couleur-accent`,
`--couleur-accent-fond`, `--texte`, `--texte-secondaire`,
`--texte-sur-structure`, `--fond-page`, `--surface`, `--bordure`.
Sémantique (ne se thématise PAS) : `--positif`, `--negatif`, et
`--texte-sur-semantique` pour le texte posé sur eux (bouton danger).
Forme : `--rayon`, `--rayon-petit`. Typo : `--police-texte`,
`--police-chiffres` (alimentées par next/font/local dans `layout.tsx`).

L'image de l'aperçu au partage (`src/app/opengraph-image.tsx`) lit au build
`--couleur-structure`, `--couleur-accent`, `--texte-sur-structure` et
`--rayon` : ces quatre-là restent des valeurs littérales (hex, `rgb()`,
`hsl()`, px), jamais `var()` ni `color-mix()`, que l'image ne sait pas lire
(`tests/referencement.test.ts` le vérifie). Sa police est celle de `next/og`,
pas celle du thème. L'image est dessinée par Satori, qui ne lit aucune feuille
de style : ses `style={{…}}` sont la seule exception à la règle des classes du
kit.

Le thème par défaut est la charte Solstice Lab — le garder pour les protos et
les clients sans identité définie.

## Thématiser pour un client

La charte arrive en **PDF** ou via un **site existant** :

- **PDF** : lire le document ; relever couleur principale, couleur d'accent,
  neutres, typographies (titres/texte), formes (arrondis). Si le PDF donne des
  références Pantone/CMJN sans hex, convertir et le signaler.
- **Site** : inspecter les styles calculés (header, boutons, liens, fonds,
  bordures) et relever les mêmes éléments. Se méfier des couleurs d'images :
  ne prendre que ce qui est du CSS assumé.

Puis mapper vers les tokens :

1. Couleur dominante de la marque → `--couleur-structure` (foncée : le texte
   sur structure doit rester lisible). Dériver `--couleur-structure-2`
   (éclaircie ~15 % pour les survols).
2. Couleur secondaire/vive → `--couleur-accent` ; en dériver
   `--couleur-accent-fond` (version très pâle, fond de badge lisible).
3. Neutres : garder des gris proches des valeurs par défaut si la charte n'en
   impose pas — un fond de page légèrement teinté vers la structure suffit.
4. Polices : jamais `next/font/google` (il télécharge chez Google à chaque
   build, et un refus fait échouer le build ; un test l'interdit dans `src/`).
   Récupérer les woff2 de la police du client à la source officielle (dépôt de
   la fonderie, paquet npm) — sous-ensemble latin, seulement les graisses
   utilisées —, les déposer dans `src/ui/theme/polices/` avec le texte de
   leur licence, puis remplacer les appels `localFont` de `src/app/layout.tsx`
   en gardant les variables `--police-sans` / `--police-mono`. Une police qui
   interdit la redistribution ne va pas dans le dépôt : le dire, ne pas la
   contourner. Si la charte n'a pas de police à chasse fixe, garder IBM Plex
   Mono pour les chiffres. Retirer les fichiers IBM Plex devenus inutiles :
   leur licence et le `LISEZMOI.md` du dossier (qui décrit IBM Plex) partent
   avec eux, ou se réécrivent pour la police du client (origine, licence).
   Dans une appli assemblée, la partie polices du `NOTICE` à la racine suit :
   l'avis IBM Plex part avec la dernière police Plex (il reste si Plex Mono
   reste), l'avis de la police du client et le chemin de sa licence s'ajoutent.
5. **Ne PAS toucher** `--positif` / `--negatif` / `--texte-sur-semantique`,
   sauf conflit direct (marque rouge → choisir un rouge d'erreur nettement
   distinct, puis revérifier le contraste de `--texte-sur-semantique` dessus).

### Garde-fous (bloquants, quel que soit le thème)

- Contraste AA : ≥ 4,5:1 pour `--texte` sur `--surface`, `--fond-page` et
  `--couleur-accent-fond` (appel à l'action d'une page vitrine), et
  pour `--texte-sur-structure` sur `--couleur-structure`, et pour
  `--texte-sur-semantique` sur `--negatif` (bouton danger) et sur `--positif`. Si l'accent du
  client est clair, il sert aux liserés et fonds, jamais au texte.
- La sémantique des états ne se détourne jamais vers l'identité : une erreur
  reste rouge, un succès reste vert.
- Vérifier le rendu sur la page vitrine (`/kit`) après thématisation — c'est son
  rôle —, et sur `/kit/site-vitrine` pour un site public. Ne pas lancer de navigateur pour autant : `npm run build` puis
  vérification par la personne qui pilote le projet.
