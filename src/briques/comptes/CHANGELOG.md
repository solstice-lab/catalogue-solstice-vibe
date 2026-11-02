# Journal des changements : brique comptes

Les changements observables de la brique, du plus ancien au plus récent. La
section « Interface publique » du [README](README.md) dit ce qui compte comme
interface.

**Règle d'entretien** : tout changement d'interface publique ajoute une entrée
**en fin** de ce fichier, dans la PR qui le fait. Une entrée dit ce qui change
pour l'appelant et pourquoi ; « Rupture » veut dire qu'un appelant existant doit
être modifié. Les changements de documentation seule n'y sont pas obligatoires.

## 2026-10-22 · Création de la brique · Rupture

- **Ce qui change** : le mécanisme des droits (`src/lib/roles.ts`)
  devient la brique `comptes`, avec le bandeau de démo et son action
  (`src/app/SelecteurDemo.tsx`, `src/app/actions-demo.ts`). Les symboles et
  leur comportement ne changent pas.
- **Appelant** : l'import `@/lib/roles` devient `@/briques/comptes/roles`.
  Côté assembleur, tout module exige désormais `--briques comptes`.
- **Pourquoi** : première étape de la brique. Le socle ne suppose plus de
  connexion (décision du 2026-10-22) : un site vitrine s'assemble sans droits.

## 2026-10-23 · Connexion, session en base, accès protégé par défaut · Rupture

- **Ce qui change** :
  - une session en base (tables `utilisateurs` et `sessions`), avec un cookie
    signé par `AUTH_SECRET` ;
  - la protection de toutes les routes dans `src/proxy.ts`, sauf `/connexion`,
    `/sante` et `/mentions-legales` ;
  - la page `/connexion` ;
  - la configuration de qui entre (`src/config/comptes.ts`), `ROLE_ADMIN` et
    `COMPTES_PREMIER_ADMIN` pour le premier admin ;
  - la démo devient une méthode, qui ouvre une vraie session et refuse de
    démarrer en production ;
  - pour les méthodes à venir : `admettre`, `ouvrirSession`, `fermerSession`,
    `cheminDeRetour`. Interface : voir le README, « Interface publique ».
- **Appelant** :
  - `utilisateurDeLEmail` rend une promesse ; un `peutDecider` l'attend.
  - `SelecteurDemo` devient `BandeauSession` dans le layout.
  - `UTILISATEURS_DEMO` passe dans `demo.ts`.
  - `COOKIE_UTILISATEUR_DEMO` et `choisirUtilisateurDemoAction` disparaissent.
  - Une appli doit déclarer `AUTH_SECRET`.
  - Les tests jouent un rôle par `jouer()` (`tests/aide-session.ts`).
- **Pourquoi** : seconde étape de la brique. Décision du 2026-10-22 : une
  session maison plutôt qu'Auth.js (voir le README).

## 2026-10-23 · Routes ouvertes aux robots · Ajout

- **Ce qui change** : `ROUTES_OUVERTES` gagne `/robots.txt`, `/sitemap.xml`,
  `/opengraph-image` et `/twitter-image`.
- **Appelant** : rien à modifier. Une page à mettre au sitemap
  (`pagesPubliques` de `src/lib/referencement.ts`) s'ajoute aussi à
  `ROUTES_OUVERTES`, et à `OUVERTS` de `tests/gardes-acces.test.ts` ;
  `tests/referencement.test.ts` le vérifie.
- **Pourquoi** : redirigés vers `/connexion`, un moteur ou un
  réseau social ne lisaient ni les règles d'indexation, ni le plan du site,
  ni l'image de l'aperçu.

## 2026-10-23 · `ROUTES_OUVERTES` · Ajout

- **Ce qui change** : `ROUTES_OUVERTES` compte `/contact` (brique contact),
  et passe à une route par ligne : une brique qui ouvre sa route l'ajoute et
  la retire avec elle dans la liste de l'assembleur.
- **Appelant** : aucun changement de signature. Une appli sans la brique
  contact n'a pas la ligne `/contact` (l'assembleur la retire).
- **Pourquoi** : le formulaire de contact s'adresse à qui n'a pas
  de compte, et toute route est protégée par défaut.

## 2026-10-23 · Connexion par code à 6 chiffres envoyé par e-mail · Rupture

