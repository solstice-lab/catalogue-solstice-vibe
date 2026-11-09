# Brique comptes

Qui est connecté et ce qu'il a le droit de faire. La brique porte :
- la session en base ;
- la protection de toutes les routes ;
- la page `/connexion` et ses méthodes ;
- le mécanisme des droits (`exiger`, `peut`, `visiblePour`).

L'appli déclare qui peut entrer dans `src/config/comptes.ts`, et qui a droit à
quoi dans `src/config/acces.ts`, sans rien réécrire de la brique.

**Tout est protégé par défaut.** Sans session valable, chaque route part vers
`/connexion`, sauf `/connexion`, `/sante`, `/mentions-legales`,
`/confidentialite` et les adresses
lues par les robots : `/robots.txt`, `/sitemap.xml`, `/opengraph-image` et
`/twitter-image`. Une page du sitemap (`pagesPubliques` de
`src/lib/referencement.ts`) s'ajoute à `ROUTES_OUVERTES`, et à `OUVERTS` de
`tests/gardes-acces.test.ts` avec sa raison (elle n'appelle pas `exiger`).

**Les méthodes de connexion se branchent une par une.** Cinq existent : le code
à 6 chiffres envoyé par e-mail, la méthode par défaut ; le lien envoyé par
e-mail, pour une appli grand public seulement ; Google, à
ajouter à `METHODES` une fois l'application OAuth du client créée ; Microsoft
(Entra ID), une fois l'application enregistrée dans le portail Azure ; et la démo.
**La démo refuse de démarrer en production.** Tant qu'elle est dans `METHODES`,
le proxy répond en erreur à toute requête, `/sante` comprise : la sonde de
l'hébergeur échoue, et le déploiement avec elle. Retirer `"demo"` de `METHODES`
avant toute mise en ligne. **De même sans `IP_EN_TETE_CLIENT` en production** :
sans elle, les limites par adresse IP ne voient pas qui demande un code (voir
« L'adresse IP derrière l'hébergeur ») ; `render.yaml` la règle pour Render.

La brique exige la brique données et la brique mails (`exige: ["donnees",
"mails"]` dans la liste de l'assembleur du catalogue) : les comptes, les
sessions et les codes sont en base, et le code part par e-mail. Chaque module
l'exige aussi, puisque chacune de ses pages appelle `exiger`.

Elle se branche sur le socle et non sur un module (`sansModule: true`). Sans
module, elle garde donc la base et la couche données du patron `dossiers`, d'où
partira le premier module d'une appli sur mesure (ses écrans restent au
catalogue). Une appli sans la brique n'a ni module,
ni base, ni droits, ni protection des routes : c'est un site vitrine. Son
`src/proxy.ts` ne pose que la CSP.

## Les trois niveaux de droits

1. **Connexion seule** : un seul rôle, qui a toutes les actions. La ligne à
   écrire est donnée dans le commentaire d'en-tête de `src/config/acces.ts`.
   Avec la brique rgpd, toute personne connectée peut alors exporter et
   effacer les données de n'importe quelle adresse (`donnees.exporter`,
   `donnees.effacer`) : le dire dans la blueprint, ou réserver ces actions.
   L'entrée ouverte (`ouverte` de `ENTREE`) refuse ce niveau : elle donnerait
   toutes les actions à n'importe quelle adresse.
2. **Rôles en configuration** : plusieurs rôles dans `ROLES`, et qui a
   droit à quoi dans `DROITS`. C'est le niveau du catalogue (membre, admin).
3. **Administration des comptes dans l'appli** : l'écran `/comptes` de
   la brique `gestion-comptes`, optionnelle. Les règles sont ici
   (`administration.ts`) ; voir « Le niveau 3 ».

## Comment ça marche

- **Session.** Le cookie (`session`, `__Host-session` en production) porte un
  jeton aléatoire de 256 bits et sa signature HMAC par `AUTH_SECRET`. La base
  ne garde que l'empreinte SHA-256 du jeton. Le cookie est `HttpOnly`,
  `SameSite=Lax`, `Secure` en production, et vaut 30 jours.
- **Proxy.** `src/proxy.ts` (socle) appelle `protegerLaRoute`, qui ne vérifie
  que la signature, sans lire la base, parce que le proxy tourne sur chaque
  requête, préchargements compris.
- **Pages.** La vérification sûre se fait à chaque page, par `exiger` ou
  `utilisateurCourant`. Elle contrôle que la session existe en base et n'a pas
  expiré, que le compte est actif, et que son adresse est encore admise (par la
  configuration, ou par la base au niveau 3). Le rôle est relu en base à chaque
  requête : retirer un droit agit tout de suite.
- **Ce qui reste visible.** Un compte désactivé dont le cookie est encore
  signé passe donc le proxy. Il ne voit que les pages sans `exiger` : l'accueil,
  qui dit « Session expirée », et `/kit`, sur des données fictives.
