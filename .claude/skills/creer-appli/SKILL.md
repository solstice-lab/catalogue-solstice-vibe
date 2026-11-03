---
name: creer-appli
description: "Assembler une appli client depuis le catalogue Solstice-vibe (un socle et des briques) : mener le cadrage, choisir les briques que l'assembleur sait donner, écrire la blueprint de l'appli et la faire relire, lancer outils/assembler.mjs vers un dossier vide, créer son dépôt distant après accord et dire à l'humain quoi taper ensuite. À charger quand la personne qui utilise le catalogue veut créer une appli client depuis ce dépôt (pas depuis une appli client déjà assemblée)."
---

# creer-appli — du cadrage à un dossier assemblé

Lancée par **la personne qui utilise le catalogue**, depuis une session ouverte dans le dépôt
catalogue. Le client, celui pour qui l'appli est faite (ce peut être cette personne
elle-même), reçoit un dépôt, pas cet outil : l'assembleur ne copie ni cette skill, ni
`outils/`. Ce qui n'est vrai que d'une livraison Solstice Lab, qui publie le catalogue, est
dit comme tel.

Ce qu'elle produit : une **blueprint** validée et un **dossier assemblé** (le socle et les
briques choisies), dépôt git d'un seul commit, poussé vers un dépôt distant, **privé par défaut**, créé
après un oui explicite (étape 5), non déployé. Ce qu'elle ne fait jamais : écrire dans une
base distante, taper un `--confirmer`, écrire un `.env*`, fusionner, déployer. Elle dit quoi
taper (`CLAUDE.md` §3 et §8).

**Hors v1** : mettre à jour une brique déjà installée dans une appli assemblée, déployer,
faire lire la blueprint par le script (il n'en lit que `appli`, `nom_affiche`, `description`,
`site`, `entree`, `role_par_defaut` et `methodes` ; le reste de son en-tête reste informatif), plugin sur
marketplace. Le module métier d'une appli (ses entités, sur le patron `dossiers`) ne
s'assemble pas : il s'écrit dans l'appli, par tickets, une fois le dossier livré (étape 5 ;
`solstice-nouvelle-appli`, §2, ligne « Module dans cette appli »).

## 0. Avant la première question

Vérifier, et dire à l'humain ce qui manque plutôt que le réparer :