- **Ce qui change** :
  - une méthode « code-email », la méthode par défaut : un code à 6 chiffres
    envoyé par e-mail, valable 10 minutes, à usage unique, invalidé au 3e
    essai faux ;
  - les limites de demandes, en base (table `codes_connexion`), par adresse
    et par adresse IP, et des saisies fausses par IP
    (`codes_connexion_essais`) ;
  - `MethodeDeConnexion` vaut `"code-email" | "demo"`, et `METHODES` du
    catalogue vaut `["code-email", "demo"]` ;
  - `/connexion` montre un bloc par méthode, dans l'ordre de `METHODES`.
- **Appelant** :
  - côté assembleur, la brique exige `mails` : `--briques comptes,mails`,
    donc pour tout module aussi ;
  - une appli assemblée retire `"demo"` de `METHODES` avant sa mise en ligne,
    comme avant ;
  - les variables de la brique mails sont à régler chez l'hébergeur pour que
    le code parte.
- **Pourquoi** : sans méthode réelle, une appli ne se montrait pas
  en ligne, puisque la démo y est refusée.

## 2026-10-23 · Politique de confidentialité · Ajout

- **Ce qui change** :
  - `confidentialite.ts` exporte `TRAITEMENTS_COMPTES` et
    `traitementsComptes(methodes)`, la description des traitements
    « Comptes et connexion » et « Connexion par code envoyé par e-mail ».
    La politique de confidentialité (`src/lib/confidentialite.ts`) les
    affiche ; la connexion par code n'y figure que si `METHODES` la propose ;
  - `ROUTES_OUVERTES` compte `/confidentialite`, ouverte sans session.
- **Appelant** : rien à changer. Le projet remplit la base légale, la durée et les destinataires
  des clés `comptes` et `connexion-code` dans `CONFIDENTIALITE`. Une méthode
  de connexion ajoutée (Google…) décrit son traitement dans
  `confidentialite.ts`, avec sa clé et ses sous-traitants.
- **Pourquoi** : le RGPD (art. 13) demande d'informer chaque personne
  dont l'appli traite les données, et la page doit se lire sans compte.

## 2026-10-23 · `SOURCES_COMPTES` · Ajout

- **Ce qui change** : `donnees-personnelles.ts` exporte `SOURCES_COMPTES`,
  ce que la brique garde sur une adresse (compte, sessions, demandes de code),
  pour l'export des données d'une personne (brique rgpd). `empreinteDeLAdresse`
  de `code-email.ts` est exportée pour ce fichier ; elle reste interne.
- **Appelant** : rien à changer. Une table ajoutée à la brique se déclare dans
  `src/config/donnees-personnelles.ts` (le verrou de `tests/rgpd-export.test.ts`
  le demande quand la brique rgpd est là).
- **Pourquoi** : le droit d'accès porte aussi sur les données de
  connexion.

## 2026-10-23 · Administration des comptes dans l'appli · Ajout

- **Ce qui change** :
  - `administration.ts` : `listerComptes`, `listerDomaines`, `inviter`,
    `changerRole`, `desactiver`, `reactiver`, `ouvrirDomaine` et
    `fermerDomaine`, sous la protection du dernier admin actif ;
  - une colonne `utilisateurs.gere_par_l_appli` et une table `domaines_admis`,
    dans une étape de migration en fin de `migrations.ts` ;
  - un compte géré par l'appli entre avec son rôle en base, quoi que dise la
    configuration, et un domaine ouvert en base vaut un domaine listé ;
  - `SOURCES_COMPTES` : la source `compte` exporte aussi `gere_par_l_appli` ;
  - `TRAITEMENTS_COMPTES` : le traitement `comptes` décrit aussi l'indication
    d'un rôle fixé dans l'appli et la création d'un compte par un admin, deux
    lignes que l'assembleur retire sans la brique gestion-comptes.
- **Appelant** : rien à modifier. Sans l'écran (brique gestion-comptes), la
  colonne reste à faux et la table vide : le comportement est celui
  d'avant. `domaines_admis` est déclarée sans donnée personnelle dans
  `src/config/donnees-personnelles.ts`.
- **Pourquoi** : le niveau 3 des droits.

## 2026-10-23 · Connexion avec Google · Ajout

- **Ce qui change** :
  - une méthode « google », par OpenID Connect avec `oauth4webapi` (PKCE,
    state et nonce vérifiés au retour) : deux routes, `/connexion/google` et
    `/connexion/google/retour`, ouvertes comme sous-chemins de `/connexion` ;
  - `MethodeDeConnexion` vaut `"code-email" | "google" | "demo"` ;
  - `DOMAINES_GOOGLE_WORKSPACE` dans `src/config/comptes.ts`, vide par défaut :
    les Workspace dont les comptes Google entrent, vérifiés dans le jeton ;
  - `EcranConnexion` reçoit `erreur?`, le paramètre de l'adresse, et affiche
    le message d'un refus de Google ;
  - `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` dans le bloc comptes de
    `.env.example` et de `render.yaml` (`sync: false`) ;
  - `traitementsComptes` décrit le traitement `connexion-google` quand
    `METHODES` propose Google, avec Google comme destinataire de la demande.
