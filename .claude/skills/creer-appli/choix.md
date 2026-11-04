# Ce que l'assembleur sait donner

Chargé par `SKILL.md` à l'étape 2. Ce fichier est un **résumé daté** : la vérité est dans
`outils/modules.mjs` (qui existe, ce qu'il exige) et dans la section « Interface
publique » du `README.md` de chaque brique (ce qu'une appli peut importer). Les relire
avant de proposer un choix ; si un écart apparaît, croire le code, le dire, et corriger ce
fichier dans une PR à part.

Le résumé, arrêté au 2026-11-03, couvre le socle, la brique données, les briques `mails`,
`comptes`, `rgpd`, `gestion-comptes`, `espaces`, `journal`, `contact`, `notifications`, `echeances`,
`calendrier`, `validation`, `import-lot` et `deploiement`, les dépendances entre briques et
le site vitrine.

## Le catalogue : un socle et des briques

Le catalogue ne porte aucun écran métier : pas de suivi de contrats, de maintenance ni
d'achats tout faits. Une appli client s'assemble en choisissant ses briques ; son module
métier (ses entités, leurs fiches en lecture seule, leurs formulaires, leur couche données)
s'écrit ensuite dans l'appli, par tickets, en copiant le patron `dossiers` (`CLAUDE.md`
§3). Les briques qui lisent la base sans se brancher sur le socle arrivent donc **à
brancher** sur ce module.

- **La base** (brique `donnees` : `src/lib/db/`, migrations, couche données du patron
  `dossiers`, squelette des scripts de données) n'est pas au choix : l'assembleur la garde
  dès qu'une brique gardée l'exige, et la retire sinon. Les écrans du patron `dossiers` ne
  viennent qu'avec `comptes` : ils appellent `exiger`.
- **Le site vitrine** : aucune brique qui lit la base ; au plus `mails`, `deploiement`, et
  `contact` avec `mails`. Sans `contact`, il ne garde que le socle : pas de base, pas de
  connexion, `src/proxy.ts` réduit à la CSP. Ses pages sont rendues à chaque requête, sans
  page statique ni cache CDN du HTML : c'est le prix du nonce de la CSP (`SKILL.md`,
  étape 2). On peut y ajouter `mails` et `deploiement`, qui ne lisent pas la base. Un
  formulaire de contact (`contact`, avec `mails`) garde la base : le site reste sans
  connexion, mais n'est plus sans base.
- **L'accueil** de toute appli assemblée est une carte « Page d'accueil à écrire »
  (`src/app/page.tsx`) : le premier écran se décide avec le client, l'assembleur n'en
  invente pas.
- Une entité du client (ce qu'il suit : contrats, équipements, demandes, autre chose)
  **ne s'obtient pas par l'assembleur**. Elle se construit après coup, par tickets, en
  copiant le patron `dossiers` ; la blueprint la décrit comme l'appli l'aura, avec son
  ticket.

## Les briques (`--briques`)

Une brique est un composant générique, sans connaissance du métier : l'appli la branche
sur une de ses entités. Certaines arrivent branchées sur le socle (pages, droits, menu) ;
les autres sont **installées mais pas branchées** tant que le module métier de l'appli ne
les appelle pas.

| Brique | Ce qu'elle apporte | Interface publique (voir le README de la brique) |
| --- | --- | --- |
| `echeances` | Vue « À venir » et compteur pour l'accueil (`TuileEcheances`) : statuts en alerte et échue sur une date, délai réglé au branchement. Arrive à brancher sur une entité datée de l'appli | `branchement.ts`, `requete.ts`, `VueAVenir.tsx`, `TuileEcheances.tsx`, `calcul.ts` |
| `calendrier` | Les événements d'une entité datée sur un mois (grille sur ordinateur, cartes sur téléphone). Arrive à brancher | `branchement.ts`, `requete.ts`, `calcul.ts`, `VueCalendrier.tsx` |
| `validation` | Une file de propositions qu'une personne habilitée accepte ou refuse, décision tracée, en lot. Arrive à brancher : l'appli écrit la liaison, la page de file et ses gardes. Qui peut décider une proposition qu'il a lui-même saisie se décide au cadrage (`SKILL.md`, étape 1) | `branchement.ts`, `propositions.ts`, `cycle.ts`, `donnees-personnelles.ts` |
| `import-lot` | Un Excel ou un CSV devient un lot à valider, confirmé ou ignoré ; elle fournit ses écrans, l'appli garde son branchement, ses droits et des pages qui les appellent. Arrive à brancher | `branchement.ts`, `types.ts`, `lot.ts`, `lecture.ts`, `validation.ts`, `gestes.ts`, `envoi.ts`, `presentation.ts`, `EcranImporter.tsx`, `EcranLot.tsx`, `ActionsLot.tsx`, `donnees-personnelles.ts` |
| `mails` | L'envoi d'e-mails transactionnels (Resend, seul fournisseur réel écrit ; un autre s'écrit sur son modèle, README, section « Resend ») ; appelée par `comptes` (code de connexion), par `contact` et par `notifications`, donc exigée dès que l'une d'elles est gardée ; l'appli branche ses autres envois. Sans base : se garde aussi seule | `envoi.ts`, `confidentialite.ts` |
| `notifications` | Prévenir par e-mail à jour fixe : l'appli fabrique un récapitulatif (qui prévenir, de quoi) par une liaison, la brique l'envoie par la brique mails depuis une route qu'une tâche planifiée appelle chaque jour, protégée par `NOTIFICATIONS_SECRET`. Modes à blanc et essai (adresses permises dans `NOTIFICATIONS_ADRESSES_ESSAI`), un seul envoi réel par jour, journal des envois purgé au-delà de 12 mois. Ne connaît pas `echeances` : la liaison applique ses règles de calcul. Exige `mails` et la base ; se garde seule, et arrive **à brancher** sur le module métier de l'appli (liaison, route, tâche planifiée : son README, « La brancher »). Gestes humains avant le premier envoi réel dans son README | `envoi.ts`, `jour.ts`, `route.ts`, `confidentialite.ts`, `donnees-personnelles.ts` |
| `contact` | Le formulaire de contact public d'une vitrine (`/contact`) : envoi par la brique mails vers `CONTACT_DESTINATAIRE`, champ piège, délai minimal et limite par adresse IP en base, sans captcha. Exige `mails` ; se garde sans `comptes`, avec la base ; arrive branchée. Geste humain au premier déploiement dans son README | `FormulaireContact.tsx`, `filtres.ts`, `contact.ts`, `confidentialite.ts` |
| `rgpd` | L'export des données d'une personne en JSON : `/mes-donnees` pour la personne connectée, `/donnees-personnelles` pour l'admin et une adresse donnée (compte désactivé, personne sans compte). Leur effacement ou anonymisation, sur demande, par l'admin seul sur `/donnees-personnelles`. Le registre `src/config/donnees-personnelles.ts` déclare chaque table de la base (verrou) : chaque entité que l'appli écrit s'y déclare. Exige `comptes` ; arrive branchée. **Gardée d'office avec `comptes`** (l'assembleur l'ajoute et le dit) : une appli à comptes doit pouvoir répondre à une demande d'accès ou d'effacement. Purge les données au terme de la durée que chaque brique déclare (`scripts/purger-donnees.ts`, dry-run par défaut), trace l'export de l'admin au journal quand l'appli l'a, et porte les gabarits hors code (registre des traitements, sous-traitance, hébergement dans l'UE) | `export.ts`, `effacement.ts`, `origine.ts`, `actions.ts`, `purge.ts`, `gabarits/`, `scripts/purger-donnees.ts` |
| `deploiement` | La mise en ligne après la CI (job `deployer` de `ci.yml`, adaptateur Render `render.yaml`), avec une seule constante dans l'appli (le lieu de l'hébergeur, pour la politique de confidentialité). Render est l'hébergeur par défaut, pas une obligation : ailleurs, l'adaptateur seul se remplace (README, « Déployer ailleurs »). Sans base : se garde aussi seule. Gestes humains dans son README | Des noms (`DEPLOIEMENT_URL`, `DEPLOIEMENT_DECLENCHEUR`, `COMMIT_DEPLOYE`) et `LIEUX_DEPLOIEMENT` (`confidentialite.ts`) |
| `journal` | Le journal d'audit : qui a créé, modifié ou supprimé quoi, et quand, écrit dans la transaction de l'écriture, sans valeur de champ ; écran `/journal` et historique de fiche réservés à `journal.consulter` (l'admin). Branchée sur le patron `dossiers` et, avec `gestion-comptes`, sur les gestes de `/comptes` ; le module métier de l'appli s'y branche au besoin (README, « La brancher »). Exige `comptes` (donc `mails`). Conservation 12 mois, purge par la brique RGPD | `journal.ts`, `evenements.ts`, `TableauJournal.tsx`, `HistoriqueFiche.tsx`, `confidentialite.ts`, `donnees-personnelles.ts` |
| `comptes` | La session en base, tout protégé par défaut (seules `/connexion`, `/sante`, `/mentions-legales`, `/confidentialite` et les adresses des robots sont ouvertes), la page `/connexion`, et les droits (`exiger`, `peut`, `visiblePour`) déclarés dans `src/config/acces.ts`. Qui entre se déclare dans `src/config/comptes.ts`. Méthodes : le code à 6 chiffres envoyé par e-mail (par défaut), Google (à ajouter à `METHODES` une fois l'application OAuth du client créée), Microsoft Entra ID (une fois l'application enregistrée dans le portail Azure ; un seul annuaire, celui du client, par défaut) et la démo, **refusée en production**. Exige `mails` ; fait garder `rgpd` d'office ; garde la base et les écrans du patron `dossiers` : c'est le départ de toute appli qui garde des données | `roles.ts`, `entree.ts`, `session.ts`, `retour.ts`, `protection.ts`, `code-email.ts`, `google.ts`, `microsoft.ts`, `parcours.ts`, `administration.ts`, `confidentialite.ts`, `donnees-personnelles.ts` |
| `gestion-comptes` | Le niveau 3 des droits : l'écran `/comptes`, où un admin invite une adresse, change un rôle, désactive ou réactive un compte et ouvre l'accès à un domaine, sans toucher à la configuration. À prendre quand le client gère lui-même ses utilisateurs ; sinon, les niveaux 1 et 2 (`src/config/acces.ts`, `src/config/comptes.ts`) suffisent. Exige `comptes` ; arrive branchée. Avec un seul rôle dans `ROLES`, toute personne connectée administre les comptes : la blueprint le dit | `EcranComptes.tsx`, `domaine.ts` |
| `espaces` | Des groupes de personnes (une coloc, une association, un club) : créer ou rejoindre un espace par un code, un lien ou une invitation par e-mail (plafonnée par espace et pour l'appli), rôles « gestionnaire » et « membre » renommables, dernier gestionnaire protégé, écrans « Créer ou rejoindre » et « Mon espace ». Surtout l'**isolation** : chaque module métier rattaché à un espace (colonne `espace_id`) lit et écrit par `exigerMonEspace()`, et un test-verrou refuse celui qui lirait sans lui. Un ou plusieurs espaces par compte et le vocabulaire se règlent dans `src/config/espaces.ts`. Exige `comptes` et `mails` ; arrive branchée, et le module métier s'y rattache (README, « La brancher »). Un module qui garde des données par membre (ordre de passage, demandes en attente) est prévenu de tout départ (parti, retiré, compte désactivé ou effacé) dans la transaction du geste, par un effet qu'il déclare dans `src/config/effets-espaces.ts`, plutôt que par un traitement à la lecture. L'invitation ne crée pas de compte : avec une entrée fermée, la blueprint dit comment l'adresse invitée est admise | `acces.ts`, `espaces.ts`, `invitations.ts`, `code.ts`, `reglages.ts`, `domaine.ts`, `EcranCreerOuRejoindre.tsx`, `EcranMonEspace.tsx`, `effets-comptes.ts`, `departs.ts`, `donnees-personnelles.ts`, `confidentialite.ts` |

- Une brique peut en **exiger une autre** (`exige` dans `outils/modules.mjs`) : la
  nommer aussi dans `--briques`, l'assembleur refuse sinon. Seule exception, `entraine` :
  `rgpd` est gardée d'office avec `comptes`, et la sortie le dit.
- Une brique **à brancher** ne sert à rien tant qu'un ticket ne l'a pas branchée sur le
  module métier de l'appli : le README de la brique, section « La brancher », dit comment.
  Ne l'ajouter que si le besoin du client la demande, et la noter dans la blueprint comme
  **à brancher** (section 3 du modèle), avec l'entité qu'elle attend et son ticket.
- Les évolutions des briques gardées arrivent après coup : `node outils/mettre-a-jour.mjs
  <appli>`, depuis le catalogue, reporte dans l'appli le catalogue d'un commit plus récent,
  sur une branche, en fusionnant avec ce qu'elle a retouché, et recopie à son rapport les
  entrées des `CHANGELOG.md` depuis le commit noté au manifeste de l'appli
  (`outils/mise-a-jour.md`). Les étapes de migration neuves s'ajoutent en fin de la liste
  de l'appli, après les siennes. `catalogue.empreintes.json` donne l'empreinte de chaque
  fichier reçu : le rapport de `--a-blanc` liste ce que l'appli a retouché ou supprimé.
  Ajouter ensuite une brique non choisie n'est pas encore outillé : le choix fait ici
  reste celui de l'appli.

## Ce qui ne dépend pas du choix

Toute appli assemblée garde : le kit `src/ui/` avec son thème de repli (la charte Solstice
Lab) et la signature Solstice Lab du pied de page (obligatoire pour une livraison Solstice
Lab, retirable par ticket sinon : `SKILL.md`, étape 1), la vitrine `/kit` (à remplacer par les
premiers écrans réels, voir `CLAUDE.md` et la skill `solstice-ui`), l'accueil « Page
d'accueil à écrire », la page
`/mentions-legales` et sa configuration `src/lib/mentions-legales.ts` (vide, statut « professionnel » d'office, à remplir), la
page `/confidentialite` et sa configuration `src/lib/confidentialite.ts` (les traitements des
briques gardées y sont décrits, les choix du responsable sont vides, à remplir), le
référencement (`src/lib/referencement.ts`, `robots.ts`, `sitemap.ts`, image de partage),
fermé aux moteurs par défaut, les
skills et agents du harnais, les gardes de Claude. Avec une brique qui lit la base, elle
garde aussi la brique données : la base et ses migrations, la couche données du patron
`dossiers` (ses écrans avec `comptes`), le squelette des scripts de données
(`scripts/lib/cli.ts`), la skill `solstice-donnees` et l'agent `relecteur-migrations`. Elle
ne reçoit ni le `README.md`, ni `outils/` du catalogue, ni la skill `creer-appli`, ni
l'agent `relecteur-blueprint`.
