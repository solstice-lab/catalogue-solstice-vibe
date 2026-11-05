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

## 2026-11-02 · Une entrée ouverte à toute adresse · Rupture

- **Ce qui change** : `Entree` (`methodes.ts`) gagne `ouverte?: boolean`. Avec
  `ouverte: true` dans `ENTREE` (`src/config/comptes.ts`), toute adresse bien
  formée entre avec `ROLE_PAR_DEFAUT`, et le garde à chaque requête. Les
  adresses listées, le premier admin, la démo et les comptes gérés par l'appli
  gardent la priorité et leur rôle. `OrigineDuCompte` gagne la valeur
  `"ouverte"`, que l'écran de la brique gestion-comptes affiche. Avec un seul
  rôle, où `ROLE_PAR_DEFAUT` administre, l'entrée ouverte refuse de démarrer
  (`refuserUneEntreeOuverteQuiAdministre`, appelée par le proxy comme le refus
  de la démo en production).
- **Appelant** : une appli qui lit `OrigineDuCompte` dans un `Record` complet
  (comme l'écran de gestion-comptes) ajoute la valeur `"ouverte"`, sans quoi
  son typecheck échoue. Rien d'autre à changer : sans l'option, ou avec
  `ouverte: false`, l'entrée est celle d'avant.
- **Pourquoi** : un outil public demande une inscription ouverte à tous. Une
  appli avait réécrit l'admission dans son propre dépôt pour l'obtenir, et une
  deuxième en avait besoin : le besoin est devenu une option de la brique.

## 2026-11-03 · Un registre des effets d'un compte désactivé, réactivé ou effacé · Rupture

- **Ce qui change** :
  - `effets.ts` (nouveau) : les types `EffetsDeCompte`, `Effet`,
    `CompteTouche`, `EvenementDeCompte`, `AuteurDuGeste` et
    `jouerLesEffets(tx, evenement, compte)`. Le registre
    `src/config/effets-comptes.ts` (`EFFETS_COMPTES`), que l'appli remplit et
    qui part avec la brique, rassemble une entrée par unité ;
  - `desactiver(id, contexte?, trace?)` devient `desactiver(id, auteur,
    contexte?)`, et `reactiver(id, trace?)` devient `reactiver(id, auteur)` :
    ils jouent les effets du registre dans leur transaction, après leur
    écriture, au nom de `auteur` (`{ email }`). Un effet qui lève annule le
    geste ;
  - `anonymiserLeCompte(executeur, email, contexte?)` devient
    `anonymiserLeCompte(executeur, email, auteur, contexte?)` et joue les
    effets d'effacement ; `CompteAnonymise` perd `geste` ;
  - la source `compte` de `SOURCES_COMPTES` reçoit l'auteur
    (`effacer(executeur, adresse, auteur)`) et ne rend plus de `gestes`.
- **Appelant** : un appel de `desactiver` ou `reactiver` passe l'auteur à la
  place de la trace (`desactiver(id, personne)`, avec la personne que rend
  `exiger`) ; le typecheck signale les appels à reprendre. Le journal d'audit
  trace ces gestes par son entrée du registre (`EFFETS_JOURNAL`) : une trace
  passée en plus les tracerait deux fois. Un effet n'écrit et ne lit que par
  l'exécuteur reçu (`tests/comptes-effets.test.ts` le verrouille).
- **Pourquoi** : dans tours-de-coloc, désactiver un compte devait aussi
  terminer son appartenance à une coloc, et l'effacer anonymiser son prénom.
  La seule prise était la trace de `desactiver`, et l'appli a dû retoucher
  `src/app/comptes/actions.ts`, un fichier de la brique gestion-comptes.

## 2026-11-04 · Connexion avec Microsoft (Entra ID) · Rupture

- **Ce qui change** :
  - une méthode « microsoft », par OpenID Connect avec `oauth4webapi`, sur la
    forme de Google (PKCE, state et nonce vérifiés au retour, même cookie de
    parcours) : deux routes, `/connexion/microsoft` et
    `/connexion/microsoft/retour`, ouvertes comme sous-chemins de `/connexion` ;
  - `MethodeDeConnexion` vaut `"code-email" | "google" | "microsoft" | "demo"`,
    et le type `AnnuairesMicrosoft` (`"un-seul" | "tous"`) s'ajoute à
    `methodes.ts` ;
  - `ANNUAIRES_MICROSOFT` dans `src/config/comptes.ts`, `"un-seul"` par
    défaut : seul l'annuaire du client entre, vérifié dans le jeton (émetteur
    et `tid`) ; `"tous"` accepte tout annuaire et les comptes personnels.
    Dans les deux cas, l'adresse doit porter `xms_edov` à `true` ;
  - `EcranConnexion` affiche la carte Microsoft et le message d'un refus de
    Microsoft (codes `microsoft-…`) ;
  - `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` et `MICROSOFT_TENANT_ID`
    dans le bloc comptes de `.env.example` et de `render.yaml`
    (`sync: false`) ;
  - `traitementsComptes` décrit le traitement `connexion-microsoft` quand
    `METHODES` propose Microsoft.