- **Appelant** :
  - rien à modifier : `METHODES` du catalogue ne change pas, et une appli sans
    `"google"` ne voit rien changer ;
  - pour proposer Google : créer l'application OAuth du client (procédure dans
    le README), déclarer les deux variables, ajouter `"google"` à `METHODES` ;
  - une page qui rend `EcranConnexion` lui passe `erreur` pour afficher les
    refus de Google ;
  - la brique a désormais un paquet, `oauth4webapi`, sans dépendance ;
  - une appli qui propose Google remplit `CONFIDENTIALITE.choix["connexion-google"]`.
- **Pourquoi** : deuxième méthode de connexion retenue le
  2026-10-22.

## 2026-10-28 · Trace des gestes d'administration · Ajout

- **Ce qui change** :
  - `inviter`, `changerRole`, `desactiver`, `reactiver`, `ouvrirDomaine` et
    `fermerDomaine` prennent un dernier paramètre facultatif `trace` (type
    `Trace`), appelé dans la transaction du geste, après son effet ;
  - un geste refusé ou qui ne change rien ne l'appelle pas ; une trace qui
    lève annule le geste, et l'invitation n'envoie alors aucun mail ;
  - types `Trace` et `Geste` exportés ; un compte s'y désigne par
    « compte n°<id> », jamais par son adresse.
- **Appelant** : rien à modifier. Sans `trace`, le comportement est celui
  d'avant. Les actions de `/comptes` passent `journaliser` de la brique
  journal quand l'appli l'a ; l'assembleur retire ce branchement sinon.
- **Pourquoi** : savoir qui a donné le rôle d'administration à qui, et quand.
  La brique comptes ne peut pas importer le journal, qui l'exige : le point
  d'accroche est un paramètre que l'appelant passe.

## 2026-10-28 · L'effacement des données d'une personne · Ajout

- **Ce qui change** :
  - `administration.ts` exporte `anonymiserLeCompte(executeur, email,
    contexte?)`, `adresseAnonymisee(id)`, `avertissementDeConfiguration(email,
    contexte?)` et le type `CompteAnonymise` ;
  - chaque source de `SOURCES_COMPTES` porte `effacement` (ce que
    l'effacement fait de ses lignes) et `effacer(executeur, adresse)`.
- **Appelant** : rien à changer. L'effacement de la brique rgpd les appelle
  par son registre.
- **Pourquoi** : répondre à une demande d'effacement (RGPD art. 17). Le compte
  s'anonymise sans se supprimer : le journal d'audit le désigne par son numéro,
  en `ON DELETE RESTRICT`, et ne se réécrit pas.

## 2026-10-29 · La brique rgpd vient d'office avec elle · Assemblage

- **Ce qui change** : l'assembleur du catalogue garde la brique rgpd dès que
  comptes est prise, et le dit dans sa sortie et le premier commit de l'appli.
- **Appelant** : rien à changer ; `--briques comptes,mails` suffit.
- **Pourquoi** : une appli qui a des comptes doit pouvoir répondre à une
  demande d'accès ou d'effacement de données personnelles.

## 2026-11-02 · Une entrée ouverte à toute adresse · Ajout

- **Ce qui change** : `Entree` (`methodes.ts`) gagne `ouverte?: boolean`. Avec
  `ouverte: true` dans `ENTREE` (`src/config/comptes.ts`), toute adresse bien
  formée entre avec `ROLE_PAR_DEFAUT`, et le garde à chaque requête. Les
  adresses listées, le premier admin, la démo et les comptes gérés par l'appli
  gardent la priorité et leur rôle. `OrigineDuCompte` gagne la valeur
  `"ouverte"`, que l'écran de la brique gestion-comptes affiche.
- **Appelant** : rien à changer. Sans l'option, ou avec `ouverte: false`,
  l'entrée est celle d'avant. Une appli qui lit `OrigineDuCompte` dans un
  `Record` complet ajoute la nouvelle valeur.
- **Pourquoi** : un outil public demande une inscription ouverte à tous. Une
  appli avait réécrit l'admission dans son propre dépôt pour l'obtenir, et une
  deuxième en avait besoin : le besoin est devenu une option de la brique.