- **Entrée.** Une méthode vérifie l'identité, puis appelle `admettre(email)`,
  qui décide selon la configuration et, au niveau 3, la base :
  - une adresse listée entre avec son rôle, et la configuration fait foi à
    chaque requête, sauf pour un compte géré par l'appli ;
  - une adresse d'un domaine listé entre avec `ROLE_PAR_DEFAUT` (jamais
    l'administration), et son rôle se change ensuite en base ;
  - `COMPTES_PREMIER_ADMIN` entre avec `ROLE_ADMIN` tant qu'aucun compte (hors
    démo, désactivés compris) n'a jamais eu ce rôle ;
  - au niveau 3, un compte géré par l'appli entre avec son rôle en base, et un
    domaine ouvert depuis l'écran vaut un domaine listé (voir « Le niveau 3 ») ;
  - avec `ouverte: true` dans `ENTREE` (un outil public, ouvert à
    l'inscription), toute autre adresse bien formée (hors adresses de démo)
    entre avec
    `ROLE_PAR_DEFAUT`, et le garde à chaque requête : jamais le rôle que sa ligne
    garde en base, pour qu'un ancien admin retiré de la configuration ne le
    redevienne pas. Avec le code ou le lien par e-mail, leurs limites de
    demandes (voir « La connexion par code envoyé par e-mail ») sont alors le
    seul frein aux inscriptions ; avec Google ou Microsoft, l'appli n'en oppose aucun. L'option exige deux
    rôles au moins : avec un seul, `ROLE_PAR_DEFAUT` administre, et la brique
    refuse de démarrer ;
  - toute autre adresse est refusée.
- **Comptes en base.** Un compte naît à sa première connexion, ou à son
  invitation au niveau 3 : rien n'est semé par migration. On désactive un
  compte (`actif`), on ne le supprime pas.

## Le niveau 3 : l'administration dans l'appli

Pour un client qui gère lui-même ses utilisateurs. L'écran `/comptes`
est dans la brique `gestion-comptes` ; les règles sont dans `administration.ts`,
à côté des tables qu'elles protègent. Sans l'écran, rien ne les appelle.

**Qui fait foi.** Un compte qu'un admin a invité, ou dont il a changé le rôle à
l'écran, est **géré par l'appli** (colonne `gere_par_l_appli`) : il entre tant
qu'il est actif, avec son rôle en base, quoi que dise la configuration. Tous les
autres suivent les règles du niveau 2. Pour une adresse listée dans
`src/config/comptes.ts`, changer son rôle à l'écran la reprend : la
configuration ne s'applique plus à elle, et l'écran le dit avant.

**Passer du niveau 2 au niveau 3** ne change l'accès de personne : la colonne
est à faux pour tous les comptes existants. La base ne fait jamais foi pour un
rôle qu'un admin n'a pas choisi à l'écran. Au niveau 2, le rôle d'une adresse
listée n'est recopié en base qu'à la connexion. Un admin rétrogradé dans la
configuration depuis sa dernière connexion est donc resté « admin » en base,
et une bascule « la base pour tous » lui aurait rendu ce rôle.

**Ce que fait l'écran** :
- **inviter** une adresse : le compte est créé tout de suite, avec le rôle
  choisi. Un mail d'information peut partir, avec l'adresse de la page de
  connexion, mais ni code ni lien qui connecte : l'identité se vérifie toujours
  par une méthode de connexion. Si l'envoi échoue, le compte reste créé, et
  l'écran le dit ;
- **changer un rôle** : le changement agit à la requête suivante. Une
  connexion qui croise le changement ne le défait pas : `admettre` ne réécrit
  jamais le rôle d'un compte géré par l'appli ;
- **désactiver** un compte : la personne est dehors à la requête suivante, et
  ses sessions sont fermées. Sans cela, une réactivation ferait revivre un
  ancien cookie. Une connexion qui croise la désactivation n'ouvre pas de
  session (`ouvrirSession` lit le compte sous verrou partagé). **Réactiver** ne
  change rien d'autre : un compte que plus rien n'admet est montré « sans
  accès ». Un compte de démo ne s'administre pas ;
- **ouvrir un domaine** (table `domaines_admis`) : toute adresse du domaine
  entre avec `ROLE_PAR_DEFAUT`, même un compte dont la ligne garde un autre
  rôle d'avant : sinon, ouvrir le domaine rendait « admin » à un ancien admin
  retiré de la configuration. Les messageries publiques (gmail.com,
  outlook.com…) sont refusées, car elles ouvriraient l'appli à tout le monde ;
- **fermer un domaine** : les comptes entrés par lui, et que l'appli ne gère
  pas, perdent l'accès, comme au niveau 2 quand un domaine sort de la
  configuration (sauf avec l'entrée ouverte, où ils restent entrés par elle). Les domaines de la configuration s'affichent, mais ne se
  ferment pas d'ici.

**Le dernier admin actif est protégé à deux portes** :
- **à l'écran**, `listerComptes` le marque `protege`, et l'écran ne lui propose
  aucune action ;
- **côté serveur**, chaque écriture refuse de laisser l'appli sans admin
  actif : désactiver, changer un rôle, fermer un domaine (avec un seul rôle
  dans `ROLES`, le rôle par défaut est celui d'administration, et un domaine
  peut porter le dernier admin).

Ce qui compte comme admin : le rôle EFFECTIF `ROLE_ADMIN`, sur un compte actif,
hors démo. Un admin listé dans la configuration compte donc lui aussi. Les
écritures passent une par une, sous un verrou en base. Sans lui, deux admins qui
se rétrogradent l'un l'autre au même instant liraient chacun deux admins, et
passeraient tous les deux. On peut agir sur son propre compte, tant qu'on n'est
pas le dernier admin.

**La trace d'un geste.** Chaque écriture de `administration.ts` est une seule
transaction. Inviter, changer un rôle, ouvrir et fermer un domaine prennent une
`trace` facultative, appelée dans cette transaction après l'effet, pour chaque
geste qui a changé quelque chose : une trace qui échoue annule le geste, un
geste refusé ne l'appelle pas. La brique ne peut pas importer le journal
d'audit, qui l'exige : ce sont les actions de `/comptes` (brique
gestion-comptes) qui lui passent `journaliser`, au nom de la personne que leur
rend `exiger`. Un compte s'y désigne par son numéro (« compte n°12 »), jamais
par son adresse. Sans la brique journal, l'assembleur retire ce branchement et
rien n'est tracé. Désactiver, réactiver et effacer ne prennent pas de trace :
le journal les trace par le registre des effets (ci-dessous).

**Les effets d'un compte désactivé, réactivé ou effacé.** Une autre unité de
l'appli peut avoir à réagir : terminer une appartenance, nommer un autre
gestionnaire, anonymiser un prénom affiché, tracer le geste au journal. Elle le
déclare dans le registre `src/config/effets-comptes.ts`, une entrée par unité
(`EffetsDeCompte`, de `effets.ts`), sans retoucher la brique ni
`src/app/comptes/actions.ts`. Le registre est né de l'essai tours-de-coloc,
qui a dû retoucher ce fichier de la brique gestion-comptes, et dont trois
tickets y ajoutaient chacun leur effet.
- `desactiver`, `reactiver` et `anonymiserLeCompte` jouent les effets de
  l'événement (`desactivation`, `reactivation`, `effacement`), dans l'ordre du
  registre, dans leur transaction, sous leur verrou, après leur écriture. Un
  effet qui lève annule le geste et les effets déjà joués.
- Un effet reçoit l'exécuteur de la transaction et le compte touché :
  `{ id, auteur, geste }`, où `auteur` est la personne qui fait le geste (celle
  que rend `exiger`, ou l'admin qui efface) et `geste` a la forme d'un
  événement du journal (« compte n°12 », les colonnes changées). À
  l'effacement, l'adresse est déjà anonymisée : l'effet retrouve ses lignes
  par le numéro du compte.
- Un geste refusé ou qui ne change rien (réactiver un compte actif) ne joue
  aucun effet.
- **Un effet n'écrit et ne lit que par l'exécuteur reçu**, jamais par
  `query()`, `queryOne()` ni `transaction()` : une écriture faite par le pool
  resterait quand le geste est annulé, et attendrait souvent la ligne que la
  transaction tient. `tests/comptes-effets.test.ts` joue chaque effet du
  registre sous un pool qui refuse toute requête, refuse un fichier d'effets
  qui importe `query`, `queryOne` ou `transaction` (pour les branches que le
  jeu ne parcourt pas), et prouve sa sensibilité sur des cas fautifs.
- **Rien d'autre qu'une écriture en base** : l'aperçu d'un effacement (brique
  rgpd) joue les effets puis les annule, et un mail envoyé par un effet
  partirait quand même.

**L'effacement des données d'une personne** (brique rgpd, que l'assembleur garde d'office avec comptes).
`anonymiserLeCompte` anonymise le compte d'une adresse dans la transaction de
l'effacement, sans le supprimer : son adresse devient
`efface-<numéro>@efface.invalid` (domaine réservé, où aucun mail n'arrive), il
est désactivé, n'est plus géré par l'appli, et sa dernière connexion est
oubliée. Ce qui le désigne par son numéro (le journal d'audit) reste en place
et ne mène plus à l'adresse. Mêmes portes que la désactivation : le verrou, le
dernier admin actif, les comptes de démo. Les effets d'effacement du registre
suivent, au nom de l'admin qui efface. Une adresse écrite dans la
configuration ou dans `COMPTES_PREMIER_ADMIN` est anonymisée en base, avec un
avertissement : elle reste dans le code, et entrerait avec un compte neuf.

Pièges verrouillés dans `tests/comptes-administration.test.ts` :

| Piège | Test |
| --- | --- |
| Le dernier admin désactivé ou rétrogradé, par l'écran ou par une action postée | « le dernier admin actif, protégé à deux portes », dont les requêtes simultanées |
| Un compte supprimé, ou un cookie qui revit à la réactivation | « désactiver, réactiver : on désactive un compte, on ne le supprime pas », dont le verrou « aucun DELETE » |
| Un rôle changé qui attend la reconnexion, ou qu'une connexion simultanée défait | « changer un rôle : agit à la requête suivante », « n'est pas défait par une connexion simultanée » |
| Une session ouverte pendant la désactivation | « n'ouvre pas de session à une connexion qui croise la désactivation » |
| Un domaine ouvert qui rend un rôle d'administration resté en base | « ne rend pas, en ouvrant un domaine, un rôle d'administration resté en base » |
| Un accès perdu ou rendu au passage du niveau 2 au niveau 3 | « passage du niveau 2 au niveau 3 » |
| Une messagerie publique ouverte comme domaine | « ouvrir et fermer un domaine » |

Et dans `tests/comptes-effets.test.ts`, le registre des effets :

| Piège | Test |
| --- | --- |
| Un effet qui écrit ou lit par le pool, hors de la transaction du geste | « verrou : un effet du registre se joue dans la transaction du geste », avec son cas fautif |
| Un effet en échec qui laisse le geste fait | « annulent le geste quand l'un d'eux lève, avec ce que les effets d'avant ont écrit » |
| Un effet joué pour un geste refusé, ou qui ne change rien | « ne partent pas pour un geste refusé ni pour un geste qui ne change rien » |

## Les fichiers

| Fichier | Rôle |
| --- | --- |
| `roles.ts` | Le mécanisme des droits, sans aucun nom de module : `peut`, `exiger`, `visiblePour`, `utilisateurCourant`. |
| `session.ts` | Ouvrir, lire, fermer une session ; retrouver une personne par son adresse ; fermer toutes les sessions d'un compte qu'on désactive. Seul fichier qui touche aux sessions en base. |
| `entree.ts` | Qui entre, avec quel rôle : `admettre`, `seraitAdmis`, `roleEffectif`, `origineDuCompte`. |
| `administration.ts` | Le niveau 3 : lister les comptes et les domaines, inviter, changer un rôle, désactiver, réactiver, ouvrir et fermer un domaine, sous la protection du dernier admin. |
| `effets.ts` | Les types du registre des effets de comptes et `jouerLesEffets`, qu'appellent la désactivation, la réactivation et l'anonymisation d'un compte. |
| `jeton.ts` | Le jeton, sa signature, le secret, le nom du cookie. Sans accès à la base : le proxy l'importe. |
| `protection.ts` | `protegerLaRoute` et la liste des routes ouvertes, pour `src/proxy.ts`. |
| `retour.ts` | `cheminDeRetour` : le chemin où revenir après la connexion, filtré. |
| `code-email.ts` | La méthode code par e-mail : demander un code, le vérifier, ouvrir la session ; les limites de demandes et les durées, partagées avec le lien. |
| `lien-email.ts` | La méthode lien par e-mail : demander un lien, lire s'il vaut encore (à l'ouverture), le consommer et ouvrir la session (au bouton) ; l'adresse du lien. |
| `google.ts` | La méthode Google : le départ vers Google, le retour (state, PKCE, nonce, ID token), les règles d'entrée propres à Google, les messages de refus. |
| `microsoft.ts` | La méthode Microsoft (Entra ID) : le départ vers Microsoft, le retour (state, PKCE, nonce, ID token, annuaire), les règles d'entrée propres à Microsoft, les messages de refus. |
| `parcours.ts` | Le cookie de parcours d'une connexion par un fournisseur : ce que le départ tire au hasard et que le retour doit retrouver. Il est signé, à usage unique, et vaut 10 minutes. |
| `demo.ts` | La méthode démo : un compte par rôle, refusée en production. |
| `methodes.ts` | Les types de la configuration (`MethodeDeConnexion`, `Entree`, `AnnuairesMicrosoft`) et `ErreurComptes`. |
| `actions.ts` | Les server actions : demander un code, le vérifier, demander un lien, se connecter par le lien, entrer en démo, se déconnecter. Sans garde, puisque ce sont elles qui décident de qui l'on est. |
| `EcranConnexion.tsx` | Le contenu de `/connexion` : un bloc par méthode, dans l'ordre de `METHODES`, et le message d'un refus de Google ou de Microsoft. |
| `FormulaireCode.tsx` | Le bloc du code par e-mail, en deux étapes : l'adresse, puis le code. |
| `FormulaireLien.tsx` | Le bloc du lien par e-mail : l'adresse, puis ce qu'il faut faire du mail. Sur `/connexion` et sur la page d'un lien qui ne vaut plus. |
| `EcranLien.tsx` | Le contenu de `/connexion/lien` : le bouton « Me connecter » d'un lien qui vaut encore, ou la demande d'un nouveau. |
| `confidentialite.ts` | La description des traitements de la brique, pour la politique de confidentialité. N'importe que `src/config/comptes.ts` : la page publique ne doit pas atteindre la base. |
| `donnees-personnelles.ts` | Ce que la brique garde sur une adresse, pour l'export et l'effacement des données d'une personne de la brique rgpd, que l'assembleur garde d'office avec comptes. |
| `BandeauSession.tsx` | Au-dessus de chaque page (depuis `src/app/layout.tsx`) : qui est connecté, « Se déconnecter » et, en démo, le choix du rôle. |

Hors de la brique, mais partis avec elle quand une copie ne la garde pas :
- `src/config/acces.ts`, `src/config/comptes.ts` et `src/config/effets-comptes.ts`,
  les fichiers que l'appli remplit, qui importent les types de la brique ;
- `src/app/connexion/`, avec les deux routes de Google (`google/route.ts` et
  `google/retour/route.ts`), les deux de Microsoft (`microsoft/route.ts` et
  `microsoft/retour/route.ts`) et la page du lien (`lien/page.tsx`) ;
- `tests/roles.test.ts` ;
- `tests/gardes-acces.test.ts`, qui vérifie que chaque page, action et route de
  `src/app` commence par son garde ;
- `tests/comptes-session.test.ts` et `tests/comptes-proxy.test.ts`, ce dernier
  parcourant toutes les routes ;
- `tests/comptes-code-email.test.ts`, la connexion par code ;
- `tests/comptes-lien-email.test.ts`, la connexion par lien ;
- `tests/comptes-administration.test.ts`, le niveau 3 ;
- `tests/comptes-effets.test.ts`, le registre des effets et son verrou ;
- `tests/comptes-google.test.ts`, la connexion avec Google ;
- `tests/comptes-microsoft.test.ts`, la connexion avec Microsoft ;
- `tests/comptes-isolement.test.ts`, `tests/aide-session.ts` et `tests/aide-comptes.ts`
  (la suppression de tous les comptes, avec ce qui les désigne).

Le paquet `oauth4webapi` reste dans le `package.json` d'une copie sans la brique.
L'assembleur ne retire aucune dépendance : `package-lock.json` ne suivrait plus, et
`npm ci` échouerait. Inutilisé, il se retire à la main (`npm uninstall oauth4webapi`).

L'assembleur retire aussi, sans elle, les étapes `utilisateurs, sessions`,
`codes_connexion` et `utilisateurs.gere_par_l_appli, domaines_admis` de
`src/lib/db/migrations.ts`, son bloc de `src/proxy.ts`, de
`.env.example` et de `render.yaml`, et son bandeau du layout. Il remet `"/"`
dans `pagesPubliques` de `src/lib/referencement.ts`, où l'accueil redevient
public, et retire de `tests/referencement.test.ts` le verrou « jamais une page
derrière connexion ».

La brique n'importe que :
- le socle (`@/ui`, Next, React, `node:crypto`, l'adresse IP du visiteur
  `@/lib/adresse-ip`) ;
- le client de base (`@/lib/db/client`) ;
- la configuration de l'appli (`@/config/acces`, `@/config/comptes`,
  `@/config/effets-comptes`, par où les autres unités réagissent à un compte
  désactivé ou effacé sans que la brique les importe elle-même) ;
- l'envoi de la brique mails (`@/briques/mails/envoi`), qu'elle exige ;
- `oauth4webapi`, pour le protocole OpenID Connect de la connexion avec Google et
  avec Microsoft.

Elle n'a pas d'autre paquet : la session reste maison (voir la décision plus
bas). Elle ne connaît aucun module : ce
sont les modules qui l'appellent. Une autre brique n'y entre que si elle est
déclarée dans son `exige` (`mails` seule aujourd'hui). Le test de l'assembleur
du catalogue le vérifie pour toutes les briques.

## La connexion par code envoyé par e-mail

La méthode par défaut, reprise d'un projet précédent où elle a tourné en
production, avec ses corrections. Sur `/connexion` : l'adresse, « Recevoir un
code », puis le code à 6 chiffres sur le même écran. « Renvoyer un code » attend
une minute ; « Changer d'adresse » recommence.

- **Le code** : 6 chiffres tirés au hasard (`crypto.randomInt`), valable
  10 minutes, consommé à la première réussite. En demander un nouveau invalide
  le précédent. Au 3e essai faux, il est invalidé, même si le bon arrive
  ensuite. Toute saisie fausse compte pour un essai.
- **En base**, tables `codes_connexion` (les demandes) et
  `codes_connexion_essais` (les saisies fausses par IP), rien qu'en empreintes,
  toutes des HMAC par `AUTH_SECRET` : sans clé, un code à 6 chiffres se
  retrouverait en un million d'essais, et une adresse IPv4 en quelques
  secondes. Les lignes de plus d'une heure sont effacées au passage.
- **Les limites**, comptées en base sous verrou (deux demandes simultanées ne
  passent pas toutes deux), sur l'heure écoulée :
  - une adresse depuis une même IP : une demande par minute, cinq par heure ;
  - une IP, toutes adresses confondues : vingt par heure, réglable
    (`LIMITES_PAR_RESEAU`, voir plus bas) ;
  - une adresse, toutes IP confondues : dix par heure, ce qui borne les essais à
    trente par heure et par adresse ;
  - toute l'appli, toutes adresses et IP confondues : trois cents par heure,
    réglable (`envoisParHeure` de `LIMITES_PAR_RESEAU`, facultatif). Les limites
    précédentes ne bornent pas qui dispose de beaucoup d'IP : il faisait partir
    autant de mails qu'il voulait au nom de l'appli (coût d'envoi, réputation de
    l'expéditeur) et remplissait la table des demandes (audit du 2026-11-09). Le
    plafond compte les demandes acceptées, qu'un mail parte ou non : l'admission
    ne se lit qu'après la réponse. Atteint, la demande reçoit la réponse
    ordinaire, celle d'une adresse inconnue, et rien ne s'écrit ni ne part ; le
    journal le dit une fois, sans adresse ni IP, quand la demande qui le remplit
    passe. Son prix, accepté : qui dispose de beaucoup d'IP peut l'épuiser avec
    des adresses quelconques et retarder toutes les connexions jusqu'à une heure.
    Trois cents, parce qu'une session dure trente jours : une appli interne de
    quelques centaines de personnes n'en voit pas autant se connecter dans la
    même heure. Une appli grand public le relève.

  Les limites par adresse e-mail (cinq depuis une IP, dix sur toutes les IP) sont
  fixes : elles parlent d'une seule personne.

  Compter par adresse seule laissait un tiers tenir une personne dehors : la
  limite par adresse se compte depuis une IP, et celle sur toutes les IP est
  plus haute. Son prix, accepté : qui dispose de plusieurs IP peut tenir une
  adresse dehors une heure, et apprend, s'il bute sur elle avant ses dix
  demandes, que d'autres ont demandé un code pour cette adresse.
- **Les saisies fausses** d'une IP, toutes adresses confondues : trente par
  heure, réglable aussi (`LIMITES_PAR_RESEAU`). Au-delà, plus aucun code n'est lu depuis cette IP. Sans cette limite,
  trois essais suffisaient à invalider le code en cours de n'importe qui, et
  « expiré » contre « incorrect » disait qui se connectait à l'instant.
- **Rien ne dit qui a un compte.** Une adresse inconnue reçoit la même réponse
  et subit les mêmes limites, et sa demande écrit la même ligne. La réponse
  n'attend ni l'envoi, ni même la question « l'adresse est-elle admise ? » :
  les deux se font après la réponse, par `after()` de Next. Attendre l'envoi
  rendait la réponse plus lente pour une adresse connue, ce qui suffisait à la
  trahir. Un envoi en échec se journalise sans l'adresse ni le code.
- **Demander un code ne crée aucun compte.** Le compte naît quand le bon code
  est saisi (`admettre`). Une adresse désactivée entre l'envoi et la saisie est
  refusée.

**Un réseau entier compte pour une adresse.** Derrière une même box, un bureau, une
école ou un événement partagent une seule IP, donc les vingt demandes par heure : un
téléphone en Wi-Fi a été refusé à sa première demande parce qu'un poste du même
réseau avait épuisé la limite (essai réel de la brique déploiement). La valeur
dépend de l'appli, pas de la brique : `LIMITES_PAR_RESEAU`, dans
`src/config/comptes.ts`, donne `demandesParHeure` (vingt par défaut : un site
grand public) et `codesFauxParHeure` (trente). Une seule question de cadrage les
règle : combien de personnes au plus se connectent dans la même heure depuis un même
réseau ? L'en-tête de la blueprint la porte (`personnes_par_reseau`), l'assembleur
écrit les deux valeurs (la seconde, une fois et demie la première, arrondie au-dessus :
sur un réseau de cent personnes, trente saisies fausses par heure se dépasseraient par
de simples fautes de frappe, d'où un rapport gardé de celui du défaut, vingt et trente),
et à défaut le profil donne vingt, cent pour un outil interne. Un entier d'au moins 1 :
la limite par IP arrête un poste qui demande des codes à la chaîne (coût d'envoi,
réputation de l'expéditeur), elle ne se retire pas, et l'appli refuse de démarrer sur
une valeur nulle, négative ou non entière.

**L'adresse IP derrière l'hébergeur.** Les limites par IP lisent l'adresse du
visiteur par `adresseDuVisiteur` (`src/lib/adresse-ip.ts`, partagé avec la
brique contact, et retiré par l'assembleur sans l'une ni l'autre). L'en-tête de confiance se désigne par
`IP_EN_TETE_CLIENT`, que `render.yaml` règle sur `cf-connecting-ip` : Render
passe par Cloudflare, qui pose cet en-tête et refuse une requête qui l'envoie
elle-même (essai réel du 2026-11-05, README de la brique déploiement, étape 7). Un en-tête lu sans le
proxy qui le pose se forgerait : un autre hébergeur demande une autre valeur.
Sans la variable, l'IP vaut `"local"` hors production. **En production, la
variable est obligatoire** : sans elle, le proxy répond en erreur à toute
requête, `/sante` comprise, comme pour la démo, et le déploiement échoue.
Les limites par IP sautaient jusque-là, avec un seul avertissement au journal :
un tiers invalidait chaque code reçu par une adresse visée (trois saisies
fausses par minute) et savait, à « expiré » contre « incorrect », qui demandait
un code à l'instant (audit du 2026-11-09). Variable réglée mais en-tête absent
d'une requête (proxy mal réglé, requête qui le contourne) : la requête compte
sur une adresse partagée, avec toutes celles qui arrivent sans adresse, aux
limites de `LIMITES_PAR_RESEAU`, et le serveur l'avertit une fois. Un proxy qui
perd l'en-tête bloque alors vite tout le monde : cela se voit et se corrige, là
où l'absence de limite ne se voyait pas. Chez un autre hébergeur, **à vérifier par
un humain sur une requête réelle au premier déploiement**.

En local (`MAILS_FOURNISSEUR=console`), le mail, et donc le code, s'affiche dans
le terminal où tourne `npm run dev`. Une adresse doit être admise par `ENTREE`
(`src/config/comptes.ts` : adresse, domaine, ou toute adresse avec
`ouverte: true`) ou déclarée dans `COMPTES_PREMIER_ADMIN`.

Dans `tests/comptes-session.test.ts`, la politique de confidentialité est
tenue d'accord avec le code : « dit la vraie durée du cookie de session et la
vraie validité du code », « ne décrit la connexion par code que si la méthode
est proposée », « ne décrit la connexion avec Google que si la méthode est
proposée », « dit la vraie durée du cookie de parcours de Google », leurs
deux pendants pour Microsoft, « ne décrit la connexion par lien que si la
méthode est proposée, avec la vraie validité du lien » et « déclare une seule
fois la conservation des demandes, que le lien partage avec le code ».

Pièges verrouillés dans `tests/comptes-code-email.test.ts` :

| Piège | Test |
| --- | --- |
| La réponse attend l'envoi et trahit les comptes | « répond avant l'envoi, qui part après la réponse » |
| La réponse diffère selon l'adresse | « répond la même chose pour une adresse admise, inconnue, désactivée ou d'un domaine non listé » |
| Les limites ne tiennent qu'en mémoire, ou par adresse seule | les cas de « limites de demandes, en base, par adresse et par adresse IP », dont les demandes simultanées |
| Un code rejoué, expiré ou deviné ; les codes des autres invalidés ou sondés | « vérification du code : expiré, déjà utilisé ou faux ne connecte pas », dont la limite des saisies fausses par IP |
| Le code ou l'adresse en clair dans la base | « ne garde en base ni le code, ni l'adresse, ni l'IP » |
| Aucune limite par IP quand l'adresse ne se lit pas | les deux cas « sans adresse IP lisible en production » |
| Des mails sans fin depuis beaucoup d'IP | « plafond de toute l'appli : codes et liens par heure, toutes adresses et IP confondues » |

Le refus de démarrer sans `IP_EN_TETE_CLIENT` en production est verrouillé dans
`tests/comptes-proxy.test.ts`, `/sante` comprise.

## La connexion par lien envoyé par e-mail

`"lien-email"` dans `METHODES`. **Réservée aux applis grand public**, celles
où l'on se connecte avec une adresse personnelle (une appli à entrée ouverte,
comme l'essai tours-de-coloc). En entreprise, le code reste la méthode : les
antivirus de messagerie ouvrent les liens d'un e-mail avant la personne, et
certains vont jusqu'à suivre une page ouverte. La page de confirmation plus bas
déjoue ceux qui se contentent d'ouvrir le lien, pas ceux qui soumettent un
formulaire ; et un lien s'ouvre souvent sur un autre appareil que celui de la
demande, ce que le code n'impose pas.

Sur `/connexion` : l'adresse, « Recevoir un lien de connexion », puis un
message qui ne dit pas si l'adresse a un compte. « Renvoyer un lien » attend
une minute. Le mail mène à `/connexion/lien`.

- **Le piège traité d'abord : ouvrir le lien ne connecte pas.** Un lien à
  usage unique consommé à l'ouverture était servi à l'antivirus, et la personne
  lisait « lien expiré ». La page `/connexion/lien` (une page, jamais une route
  GET : un test le verrouille) ne fait que lire si le lien vaut encore, et
  montre l'adresse et un bouton « Me connecter ». C'est l'envoi de ce bouton,
  une requête POST (server action `connecterParLienAction`), qui connecte et
  consomme le lien. Rien ne le soumet tout seul.
- **Le lien** : valable 15 minutes (`DUREE_VALIDITE_LIEN_MINUTES`), plus que le
  code, parce qu'on l'ouvre depuis sa messagerie, souvent sur le téléphone ;
  consommé au premier envoi du bouton. En demander un nouveau, lien ou code,
  invalide le précédent. La session s'ouvre sur l'appareil où l'on appuie
  sur le bouton.
- **Ce que porte le lien** : un jeton, l'adresse et 192 bits d'aléa chiffrés
  ensemble (AES-256-GCM, clé tirée d'`AUTH_SECRET`). L'adresse est dans le
  lien parce que la base n'en garde que l'empreinte ; chiffrée, elle n'apparaît
  ni dans les journaux de l'hébergeur ni dans l'historique. La page de
  confirmation, elle, l'affiche, à qui tient le lien. Un jeton retouché
  ne se déchiffre pas. La base garde l'empreinte de l'aléa, comme celle d'un
  code.
- **Les mêmes gardes que le code**, par les mêmes fonctions de `code-email.ts`
  et dans la même table `codes_connexion` : les mêmes limites par adresse et
  par IP, comptées avec celles du code (un lien puis un code dans la minute
  pour la même adresse est refusé) ; la même réponse, que l'adresse ait un
  compte ou non ; l'envoi après la réponse, à une adresse admise seulement ;
  aucun compte créé avant le bouton. Un lien faux ou périmé envoyé compte pour
  une saisie fausse de l'IP (trente par heure par défaut, `LIMITES_PAR_RESEAU`).
- **Un lien qui ne vaut plus** (expiré, déjà servi, remplacé, inventé) mène à
  la même page : « Ce lien a expiré ou a déjà servi », et le formulaire pour en
  recevoir un nouveau, qui ne dit rien de l'adresse.
- **L'adresse du lien.** En production, c'est `URL_PUBLIQUE` (en `https`, sans
  chemin), jamais l'en-tête `Host` de la requête : un tiers qui l'écrit ferait
  envoyer à une personne un lien vers son propre site, et y recueillerait le
  jeton. Sans elle, la carte de `/connexion` dit qu'elle manque, et rien ne
  part. Hors production, l'hôte de la requête : le lien du mail affiché dans la
  console s'ouvre sur le poste. **En recette** (`NODE_ENV=production` sans
  `URL_PUBLIQUE`), la méthode ne fonctionne donc pas ; y déclarer
  `URL_PUBLIQUE` ouvrirait un site public aux moteurs (`src/lib/referencement.ts`).
  La recette garde le code.

Dans une appli qui propose le code et le lien, la dernière demande peut être
un lien : un code saisi alors compte pour un essai faux. La politique de
confidentialité décrit le traitement `connexion-lien`, et ne déclare la
conservation des demandes qu'une fois quand les deux méthodes sont là.

Pièges verrouillés dans `tests/comptes-lien-email.test.ts` :

| Piège | Test |
| --- | --- |
| L'antivirus consomme le lien en l'ouvrant | « ouvrir le lien (GET) ne connecte pas et ne consomme pas le lien », et le verrou « n'a pas de route GET sous /connexion/lien » |
| Un lien rejoué, expiré, remplacé ou retouché | « le bouton « Me connecter » (POST) connecte une fois » |
| La réponse dit qui a un compte, ou les limites se contournent par le lien | « qui reçoit un lien : la réponse ne dit pas qui a un compte », dont « partage les limites du code par e-mail » |
| L'adresse en clair dans le lien ou la base | « ne met l'adresse en clair ni dans le lien ni en base, ni le jeton en base » |
| Un lien vers un autre site par l'en-tête `Host` | « l'adresse du lien : jamais celle que la requête prétend » |

## La connexion avec Google

Sur `/connexion`, la carte « Google » porte un lien « Se connecter
avec Google ». On choisit son compte chez Google, puis on revient connecté sur la page
demandée. C'est un lien et non un formulaire : la CSP du socle porte `form-action
'self'`, que Chrome applique aussi à la redirection qui suit l'envoi d'un formulaire.

**Le parcours, en OpenID Connect** (code d'autorisation, par `oauth4webapi`) :

- **Le départ** (`/connexion/google`) tire un `code_verifier` (PKCE S256), un
  `state` et un `nonce`. Il les range, avec le chemin de retour filtré et l'adresse
  de retour, dans un cookie de parcours (`parcours.ts`), puis renvoie vers Google.
- **Le cookie de parcours** est signé par `AUTH_SECRET`, `HttpOnly` et
  `SameSite=Lax` : le retour de Google est une navigation venue d'un autre site, et
  un cookie `Strict` n'y serait pas envoyé. En production, il est aussi `Secure` et
  préfixé `__Host-`. Il vaut 10 minutes, et il est effacé dès sa lecture.
- **Le retour** (`/connexion/google/retour`) exige le cookie de ce navigateur et
  le même `state`. Il échange ensuite le code avec le `code_verifier` et le secret
  client. L'ID token reçu doit porter le `nonce` du départ, l'émetteur
  `https://accounts.google.com` et l'ID client de l'appli, avec des dates valables.
- **La signature de l'ID token** n'est pas vérifiée contre les clés publiques de
  Google. Le jeton arrive de Google par TLS, sur son point d'échange, et OpenID
  Connect Core (§3.1.3.7) accepte alors TLS à la place de la signature. C'est le
  comportement par défaut d'`oauth4webapi`.
- **Les adresses de Google** sont écrites dans `google.ts`, plutôt que lues à chaque
  connexion dans son document de découverte.

**Qui entre**, dans cet ordre :

1. L'adresse doit être vérifiée par Google : `email_verified` vaut `true`.
2. **Google doit faire autorité sur l'adresse** : une adresse `@gmail.com`, ou celle
   d'un compte Google Workspace (revendication `hd` présente).
   - Pour un compte Google ouvert avec l'adresse d'une autre entreprise,
     `email_verified` dit seulement que l'adresse a été vérifiée un jour. La personne
     a pu quitter l'entreprise depuis et garder son compte Google (documentation
     « Sign in with Google »).
   - Une telle adresse est refusée. Le code par e-mail reste là pour elle.
3. Si `DOMAINES_GOOGLE_WORKSPACE` (`src/config/comptes.ts`) n'est pas vide, la
   revendication `hd` de l'ID token doit en faire partie. `hd` porte le domaine
   **principal** du Workspace.
   - Avec un seul domaine, il est aussi passé en paramètre à Google, qui ne propose
     alors que les comptes de ce domaine. Avec plusieurs, le paramètre vaut `*`
     (tout Workspace).
   - Ce paramètre n'est qu'un confort d'affichage : n'importe qui le retire de
     l'adresse. Seule la revendication du jeton compte.
4. `admettre(email)` décide, comme pour le code. **Le domaine Workspace s'ajoute à
   `ENTREE`, il ne la remplace pas** : une adresse du bon Workspace que `ENTREE`
   n'admet pas reste dehors.

Un compte est reconnu par son adresse, comme avec le code, et non par l'identifiant
Google (`sub`). Le prix : si un Workspace réattribue une adresse à une autre personne,
celle-ci hérite du compte dans l'appli.

**Refus.** On revient sur `/connexion?erreur=<code>`, où la carte Google affiche un
message fixe (`ERREURS_GOOGLE`) :

| Code | Cas |
| --- | --- |
| `google-annule` | Refus chez Google. |
| `google-expire` | Le cookie de parcours manque, a expiré ou a été retouché ; le `state` est faux ; l'ID token ne correspond pas au départ ; le code a déjà servi. |
| `google-acces` | Adresse non vérifiée, Google sans autorité, domaine Workspace hors liste, ou refus d'`admettre`. |
| `google-indisponible` | Réseau, panne chez Google, réponse illisible ou sans ID token. |
| `google-configuration` | Google refuse l'ID client ou le secret : réessayer n'y changerait rien. |

Un code inconnu n'affiche rien, et rien du paramètre n'est recopié à l'écran. Les
refus du protocole sont journalisés par leur nature, jamais par leur contenu : ni le
code, ni le secret, ni le jeton.

**Sans configuration.** Si `"google"` est dans `METHODES` mais que
`GOOGLE_CLIENT_ID` ou `GOOGLE_CLIENT_SECRET` manque :
- la carte Google nomme la ou les variables manquantes, jamais leur valeur ;
- les deux routes renvoient vers `/connexion` ;
- rien ne plante, et les autres méthodes restent là.

Sans `"google"` dans `METHODES`, les deux routes répondent 404.

**Politique de confidentialité.** Avec `"google"` dans `METHODES`, la page
`/confidentialite` décrit le traitement « Connexion avec Google » (clé
`connexion-google` de `confidentialite.ts`) : ce que Google renvoie (adresse,
vérification, domaine Workspace), et Google comme destinataire de la demande. Google
n'y est pas un sous-traitant : la personne s'identifie chez lui avec son propre
compte, et il traite cette connexion selon ses propres règles. La qualification se
fait valider par le client, comme la base légale, la durée et les destinataires, à
remplir dans `CONFIDENTIALITE.choix["connexion-google"]` (`src/lib/confidentialite.ts`).

**L'adresse de retour** se calcule depuis l'origine de la requête, suivie de
`/connexion/google/retour`. Next lit le protocole dans `X-Forwarded-Proto`, que pose
l'hébergeur. Un `Host` forgé ne mène qu'à un refus de Google, qui ne connaît pas cette
adresse. **À vérifier par un humain au premier déploiement** : la page de Google doit
être appelée avec `redirect_uri=https://<domaine>/connexion/google/retour`, en https.

### Créer l'application OAuth du client dans Google Cloud

C'est au client de le faire, ou avec lui, depuis un compte de son organisation : le
projet Google Cloud et le secret lui appartiennent. Les libellés de la console ont été
relus le 2026-10-23 (menu « Google Auth Platform »).

1. Dans la console Google Cloud (`console.cloud.google.com`), créer un projet au nom
   de l'appli, dans l'organisation du client s'il en a une.
2. Ouvrir **Google Auth Platform**, puis **Get started**. L'appli s'y enregistre en
   deux volets :
   - **Branding** : le nom de l'appli, l'adresse d'assistance, l'adresse de contact
     du développeur ;
   - **Audience** :
     - **Internal** si le client a Google Workspace. Seuls les comptes de son
       organisation entrent, et aucune validation n'est à demander à Google. Le
       projet doit alors appartenir à l'organisation Google Cloud du client.
     - **External** sinon (des comptes Gmail, par exemple). L'appli reste « en test »
       tant qu'elle n'est pas publiée. La connexion seule (`openid`, `email`)
       échappe aux limites de ce mode test.
3. **Data Access** : rien à ajouter. L'appli ne demande que `openid` et `email`, qui
   ne demandent aucune validation.
4. **Clients**, puis **Create client**, de type **Web application**. Le nommer
   d'après l'environnement.
   - Dans **Authorized redirect URIs**, une ligne par environnement :
     - `http://localhost:3000/connexion/google/retour` en local ;
     - `https://<domaine de production>/connexion/google/retour` ;
     - `https://<service>.onrender.com/connexion/google/retour` si l'appli s'essaie
       sur l'adresse de Render avant son domaine ;
     - une ligne par recette.
   - **Authorized JavaScript origins** reste vide : le navigateur ne parle pas à
     Google en script.
   - Une adresse modifiée peut mettre de quelques minutes à quelques heures à
     s'appliquer.
5. **Copier le secret à la création** : la console ne le montre qu'une fois. Le
   ranger dans le gestionnaire de secrets de l'équipe, jamais dans le dépôt. S'il
   est perdu, en ajouter un autre (**Add secret**).
6. Déclarer `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` dans `.env.local` en local,
   et chez l'hébergeur dans le tableau de bord (`sync: false` dans `render.yaml`).
7. Dans `src/config/comptes.ts` :
   - ajouter `"google"` à `METHODES`, en premier si c'est la méthode principale du
     client ;
   - pour un client Workspace, ajouter ses domaines à `DOMAINES_GOOGLE_WORKSPACE` ;
   - lister les adresses ou les domaines admis dans `ENTREE`, comme pour le code,
     ou poser `ouverte: true` pour un outil public.

En local, `npm run dev` sert `http://localhost:3000`, l'adresse déclarée à
l'étape 4.

Pièges verrouillés dans `tests/comptes-google.test.ts` :

| Piège | Test |
| --- | --- |
| Une connexion forcée par un tiers (son propre code, sans le parcours de ce navigateur) | « refuse un state qui n'est pas celui du départ… », « refuse un retour sans cookie de parcours… » |
| Un parcours retouché, rejoué ou trop vieux | « refuse un cookie de parcours retouché… », « … de plus de 10 minutes… », « ne connecte qu'une fois par départ… », « … dont la signature porte un caractère hors base64url, sans planter… » |
| Une session posée avant la connexion qui lui survit (fixation) | « ferme la session que le navigateur portait déjà… » |
| Un code intercepté, échangé sans le verifier | « connecte une adresse admise… en envoyant à Google le verifier dont le challenge est l'empreinte » |
| Un ID token rejoué, expiré ou destiné à une autre appli | « refuse un ID token dont le nonce… », « … émis pour une autre application, ou par un autre émetteur… », « refuse un ID token expiré… » |
| Un texte de l'adresse recopié à l'écran | « n'affiche un message que pour un code de refus connu… » |
| Une adresse non vérifiée, ou dont Google ne fait pas autorité | « refuse une adresse que Google n'a pas vérifiée… », « refuse une adresse dont Google ne fait pas autorité… » |
| Le domaine Workspace vérifié dans l'adresse de départ seulement, ou qui remplace la liste d'accès | les deux cas « avec un domaine Workspace configuré… » |
| Un chemin de retour vers un autre site | « revient sur l'accueil quand le chemin de retour mène hors de l'appli » |

## La connexion avec Microsoft

Pour les clients sous Microsoft 365 : leurs comptes sont dans un annuaire
Microsoft Entra ID (un *tenant*). Sur `/connexion`, la carte « Microsoft » porte un
lien « Se connecter avec Microsoft ». Le parcours est celui de Google, dans
`microsoft.ts` : même OpenID Connect par `oauth4webapi` (PKCE S256, `state`, `nonce`),
même cookie de parcours (`parcours.ts`, fournisseur `microsoft`), mêmes règles pour le
chemin de retour, la signature de l'ID token (TLS, OIDC Core §3.1.3.7) et les refus
journalisés par leur nature. Le départ (`/connexion/microsoft`) est un lien, pas un
formulaire : rien n'est à ajouter à `form-action 'self'` de la CSP, ni à
`tests/en-tetes-securite.test.ts`. Le retour se fait sur `/connexion/microsoft/retour`.

**Un seul annuaire ou tous** (`ANNUAIRES_MICROSOFT`, `src/config/comptes.ts`) :

| Réglage | Qui passe à `ENTREE` | Adresses de Microsoft |
| --- | --- | --- |
| `"un-seul"` (le défaut, le cas normal) | Les comptes de l'annuaire du client, `MICROSOFT_TENANT_ID`. Un invité d'un autre annuaire y a un jeton de cet annuaire, mais le domaine de son adresse n'appartient pas au client : `xms_edov` le refusera sans doute (non essayé). | `https://login.microsoftonline.com/<MICROSOFT_TENANT_ID>/oauth2/v2.0/…` |
| `"tous"` | Les comptes de tout annuaire, et les comptes Microsoft personnels si l'enregistrement de l'application les accepte (étape 2 ci-dessous). Pour un outil ouvert à plusieurs entreprises. | `https://login.microsoftonline.com/common/oauth2/v2.0/…` |

Dans les deux cas, l'ID token doit porter l'émetteur de son propre annuaire,
`https://login.microsoftonline.com/<tid>/v2.0`, et le `tid` de cet émetteur. Avec
`"un-seul"`, ce `tid` doit être `MICROSOFT_TENANT_ID` : un compte d'ailleurs est
refusé (`microsoft-acces`), même listé dans `ENTREE`. `MICROSOFT_TENANT_ID` est le GUID
de l'annuaire, pas son nom de domaine : avec le nom, chaque jeton serait refusé sur son
émetteur, et la carte le tient donc pour absent. Avec `"tous"`, l'émetteur ne dit
que l'annuaire du compte, quel qu'il soit : la confiance tient alors à TLS, au
destinataire du jeton (`aud`), à `xms_edov` et à `ENTREE`.

**Qui entre**, dans cet ordre :

1. L'émetteur et le `tid`, ci-dessus.
2. L'ID token porte une adresse (`email`) et **`xms_edov` vaut `true`** : Microsoft a
   vérifié que le domaine de l'adresse appartient à l'annuaire du compte. La
   documentation Microsoft des revendications facultatives compte aussi pour vérifiées
   les adresses des comptes personnels : **à confirmer par le premier essai** avec un
   compte personnel (refusé sinon, avec la ligne du journal ci-dessous).
   - Sans cette règle, l'administrateur de n'importe quel annuaire écrit dans le profil
     d'un compte l'adresse qu'il veut, celle d'un client comprise, et entre sous son
     nom (attaque dite « nOAuth » ; documentation Microsoft « Migrate away from using
     email claims for user identification or authorization »).
   - `xms_edov` est une revendication facultative : **elle se déclare dans
     l'enregistrement de l'application** (étape 6). Sans elle, tout le monde est
     refusé, et le journal du serveur le dit (« domaine non vérifié par Microsoft
     (email, xms_edov) »), sans l'adresse.
   - Un compte sans adresse dans son profil Entra (champ *Email*) est refusé :
     `preferred_username` n'est pas une adresse garantie.
3. `admettre(email)` décide, comme pour le code et pour Google.

Comme pour Google, un compte est reconnu par son adresse, pas par son identifiant
Microsoft (`oid`). Et comme pour Google, un compte Microsoft personnel peut avoir été
ouvert avec l'adresse d'une entreprise : Microsoft l'a vérifiée à l'ouverture, pas
depuis. Avec `"un-seul"`, ces comptes n'entrent pas ; avec `"tous"`, c'est le prix
de l'ouverture aux comptes personnels, à dire au client (ou à fermer dans le portail
en n'acceptant que les annuaires d'entreprise, étape 2).

**Refus.** Les codes et leurs cas sont ceux de Google, préfixés `microsoft-`
(`ERREURS_MICROSOFT`) : `microsoft-annule`, `microsoft-expire` (aussi : un jeton sans
`tid` ou dont l'émetteur n'est pas celui de son `tid`), `microsoft-acces` (aussi : un
autre annuaire avec `"un-seul"`, ou `xms_edov` absent), `microsoft-indisponible`,
`microsoft-configuration` (dont le secret expiré : il vaut 24 mois au plus). Une
erreur que Microsoft renvoie dès le retour, avant tout échange, se lit aussi :
`unauthorized_client`, `invalid_client` ou `invalid_scope` donnent
`microsoft-configuration`, `consent_required` (un consentement d'administrateur
exigé) donne `microsoft-acces`, le reste `microsoft-expire`. Le journal en garde le
code, jamais la description (`error_description`).

**Sans configuration.** Si `"microsoft"` est dans `METHODES` mais que
`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` ou, avec `"un-seul"`,
`MICROSOFT_TENANT_ID` manque ou n'est pas un GUID, la carte nomme les variables à
renseigner et les deux routes renvoient vers `/connexion`. Sans `"microsoft"` dans
`METHODES`, elles répondent 404.

**Politique de confidentialité.** Avec `"microsoft"` dans `METHODES`, `/confidentialite`
décrit le traitement « Connexion avec Microsoft » (clé `connexion-microsoft`), avec
Microsoft destinataire de la demande et non sous-traitant, comme Google. Ses choix se
remplissent dans `CONFIDENTIALITE.choix["connexion-microsoft"]`.

**La restriction à un annuaire** ne s'essaie qu'avec un vrai client sous
Microsoft 365 : un compte personnel n'a pas d'annuaire d'entreprise. **À vérifier par
un humain avec la première appli d'un tel client** : un compte de son annuaire entre,
un compte d'un autre annuaire (ou personnel) est refusé.

### Enregistrer l'application dans le portail Azure

Gratuit, depuis un compte de l'organisation du client, ou avec lui : l'enregistrement
et le secret lui appartiennent. Les libellés sont ceux du portail en anglais, écrits le
2026-11-04 sans l'avoir ouvert : le premier essai les confirme ou les corrige ici. Le centre d'administration Microsoft Entra (`entra.microsoft.com`) a les
mêmes écrans sous *Identity → Applications → App registrations*.

1. Sur `portal.azure.com`, ouvrir **Microsoft Entra ID**, puis **App registrations**,
   puis **New registration**. Nom : celui de l'appli, suivi de l'environnement.
2. **Supported account types** :
   - **Accounts in this organizational directory only (Single tenant)** pour
     `"un-seul"`, le cas normal ;
   - **Accounts in any organizational directory (Multitenant)** pour `"tous"`, sans
     les comptes personnels ;
   - **… and personal Microsoft accounts** pour `"tous"` avec les comptes personnels
     (c'est le réglage d'un essai avec un compte personnel).
3. **Redirect URI** : plateforme **Web**, `http://localhost:3000/connexion/microsoft/retour`.
   Les autres environnements s'ajoutent ensuite dans **Authentication**, plateforme
   Web, une ligne chacun :
   - `https://<domaine de production>/connexion/microsoft/retour` ;
   - `https://<service>.onrender.com/connexion/microsoft/retour` si l'appli s'essaie
     sur l'adresse de Render avant son domaine ;
   - une ligne par recette.

   Dans **Authentication**, ne cocher ni *Access tokens* ni *ID tokens* (flux implicite) :
   l'appli échange un code.
4. **Register**. La page **Overview** donne **Application (client) ID**
   (`MICROSOFT_CLIENT_ID`) et **Directory (tenant) ID** (`MICROSOFT_TENANT_ID`, le GUID).
5. **Certificates & secrets**, onglet **Client secrets**, **New client secret** :
   une description, une durée (24 mois au plus). **Copier la colonne *Value*** (pas
   *Secret ID*) tout de suite : le portail ne la montre qu'une fois. La ranger dans le
   gestionnaire de secrets de l'équipe, jamais dans le dépôt. Noter l'échéance : un
   secret expiré bloque la connexion (`microsoft-configuration`), et un nouveau se crée
   au même endroit.
6. **Token configuration**, **Add optional claim**, type **ID** : cocher **email** et
   **xms_edov**, puis **Add**. Si le portail propose d'ajouter la permission Microsoft
   Graph *email*, l'accepter.
7. **API permissions** : rien à ajouter. L'appli ne demande que `openid` et `email`,
   qui ne demandent pas, par défaut, de consentement d'administrateur. Un annuaire
   qui interdit le consentement des utilisateurs le demande à son administrateur.
8. Déclarer `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` et `MICROSOFT_TENANT_ID`
   dans `.env.local` en local, et chez l'hébergeur dans le tableau de bord
   (`sync: false` dans `render.yaml`). Avec `"tous"`, `MICROSOFT_TENANT_ID` peut rester
   vide.
9. Dans `src/config/comptes.ts` :
   - ajouter `"microsoft"` à `METHODES`, en premier si c'est la méthode principale ;
   - régler `ANNUAIRES_MICROSOFT` selon l'étape 2 ;
   - lister les adresses ou les domaines admis dans `ENTREE`, comme pour le code.

**L'adresse de retour** se calcule comme pour Google, depuis l'origine de la requête.
**À vérifier par un humain au premier déploiement** : Microsoft doit être appelé avec
`redirect_uri=https://<domaine>/connexion/microsoft/retour`, en https.

Pièges verrouillés dans `tests/comptes-microsoft.test.ts` :

| Piège | Test |
| --- | --- |
| Une connexion forcée par un tiers, un parcours rejoué | « refuse un state qui n'est pas celui du départ… », « refuse un retour sans cookie de parcours… », « ne connecte qu'une fois par départ… » |
| Un code intercepté, échangé sans le verifier, ou ailleurs que chez l'annuaire configuré | « connecte une adresse admise… en échangeant le code chez l'annuaire du client avec le verifier… » |
| Un ID token rejoué, expiré, destiné à une autre appli ou d'un autre émetteur | « refuse un ID token dont le nonce… », « refuse un ID token émis pour une autre application, expiré, ou par un autre émetteur… » |
| Un compte d'un autre annuaire avec un seul annuaire configuré | « avec un seul annuaire, refuse le compte d'un autre annuaire ou un compte personnel… » |
| Un émetteur qui n'est pas celui du `tid`, ou un jeton sans `tid` | « avec tous les annuaires, refuse un jeton dont l'émetteur n'est pas celui de son annuaire (tid) », « avec un seul annuaire, refuse un jeton sans tid… » |
| Une adresse écrite par l'administrateur d'un autre annuaire (nOAuth) | « refuse une adresse dont Microsoft ne garantit pas le domaine (xms_edov)… » |
| Une adresse hors liste | « refuse une adresse hors de la liste d'accès, même garantie par Microsoft (critère d'acceptation) » |
| Un nom de domaine à la place de l'ID d'annuaire | « tient pour absent un ID d'annuaire qui n'est pas un GUID… » |

## Interface publique

Ce qu'une appli peut importer et appeler, et ce qu'une méthode de connexion
utilise. Les autres exports servent aux fichiers de la brique ou
à ses tests : ils peuvent changer sans entrée au journal.

| Import | Symboles | Rôle |
| --- | --- | --- |
| `roles.ts` | `exiger(...actions)` → `Promise<Utilisateur>` | Première ligne de chaque page et de chaque server action. Répond par une page introuvable (`notFound()`, un 404) si personne n'est connecté ou si la personne n'a aucune des actions demandées. |
| `roles.ts` | `peut(utilisateur, action)` → `boolean` | La règle elle-même, relue à chaque appel. Refus par défaut : `null` ou un rôle absent de `ROLES` ne passe aucune action. Une route l'appelle avec `await utilisateurCourant()` et répond elle-même. |
| `roles.ts` | `visiblePour(action)` → `() => Promise<boolean>` | Le garde d'une entrée de `src/lib/navigation.ts`, avec la même action que la page. |
| `roles.ts` | `utilisateurCourant()` → `Promise<Utilisateur \| null>` | La personne de la session, ou `null`. Une seule lecture en base par requête. |
| `roles.ts` | `utilisateurDeLEmail(email)` → `Promise<Utilisateur \| null>` | Retrouve en base une personne active et encore admise, par son adresse (le `peutDecider` de la brique validation). |
| `roles.ts` | types `Utilisateur`, `DroitsDe<A, R>` | `Utilisateur` : `{ email, role }`, avec `role` en chaîne (un rôle retiré de la configuration est refusé, pas rejeté au typage). `DroitsDe` : le type de `DROITS`. |
| `entree.ts` | `admettre(email)` → `Promise<CompteAdmis \| null>` | Pour une méthode, une fois l'identité vérifiée : le compte, créé s'il manque, ou `null` si la personne n'entre pas (inconnue, compte désactivé). |
| `session.ts` | `ouvrirSession(compte)`, `fermerSession()` | Ouvre la session d'un compte admis et pose le cookie, après avoir fermé celle que le navigateur portait déjà (pas de fixation de session) ; la ferme en base et retire le cookie. `ouvrirSession` lève `ErreurComptes` sans `AUTH_SECRET` valable, avant toute écriture. |
| `retour.ts` | `cheminDeRetour(valeur)` → `string` | Le chemin de l'appli où revenir après la connexion, `/` pour tout le reste. |
| `protection.ts` | `protegerLaRoute(requete)` → `NextResponse \| null`, `ROUTES_OUVERTES`, `estOuverte(chemin)` → `boolean` | Appelé par `src/proxy.ts`. Une route ouverte de plus s'ajoute à `ROUTES_OUVERTES`, avec sa raison, sur sa propre ligne : une brique qui ouvre sa route la retire avec elle dans la liste de l'assembleur (la brique contact le fait pour `/contact`). `estOuverte` est vrai pour une route de la liste ou l'un de ses sous-chemins ; lu par `tests/referencement.test.ts`. |
| `EcranConnexion.tsx` | `EcranConnexion({ retour, erreur? })` | Le contenu de `/connexion`, que la page entoure de `AppLayout`. `erreur` reçoit le paramètre `erreur` de l'adresse, tel quel : seul un code de refus de Google ou de Microsoft connu affiche un message. |
| `EcranLien.tsx` | `EcranLien({ jeton?, retour, erreur? })` | Le contenu de `/connexion/lien`, où mène le lien de connexion du mail, que la page entoure de `AppLayout`. Son rendu ne fait que lire si le lien vaut encore : il montre l'adresse et le bouton « Me connecter », dont l'envoi (POST) connecte, ou la demande d'un nouveau lien. `retour` arrive filtré (`cheminDeRetour`). Sans lien valable, le message du lien expiré, quelle que soit l'`erreur` ; `acces` et `limite`, seuls codes reconnus en plus, donnent une alerte fixe. Page introuvable sans `"lien-email"` dans `METHODES`. |
| `BandeauSession.tsx` | `BandeauSession` | Placé dans `src/app/layout.tsx`. |
| `methodes.ts` | types `MethodeDeConnexion` (`"code-email"`, `"lien-email"`, `"google"`, `"microsoft"`, `"demo"`), `Entree` (`adresses`, `domaines`, `ouverte` facultatif), `AnnuairesMicrosoft` (`"un-seul"`, `"tous"`), `LimitesParReseau` (`demandesParHeure`, `codesFauxParHeure`, `envoisParHeure` facultatif) ; `ENVOIS_PAR_HEURE_PAR_DEFAUT` (300) ; classe `ErreurComptes` ; `refuserDesLimitesParReseauInvalides(limites?)` → `Required<LimitesParReseau>` ; `refuserLaProductionSansEnTeteIp()` | Les types de `src/config/comptes.ts`. `refuserDesLimitesParReseauInvalides` lève `ErreurComptes` pour une limite qui n'est pas un entier d'au moins 1, et rend les limites avec `envoisParHeure` à `ENVOIS_PAR_HEURE_PAR_DEFAUT` quand l'appli ne le règle pas ; le proxy l'appelle à chaque requête, avec les gardes de démarrage (démo, `IP_EN_TETE_CLIENT` en production, entrée ouverte), et la brique à chaque demande ou saisie. `refuserLaProductionSansEnTeteIp` lève `ErreurComptes` en production quand `IP_EN_TETE_CLIENT` est vide. Le message de l'erreur commence par « Brique comptes : » et ne cite jamais un secret. |
| `confidentialite.ts` | `TRAITEMENTS_COMPTES`, `traitementsComptes(methodes)` | Les traitements de la brique (clés `comptes`, `connexion-code`, `connexion-lien`, `connexion-google` et `connexion-microsoft`), au format `Traitement` de `src/lib/confidentialite.ts`, qui les importe. La connexion par code, par lien, avec Google et avec Microsoft n'y sont que si `METHODES` les propose. Une méthode ajoutée y décrit son traitement et, s'il y en a, ses sous-traitants. Les durées y sont écrites en toutes lettres : la durée de session, la validité du code et du lien, et la vie du cookie de parcours de Google et de Microsoft sont comparées aux constantes par `tests/comptes-session.test.ts` ; l'heure de conservation des empreintes (`CONSERVATION_S`, interne à `code-email.ts`) ne l'est pas. Chaque traitement déclare sa `conservation`, à valider avec le client : le compte 24 mois après la dernière connexion (clé `comptes-inactifs`, compté par le script de purge de la brique rgpd, effacé à la main), les sessions un jour après leur expiration (`sessions`), les demandes et saisies de code ou de lien une heure (`codes-connexion`, `codes-connexion-essais`, déclarées par le lien seulement quand le code n'est pas proposé), purgées par la brique rgpd ; les connexions avec Google et avec Microsoft n'en déclarent pas. L'assembleur retire l'import et les clés quand la brique part, et sans la brique gestion-comptes les deux lignes du traitement `comptes` qui viennent de son écran (un rôle fixé dans l'appli, un compte créé par un admin). |
| `donnees-personnelles.ts` | `SOURCES_COMPTES` | Pour la brique rgpd, gardée d'office avec comptes : les sources de l'export des données d'une personne (`compte`, `sessions`, `codes-connexion`), que son registre rassemble. Les demandes de code ou de lien se retrouvent en recalculant l'empreinte à clé de l'adresse (`empreinteDeLAdresse` de `code-email.ts`, exportée pour cela et interne à la brique). Aucune empreinte ne sort. La source `compte` dit aussi si le rôle est fixé dans l'appli (`gere_par_l_appli`). Chaque source porte son `effacement` et `effacer(executeur, adresse, auteur)` : le compte s'anonymise (`anonymiserLeCompte`, au nom de `auteur`, l'admin qui efface), sessions et demandes de code ou de lien sont supprimées. |
| `entree.ts` | type `OrigineDuCompte` | Ce qui fait entrer un compte : `appli`, `configuration`, `demo`, `premier-admin`, `domaine`, `ouverte` ou `aucune`. Lu par l'écran de la brique gestion-comptes. |
| `administration.ts` | `anonymiserLeCompte(executeur, email, auteur, contexte?)` → `Promise<CompteAnonymise \| Refus \| null>`, `adresseAnonymisee(id)` → `string` | L'anonymisation du compte d'une adresse, dans la transaction de l'appelant (l'effacement de la brique rgpd), suivie des effets d'effacement du registre au nom de `auteur` (`{ email }`, l'admin qui efface) : `null` sans compte, `Refus` pour le dernier admin actif ou un compte de démo. `CompteAnonymise` : `{ id, avertissement? }`, où `avertissement` dit de retirer l'adresse de la configuration. `avertissementDeConfiguration(email, contexte?)` → `string | null` donne cet avertissement aussi pour une adresse sans compte en base. |
| `administration.ts` | types `CompteAdministre`, `DomaineAdministre`, `StatutDuCompte`, `Invitation`, `Prevenir`, `Refus`, `Trace`, `Geste`, `CompteAnonymise` | Les formes que rendent les fonctions ci-dessous ; l'écran de gestion-comptes les importe en `import type`. |
| `administration.ts` | `listerComptes(contexte?)` → `Promise<CompteAdministre[]>`, `listerDomaines(contexte?)` → `Promise<DomaineAdministre[]>` | Le niveau 3, pour l'écran de la brique gestion-comptes. Un compte porte son rôle effectif, son origine, son statut (`actif`, `desactive`, `sans-acces`) et `protege`, vrai sur le dernier admin actif. Un domaine dit ce que sa fermeture retirerait (`comptesQuiPerdraientLAcces`). |
| `administration.ts` | `inviter(email, role, prevenir, trace?)` → `Promise<Invitation \| Refus>` | Crée le compte, géré par l'appli. `prevenir` : `{ nomDeLAppli, adresseDeConnexion }` pour un mail d'information (l'adresse de la page de connexion, ni code ni lien qui connecte), ou `null`. `Invitation.mail` vaut `"parti"`, `"en-echec"` (le compte reste créé) ou `"non-demande"`. |
| `administration.ts` | `changerRole(id, role, contexte?, trace?)`, `desactiver(id, auteur, contexte?)`, `reactiver(id, auteur)`, `ouvrirDomaine(domaine, contexte?, trace?)`, `fermerDomaine(domaine, contexte?, trace?)` → `Promise<Refus \| undefined>` | `undefined` : c'est fait. `desactiver` et `reactiver` jouent les effets du registre au nom de `auteur` (`{ email }`, la personne que rend `exiger`). `Refus` (`{ erreur }`) : un message à afficher tel quel (dernier admin, compte introuvable, rôle non déclaré, messagerie publique…). Le garde (`exiger`) reste à l'appelant. |
| `administration.ts` | `Trace` : `(tx, geste) => Promise<void>` | Le paramètre `trace` de quatre écritures (inviter, changer un rôle, ouvrir et fermer un domaine) : appelée dans leur transaction, après l'effet, pour chaque geste qui a changé quelque chose ; si elle lève, le geste est annulé. `Geste` a la forme d'un événement de la brique journal : `action` (`creation`, `modification`), `entite` (`compte`, `domaine`), `entiteId`, `libelle` (« compte n°12 », ou le domaine) et, pour une modification, les `champs` changés (`role`, `gere_par_l_appli`, `actif`). Sans trace, rien n'est tracé. |
| `effets.ts` | types `EffetsDeCompte`, `Effet`, `CompteTouche`, `EvenementDeCompte`, `AuteurDuGeste` | Le registre `src/config/effets-comptes.ts` : `EffetsDeCompte` vaut `{ unite, desactivation?, reactivation?, effacement? }`, chaque effet `(tx, { id, auteur, geste }) => Promise<void>`, joué dans la transaction du geste ; il lève pour l'annuler. Il n'écrit et ne lit que par `tx`, jamais par `query()` (verrou de `tests/comptes-effets.test.ts`), et n'envoie rien hors de la base. Voir « Les effets d'un compte désactivé, réactivé ou effacé ». |
| `effets.ts` | `jouerLesEffets(tx, evenement, compte)` → `Promise<void>` | Ce qu'appellent les gestes de la brique. Une autre brique qui désactiverait ou effacerait un compte l'appelle dans sa transaction. |

**Ce que l'appli remplit :**
- `src/config/acces.ts` : `ACTIONS`, une ligne par module ou par brique ; `ROLES` ;
  `ROLE_PAR_DEFAUT`, jamais un rôle d'administration ; `ROLE_ADMIN`, le rôle du
  premier admin ; `DROITS satisfies Droits`.
- `src/config/comptes.ts` :
  - `METHODES`, les méthodes proposées (`"lien-email"` pour une appli grand
    public seulement : voir « La connexion par lien envoyé par e-mail ») ;
  - `ENTREE`, qui entre (adresses et domaines, et `ouverte` pour un outil
    ouvert à toute adresse) ;
  - `DOMAINES_GOOGLE_WORKSPACE`, le ou les Workspace dont la connexion avec Google
    accepte les comptes. Vide, elle accepte tout compte dont Google fait autorité ;
  - `ANNUAIRES_MICROSOFT`, `"un-seul"` (l'annuaire du client, `MICROSOFT_TENANT_ID`,
    le défaut) ou `"tous"` (tout annuaire, et les comptes personnels si
    l'enregistrement de l'application les accepte) ;
  - `LIMITES_PAR_RESEAU`, `{ demandesParHeure, codesFauxParHeure }` : les limites par
    adresse IP de la connexion par code ou lien, sur une heure (« Un réseau entier
    compte pour une adresse », plus haut). `{ 20, 30 }` par défaut ; des entiers d'au
    moins 1, sans quoi l'appli refuse de démarrer. Les limites par adresse e-mail ne
    se règlent pas. `envoisParHeure`, facultatif, y règle le plafond de toute l'appli
    (300 sans lui), à relever pour une appli grand public.
- `src/config/effets-comptes.ts` : `EFFETS_COMPTES`, une entrée par unité qui
  réagit à un compte désactivé, réactivé ou effacé (le journal d'audit et les
  espaces, si l'appli les a, y sont déjà).

**Interne** : `UTILISATEURS_DEMO`, `entrerEnDemo`, `demoProposee`,
`lireSession`, `lireSessionDe`, `trouverUtilisateur`, `fermerLesSessionsDe`,
`roleEffectif`, `origineDuCompte`, `seraitAdmis`, `COLONNES_ENTREE`,
`enBaseDe`, `estAdresseDeDemo`, `domaineDe`, l'ensemble de `jeton.ts`,
`code-email.ts`, `lien-email.ts`, `google.ts`, `microsoft.ts` et `parcours.ts`,
les routes de Google et de Microsoft, la page du lien, les actions
(`actions.ts`), `FormulaireCode` et `FormulaireLien`.

**Règle d'entretien.** Tout changement d'interface publique (symbole ajouté,
retiré ou renommé, signature modifiée) met à jour cette section. Il ajoute
aussi une entrée **en fin** de [`CHANGELOG.md`](CHANGELOG.md), dans la pull
request qui le fait : date, ce qui change pour l'appelant, raison.

## La brancher

Dans une page ou une server action d'un module, en première ligne :

```ts
import { exiger } from "@/briques/comptes/roles";

export default async function PageContrats() {
  await exiger("contrats.acceder");
  // …
}
```

Le module déclare ses actions dans son fichier de domaine, sans parler de
rôles (`export const ACTIONS_CONTRATS = ["contrats.acceder"] as const;`).
`src/config/acces.ts` les ajoute à `ACTIONS` et dit qui y a droit dans
`DROITS`. Masquer une entrée de menu ne protège rien : la page garde son
`exiger`.

Une méthode de connexion, une fois l'identité vérifiée :

```ts
const compte = await admettre(email);
if (!compte) return { erreur: "Cette adresse n'a pas accès à l'appli." };
await ouvrirSession(compte);
redirect(cheminDeRetour(retour));
```

## Ce qu'on configure

| Variable | Valeur | Sans elle |
| --- | --- | --- |
| `AUTH_SECRET` | 32 caractères au moins, aléatoires, propres à chaque appli et à chaque environnement. **Secret** : généré par l'hébergeur (`render.yaml`), dans `.env.local` en local, jamais dans le dépôt. | Toute connexion échoue, et le proxy refuse tout cookie, en nommant la variable. |
| `GOOGLE_CLIENT_ID` | L'ID client OAuth de l'appli, créé dans la console Google Cloud du client (voir « La connexion avec Google »). Seulement avec `"google"` dans `METHODES`. | La carte Google de `/connexion` dit qu'elle manque. Les autres méthodes restent là. |
| `GOOGLE_CLIENT_SECRET` | Son secret. **Secret** : saisi à la main chez l'hébergeur (`sync: false`), dans `.env.local` en local, jamais dans le dépôt. | Comme pour `GOOGLE_CLIENT_ID`. |
| `MICROSOFT_CLIENT_ID` | L'ID d'application (client) de l'enregistrement fait dans le portail Azure (voir « La connexion avec Microsoft »). Seulement avec `"microsoft"` dans `METHODES`. | La carte Microsoft de `/connexion` dit qu'elle est à renseigner. Les autres méthodes restent là. |
| `MICROSOFT_CLIENT_SECRET` | Sa valeur de secret client. **Secret** : saisi à la main chez l'hébergeur (`sync: false`), dans `.env.local` en local, jamais dans le dépôt. Expire (24 mois au plus). | Comme pour `MICROSOFT_CLIENT_ID`. |
| `MICROSOFT_TENANT_ID` | L'ID de l'annuaire (tenant) du client, un GUID. Seulement avec `ANNUAIRES_MICROSOFT = "un-seul"`. | Comme pour `MICROSOFT_CLIENT_ID` ; un nom de domaine compte pour absent. |
| `URL_PUBLIQUE` | L'adresse publique du site, en `https` et sans chemin, la variable du socle (`src/lib/referencement.ts`). Avec `"lien-email"` dans `METHODES`, l'adresse où mène le lien du mail, en production. | En production, la carte du lien de `/connexion` dit qu'elle manque, et aucun lien ne part. Hors production, l'hôte de la requête. |
| `COMPTES_PREMIER_ADMIN` | L'adresse du premier admin. Elle ne sert qu'au premier démarrage : une fois un admin passé, elle n'en refait pas. | Personne n'entre en `ROLE_ADMIN` sans être listé dans `src/config/comptes.ts`. |
| `IP_EN_TETE_CLIENT` | L'en-tête où le proxy de l'hébergeur pose l'adresse du visiteur (`src/lib/adresse-ip.ts`) ; Render : `cf-connecting-ip`, déjà dans `render.yaml`. **Obligatoire en production.** | En production, le proxy répond en erreur à toute requête, `/sante` comprise. Hors production, l'adresse vaut `"local"`. |

La connexion par code, comme celle par lien, envoie par la brique mails : ses variables
(`MAILS_FOURNISSEUR`, `MAILS_EXPEDITEUR`, `RESEND_API_KEY`) sont à régler chez
l'hébergeur, voir son README. L'en-tête de l'adresse IP : voir « La connexion
par code envoyé par e-mail ».

En local, générer le secret sous PowerShell, puis le copier dans `.env.local` :

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Décision : une session maison plutôt qu'Auth.js

Décision prise le 2026-10-22 par la personne responsable du projet, à la
validation du plan de la brique, qui disait « Auth.js ». La brique
implémente la session elle-même, sans paquet :
- un jeton aléatoire d'au moins 128 bits, dont seul le hachage est stocké en
  base ;
- un cookie `HttpOnly`, `SameSite=Lax`, et `Secure` en production ;
- une signature vérifiée avant tout usage du jeton ;
- un rôle relu en base à chaque requête.

Pourquoi pas Auth.js :

- La v5 est toujours en bêta (`5.0.0-beta.32` en juillet 2026). Le projet ne
  reçoit plus que des correctifs de sécurité, d'après l'équipe de Better Auth
  et des sources secondaires.
- Son adaptateur Postgres prend un `Pool` de `pg`, ce qui contredit « seul
  `src/lib/db/client.ts` importe `pg` ». Son schéma (`"emailVerified"`,
  `"userId"`) n'est pas le nôtre.
- Le code par e-mail et la démo y seraient des « Credentials », qui imposent
  une session JWT sans session en base. Un compte désactivé garderait un
  jeton valide jusqu'à son expiration.
- Il ajoute une dizaine de paquets à l'audit des dépendances.
- Son vrai apport est OAuth. La connexion avec Google prend
  `oauth4webapi` seul, ce qu'Auth.js utilise lui-même. Il n'a aucune dépendance
  et il est certifié OpenID. Écartés pour Google :
  - `openid-client`, qui ajoute `jose` ;
  - `arctic`, qui a trois dépendances et ne vérifie pas l'ID token ;
  - un client écrit à la main, dont les règles de validation de l'ID token
    seraient les nôtres.

Écartée aussi : Better Auth. Il gère son schéma par sa propre CLI, en dehors de
`src/lib/db/migrations.ts`, et accède à la base par son propre pilote.

## Pas encore là

- Une forme commune à `google.ts` et `microsoft.ts` : ils partagent le parcours
  (`parcours.ts`), mais chacun garde ses petites fonctions (redirection, nature d'un
  refus). À mettre en commun si une troisième méthode par fournisseur arrive.