- **Appelant** :
  - une appli qui met la brique à jour ajoute à son `src/config/comptes.ts`
    la ligne `export const ANNUAIRES_MICROSOFT: AnnuairesMicrosoft = "un-seul";`
    (et `AnnuairesMicrosoft` à son import de `methodes`) : la brique l'importe,
    et le typecheck échoue sans elle. Rien d'autre ne change sans `"microsoft"`
    dans `METHODES` ;
  - les deux routes s'ajoutent à `OUVERTS` de `tests/gardes-acces.test.ts`, et
    `"connexion-microsoft"` à `CONFIDENTIALITE.choix` (`src/lib/confidentialite.ts`) ;
  - pour proposer Microsoft : enregistrer l'application dans le portail Azure
    (procédure dans le README, `xms_edov` compris), déclarer les variables,
    ajouter `"microsoft"` à `METHODES`, régler `ANNUAIRES_MICROSOFT`.
- **Pourquoi** : la cible principale du catalogue, ce sont les entreprises, et
  beaucoup sont sous Microsoft 365.

## 2026-11-04 · Durées de conservation déclarées par donnée · Ajout

- **Ce qui change** : chaque traitement de `confidentialite.ts` porte un
  champ `conservation` (type `Conservation[]` de `src/lib/confidentialite.ts`) :
  le compte 24 mois après la dernière connexion (compté par le script, effacé
  à la main), les sessions un jour après leur expiration, les demandes et
  saisies de code une heure. La connexion avec Google n'en déclare pas.
  La politique de confidentialité les affiche, « à valider » tant que le
  projet ne les a pas revues ; le script de purge de la brique rgpd les
  applique. Clés : `comptes-inactifs`, `sessions`, `codes-connexion`, `codes-connexion-essais`.
- **Appelant** : rien à changer pour la brique. Une appli qui a écrit son
  propre `Traitement` (dans `traitementsDuProjet`) ajoute `conservation`,
  vide ou rempli : le typecheck le signale. Une durée autre que celle proposée
  s'écrit dans `CONFIDENTIALITE.durees`, par sa clé.
- **Pourquoi** : une durée de conservation qui n'est qu'un texte de la
  politique n'est tenue par rien ; déclarée par donnée, elle se purge et se
  vérifie.

## 2026-11-04 · Connexion par lien envoyé par e-mail · Rupture