- `outils/assembler.mjs` existe : sinon, la session n'est pas dans le catalogue, arrêter.
- `git status --short` est **vide**. Un fichier non suivi compte comme une modification :
  le script refuse (voir l'étape 4). Une blueprint de travail s'écrit donc **hors du
  dépôt**, jamais dedans.
- `git fetch`, puis `git rev-parse HEAD origin/main` donne deux fois le même commit. Le
  script note le `HEAD` local sans regarder la branche : un `HEAD` sur une branche de
  travail serait noté comme « le catalogue » (vérification de la skill, pas du script).

## 1. Cadrer

Charger `solstice-nouvelle-appli` et en suivre le §1 (les blocs de questions, un par
message, avec recommandation), le §2 (la forme : ici, une nouvelle appli assemblée)
et le §3 (la fiche projet, présentée et validée dans la conversation). **Ne pas recopier ses
questions ici.** Y ajouter ce que seul l'assemblage demande :

- **Un site vitrine, ou une appli ?** À poser juste après le bloc « Le besoin ». Le besoin
  a-t-il des données à garder (fiches, saisies, imports) ? Des personnes qui se
  connectent ? Si c'est non aux deux, recommander le **site vitrine**, c'est-à-dire le
  socle sans base (étape 2).
  - Le client obtient : des pages dont le contenu est écrit dans le code, le kit, les
    mentions légales, la politique de confidentialité, `/sante` et la CSP du socle.
  - Il n'obtient pas : de base, de connexion ni de saisie gardée en base. L'assembleur ne
    les ajoutera pas après coup. Un formulaire de contact passe par la brique `contact`
    (avec `mails`) : elle garde la base pour limiter les envois, le site reste sans
    connexion.
  - Ses pages sont rendues à chaque requête (compromis de la CSP, étape 2).
  - Les blocs « Les données » et « Les accès » de `solstice-nouvelle-appli` §1 sautent.
    « Le besoin », « Les écrans » et « La mise en ligne » restent.
- **Le nom de l'appli** : celui du dossier, de `package.json` et, avec la brique `deploiement`,
  du service et de la base de `render.yaml` (un service renommé après la création du
  Blueprint Render quitte le Blueprint, sans message). Il se note dans le champ `appli:` de
  la blueprint, que l'assembleur reporte. **Le nom affiché** (`NOM_APP`, titre des pages)
  est une autre question, à faire valider avec lui : il se note dans `nom_affiche:`.
- **L'entrée, avec la brique `comptes`** : les réponses du bloc « Les accès » de
  `solstice-nouvelle-appli` §1 (une liste d'adresses ou de domaines, ou un outil ouvert à toute
  adresse ; le rôle de qui entre sans rôle attribué ; code par e-mail, Google ou les
  deux) se notent dans l'en-tête de la blueprint : `entree: ferme` ou `ouverte`,
  `role_par_defaut:` et `methodes: [code-email, google]`. L'assembleur les écrit dans
  `src/config/comptes.ts` et `src/config/acces.ts`. Le rôle par défaut n'est jamais un rôle
  qui administre, et une entrée ouverte demande donc un rôle de plus que l'administration
  (le catalogue en a deux : `membre` et `admin`). Les adresses et domaines admis ne se
  notent pas : ils sont à écrire dans `ENTREE`, avec le premier admin
  (`COMPTES_PREMIER_ADMIN`).
- **Qui livre l'appli ?** Elle décide de la signature « Conçu par Solstice Lab » que
  le kit affiche en pied de page (`AppLayout`, `PageVitrine`).
  - Pour une livraison Solstice Lab : la signature reste, même pour un prototype
    (`CLAUDE.md` §1). Rien à décider.
  - Pour toute autre personne : la garder ou la retirer, à son choix. C'est une règle des
    livraisons de Solstice Lab, pas de la licence MIT (`CONTRIBUTING.md`, « La signature
    Solstice Lab »). L'assembleur ne la retire pas, et des textes copiés dans l'appli
    la décrivent, comme une règle des livraisons Solstice Lab (`CLAUDE.md` §1, la skill
    `solstice-ui`, les commentaires de `PiedDePage.tsx` et de `ui.css`) ou par son exception
    de couleurs (`tokens.css`, `tests/kit-tokens.test.ts`). Le retrait est donc un
    ticket de la section 9 de la blueprint, qui retire le pied de page et ses styles et
    retouche ces textes.
  - La réponse se note dans la section 5 de la blueprint (« Accès et thème »).
  - Quel que soit le livreur, l'appli assemblée n'est pas sous MIT : l'assembleur ne copie
    pas `LICENSE` et marque son `package.json` `UNLICENSED`. Ses droits relèvent de
    l'accord avec le client ; une autre licence se pose par ticket. Il écrit en revanche un
    `NOTICE` à la racine (avis et texte MIT du catalogue, avis OFL des polices IBM Plex),
    que la MIT exige dans toute copie du code repris : il ne change pas les droits de
    l'appli et ne se retire pas ; sa partie polices suit les polices de l'appli (skill
    `solstice-ui`, thématisation).
- **Langue, devise, fuseau du client** : `LOCALE`, `DEVISE`, `FUSEAU` de `src/lib/format.ts`
  (le fuseau décide du jour qui compte pour les échéances).
- **Qui peut décider une proposition qu'il a lui-même saisie ?** À poser dès que l'appli
  garde la brique `validation` (une file de décision, que le module métier de l'appli
  branchera). Valeur recommandée : **autorisé, avec mention visible** dans la file (dans
  une petite structure, l'admin est souvent le seul à décider). Autres réponses
  possibles : interdit, ou autorisé sans mention. La brique ne tranche pas, et le catalogue
  ne porte aucun réglage par client : la réponse se note dans la section 5 de la blueprint
  (« Accès et thème »), et le ticket de la section 9 qui écrit la file de décision la met
  en œuvre, pas une retouche pendant l'assemblage.
- **Où l'appli sera-t-elle hébergée, et au nom de qui sont les comptes ?** Le catalogue ne
  retient aucun hébergeur à la place de la personne. Valeur par défaut : **Render**, dont la
  brique `deploiement` fournit l'adaptateur (`render.yaml`).
  - Un autre hébergeur : la brique reste, son adaptateur seul se remplace (README de la
    brique, « Déployer ailleurs »). C'est un ticket de la section 9.
  - Les comptes chez l'hébergeur, et chez Resend si la brique `mails` est gardée,
    s'ouvrent au nom de la personne qui livre ou au nom du client : le demander.
  - Les réponses vont dans le bloc « La mise en ligne » de la fiche. L'hébergeur retenu
    renseigne aussi les mentions légales (question suivante) : avec la brique `deploiement`,
    l'assembleur y écrit le nom de Render (« Render Services, Inc. »), pas son adresse ni
    son téléphone.
- **Les mentions légales** (`src/lib/mentions-legales.ts`, page `/mentions-legales`) : le
  bloc « La mise en ligne » de `solstice-nouvelle-appli` §1, posé pendant ce cadrage et
  non à la veille de la mise en ligne (éditeur, directeur de la publication, champs
  facultatifs ; l'hébergeur ne se redemande pas : c'est celui retenu à la question
  précédente). Commencer par le statut de l'éditeur : **professionnel** (société,
  association, indépendant qui édite pour son activité) ou **particulier à titre non
  professionnel**. Le second peut ne publier que les coordonnées de l'hébergeur, à
  condition de lui avoir communiqué son identité (LCEN, art. 6, III, 2) : ni éditeur ni
  directeur de la publication à demander (le texte ne prévoit que l'hébergeur), mais la
  confirmation que l'identité a bien été communiquée à l'hébergeur
  (`identiteCommuniqueeALHebergeur`), et le courriel où exercer ses droits
  (confidentialité) reste requis. Le statut se règle par `statutEditeur` dans
  `src/lib/mentions-legales.ts`. Rien dans le code ne le vérifie : un site avec publicité
  ou vente n'est plus à titre non professionnel. En cas de doute sur le statut, ne pas
  trancher : c'est une question ouverte, « à faire valider » par le client. Les réponses vont dans la rubrique « Mentions
  légales » de la fiche.
- **La politique de confidentialité** (`src/lib/confidentialite.ts`, page
  `/confidentialite`) : le courriel où exercer ses droits, le délégué à la protection des
  données s'il y en a un, l'autorité de contrôle (la CNIL pour un client établi en France),
  et, pour chaque traitement des briques retenues, la base légale, la durée de conservation
  et les destinataires. Le catalogue n'en propose aucune : elles engagent le client et
  se font valider par lui (son conseil ou son délégué). Aussi : les données métier que
  l'appli gardera, à décrire comme traitements du projet. Les réponses vont dans la
  rubrique « Confidentialité » de la fiche ; une réponse manquante s'écrit « à faire
  valider » et passe aux questions ouvertes.
- **Quelqu'un entretiendra-t-il l'appli après la livraison ?** (question du bloc « La mise
  en ligne » de `solstice-nouvelle-appli` §1, à ne pas oublier ici). Réponse **non** ou
  « on verra » : l'assembleur retire `.github/dependabot.yml`. Réponse **oui** : passer
  `--dependabot` à l'étape 4. Le Dependabot du catalogue reste en place.
- **Le référencement** (`src/lib/referencement.ts`) : le site doit-il être trouvé par les
  moteurs de recherche (vitrine : oui ; outil interne : non, même en ligne) ? Sa
  description en une ou deux phrases, et les pages publiques pour le sitemap (avec
  `comptes`, l'accueil n'en est pas une, et chacune s'ouvre dans la brique). Les
  réponses vont dans la rubrique « Référencement » de la fiche, et les deux premières dans
  l'en-tête de la blueprint : `site: public` ou `site: ferme`, et `description:` (une
  ligne), que l'assembleur écrit dans `src/lib/referencement.ts`. Les pages publiques
  restent à ajouter par ticket.
- **Ce que le client suit, entité par entité**, pour choisir les briques dont le module
  métier de l'appli aura besoin (étape 2) : une date à surveiller appelle `echeances`, un
  fichier à reprendre `import-lot`, une décision à tracer `validation`. Un vrai exemple de
  sa donnée, avant de choisir. Sauf pour un site vitrine.

La fiche validée est **le préalable** : pas d'assemblage avant. Elle deviendra le
`PROJET.md` du dossier assemblé, passée à l'assembleur par `--fiche` (étape 4).

## 2. Choisir les briques

Lire [`choix.md`](choix.md), **puis**, pour chaque brique envisagée, la section « Interface
publique » de `src/briques/<brique>/README.md` et `outils/modules.mjs` (la liste est la
vérité, `choix.md` un résumé daté). Le catalogue est un socle et des briques : il ne donne
aucun écran métier. Le module métier de l'appli (ses entités, leurs fiches et formulaires,
leur couche données) s'écrit ensuite dans l'appli, par tickets, en copiant le patron
`dossiers` (`CLAUDE.md` §3) ; ici, on choisit les briques dont ce module aura besoin.
Règles de l'assembleur :

- **Site vitrine** (non aux deux questions de la première ligne de l'étape 1) : aucune
  brique qui lit la base ; au plus `mails`, `deploiement`, et `contact` avec `mails`. On n'ajoute `mails`
  (envois de l'appli) ou `deploiement` (mise en ligne après la CI) que si le besoin les
  demande. L'appli n'a ni protection des routes, ni bandeau de session : `src/proxy.ts`
  n'y pose que la CSP. Elle n'a pas de base, sauf avec un formulaire de contact
  (`mails,contact`), qui la garde pour sa limite d'envois, sans connexion ni patron
  `dossiers`.
  - **Le compromis de la CSP** : son nonce n'existe que dans une page rendue à la requête.
    C'est le rôle de `await connection()` dans le layout racine, que
    `tests/en-tetes-securite.test.ts` verrouille. Aucune page n'est donc statique, et un
    CDN ne met pas le HTML en cache ; les fichiers de `_next/static` restent cachables.
  - Écartés : une CSP par hachages (`experimental.sri` de Next, encore expérimental) et
    `'unsafe-inline'` (plus aucune protection contre un script injecté).
  - Un site qui a vraiment besoin du cache CDN : le dire, et laisser la personne
    responsable technique du projet trancher.
- **La base vient avec les briques qui la lisent.** `comptes`, `contact`, `rgpd`,
  `journal`, `gestion-comptes`, `echeances`, `calendrier`, `validation`, `import-lot` et
  `notifications` exigent la brique `donnees` (base, migrations, couche données du patron
  `dossiers`), que l'assembleur garde d'office dès qu'une brique gardée l'exige : ne pas la
  nommer. Sans aucune d'elles, l'appli n'a pas de base, et n'en recevra pas après coup. Les
  écrans du patron `dossiers` ne viennent qu'avec `comptes` (chaque page appelle `exiger`).
- Une brique peut en exiger une autre : l'assembleur refuse de la garder sans elle et
  nomme l'option à ajouter. **`comptes`, `contact` et `notifications` exigent `mails`**
  (le code de connexion part par e-mail : nommer `comptes,mails`) ; **`rgpd`, `journal` et
  `gestion-comptes` exigent `comptes`**. Il n'ajoute rien en silence : seule `rgpd` vient
  d'office avec `comptes`, et il le dit.
- `comptes` (avec `mails`) donne la base, les droits et le patron `dossiers`, écrans
  compris : c'est le départ de toute appli qui garde des données, dont le module métier
  copiera `dossiers`. L'accueil de toute appli assemblée est une carte « Page d'accueil à
  écrire » (`src/app/page.tsx`).
- **`rgpd` vient d'office avec `comptes`** (l'export et l'effacement des données d'une
  personne) : une appli qui a des comptes doit pouvoir répondre à une demande d'accès ou
  d'effacement. L'assembleur l'ajoute (`entraine` dans `outils/modules.mjs`) et le dit ; la
  nommer dans `--briques` reste permis. Comme `comptes`, `contact`, `journal` et
  `gestion-comptes`, elle arrive branchée (pages, droits, menu) : la règle « à brancher »
  ci-dessous ne la vise pas.
- **Les briques qui lisent la base sans se brancher sur le socle** (`echeances`,
  `calendrier`, `validation`, `import-lot`, `notifications`) se gardent seules, avec la
  base, et arrivent **à brancher** sur le module métier que l'appli écrira (README de la
  brique, « La brancher ») ; `mails` aussi, hors les envois de `comptes`, `contact` et
  `notifications`, qui l'appellent. Ne les ajouter que sur demande du besoin, et les noter
  « à brancher » dans la blueprint, chacune avec le ticket qui la branche.
- **Le besoin n'a pas d'écran tout fait dans le catalogue, et c'est la règle** : le module
  métier s'écrit dans l'appli, sur le patron `dossiers`, et on choisit ici les briques dont
  il aura besoin. Assembler sans brique qui lit la base donne une appli sans base, qui n'en
  recevra pas après coup : ce n'est la réponse que si le besoin n'a pas de données à garder.
  Si le besoin a des données, `--briques comptes,mails` au moins (avec `rgpd`, d'office)
  garde la base, les droits, l'export et l'effacement des données d'une personne et le
  patron `dossiers` à copier. Un doute sur ce que le besoin garde : le dire, et laisser la
  personne responsable du projet trancher (retirer ensuite des écrans à la main est un
  changement structurel, `CLAUDE.md` §5).

Présenter le choix en clair (ce que le client obtient, ce qu'il n'obtient pas, ce qui
restera à construire par tickets) et le **faire valider** avant d'écrire la blueprint.

## 3. Écrire la blueprint

Suivre [`blueprint-modele.md`](blueprint-modele.md) : en-tête YAML et corps en sections
numérotées, au format qu'il décrit. Écrire le fichier **hors du catalogue**,
à côté du dossier de sortie : `<parent>/<nom>-blueprint.md`. Le présenter, corriger, faire
valider. Le commit de référence n'est pas à deviner : l'assembleur l'écrit.

**Faire relire avant d'assembler.** La blueprint validée par l'humain, et avant l'appel de
l'étape 4, passe par le sous-agent `relecteur-blueprint` (lecture seule), sans lui souffler de
conclusion : lui donner le chemin de la blueprint et la liste prévue pour `--briques`, rien
d'autre. Il relève ce qui manque, ce qui se contredit et ce que l'assembleur
ne sait pas donner, en trois rubriques (bloquant, à corriger, à noter) ; le script, lui, ne lit
pas le corps de la blueprint.

- Rapporter ses constats à l'humain tels quels, puis corriger la blueprint pour chaque
  « bloquant » et « à corriger », et la lui re-présenter. **Un « bloquant » non levé : pas
  d'assemblage.**
- Un constat qui se règle autrement qu'en réécrivant la blueprint (un choix de briques à
  revoir, une entité que le besoin ne garde finalement pas) revient à l'étape 2 et à la
  personne responsable du projet : ne pas le trancher dans le texte.
- Corrigée, la blueprint est relue de nouveau seulement si la correction a touché les listes de
  l'en-tête, les entités ou les briques ; une retouche de rédaction n'a pas à l'être.
- Si le sous-agent n'est pas disponible dans la session, le dire à l'humain : l'assemblage ne
  se fait pas sur une blueprint non relue sans son accord.

## 4. Assembler

Le dossier de sortie est **hors du catalogue** (sinon refusé), vide ou inexistant, de
préférence en chemin absolu (un chemin relatif est résolu depuis le dossier courant).
La fiche validée à l'étape 1 s'écrit d'abord, comme la blueprint, **hors du catalogue** :
`<parent>/<nom>-projet.md`. Depuis la racine du catalogue, ses dépendances installées
(`npm ci` : l'assembleur met en forme avec son Prettier) :

```bash
node outils/assembler.mjs <dossier-de-sortie> --briques <liste> --blueprint <fichier> --fiche <fichier> [--dependabot]
```

`--dependabot` seulement si la fiche dit que quelqu'un entretient l'appli (étape 1) : il garde
`.github/dependabot.yml`, que l'appli ne reçoit sinon pas. Sans lui, la sortie dit
« Dependabot : retiré ».

`--briques` nomme les briques retenues à l'étape 2, avec celles qu'elles exigent (`comptes,mails` ; `rgpd` vient d'office) ; `donnees` ne s'y nomme pas, la base suit les briques qui la lisent.
Un site vitrine s'assemble sans `--briques`, ou avec `mails`, `deploiement` ou `mails,contact`, s'il y a lieu : `node outils/assembler.mjs <dossier-de-sortie> --blueprint <fichier> --fiche <fichier> [--briques <liste>] [--dependabot]`.

Liste séparée par des virgules, sans espace. Le nom du paquet de l'appli (`package.json`,
d'où ses bases locales) vient du champ `appli:` de la blueprint (à défaut, du nom du dossier
de sortie), ramené en minuscules sans accent ni espace ; `--nom` l'emporte, et nomme sinon la blueprint minimale que le script
écrit sans `--blueprint`. Il écrit aussi dans le code ce que l'en-tête de la blueprint a
fait valider au cadrage : `NOM_APP` (`nom_affiche:`), la description et `sitePublic` du
référencement (`description:`, `site:`), le nom du service et de la base de `render.yaml`
(d'après `appli:` ou `--nom`, avec la brique `deploiement` ; le nom du dossier de sortie n'en est pas un) et le nom de l'hébergeur des
mentions légales (avec cette brique), puis, avec la brique `comptes`, l'entrée (`entree:`,
`role_par_defaut:`, `methodes:` : `ouverte` de `ENTREE`, `ROLE_PAR_DEFAUT` et `METHODES`,
où `"demo"` reste en dernier pour le local). Un champ absent de l'en-tête laisse sa valeur de
remplacement. Rien de ce qui engage la personne n'est rempli. `node outils/assembler.mjs --aide`
rappelle les options.

La commande **ne déploie rien, ne touche à aucune base, ne lit aucun secret, ne crée aucun
remote et ne pousse rien** : elle copie les fichiers que git suit, retouche les fichiers
partagés du socle selon `outils/modules.mjs` puis les remet en forme par Prettier, écrit `blueprint.md`, `NOTICE` (l'avis de
licence), `catalogue.empreintes.json` (le manifeste d'empreintes des fichiers venus du
catalogue, à ne pas retoucher à la main) et `PROJET.md` (la fiche, telle quelle) à la **racine** du dossier, puis en fait un dépôt git **local** : branche
`main`, un seul commit « Socle : appli assemblée depuis le catalogue au commit `<commit>` »,
avec les briques gardées, ajoutées d'office et retirées dans le corps. Elle exige une identité git
(`user.name`, `user.email`) et vérifie que la racine du dépôt est bien le dossier de sortie,
pas un dépôt parent.

**Emplacement de `blueprint.md`** : à la racine.
Elle y est lisible dès l'ouverture du dépôt, distincte de `PROJET.md` (le besoin et les
décisions) parce qu'elle décrit l'appli telle qu'elle est ; un script la trouvera sans
chercher. Le script écrit toujours ce nom exact, quel que soit celui du fichier donné.

