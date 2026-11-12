# Les briques : table complète

Référence des briques que l'assembleur sait livrer, avec ce que chacune exige
et où elle se branche. Le [README](../../README.md) en donne la liste courte.
Il est propre au catalogue : une appli assemblée ne le reçoit pas.

## Les briques

Ce sont exactement celles que l'assembleur sait livrer (`BRIQUES` de
`outils/modules.mjs`, que `node outils/assembler.mjs --aide` énumère).

| Brique | Ce qu'elle fait | Exige | Se branche sur |
| --- | --- | --- | --- |
| `echeances` | Statuts des échéances d'une entité datée, vue « À venir » et tuile d'accueil | la base | une entité de l'appli, à brancher |
| `calendrier` | Les événements d'une entité datée sur un mois : grille sur ordinateur, cartes sur téléphone | la base | une entité de l'appli, à brancher |
| `validation` | Une file de propositions acceptées ou refusées, décision tracée et en lot | la base | une entité de l'appli, à brancher |
| `import-lot` | Un Excel ou un CSV devient un lot à valider, confirmé tout ou rien ou ignoré ; fournit ses écrans, l'appli garde son branchement, ses droits et les pages qui les appellent | la base | une entité de l'appli, à brancher |
| `mails` | L'envoi d'e-mails transactionnels par Resend, sans base ni session ; console en local, capture en test, rien ne part sans réglage explicite | — | le socle |
| `deploiement` | La mise en ligne après la CI : job `deployer` qui déclenche le commit vérifié et l'attend sur `/sante` ; adaptateur Render (`render.yaml`) remplaçable seul | — | la CI |
| `notifications` | Prévenir par e-mail à jour fixe : un récapitulatif fabriqué par l'appli, envoyé par `mails` depuis une route qu'une tâche planifiée appelle chaque jour, protégée par un secret ; modes à blanc et essai, journal des envois purgé au-delà de 12 mois. Ne connaît pas `echeances` : l'appli fait le lien | la base, `mails` | une entité de l'appli, à brancher |
| `contact` | Le formulaire de contact public (`/contact`) : envoi par `mails`, champ piège, délai minimal et limite par adresse IP en base, sans captcha | la base, `mails` | le socle |
| `comptes` | Session en base, tout protégé par défaut, page `/connexion`, droits (`exiger`, `peut`, `visiblePour`) ; connexion par code à 6 chiffres envoyé par e-mail (par défaut), par lien envoyé par e-mail (applis grand public), avec Google ou avec Microsoft (Entra ID) ; la démo est une méthode, refusée en production | la base, `mails` | le socle |
| `rgpd` | L'export des données d'une personne en JSON, par elle-même (`/mes-donnees`) ou par l'admin (`/donnees-personnelles`), et leur effacement ou anonymisation, par l'admin seul (`/donnees-personnelles`) ; chaque table se déclare dans `src/config/donnees-personnelles.ts` ; la purge des données au terme de la durée que chaque brique déclare (`scripts/purger-donnees.ts`, et au passage), la trace de l'export de l'admin au journal, et les gabarits hors code (registre des traitements, sous-traitance, hébergement dans l'UE) | la base, `comptes` | le socle |
| `journal` | Le journal d'audit : qui a créé, modifié ou supprimé quoi, et quand, dans la transaction de l'écriture, sans valeur de champ ; écran `/journal` et historique de fiche pour l'admin ; branché, avec `gestion-comptes`, sur les gestes de `/comptes`, et au catalogue sur le patron `dossiers` | la base, `comptes` | le module métier de l'appli, sur le modèle du patron `dossiers` |
| `gestion-comptes` | L'écran `/comptes`, où un admin invite, change un rôle, désactive ou réactive un compte et ouvre un domaine ; le dernier admin actif y est protégé | la base, `comptes` | le socle |
| `espaces` | Des groupes de personnes (une coloc, une association) qu'on crée ou rejoint par un code, un lien ou une invitation par e-mail plafonnée ; rôles d'espace, dernier gestionnaire protégé, écrans « Créer ou rejoindre » et « Mon espace ». L'accès unique `exigerMonEspace()` isole les fiches de chaque espace, et un test-verrou refuse un module qui lirait sans lui | la base, `comptes`, `mails` | le socle, puis le module métier |

La base (brique données, `src/lib/db/`) ne se choisit pas : l'assembleur la
garde dès qu'une brique gardée l'exige. Une brique qui en exige
une autre ne se garde pas sans elle : l'assembleur refuse l'appel en nommant
la brique à ajouter, sans jamais l'ajouter en silence. Seule exception, déclarée
dans `outils/modules.mjs` (`entraine`) : `rgpd` est gardée d'office avec
`comptes`, car une appli à comptes doit pouvoir répondre à une demande d'accès
ou d'effacement ; l'assembleur le dit dans sa sortie et dans le premier commit
de l'appli. Une brique n'importe une autre brique que si elle l'exige :
`tests/assembleur.test.ts` le verrouille. « À brancher » : la brique arrive
installée, sans branchement ; l'appli la branche sur l'entité de son module
métier en suivant la section « La brancher » de son README, qui porte un
exemple complet.

## Le module métier

Le catalogue ne livre aucun module métier : les entités du client (ses
contrats, ses équipements, ses demandes…) s'écrivent dans l'appli assemblée, en
copiant le patron `dossiers` (`src/app/dossiers/`, règles dans `CLAUDE.md` §3),
puis les briques à brancher s'y branchent. Trois modules de test ont vécu dans
le catalogue le temps d'éprouver les briques ; ils l'ont quitté avant sa
publication, et ne manquent à aucune brique, dont les tests tiennent sur leurs
propres tables.