- **Ce qui change** :
  - `MethodeDeConnexion` vaut `"code-email" | "lien-email" | "google" |
    "microsoft" | "demo"` ;
  - `"lien-email"` dans `METHODES` affiche sur `/connexion` la demande d'un
    lien. Le lien mène à `/connexion/lien` (`src/app/connexion/lien/page.tsx`,
    composant public `EcranLien({ jeton?, retour, erreur? })`), dont
    l'ouverture ne connecte pas : seul l'envoi du bouton « Me connecter »
    (POST) connecte et consomme le lien. Un lien qui ne vaut plus mène à la
    demande d'un nouveau ;
  - le lien vaut 15 minutes et partage la table `codes_connexion`, donc les
    limites par adresse et par IP, avec le code : aucune migration ;
  - en production, l'adresse du lien est `URL_PUBLIQUE`, jamais l'en-tête
    `Host` ; sans elle, la carte du lien dit qu'elle manque ;
  - `traitementsComptes` décrit le traitement `connexion-lien` quand
    `METHODES` propose le lien ; la source d'export `codes-connexion`
    s'intitule « Demandes de code ou de lien de connexion » ;
  - dans une appli qui propose le code et le lien, les deux comptent ensemble
    sous les limites, une demande de l'un invalide l'autre, et un code saisi
    quand la dernière demande est un lien compte pour un essai faux.
- **Appelant** :
  - une appli qui met la brique à jour reçoit `src/app/connexion/lien/page.tsx`
    et doit l'ajouter à `OUVERTS` de `tests/gardes-acces.test.ts`, sans quoi
    ce test échoue, méthode proposée ou non. Elle ajoute aussi
    `"connexion-lien"` à `CONFIDENTIALITE.choix` (`src/lib/confidentialite.ts`).
    Sans `"lien-email"` dans `METHODES`, rien d'autre ;
  - pour proposer le lien : une appli grand public seulement, `URL_PUBLIQUE`
    déclarée en production, `"lien-email"` ajouté à `METHODES`. La recette
    sans `URL_PUBLIQUE` garde le code.
- **Pourquoi** : sur une appli grand public, cliquer un lien est plus simple
  que recopier un code. En entreprise, les antivirus de messagerie ouvrent les
  liens avant la personne : la méthode leur est réservée au grand public, et
  le lien ne se consomme jamais à l'ouverture.

## 2026-11-05 · Limites de connexion par réseau réglables par l'appli

- **Ce qui change** :
  - `LIMITES_PAR_RESEAU` dans `src/config/comptes.ts`, `{ demandesParHeure: 20,
    codesFauxParHeure: 30 }` par défaut : les deux limites par adresse IP de la
    connexion par code ou par lien, qui étaient les constantes
    `DEMANDES_PAR_HEURE_IP` et `ESSAIS_FAUX_PAR_HEURE_IP` de `code-email.ts` (retirées) ;
  - le type `LimitesParReseau` et `refuserDesLimitesParReseauInvalides` dans
    `methodes.ts` : une limite qui n'est pas un entier d'au moins 1 fait refuser le
    démarrage de l'appli (le proxy l'appelle), et la brique la relit à chaque
    demande ou saisie ;
  - les limites par adresse e-mail (`DEMANDES_PAR_HEURE_ADRESSE`,
    `DEMANDES_PAR_HEURE_ADRESSE_IP`) restent des constantes de la brique.
- **Appelant** :
  - une appli qui met la brique à jour reçoit la ligne par la fusion à trois de son
    `src/config/comptes.ts` (avec `LimitesParReseau` à l'import de `methodes`), à 20 et
    30 : ses limites ne changent pas. Une appli qui s'ouvre à un bureau ou à une école
    règle `demandesParHeure` à la main (un outil interne assemblé avant ce changement ne
    passe pas à 100 de lui-même) ; sans la ligne, le typecheck échoue ;
  - un test qui importait `DEMANDES_PAR_HEURE_IP` ou `ESSAIS_FAUX_PAR_HEURE_IP` lit
    `LIMITES_PAR_RESEAU` de `@/config/comptes`.
- **Pourquoi** : tout un réseau (bureau, école, événement) partage une adresse IP.
  Pendant l'essai réel de la brique déploiement, un téléphone en Wi-Fi a été refusé à
  sa première demande de code parce qu'un poste du même réseau avait épuisé les vingt
  demandes par heure. Vingt convient à une appli grand public, pas à un outil interne
  où cinquante personnes se connectent le lundi matin : la valeur dépend de l'appli.
  L'assembleur la règle depuis l'en-tête de la blueprint (`personnes_par_reseau`), avec
  un défaut par profil.
