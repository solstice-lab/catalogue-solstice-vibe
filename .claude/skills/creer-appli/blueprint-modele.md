# Modèle de blueprint d'une appli client

Chargé par `SKILL.md` à l'étape 3. Le format est décrit ici en entier : un en-tête YAML
court, entre deux lignes `---` en tête de fichier, lu par l'assembleur pour `appli`, `commit_reference`,
`profil`, `nom_affiche`, `description`, `site`, `entree`, `role_par_defaut` et `methodes`, puis un corps Markdown : un
titre, un paragraphe, et neuf sections numérotées dans l'ordre donné plus bas. Le ton :
des phrases courtes, au présent, qui décrivent sans recopier ; la précision attendue :
chaque règle a une valeur (un délai en jours, un volume, une clé), et chaque section
nomme sa source de vérité (un fichier de l'appli, la fiche projet).

La blueprint est **la mémoire de l'appli** : ce qu'elle fait, ce qu'elle a reçu du
catalogue, et à quel commit. Elle décrit sans recopier : ce que le code dit déjà (types de
colonnes, valeurs d'un branchement) reste dans le code, et chaque section nomme sa source
de vérité. Les règles de construction (patron `dossiers` et migrations avec la brique
données, kit `src/ui/`, gardes) sont dans `CLAUDE.md` et ne sont pas répétées.

Le catalogue est un socle et des briques : aucune entité ne vient de l'assemblage. La
blueprint décrit donc l'appli **telle que l'appli l'aura** : ses entités à construire sur
le patron `dossiers`, les briques reçues, et, pour chaque brique à brancher, l'entité
qu'elle attend. Ce qui reste à faire est un ticket de la section 9, jamais une promesse
dans une autre section.

## L'en-tête

```yaml
---
# Blueprint de l'appli <nom>. L'en-tête ne porte que l'essentiel, en clair :
# l'assembleur en lit appli, profil, nom_affiche, description, site, entree,
# role_par_defaut, methodes et commit_reference ; tout le reste est dans le corps. Il ne recopie pas le branchement : il reste
# dans son fichier.
format: 1
appli: <nom>
profil: <vitrine | outil-interne | portail>         # ses briques passent avant --briques
nom_affiche: <nom affiché dans l'appli, validé au cadrage>
description: <une ou deux phrases pour les moteurs et l'aperçu, sur une ligne>
site: <public | ferme>
entree: <ferme | ouverte>                          # avec la brique comptes seulement
role_par_defaut: <rôle de qui entre sans rôle attribué, jamais un rôle d'administration>
methodes: [<code-email, lien-email, google, microsoft>]        # « demo » reste en local, sans être listée
statut: <écrite avant tout code, brouillon validé par <qui> le <date>>
commit_reference: <à renseigner : l'assembleur le remplace>
briques_assemblees: [<briques du profil, puis celles de --briques, plus rgpd avec comptes>]
entites:
  - nom: <entité>
    module: <dossier sous src/app/ que l'appli créera, sur le patron dossiers>
    cle_metier: <champ ou combinaison qui identifie une ligne>
    rattache_a: <entité parente, si elle existe>
briques:
  - brique: <nom de la brique>
    entite: <entité sur laquelle elle est ou sera branchée, ou « aucune »>
    branchement: <fichier qui la branche, ou « à brancher » si aucun>
---
```

- `commit_reference` : l'assembleur **remplace la ligne** par le commit du catalogue au
  moment de la commande (ou l'ajoute si elle manque). Sans en-tête entre deux lignes
  `---` en tête de fichier, il refuse la blueprint. L'outil de mise à jour
  (`outils/mettre-a-jour.mjs`) remplace aussi cette ligne à chaque report, et ajoute à
  `briques_assemblees` les briques arrivées ; le reste de la blueprint ne change pas.
- `appli` : l'assembleur en tire le nom du paquet de l'appli (`package.json`, d'où ses bases
  locales), en minuscules sans accent, en tirets. Il refuse un nom qui ne commence pas par
  une lettre, trop long (plus de 58 caractères une fois ramené) ou qui est celui du
  catalogue. `--nom` l'emporte ; sans `appli`, le nom du dossier de sortie sert. Avec la
  brique `deploiement`, `appli` (ou `--nom`, jamais le nom du dossier) nomme aussi le service (`<nom>`) et la base (`<nom>-db`) de
  `render.yaml` : un service renommé après la création du Blueprint Render quitte le
  Blueprint, sans message.
- `profil` : le profil de départ retenu au cadrage (`SKILL.md`, question à l'étape 1, tableau à l'étape 2 ; `PROFILS`
  d'`outils/modules.mjs`). L'assembleur en garde les briques, puis celles de `--briques`
  qui n'y sont pas. `vitrine` : aucune, et seules `mails`, `contact` et `deploiement`
  peuvent s'ajouter (une autre est refusée : ce ne serait plus une vitrine) ;
  `outil-interne` : `comptes` et `mails` ; `portail` : `comptes`, `mails` et
  `gestion-comptes`. Un profil inconnu est refusé ; sans le champ, `--briques` seul. Le
  manifeste de l'appli note les briques, pas le profil : le champ reste dans sa blueprint
  comme trace du cadrage, et `briques_assemblees` dit ce qui est installé.
- `nom_affiche`, `description`, `site` : les valeurs validées au cadrage, que l'assembleur
  écrit dans l'appli au lieu d'un premier ticket de remplissage. Une ligne chacune, sans bloc
  (`>`, `|`) ni liste, que l'assembleur refuse ; une valeur qui porte « # » se met entre
  guillemets, sinon ce qui suit est lu comme un commentaire.
  - `nom_affiche` : `NOM_APP` (`src/lib/navigation.ts`), que le nom du site de
    `REFERENCEMENT` reprend.
  - `description` : la `description` de `REFERENCEMENT` (`src/lib/referencement.ts`).
  - `site` : `public` (un site vitrine, que les moteurs doivent trouver) ou `ferme` (un
    outil interne, même en ligne). L'assembleur en tire `sitePublic` ; sans le champ, le
    site reste fermé, et toute autre valeur est refusée.
  - Un champ absent laisse sa valeur de remplacement, à remplir par ticket. Rien de ce qui
    engage la personne ne passe par l'en-tête : statut de l'éditeur, éditeur, courriel des droits, bases
    légales, durées, coordonnées de l'hébergeur restent « À compléter ». Avec la brique
    `deploiement`, le nom de l'hébergeur (Render Services, Inc.) est écrit dans les
    mentions légales ; son adresse et son téléphone, non.
- `entree`, `role_par_defaut`, `methodes` : l'entrée tranchée au cadrage (`solstice-nouvelle-appli`
  §1, « Les accès »), que l'assembleur écrit dans `src/config/comptes.ts` et
  `src/config/acces.ts`. **Seulement avec la brique `comptes`** : déclarés sans elle, ils
  sont refusés, comme une promesse de connexion que l'appli ne tiendrait pas.
  - `entree` : `ouverte` (toute adresse bien formée entre : un outil public, ouvert à
    l'inscription) ou `ferme` (le défaut : une adresse listée, un domaine, ou le premier
    admin). `ouverte` pose `ouverte: true` dans `ENTREE`.
  - `role_par_defaut` : le rôle de qui entre sans rôle attribué (`ROLE_PAR_DEFAUT`),
    `membre` si le champ manque. Un rôle de l'appli (`src/config/acces.ts`) et **jamais un
    rôle qui administre**, pour aucune entrée : l'assembleur le refuse. Un rôle de plus
    s'ajoute par ticket après l'assemblage.
  - `methodes` : une liste sur une ligne parmi `code-email`, `lien-email` (appli grand public
    seulement, `URL_PUBLIQUE` en production), `google` et `microsoft`, écrite
    dans `METHODES` ; sans le champ, `code-email`. `"demo"` est toujours gardée en dernier,
    pour le local, et se retire à la mise en ligne (elle refuse la production). `google` et
    `microsoft` ne disent pas que leur application existe chez Google ou dans le portail
    Azure : leurs variables restent à déclarer. `microsoft` accepte un seul annuaire
    (`ANNUAIRES_MICROSOFT`), à changer par ticket pour un outil ouvert à plusieurs entreprises.
  - Reste à faire par ticket : les actions du module métier qu'un visiteur de l'entrée
    ouverte aura le droit de faire (`src/config/acces.ts`).
- `briques_assemblees` est la liste que l'assembleur écrit dans sa blueprint minimale :
  c'est ce qui dit, sans lire le code, ce qui a été installé. **Elle doit redire exactement
  les briques du profil, puis celles de `--briques`, plus les briques ajoutées d'office
  (`rgpd` avec `comptes`)** : le script ne le vérifie pas. Pour `portail` avec
  `--briques espaces` : `[comptes, mails, gestion-comptes, espaces, rgpd]`.
- `entites` : les entités que **l'appli écrira**, aucune ne vient de l'assemblage. `module`
  est le dossier sous `src/app/` que l'appli créera en copiant le patron `dossiers`
  (`CLAUDE.md` §3), avec sa couche données dans `src/lib/db/`. Chaque entité a son ticket
  en section 9.
- `briques` : une ligne par brique de `briques_assemblees` qui a du code à brancher ou
  branché (`deploiement` n'a pas de code à brancher et n'y figure pas). Une brique à
  brancher porte `entite:` l'entité de la section 2 qu'elle attend et `branchement: à
  brancher`. Les briques branchées d'office portent le fichier de l'appli qui les
  configure ou les appelle : `comptes`, `entite: aucune` et
  `branchement: src/config/acces.ts` ; `rgpd`, `entite: aucune` et
  `branchement: src/app/mes-donnees/page.tsx` (elle ne se refuse pas : l'assembleur la garde
  avec `comptes`) ; `gestion-comptes`, `entite: aucune` et
  `branchement: src/app/comptes/page.tsx` ; `espaces`, `entite: aucune` et
  `branchement: src/config/espaces.ts`, chaque entité rattachée à un espace portant en
  section 2 la ligne « rattachée à un espace (colonne `espace_id`) », distincte de
  `rattache_a` ; `journal`, `entite: dossiers` et
  `branchement: src/lib/db/dossiers.ts` (le patron), le module métier s'y branchant par
  ticket.
- **Site vitrine** (`profil: vitrine`, sans brique qui lit la base hors `contact`) : `entites: []`.
  `briques_assemblees` ne cite que `mails`, `deploiement` ou `contact`, s'ils sont gardés.
  Dans `briques`, `mails` seule porte `entite: aucune` et `branchement: à brancher` ;
  `contact` porte `entite: aucune` et `branchement: src/app/contact/page.tsx`, et `mails`
  porte alors `branchement: src/briques/contact/contact.ts`, qui l'appelle ; sinon,
  `briques: []`. `deploiement`
  n'a pas de code à brancher et n'y figure pas. Dans le corps :
  - section 2 : « Aucune : le contenu des pages est écrit dans le code » ;
  - section 3 : « aucune », `mails` à brancher, ou `contact` branché et `mails` par lui
    (et `deploiement`, sans code, s'il est gardé) ;
  - section 4 : les pages prévues, à écrire ;
  - section 5 : aucune connexion, toutes les pages sont publiques ; puis le thème et le nom ;
  - section 6 : « aucune » ;
  - section 9 : après la vérification de l'en-tête, les réglages, les mentions légales, la politique de
    confidentialité et le référencement, écrire l'accueil et les pages, et les ajouter aux pages publiques du référencement.

## Le corps

Un titre `# Blueprint : <nom>`, un paragraphe qui dit au commit de quoi la blueprint est
la description, puis :

1. **Intention** : à qui sert l'appli, ce qu'elle remplace aujourd'hui, un cas test
   d'origine entre guillemets (la phrase du client), volumes. Source : la fiche projet.
2. **Entités** : une sous-section par entité, avec son sens, ses champs en clair, sa clé
   métier, ses règles d'unicité et de suppression, et le module qui la portera : le
   dossier sous `src/app/` et le fichier de `src/lib/db/` que l'appli créera en copiant le
   patron `dossiers`. Aucune entité n'est livrée par l'assembleur : chacune est décrite
   comme l'appli l'aura, marquée « à construire », avec son ticket en section 9. Pour une
   entité qui remplace un fichier ou un outil du client, dire ce qu'elle garde de lui.
3. **Briques branchées** : un tableau (brique, entité cible, réglages en clair, source de
   vérité). Ne décrit pas la brique, qui est un composant du catalogue : le dire. Y noter
   le réglage d'appli qui conditionne les briques de date (`FUSEAU`, `LOCALE`, `DEVISE`
   dans `src/lib/format.ts`). Les briques installées non branchées y figurent, marquées
   « à brancher », avec l'entité de la section 2 qu'elles attendent et leur ticket. Avec
   `deploiement`, le réglage est l'hébergeur retenu au cadrage (Render par défaut).
4. **Écrans et navigation** : un tableau (écran, URL, contenu) dans l'ordre de
   `src/lib/navigation.ts`, ordinateur et téléphone, sans citer le détail de ce fichier.
   Chaque écran a l'une de trois origines, dite dans le tableau : une brique gardée qui
   apporte ses écrans (`/connexion`, `/mes-donnees`, `/donnees-personnelles`, `/comptes`,
   `/journal`, `/contact`, `/espace` et `/espace/rejoindre`) ; le socle (`/kit` et, avec `comptes`, `/dossiers`, à remplacer
   par ticket ; `/mentions-legales`, `/confidentialite`, à remplir) ; ou une page que
   l'appli écrira (l'accueil, les écrans de chaque entité, les vues des briques à
   brancher), marquée « à écrire » avec son ticket.
5. **Accès et thème** : ce qui est décidé des droits (`src/config/acces.ts` : rôles, et
   qui a droit à chaque action ; avec un seul rôle, dire que toute personne connectée a
   droit aux actions sensibles : décider, importer, supprimer, avec `gestion-comptes` administrer les
   comptes, et avec `rgpd` exporter et effacer les données de n'importe quelle adresse ; avec
   `espaces` et une entrée fermée, comment une adresse invitée est admise : configuration,
   domaine ou `/comptes`, l'invitation ne créant pas de compte), le thème
   (charte du client, ou thème de repli du catalogue : la charte Solstice Lab), qui livre
   l'appli et le sort de la signature Solstice Lab (gardée, obligatoire pour une livraison
   Solstice Lab ; ou à retirer, avec son ticket en section 9), le nom de l'appli. Avec la
   brique `validation`, y noter la réponse à « Qui peut décider une proposition qu'il
   a lui-même saisie ? » (autorisé avec mention visible, valeur recommandée ; interdit ;
   autorisé sans mention) : la brique ne tranche pas, le ticket de la section 9 qui écrit
   la file de décision la met en œuvre.
6. **Données de démo** : les scripts de données que l'appli écrira pour sa base locale
   (sur le squelette `scripts/lib/cli.ts` : dry-run par défaut, `--confirmer` tapé à la
   main), chacun un ticket de la section 9, ou « aucune ». L'assembleur n'en livre aucun.
7. **Hors périmètre** : un tableau exclu / raison, repris de la fiche projet (« pas en
   v1 »).
8. **Questions ouvertes** : avec qui tranche et avant quelle étape, reprises de la fiche.
9. **Pour poursuivre** : ce que l'assembleur ne fait pas et qui reste à faire, dans
   l'ordre, chaque étape un ticket, au format décrit après cette liste (socle prêt pour la prod et découpage :
   `solstice-nouvelle-appli` §4 et §5) : vérifier ce que l'assembleur a écrit de l'en-tête (`NOM_APP`, la description et
   `sitePublic` du référencement, les noms du service et de la base de `render.yaml`,
   l'hébergeur des mentions légales ; ce qu'un champ absent a laissé à sa valeur de
   remplacement se remplit ici), régler `src/lib/format.ts`, remplir le reste des
   mentions légales (`src/lib/mentions-legales.ts`, avant toute mise en ligne : statut de
   l'éditeur ; pour un professionnel, éditeur et directeur de la publication ; coordonnées
   de l'hébergeur), remplir la politique de confidentialité
   (`src/lib/confidentialite.ts`, avant toute mise en ligne, choix validés par le client), compléter le référencement (`src/lib/referencement.ts` : les pages publiques), thématiser, écrire
   l'accueil, construire chaque entité de la section 2 en copiant le patron `dossiers`
   (puis remplacer ou retirer `dossiers`), brancher les briques « à brancher », écrire les
   scripts de données de la section 6. S'il y a lieu : retirer
   la signature Solstice Lab (hors livraison Solstice Lab, si la fiche le dit, avec les
   textes qui la décrivent : `CLAUDE.md` §1, skill `solstice-ui`,
   commentaires de `PiedDePage.tsx`, `ui.css` et `tokens.css`, exception de
   `tests/kit-tokens.test.ts`) ; écrire l'adaptateur de déploiement d'un hébergeur autre que
   Render (avec la brique `deploiement`). Avec la brique `comptes` : retirer `"demo"` de
   `METHODES` (`src/config/comptes.ts`) avant la première mise en ligne, car elle refuse la
   production ; elle reste en local, que la blueprint la déclare ou non.

   **Format lu par l'outil des issues** (`outils/creer-issues.mjs`, étape 6 de `SKILL.md`) :
   un paragraphe d'introduction libre, puis une étape par sous-titre `### 9.n Titre`, numérotée
   9.1, 9.2… sans trou, dans l'ordre où elles se font. Sous chaque titre :
   - le **contenu**, libre (paragraphes, listes, sous-titres d'un autre niveau) : ce qui est
     à faire, avec les fichiers et les règles de la blueprint. Il devient le corps de l'issue ;
   - `Vérifiable à l'écran :` ce que la personne ouvre pour constater que l'étape est faite
     (une URL, un écran, un cas à essayer) ; une étape sans rien à voir à l'écran dit ce qui la
     prouve à la place (la sortie d'une commande) ;
   - `Bloqué par :` `aucune`, ou les étapes précédentes séparées par des virgules (`9.1, 9.3`).
     Une étape ne dépend jamais d'elle-même ni d'une suivante.

   Les deux champs s'écrivent chacun en début de ligne, à la suite du contenu. Le titre est
   celui de l'issue et ne se répète pas d'une étape à l'autre. Une étape est une tranche de
   bout en bout, vérifiable en une fois (`solstice-livrer`, §1) : trop grosse, elle se découpe
   ici, pas dans l'issue.

   ```markdown
   ## 9. Pour poursuivre

   Chaque étape est un ticket, dans cet ordre, avec la skill `solstice-livrer`.

   ### 9.1 Socle prêt pour la prod

   Vérifier ce que l'assembleur a écrit de l'en-tête, régler `src/lib/format.ts`.

   Vérifiable à l'écran : le titre de l'onglet porte le nom affiché de l'appli.
   Bloqué par : aucune

   ### 9.2 Entrée ouverte

   Poser `ouverte: true` dans `ENTREE` et l'action du module dans `src/config/acces.ts`.

   Vérifiable à l'écran : `/connexion` accepte une adresse qui n'est dans aucune liste.
   Bloqué par : 9.1
   ```

## Ce que la blueprint ne cite pas

L'appli du client n'a ni `outils/`, ni la skill `creer-appli`, ni l'agent
`relecteur-blueprint`, ni le `README.md` du catalogue, ni le catalogue lui-même. Aucun
renvoi par chemin vers ces fichiers : un lien qui mène à rien est pire qu'une phrase. Le
catalogue se cite par son nom et le commit de référence ; la fiche projet du client est
son propre `PROJET.md`, copié par l'assembleur avec `--fiche`.