Refus du script : il sort en code 1 avec « Assemblage refusé : » suivi du motif ci-dessous,
et n'écrit rien, sauf quand la mise en forme ou le premier commit échoue (deux dernières lignes du tableau). Les
motifs d'usage, « Option inconnue », « … attend une valeur », « Un seul dossier de sortie
attendu », se corrigent en relisant la commande.

| Le motif contient | Que faire |
| --- | --- |
| « Brique inconnue » | Corriger le nom ; le message liste les valeurs permises. |
| « « donnees » ne se choisit pas » | La retirer de `--briques` : la base vient d'office avec les briques qui la lisent. |
| « La brique … exige la ou les briques … » | Ajouter ces briques à `--briques`, après avoir vérifié à l'étape 2 que le besoin les veut. La mention « (ajoutée d'office avec comptes) » désigne `rgpd`, que `comptes` entraîne. |
| « Nom d'appli … » | Le champ `appli:` de la blueprint (ou le nom du dossier) donne un nom de paquet refusé (pas de lettre en tête, trop long, celui du catalogue) : corriger `appli:`, ou passer `--nom`. |
| « En-tête de la blueprint, … » | Le champ cité (`site:` : `public` ou `ferme` ; `entree:` : `ouverte` ou `ferme` ; `role_par_defaut:` jamais un rôle d'administration ; `methodes:` une liste entre crochets ; une valeur sur plusieurs lignes ou à guillemet mal fermé) est à corriger dans l'en-tête de la blueprint. Rien n'est écrit. |
| « … règle l'entrée … la brique qui porte la connexion n'est pas gardée » | L'en-tête déclare `entree`, `role_par_defaut` ou `methodes` sans la brique `comptes` : l'ajouter à `--briques` (avec `mails`) si le besoin veut des connexions, sinon retirer ces champs. |
| « Le dossier de sortie … n'est pas vide » | En choisir un autre. **Ne jamais vider un dossier à la place de l'humain.** |
| « … est dans le catalogue » ou « … est un fichier » | Un dossier à côté du catalogue, pas dedans. |
| « Le catalogue a des modifications non commitées » | `git status --short`, dire lesquelles à l'humain. `--tolerer-arbre-modifie` seulement s'il le demande : le commit noté devient `<commit>+arbre-modifie` et ne décrit plus ce qui est copié. |
| « La blueprint n'a pas d'en-tête YAML » | Reprendre l'en-tête du modèle : un bloc entre deux lignes `---` en tête de fichier. |
| « La blueprint … est introuvable ou illisible » | Le chemin donné à `--blueprint` ne désigne pas un fichier lisible : le corriger (il se lit depuis le dossier où la commande est lancée). Le dossier de sortie n'est pas créé. |
| « La fiche projet … est introuvable ou illisible » | Même chose pour `--fiche`. |
| « git n'a pas d'identité » | Donner à l'humain les deux commandes `git config --global` du message, **à taper par lui** (son nom et son adresse), puis relancer. Le dossier de sortie est resté tel qu'il était. |
| « git init » a échoué, ou « … a pour racine … » | Rapporter le message tel quel à l'humain ; ne pas versionner le dossier à la main. Le dossier de sortie est resté tel qu'il était. |
| « … l'avis de licence de l'appli (NOTICE) ne peut pas être écrit » | Le catalogue a perdu `LICENSE` ou `src/ui/theme/polices/LICENCE-OFL.txt`. Arrêter, le dire à la personne responsable technique du projet ; rien n'est écrit. |
| « … introuvable », « … trouvé N fois » (extrait), « … propre à plusieurs unités », « … entraîne …, inconnue » | La liste de `outils/modules.mjs` s'est écartée du code. **Ne pas la corriger ici** : arrêter, le dire à la personne responsable technique du projet. |
| « Prettier est absent du catalogue » | `npm ci` à la racine du catalogue, puis relancer. Rien n'est écrit. |
| « la mise en forme des fichiers retouchés a échoué » | Laisse des fichiers, comme la ligne suivante. Rapporter le message à l'humain ; c'est lui qui vide le dossier, puis on relance. |
| « … le premier commit a échoué » | **Refus qui laisse des fichiers** : l'appli est copiée, son dépôt créé, sans commit. Rapporter la cause à l'humain ; une fois corrigée, c'est lui qui vide le dossier, puis on relance. |

Relire la sortie : la ligne « Assemblé : … » (nombre de fichiers, commit), la ligne
« Ajouté d'office : rgpd (avec comptes). » quand `comptes` est choisi sans `rgpd`, et la ligne
« Retiré : … », qui doit contenir tout ce qui n'a été ni choisi ni ajouté d'office : chaque
brique non choisie, `partagée patron-dossiers` quand `comptes` ne l'est pas, `partagée
adresse-ip` quand ni `comptes` ni `contact` ne l'est, et `brique donnees` quand aucune brique
gardée ne lit la base. Une brique choisie qui y figure est une anomalie : arrêter. La ligne
« Dependabot : » (absente de « Retiré : », qui ne liste que des unités) doit redire la fiche (étape 1) ;
le premier commit la reprend. La ligne
« Suite : » annonce le dépôt git local (branche `main`, un commit), aucun remote et, avec
la brique données, les commandes de la base locale. Ouvrir
`blueprint.md` dans le dossier : `commit_reference` est un commit, les listes de l'en-tête
redisent le choix. `catalogue.empreintes.json` existe, et son `catalogue.commit` est ce
même commit.

## 5. Dépôt distant, puis ce que l'humain tape

Claude n'écrit rien dans le dossier assemblé : le `PROJET.md` y est arrivé par `--fiche`,
dans le premier commit que l'assembleur a fait, faute de branche avant lui : c'est
l'adaptation, pour une appli assemblée, de « premier commit de la branche du premier
ticket » (§3). Le reste est le premier ticket de l'appli, dans une session ouverte **dans
ce dossier**, avec `solstice-livrer`, le socle prêt pour la prod (`solstice-nouvelle-appli`
§4, `socle.md`) et le découpage en tickets (§5).

À l'essai du 2026-10-21, trois des quatre commandes données à l'humain ont échoué au premier
essai : écrites en bash pour une personne sous PowerShell, aucune n'était suivie d'une
vérification. D'où les règles de cette étape : toute commande, lancée par Claude ou tapée
par l'humain, est suivie de sa vérification, et un écart s'arrête là, rapporté tel quel.

### 5.1 Vérifier le dépôt local

L'assembleur l'a créé : Claude ne fait pas de `git init`, il vérifie.

- `git -C "<dossier>" rev-parse --show-toplevel` affiche le dossier assemblé lui-même (avec
  des `/` : comparer les chemins normalisés). Un
  autre chemin : le dépôt est un dépôt parent, arrêter et le rapporter.
- `git -C "<dossier>" rev-list --count HEAD` affiche `1`, et `git -C "<dossier>" remote`
  n'affiche rien.

### 5.2 Créer le dépôt distant, après un oui

Claude crée le dépôt distant lui-même, **seulement après un oui explicite dans la
conversation**, à la commande qu'il a annoncée. Le catalogue sert à n'importe qui :
**aucune organisation n'est retenue d'office**, pas même celle qui publie le catalogue.

1. **Propriétaire** : `gh api user --jq .login` donne le compte GitHub de la personne ; le
   proposer, ou l'organisation qu'elle nomme. `gh` non connecté : lui dire de taper
   `gh auth login` elle-même, puis relancer.
2. **Nom** : celui du dossier assemblé, sauf demande contraire. `gh repo view
   <proprietaire>/<nom>` doit échouer (« Could not resolve to a Repository ») ; s'il répond,
   le nom est pris : en demander un autre.
3. **Visibilité** : **privé** par défaut. Public seulement si la personne le demande (`--public` à la
   place de `--private`).
4. **Annoncer** en un message le propriétaire, le nom, la visibilité et la commande exacte,
   chemin **absolu** dans `--source` :

   ```powershell
   gh repo create <proprietaire>/<nom> --private --source "<chemin absolu du dossier>" --remote origin --push
   ```

   Sans `--source`, le dépôt naît vide et non relié au dossier (essai du 2026-10-21, vu
   seulement au ticket suivant). Attendre le oui ; une réponse qui change l'un des quatre
   éléments appelle une nouvelle annonce.
5. **Vérifier**, une fois la commande passée :
   - `git -C "<dossier>" remote get-url origin` répond l'URL de `<proprietaire>/<nom>` ;
   - `git -C "<dossier>" fetch origin`, puis `git -C "<dossier>" rev-parse HEAD origin/main`
     donne deux fois le même commit, celui de la ligne « Suite : » de l'assembleur.

   Un échec (dépôt créé mais vide, remote absent, commits différents) se rapporte tel quel.
   Ne supprimer aucun dépôt ; la commande de rattrapage (`git -C "<dossier>" remote add
   origin <url>`, puis `git -C "<dossier>" push -u origin main`) s'annonce et attend un oui,
   comme la première.

### 5.3 Ce que l'humain tape

Claude remet un message court : où est le dossier, le commit de référence, les briques
gardées et retirées, l'URL du dépôt distant et sa visibilité, puis la liste suivante. Les
commandes sont **une par bloc**, chacune suivie de sa vérification et de ce qu'elle doit
afficher, dans le shell du poste de la personne : **PowerShell** sous Windows (ci-dessous),
**bash ou zsh** sous macOS et Linux (leurs équivalents en 5.4). Claude demande le système
s'il n'a pas été dit, et ne donne que les commandes de ce poste ; il remplace les `<…>` par
les vraies valeurs. **« Avec la
base »** : l'appli a gardé la brique `donnees`, parce qu'une brique gardée l'exige
(`echeances` seule suffit) ; la ligne « Suite : » de l'assembleur cite alors les
commandes de la base locale. Sans elle, les étapes 2 et 3 n'ont pas lieu.

1. **Se placer dans le dossier assemblé**, d'où se tapent toutes les commandes suivantes :

   ```powershell
   Set-Location "<chemin absolu du dossier>"
   ```

   Vérifier, doit afficher `True` :

   ```powershell
   Test-Path .\blueprint.md
   ```

   À l'essai du 2026-10-21, un script de données lancé avec `--confirmer` depuis un autre
   dossier n'a signalé aucune erreur, et la base de l'appli est restée vide.

2. **Avec la base**, les bases locales (skill `solstice-donnees`, « Tests et base
   locale ») :

   ```powershell
   docker compose up -d --wait
   ```

   Vérifier, doit afficher `<conteneur> Up … (healthy)`, `<conteneur>` étant le
   `container_name` de `docker-compose.yml`. Ce Postgres est le même pour toutes les applis
   assemblées sur le poste, chacune avec ses bases :

   ```powershell
   docker compose ps --format "{{.Name}} {{.Status}}"
   ```

   Un autre Postgres déjà publié sur le 5433 fait échouer `docker compose up` : l'arrêter
   d'abord.

   ```powershell
   npx tsx scripts/bases-locales.ts
   ```

   Sa sortie est sa vérification : deux lignes `<appli>_dev` et `<appli>_test`, chacune
   « créée » ou « existe déjà », puis la ligne `DATABASE_URL=…_dev` à mettre dans
   `.env.local`. `<appli>` est le nom de `package.json`, tirets changés en `_` : l'assembleur l'a
   tiré du champ `appli:` de la blueprint, chaque appli du poste a donc ses propres bases.
   `_test` est jetable (les tests la vident), `_dev` sert à l'appli et à ses scripts de
   données.

3. **Avec la base**, `.env.local`, copie de `.env.example` dont la ligne `DATABASE_URL`
   vise la base `_dev`. Les gardes interdisent à Claude d'écrire un `.env*` : l'humain le
   tape. `[IO.File]::WriteAllText` écrit sans BOM ; `Set-Content` et `Out-File` de
   PowerShell 5.1 ne le garantissent pas :

   ```powershell
   [IO.File]::WriteAllText("$PWD\.env.local", ([IO.File]::ReadAllText("$PWD\.env.example") -replace '(?m)^DATABASE_URL=[^\r\n]*', '<ligne DATABASE_URL affichée par bases-locales>'))
   ```

   Avec la brique `comptes`, l'humain remplit aussi `AUTH_SECRET` : sans lui, aucune
   connexion ne s'ouvre. La commande remplace la ligne vide de `.env.local` par un secret
   tiré au hasard, sans qu'il passe par Claude :

   ```powershell
   [IO.File]::WriteAllText("$PWD\.env.local", ([IO.File]::ReadAllText("$PWD\.env.local") -replace '(?m)^AUTH_SECRET=[^\r\n]*', ("AUTH_SECRET=" + (node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"))))
   ```

   Vérifier, doit afficher `True` (sans montrer le secret) :

   ```powershell
   (Select-String -Path .env.local -Pattern '^AUTH_SECRET=.{32,}$').Count -eq 1
   ```

   Vérifier, doit afficher une seule ligne, qui finit par `_dev` :

   ```powershell
   Select-String -Path .env.local -Pattern '^DATABASE_URL='
   ```

   Vérifier, doit afficher `35` (le `#` de la première ligne ; `239` est un BOM, réécrire le
   fichier par la commande ci-dessus) :

   ```powershell
   [IO.File]::ReadAllBytes("$PWD\.env.local")[0]
   ```

4. **Installer et vérifier** (le `CLAUDE.md` du dossier, §6). Claude peut les lancer lui-même
   dans ce dossier, avec une base locale libre ; sinon il les donne. Rouge : le rapporter tel
   quel, sans corriger la liste de retrait. Chaque commande dans son bloc :

   ```powershell
   npm ci
   ```

   ```powershell
   npm run format:check
   ```

   ```powershell
   npm run lint
   ```

   ```powershell
   npm run typecheck
   ```

   Avec la base, les tests sur la base `_test`, variables retirées dans la même ligne
   pour qu'elles ne restent pas dans le terminal :

   ```powershell
   $env:DATABASE_URL = "postgresql://postgres@localhost:5433/<appli>_test"; $env:PGSSLMODE = "disable"; npm test; Remove-Item Env:DATABASE_URL, Env:PGSSLMODE
   ```

   Sans la base :

   ```powershell
   npm test
   ```

   ```powershell
   npm run build
   ```

   Vérifier après **chacune**, doit afficher `0` :

   ```powershell
   $LASTEXITCODE
   ```

5. **Lancer l'appli** :

   ```powershell
   npm run dev
   ```

   Vérifier, dans un second terminal :

   ```powershell
   Invoke-RestMethod http://localhost:3000/sante
   ```

   Doit afficher, avec la base (`commit` reste `inconnu` tant que `COMMIT_DEPLOYE` n'est
   renseignée que chez l'hébergeur ; `injoignable` à la place de `ok` : la base `_dev` ne
   répond pas, revoir les étapes 2 et 3) :

   ```text
   commit  base
   ------  ----
   inconnu ok
   ```

   Sans la base, la même forme avec `base` à `non-configuree`.

À dire aussi, sans le faire : déployer reste à l'humain, chez l'hébergeur noté dans la fiche
(étape 1) ; avec la brique `deploiement`, les gestes sont dans son README, et un hébergeur
autre que Render attend d'abord son adaptateur (ticket de la section 9). Si la brique
`mails` est gardée : compte Resend au nom décidé au cadrage, domaine d'envoi vérifié et
variables chez l'hébergeur, voir la section « Resend » de son README. Si la brique
`notifications` est gardée : elle arrive à brancher ; une fois branchée, son secret et ses
adresses d'essai se déclarent chez l'hébergeur et dans les secrets de la tâche planifiée,
puis une répétition à blanc et un essai précèdent le premier envoi réel (section « Avant le
premier envoi réel » de son README). Avec la brique
`comptes` : la connexion par code envoyé par e-mail est la méthode par défaut, en local le
code se lit dans le terminal du serveur (`MAILS_FOURNISSEUR=console`) ; la démo **refuse
la production** : retirer `"demo"` de `METHODES` (`src/config/comptes.ts`) avant la
première mise en ligne, sinon le déploiement échoue ; `COMPTES_PREMIER_ADMIN` se déclare
chez l'hébergeur. Si le client veut se connecter avec Google (Workspace ou Gmail) :
créer son application OAuth, déclarer `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`,
ajouter `"google"` à `METHODES` (déjà fait si la blueprint le déclare) et, pour un client Workspace, ses domaines à
`DOMAINES_GOOGLE_WORKSPACE` (section « La connexion avec Google » du README de la
brique). Et ce que l'assembleur n'a **pas** fait :
`src/lib/format.ts` garde le fuseau du
catalogue, le thème est le thème de repli du catalogue (la charte Solstice Lab), la
signature Solstice Lab est en place (à retirer par ticket si la fiche le dit, étape 1),
`/kit` (et `dossiers`, avec la brique `comptes`) sont toujours là, et
`src/lib/mentions-legales.ts` est vide hors le nom de l'hébergeur et le statut de
l'éditeur, « professionnel » par défaut (la page
`/mentions-legales` le signale), comme les
choix de `src/lib/confidentialite.ts` (la page `/confidentialite` le signale). Le nom
affiché, la description et le choix public ou fermé de `src/lib/referencement.ts` ne sont
écrits que s'ils sont dans l'en-tête de la blueprint : sinon `NOM_APP` garde sa valeur de
remplacement et les titres disent « À compléter », site fermé aux moteurs ; les pages
publiques du sitemap restent à ajouter dans tous les cas.
L'accueil est une carte « Page d'accueil à écrire », et l'appli n'a aucun écran métier ni
script de données : son module métier se construit par tickets, en copiant le patron
`dossiers`, et les briques « à brancher » s'y branchent ensuite. Pour un site vitrine, écrire
l'accueil et les pages vient juste après la vérification des valeurs écrites, les réglages, les mentions légales,
la politique de confidentialité et le référencement : le contenu vient du client, l'assembleur n'en invente pas. Ce sont
les premiers tickets, listés à la section 9 de la blueprint.

### 5.4 Sous macOS ou Linux

Les mêmes étapes que 5.3, aux mêmes numéros, avec ce que chaque vérification doit afficher.
Les commandes de `gh`, `git`, `docker`, `npx` et `npm` ne changent pas, ni leurs sorties
attendues. Seules celles-ci s'écrivent autrement.

**Étape 1.** Se placer dans le dossier :

```bash
cd "<chemin absolu du dossier>"
```

Vérifier, doit afficher `oui` :

```bash
test -f blueprint.md && echo oui || echo non
```

**Étape 3.** `.env.local`, copie de `.env.example` dont la ligne `DATABASE_URL` vise la base
`_dev` :

```bash
sed 's|^DATABASE_URL=.*|<ligne DATABASE_URL affichée par bases-locales>|' .env.example > .env.local
```

Avec la brique `comptes`, `AUTH_SECRET`. `-i.bak` vaut sous macOS comme sous Linux, `sed -i`
seul n'y a pas le même sens :

```bash
secret=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"); sed -i.bak "s|^AUTH_SECRET=.*|AUTH_SECRET=$secret|" .env.local && rm .env.local.bak; unset secret
```

Vérifier, doit afficher `1` (sans montrer le secret) :

```bash
grep -cE '^AUTH_SECRET=.{32,}$' .env.local
```

Vérifier, doit afficher une seule ligne, qui finit par `_dev` :

```bash
grep '^DATABASE_URL=' .env.local
```

Vérifier, doit afficher `35`, précédé d'espaces (`239` est un BOM, laissé par un éditeur :
réécrire le fichier par les commandes ci-dessus) :

```bash
head -c 1 .env.local | od -An -tu1
```

**Étape 4.** Les tests avec la base, variables posées pour cette seule commande :

```bash
DATABASE_URL="postgresql://postgres@localhost:5433/<appli>_test" PGSSLMODE=disable npm test
```

Vérifier après chaque commande de l'étape (de `npm ci` à `npm run build`), doit afficher `0` :

```bash
echo $?
```

**Étape 5.** Vérifier l'appli lancée, dans un second terminal (sans `curl`, l'installer, ou
ouvrir l'adresse dans un navigateur) :

```bash
curl -s http://localhost:3000/sante
```

Doit afficher, avec la base, `{"commit":"inconnu","base":"ok"}` (sans la base, `base` à
`"non-configuree"`), avec les mêmes écarts possibles qu'en 5.3.

Ces commandes ont été essayées sous Git Bash (sed GNU) sur des fichiers d'essai, pas encore
sur un poste macOS (sed BSD) ou Linux : un écart se rapporte tel quel, comme en 5.3.
