# Registre des cicatrices

Une **cicatrice** est une leçon payée sur un projet antérieur de l'équipe : un
incident, un correctif ou une recette ratée dont on a tiré une règle. Le
catalogue est né de ces leçons. Ce registre en garde la règle et le cas, sans
nom de client, d'appli, de prestataire ni de personne. Les sources (l'inventaire
des applis déjà livrées, les journaux du prototype) restent hors de ce dépôt.

Chaque ligne donne :

- **la règle**, ce qu'on fait désormais ;
- **le cas**, ce qui s'est passé (ou, quand les archives ne détaillent pas
  l'incident, d'où vient la règle) ;
- **ce qui la tient** dans le catalogue : un test (fichier et ligne de son
  intitulé), une skill, une ligne du `CLAUDE.md`, une garde de Claude, ou un
  fichier de configuration commenté. « **En partie** » dit ce qui manque.
  « **Non tenue** » : rien ne la tient encore, c'est une invitation à ouvrir un
  ticket.

Les numéros de ligne sont ceux du jour où la ligne a été écrite. Une règle
« tenue » par une brique, un module ou la brique données ne vaut que dans
une appli qui les a gardés.

Avant de cadrer une brique ou un module, relire les domaines qu'il touche.

## 1. Données et migrations

| N° | Règle | Cas | Tenue par |
| --- | --- | --- | --- |
| D1 | Un `CREATE TABLE` fusionné ne se retouche plus. Une colonne ajoutée après coup naît dans une étape de migration, et son index dans la même étape. | Un index posé dans le schéma initial visait une colonne née en migration. Sur une base ancienne, le schéma passe avant les migrations : l'initialisation a échoué et toute l'application est tombée. | `CLAUDE.md:53` ; `solstice-donnees` (`SKILL.md:38`, `:45`) ; agent `relecteur-migrations` (`:32`) ; `tests/migrations.test.ts:17` |
| D2 | Une étape de migration est idempotente, ajoutée en fin de liste, rejouée à chaque démarrage, sans table de suivi. | Sur un projet antérieur, une fonction de migration unique avait enflé jusqu'à près de 700 lignes. L'idempotence, elle, a traversé tous les incidents, quand une table de suivi aurait été un état de plus qui peut mentir. | `src/lib/db/migrations.ts:6` ; `tests/migrations.test.ts:5` ; `relecteur-migrations` |
| D3 | Un échec d'initialisation de la base ne se garde jamais en mémoire : la requête suivante retente. | Une promesse d'initialisation rejetée restait mémorisée : après un incident passager de la base, toutes les requêtes échouaient jusqu'au redémarrage. | **En partie** : `src/lib/db/client.ts:116` et `solstice-donnees` (`SKILL.md:16`) ; `tests/client-pool.test.ts:40` couvre une variable absente, aucun test ne couvre un échec d'initialisation |
| D4 | Le SQL se relit tel qu'il part, pas tel qu'il s'écrit dans le code. | Une expression régulière écrite dans une chaîne a perdu son antislash : la base a reçu `'s+'` au lieu de `'\s+'`, et un index d'unicité était faux en production. | `solstice-donnees` (`SKILL.md:64`) ; `relecteur-migrations` (`:40`) |
| D5 | Aucune donnée de référence (comptes, rôles, catégories) n'est semée par une étape rejouée. | Une catégorie supprimée par un administrateur réapparaissait à chaque redémarrage, recréée par le semis. | `solstice-donnees` (`SKILL.md:56`) ; `relecteur-migrations` (`:42`) |
| D6 | Un semis « si la table est vide » ne rattrape pas une table ajoutée ensuite. | La table de chiffre d'affaires d'un mode démonstration, ajoutée après le premier semis, est restée vide en production. | `solstice-donnees` (`SKILL.md:60`) |
| D7 | Une suppression en cascade se juge sur tout ce qu'elle emporte : lister chaque table qui référence la ligne. | La fusion de deux fiches de contact a détruit leurs documents joints, liés par une clé étrangère en cascade. | `solstice-donnees` (`SKILL.md:67`) ; `relecteur-migrations` (`:46`) ; suppressions refusées par la base, par exemple `tests/migrations.test.ts:33` |
| D8 | Un index unique ne se pose pas sur une table qui contient déjà des doublons : l'étape les cherche, n'écrit rien et les signale. | Relevé dans une appli livrée, avant tout incident : posé sur une table de production qui en contenait, l'index aurait fait échouer chaque démarrage. | `solstice-donnees` (`SKILL.md:52`) ; `relecteur-migrations` (`:34`) |
| D9 | Deux valeurs vides ne se heurtent pas dans un index unique : `NULLS NOT DISTINCT`, ou deux index partiels avant PostgreSQL 15. | Dans un arbre de catégories, deux racines de même nom (parent vide) ne se heurtaient pas dans l'index d'unicité : il a fallu deux index partiels. | **Non tenue** |
| D10 | Tout statut que le code peut écrire est admis par la contrainte de la base, et la base n'en admet pas d'autre. | Le code écrivait un verdict que la contrainte `CHECK` de sa table refusait : relevé à la lecture du code, toute écriture de ce verdict devait échouer. | `solstice-donnees` (`SKILL.md:73`) ; `relecteur-migrations` (`:36`) ; pour la brique validation, `tests/validation.test.ts:568` (seul test : la règle générale se tient par la relecture) |
| D11 | Une valeur dérivée se recalcule côté serveur après l'écriture, jamais lue depuis le formulaire. | Un montant affiché en lecture seule était quand même renvoyé par le formulaire : sa valeur périmée écrasait la somme des montants mensuels. | `solstice-donnees` (`SKILL.md:106`) |
| D12 | Un rattrapage de données n'invente rien. | Des fiches anciennes sans créateur connu sont restées sans créateur, plutôt que d'en recevoir un choisi au hasard. | `solstice-donnees` (`SKILL.md:59`) |
| D13 | Les tests tournent sur le même moteur de base, à la même version, que la production. | Le tri des valeurs vides différait entre deux moteurs de base ; il a fallu un ordre explicite (`NULLS LAST`). | `solstice-nouvelle-appli` (`socle.md:87`) ; `tests/deploiement.test.ts:227` |

## 2. Tests et bases locales

| N° | Règle | Cas | Tenue par |
| --- | --- | --- | --- |
| T1 | Les tests refusent toute base hors de la machine locale. | Le fichier d'environnement local portait l'adresse de la base de production, et seule une consigne empêchait les tests d'y écrire. | `vitest.config.ts:8` ; `CLAUDE.md:63` |
| T2 | Les tests refusent une base dont le nom ne finit pas par `_test` ou `_test_<n>`. | Un `npm test` lancé sur la base de développement, locale elle aussi, a effacé le compte administrateur. | `vitest.config.ts:46` ; `tests/bases-locales.test.ts:53` ; `CLAUDE.md:65` |
| T3 | Les fichiers de tests qui touchent la base tournent en série. | Deux fichiers en parallèle jouaient deux migrations en même temps sur la même base : suite instable, toujours verte en série. | `vitest.config.ts:68` |
| T4 | La base visée par une commande de données se choisit à l'invocation, et le script la nomme en première ligne. Aucun script npm ne fige le fichier d'environnement. | Le fichier d'environnement local d'un projet antérieur portait l'adresse de la production : une commande qui le lit d'office vise la production sans le dire. | `CLAUDE.md:69` ; `solstice-donnees` (`SKILL.md:148`) ; `tests/cli-base-visee.test.ts:118` |
| T5 | Un test-verrou prouve sa propre sensibilité sur un cas fautif. | Un test des gardes d'accès qui ne trouvait aucun fichier à lire passait au vert. | `solstice-livrer` (`SKILL.md:35`) ; `tests/gardes-acces.test.ts:166`, `:183` ; `tests/comptes-proxy.test.ts:62` |

## 3. Import de fichiers

| N° | Règle | Cas | Tenue par |
| --- | --- | --- | --- |
| I1 | Une date ambiguë se lit selon le format réglé pour la source, jamais devinée. | Un import réel a lu jour et mois à l'envers. | `tests/import-lot-dates.test.ts:5` |
| I2 | Une colonne qui contient déjà le total est lue telle quelle, jamais recalculée. | Une colonne d'engagement d'un réseau social contenait déjà le total ; le recalculer divergeait de la source. | `tests/import-lot-validation.test.ts:38` |
| I3 | Une ligne mal typée ou sans clé est écartée avec son numéro, jamais perdue en silence. | Deux formats d'import d'une même appli traitaient chacun à sa façon une ligne mal typée ; la règle commune retenue : jamais perdue en silence. | `tests/import-lot-validation.test.ts:43` |
| I4 | Un fichier se reconnaît à son contenu, pas à son extension. | Les exports d'un réseau social arrivaient en `.xls` ou en `.xlsx`, sans que l'extension dise lequel lire : il a fallu reconnaître le format au contenu. | `tests/import-lot.test.ts:202` |
| I5 | Un lot de plusieurs centaines de lignes se confirme sans erreur. | Au-delà d'environ 90 lignes, la confirmation tombait sur une erreur brute : le formulaire dépassait la limite de champs du framework. | `tests/import-lot.test.ts:144` |
| I6 | Un échec au milieu d'une confirmation ne laisse aucun état partiel. | Avec l'erreur de I5, une confirmation interrompue pouvait laisser le lot à moitié écrit : elle est devenue une seule transaction. | `tests/import-lot.test.ts:167` |
| I7 | Tout le fichier est validé avant la première écriture. | Règle des imports de grand livre et d'absences d'un projet antérieur : un fichier lu à moitié n'écrit rien. | `tests/import-lot.test.ts:91` |
| I8 | Confirmer deux fois le même lot ne crée rien et ne plante pas. | Une page périmée soumise deux fois fabriquait un élément vierge et une erreur d'intégrité. | `tests/import-lot.test.ts:183` |
| I9 | Supprimer un lot ne touche aucune ligne d'un autre lot. | Supprimer un lot marqué « doublon » effaçait les données d'un autre lot ; la couverture repassait à « manquant » et le rapport mensuel devenait faux. | `tests/import-lot.test.ts:275` |
| I10 | Un réimport met à jour en place et garde la trace du lot précédent. | Pour qu'un lot puisse s'afficher « doublon », un réimport devait garder la trace du lot précédent au lieu de la remplacer. | `tests/import-lot.test.ts:292` |
| I11 | Un champ de décision vide bloque la confirmation, jamais rempli par défaut. | Une case « payant / non payant » laissée vide ne devait jamais devenir « non payant ». | `tests/import-lot.test.ts:307` |
| I12 | Un identifiant à zéros de tête reste du texte. | Un export réenregistré par un tableur perdait les zéros de tête des matricules. | `solstice-donnees` (`SKILL.md:174`) ; `tests/import-lot-lecture.test.ts:43` ; `tests/import-lot-validation.test.ts:94` |
| I13 | Une date devenue nombre de série par un tableur se relit comme une date. | Le même tableur convertissait les dates écrites en texte en nombres. | `solstice-donnees` (`SKILL.md:177`) ; `tests/import-lot-dates.test.ts:35` |
| I14 | Une cellule de date vide devient une date absente ; la ligne n'est pas rejetée. | Une chaîne vide dans une colonne de date faisait rejeter toute la ligne. | `solstice-donnees` (`SKILL.md:179`) ; `tests/import-lot-dates.test.ts:51` |
| I15 | Les clés de rapprochement se normalisent (casse, espaces). | « AB13 » et « AB 13 » donnaient deux lignes au lieu d'une à chaque resynchronisation. | `solstice-donnees` (`SKILL.md:185`) |
| I16 | Deux clés que la normalisation rapproche sont fusionnées avant l'écriture. | Deux adresses qui ne différaient que par une barre oblique finale sont entrées en collision de clé primaire : un lot de six mois a été perdu. | `tests/import-lot-validation.test.ts:107` ; `tests/import-lot.test.ts:390` |
| I17 | Une ligne qui renvoie à une autre du même lot s'écrit après elle. | Un renvoi inséré avant son original violait une clé étrangère sur la même table : la table est restée vide depuis le début. | `tests/import-lot-validation.test.ts:147` ; `tests/import-lot.test.ts:380` |
| I18 | Sans clé de dédoublonnage, deux lignes identiques sont deux lignes. | Dans un export de paie, deux lignes identiques étaient deux demi-journées ; les fondre en perdait une. | `tests/import-lot-validation.test.ts:129` |
| I19 | Un import qui remplace une période lit tout ou rien, et n'efface qu'une fois tout prêt. | L'import mensuel des absences effaçait puis réécrivait le mois : il doit avoir lu tout le fichier avant d'effacer. | `tests/import-lot.test.ts:336` |
| I20 | Un lot sans ligne retenue ne se confirme pas, il s'ignore ; « en attente » prime sur « décidé ». | Un lot entièrement ignoré s'affichait « confirmé ». | `tests/import-lot.test.ts:268` ; `tests/validation-cycle.test.ts:8`, `:14` |
| I21 | Un montant illisible est refusé : la ligne est écartée avec son motif, jamais absorbée. | Un coût dont le montant ne se lisait pas était absorbé en silence : un coût faux. | `src/briques/import-lot/validation.ts:178` ; `tests/import-lot-validation.test.ts:53` (nombre ambigu refusé) |
| I22 | Deux lignes de même clé dans un import se somment ou se rejettent, jamais l'une n'écrase l'autre. | Une collision de codes a écrasé en silence plusieurs centaines de milliers d'euros de chiffre d'affaires. | **En partie** : `solstice-donnees` (`SKILL.md:182`), aucun test |
| I23 | Un import se réconcilie sur les totaux métier, pas sur le nombre de lignes. | Environ 150 lignes d'écart sur 4 500, pour un total de jours intact : un dédoublonnage normal. | `solstice-donnees` (`SKILL.md:187`) |
| I24 | Les pièces jointes du système source se téléchargent avant de planifier l'import. | Les adresses des pièces jointes d'un outil source expiraient avant l'import. | `solstice-donnees` (`SKILL.md:170`) |
| I25 | Un import en production attend le déploiement de la migration qui crée ses colonnes. | Vécu en production : un import visait des colonnes que la migration n'avait pas encore créées. | `solstice-donnees` (`SKILL.md:172`) |
| I26 | Un script de données tourne à blanc par défaut ; l'écriture se demande à la main, par un humain, après relecture du rapport. Une valeur pleine ne se dégrade jamais. | Les rattrapages de commissions, les colonnes ajoutées après coup et la casse des noms de comptes se sont corrigés par script en production. | `scripts/lib/cli.ts:7` ; `CLAUDE.md:66` ; garde `--confirmer` (`.claude/hooks/gardes.mjs:166`) ; `tests/import-fusion.test.ts:10` |

## 4. Sources externes et synchronisations

| N° | Règle | Cas | Tenue par |
| --- | --- | --- | --- |
| S1 | La référence d'un événement partagé entre plusieurs fiches inclut la fiche. | Une réunion à plusieurs contacts n'apparaissait que sur une fiche : l'unicité (source, référence) ignorait la fiche et avalait le doublon en silence. | **Non tenue** |
| S2 | Une lecture de source est bornée à la source, puis refiltrée à l'écriture. | Une invitation récurrente sans date de fin a produit plus de 1 200 lignes. | **Non tenue** |
| S3 | Un webhook répond d'abord, traite ensuite, avec une file persistante en filet. | La messagerie exigeait une réponse en 3 secondes ; le modèle d'IA en prenait 5 à 20. | **Non tenue** |
| S4 | La source qui fait foi est l'export complet, pas sa projection dans un message. | Des personnes absentes à leur rendez-vous, relayées par un message de chat, ont été importées comme prospects vivants. | **Non tenue** |
| S5 | Un événement se date du jour où il a eu lieu. | Un appel daté du rendez-vous futur qu'il fixait sortait le contact des relances. | **Non tenue** |
| S6 | On ne dédoublonne qu'en sachant ce que la répétition représente : la clé dépend de l'usage. | Une même source se dédoublonnait par adresse seule pour les fiches, par adresse et date pour l'entonnoir. | **En partie** : I18 (sans clé, rien n'est fusionné) |
| S7 | Un vrai zéro se distingue d'une mesure absente, et la fraîcheur d'une synchronisation ne compte que les passes réussies. | Règles des synchronisations quotidiennes d'un projet antérieur (audience d'un site, campagnes d'e-mailing) ; les archives ne détaillent pas l'incident. | **Non tenue** |
| S8 | Les ouvertures par les passerelles de sécurité des messageries ne sont pas des lectures. | Les robots qui ouvrent chaque lien d'un e-mail étaient comptés comme lecteurs ; la règle a dû être reconstituée, faute de règle publique. | **Non tenue** |
| S9 | Un script hébergé dans un autre environnement recopie ses règles à la main et signale une adresse périmée. | Une adresse périmée dans un script hébergé chez un tiers a arrêté toutes ses tâches, sans message. | **Non tenue** |

## 5. Rapprochement d'identité

| N° | Règle | Cas | Tenue par |
| --- | --- | --- | --- |
| R1 | Une identité d'un seul mot n'apparie rien ; une coquille et un préfixe sont deux règles distinctes, et plusieurs candidats donnent un choix humain, jamais une création. | Une fiche réduite à un prénom avait agrégé neuf adresses de neuf sociétés. | **Non tenue** |
| R2 | Une fiche « fourre-tout » est exclue de l'enrichissement automatique. | L'enrichissement a rempli la fiche fourre-tout avec les données d'autres sociétés. | **Non tenue** |

## 6. Circuit de validation

| N° | Règle | Cas | Tenue par |
| --- | --- | --- | --- |
| V1 | Un refus garde la clé : une nouvelle lecture de la source ne ressuscite pas la proposition. | Un rejet libérait la clé de dédoublonnage, et le passage suivant recréait la carte refusée. | `tests/validation.test.ts:97` |
| V2 | Lever un refus est un geste humain, qui rafraîchit le contenu. | Même cas : un refus ne doit revenir ni tout seul, ni avec un contenu périmé. | `tests/validation.test.ts:187` |
| V3 | Accepter une proposition ancienne revérifie l'appariement. | Une suggestion « nouveau contact » restée longtemps en attente a recréé un doublon. | `tests/validation.test.ts:225` |
| V4 | Décider deux fois la même proposition ne fait rien de plus. | Une page périmée soumise deux fois (même cas que I8). | `tests/validation.test.ts:263` |
| V5 | Deux décisions simultanées n'appliquent qu'une fois. | Une demande d'autorisation de nouvelle version ne devait produire qu'un dépôt. | `tests/validation.test.ts:279` |
| V6 | Une décision exige un décideur identifié, jamais un lien à jeton ; qu'il vienne d'une session est l'engagement du garde de l'appli. | Le même circuit n'acceptait de décision qu'avec une session, jamais depuis un lien à jeton. | `tests/validation.test.ts:313` |
| V7 | Une décision vide bloque, jamais prise par défaut. | Même cas que I11. | `tests/validation.test.ts:327` |
| V8 | Un statut inconnu s'affiche comme tel, avec sa valeur, jamais comme un état sain. | Sur l'écran de règlement des factures d'un projet antérieur, un statut que l'écran ne savait pas lire ne devait jamais passer pour « tout va bien ». | `solstice-ui` (`SKILL.md:99`) ; `tests/validation-cycle.test.ts:38` |
| V9 | Un état « en cours » expire, après un délai plus long que celui du traitement. | Une demande restée « en cours » a verrouillé son auteur pour toujours ; la péremption a été fixée à 30 minutes pour un traitement abandonné à 25. | **Non tenue** |
| V10 | La vérification d'arrêt se place dans l'étape irréversible ; une réponse illisible ne vaut pas annulation. | Pour un agent qui publiait du code, l'arrêt demandé se vérifiait avant l'étape de publication, pas dans celle-ci. | **Non tenue** |
| V11 | Un agent n'annonce jamais lui-même son succès : la conclusion s'écrit après les vérifications. | Règle d'un agent autonome de développement : sa conclusion s'écrit après les vérifications, pas par lui. | **Non tenue** |
| V12 | Une matrice de droits se teste par comportement, pas par lecture du code source. | Une matrice rôle × motif de blocage n'était testée qu'en lisant le source, et ses textes étaient dupliqués entre client et serveur. | `tests/roles.test.ts:46` (la matrice des droits du catalogue, testée par comportement) ; `solstice-livrer` (`SKILL.md:31`) |

## 7. Documents sortants et facturation

| N° | Règle | Cas | Tenue par |
| --- | --- | --- | --- |
| F1 | Un brouillon est une photo : sa péremption se détecte et se met à jour par un geste explicite, jamais par un recalcul silencieux. | Des temps saisis après la préparation d'une facture n'entraient pas dans son brouillon. | **Non tenue** |
| F2 | Un état « envoyé sans facture » bloque une nouvelle préparation. | Sans ce blocage, une même période était facturée deux fois. | **Non tenue** |
| F3 | Un seul brouillon ouvert par (client, période). | Un client avec une affaire mensuelle et une trimestrielle avait deux brouillons sur le même mois. | **Non tenue** |
| F4 | Le système externe d'abord, la base ensuite. | Règle de l'envoi des factures vers un logiciel de facturation ; les archives ne détaillent pas l'incident. | **Non tenue** |
| F5 | Une pièce se rapproche d'une ligne par son libellé ; la date ne départage que l'année. | Rapprochée par sa date d'émission, une facture de juin a basculé en juillet. | **Non tenue** |
| F6 | Une référence valable sur une période porte cette période ; une fin ouverte est interdite. | La référence de bon de commande portée par l'affaire, périmée au trimestre suivant, est partie sur la facture. | **Non tenue** |
| F7 | Un délai de paiement se calcule par sa règle complète ; un délai absent vaut zéro, et une date de règlement absente le reste. | « 30 jours fin de mois le 15 » vaut 49 jours, pas 30. | **Non tenue** |

## 8. Calcul métier

| N° | Règle | Cas | Tenue par |
| --- | --- | --- | --- |
| C1 | Deux séries (prévu et acquis) ne s'additionnent jamais en silence, et un statut qu'aucune série ne classe fait échouer un test. | Un calendrier de chiffre d'affaires filtrait deux fois sur les statuts acquis et masquait des répartitions. | **En partie** : `tests/validation-cycle.test.ts:55` (chaque statut connu a un libellé et un ton) |
| C2 | Une grandeur ne se prend qu'à une source. | Le chiffre d'affaires du compte de résultat devait être le chiffre calendarisé, pas le comptable, sous peine d'être compté deux fois. | **Non tenue** |
| C3 | Un élément non classé se signale, il ne disparaît pas. | Un compte comptable sans classification disparaissait du compte de résultat. | **Non tenue** |
| C4 | Un ratio ne se calcule qu'entre deux séries toutes deux terminées. | Sur le mois en cours, le chiffre d'affaires était complet et les jours travaillés partiels : la productivité sortait faussement haute. | **Non tenue** |
| C5 | Un calcul jour par jour relit les périodes elles-mêmes, pas une date dérivée. | Les dates d'arrivée et de départ dérivées écrasaient les trous : une personne partie puis revenue a perçu une indemnité journalière pour chaque jour ouvré entre ses deux contrats. | **Non tenue** |
| C6 | Un montant se répartit sur la période qu'il couvre. | Un abonnement annuel divisé par la durée d'un contrat court gonflait les remboursements. | **Non tenue** |
| C7 | Un justificatif appartient à la saisie, pas à sa première ligne. | Une pièce posée sur la première ligne d'une saisie de plusieurs mois laissait les autres mois « sans pièce ». | **Non tenue** |
| C8 | Un plafond de présences simultanées se vérifie jour par jour, pas aux bornes des périodes. | Règle d'un suivi d'équipe qui plafonnait le nombre de personnes d'un statut présentes en même temps. | **Non tenue** |
| C9 | Une jointure qui peut ramener plusieurs lignes par clé se dédoublonne avant de sommer. | Relevé dans le code d'un projet antérieur, sans incident : deux affaires portant le même code projet auraient doublé les temps d'une facture. | **Non tenue** |
| C10 | Un taux ne se stocke pas : il se recalcule à l'affichage depuis ses deux termes. | Règle des tableaux d'audience d'un projet antérieur ; les archives ne détaillent pas l'incident. | **Non tenue** |

## 9. Accès et comptes

| N° | Règle | Cas | Tenue par |
| --- | --- | --- | --- |
| A1 | Chaque page, action serveur et route commence par sa garde : masquer un bouton ou une entrée de navigation ne protège rien. | Un bouton retiré de l'écran pour respecter une règle laissait son action serveur appelable sans l'écran. | `CLAUDE.md:60` ; `src/briques/comptes/roles.ts:10` ; `tests/gardes-acces.test.ts:157` |
| A2 | Tout est protégé par défaut ; les routes ouvertes sont une liste déclarée et vérifiée. | Deux applis livrées ont convergé vers cette forme : protection par défaut, et un test qui parcourt toutes les routes. | `tests/comptes-proxy.test.ts:68` |
| A3 | Un seul fichier de proxy, jamais un `middleware.ts` à côté. | Les deux ensemble font planter Next.js sans message. | **En partie** : commentaire de `src/briques/comptes/protection.ts:7`, aucun test |
| A4 | Un secret de signature vide ou court est refusé, et la signature se vérifie avant tout usage du jeton. | Règle reprise d'une appli livrée : un HMAC à clé vide se forge. | `tests/comptes-session.test.ts:56` |
| A5 | Le chemin de retour après connexion est filtré, caractères de contrôle compris. | Un caractère de contrôle glissé dans le chemin de retour le faisait sortir de l'appli, vers un site tiers. | `tests/comptes-session.test.ts:257` |
| A6 | La réponse à une demande de code n'attend pas l'envoi. | Le temps de réponse trahissait les adresses qui avaient un compte. | `tests/comptes-code-email.test.ts:126` |
| A7 | Les limites de tentatives se comptent par adresse et par adresse IP. | Un tiers pouvait tenir une personne dehors une heure en épuisant le quota de son adresse. | `tests/comptes-code-email.test.ts:198` |
| A8 | Les limites se comptent en base, sous verrou, jamais en mémoire. | Une limite d'essais tenue en mémoire ne valait qu'avec un seul processus. | `src/briques/comptes/code-email.ts:18` ; `tests/comptes-code-email.test.ts:223` |
| A9 | L'adresse IP du visiteur se lit dans le seul en-tête que pose l'hébergeur, jamais dans `X-Forwarded-For`. | La limite par adresse IP dépendait du proxy placé devant l'hébergeur ; elle est à revérifier à chaque changement d'hébergeur. | `tests/adresse-ip.test.ts:23`, `:45` ; `solstice-nouvelle-appli` (`socle.md:63`), avec la brique comptes ou contact |
| A10 | Le dernier administrateur actif ne se désactive ni ne se rétrograde, par l'écran ni par une action postée à la main. | Règle reprise d'une appli livrée, qui protège ensemble les deux portes (désactiver, rétrograder), lecture et comptage dans la même transaction. | `tests/comptes-administration.test.ts:116` ; `tests/gestion-comptes.test.ts:68` |
| A11 | Le rôle n'est jamais dans le jeton de session : il se relit en base à chaque requête. | Règle reprise d'une appli livrée : un rôle porté par le jeton survivrait au retrait du droit jusqu'à la fin de la session. | `tests/comptes-session.test.ts:146` ; `tests/comptes-administration.test.ts:256` |
| A12 | On désactive un compte, on ne le supprime pas. | Règle reprise d'une appli livrée : un compte désactivé perd l'accès, ses traces restent. | `tests/comptes-administration.test.ts:179` ; `solstice-donnees` (`SKILL.md:71`) |
| A13 | L'état d'une connexion par un fournisseur d'identité est lié au navigateur qui l'a lancée. | Sans ce lien, un tiers peut forcer la connexion de quelqu'un à son propre compte. | `tests/comptes-google.test.ts:221`, `:228` ; `tests/comptes-microsoft.test.ts:269`, `:276` |
| A14 | Un jeton de passage d'une appli à l'autre est à usage unique, et son mécanisme existe en un seul exemplaire. | Le même jeton signé entre applis existait en trois copies dans un même dépôt. | **Non tenue** (le catalogue n'a pas de jeton entre applis) |
| A15 | Un formulaire en deux temps n'a qu'un état, celui de la dernière réponse. | Deux états séparés laissaient l'erreur d'un ancien code de connexion à côté du nouveau. | **En partie** : `src/briques/comptes/FormulaireCode.tsx:15`, aucun test |
| A16 | Une page à ne pas indexer se ferme par `noindex` (balise ou en-tête `X-Robots-Tag`), que les moteurs doivent pouvoir lire : un `Disallow` les empêche de la lire. | Les liens à jeton donnés aux clients d'une appli livrée sont sortis des moteurs de recherche par `X-Robots-Tag`, sans `Disallow`. | **En partie** : `noindex` sur chaque page fermée (`tests/referencement.test.ts:166`) ; `robots.txt` interdit aussi tout, par un choix commenté (`src/lib/referencement.ts:115`) que prescrit aussi `solstice-nouvelle-appli` (`socle.md:143`), à trancher |
| A17 | Un contenu déposé par un utilisateur s'affiche dans une iframe isolée (`sandbox` sans `allow-same-origin`), derrière un jeton non devinable. | Les présentations HTML déposées dans une appli livrée s'affichaient ainsi, lien public compris. | **Non tenue** (le catalogue n'affiche aucun contenu déposé) |

## 10. Données personnelles

| N° | Règle | Cas | Tenue par |
| --- | --- | --- | --- |
| P1 | Données réelles, exports, dumps et clés n'entrent jamais dans l'historique git. | Des données personnelles sont entrées dans l'historique d'un projet, coûteuses à purger. Un fichier retiré après coup reste lisible dans l'historique. | `.gitignore:14` ; `tests/gitignore.test.ts:71` ; garde `git add -f` (`.claude/hooks/gardes.mjs:171`) |
| P2 | Une donnée sensible masquée l'est sur toutes ses facettes : libellé, famille, couleur, légende. | Un motif d'absence masqué restait trahi par la couleur de sa légende. | **Non tenue** |
| P3 | Les gabarits de conformité (registre des traitements, trame de sous-traitance, hébergement dans l'Union européenne) sont prêts avant la mise en ligne. | Un hébergement a été déplacé d'une région américaine vers l'Union européenne après coup. | Gabarits de la brique rgpd (`src/briques/rgpd/gabarits/`) : registre des traitements, trame d'accord de sous-traitance, checklist d'hébergement dans l'UE ; hébergement tenu aussi par DP5 |
| P4 | La position sur l'envoi de données vers des services d'IA se documente par projet. | Point ouvert d'un projet antérieur qui envoyait des données à des modèles d'IA ; les archives ne détaillent pas d'incident. | **Non tenue** |

## 11. Dates et fuseaux

| N° | Règle | Cas | Tenue par |
| --- | --- | --- | --- |
| H1 | La date du jour se calcule dans le fuseau du client et s'injecte ; jamais celle du serveur. | Le serveur tournait en UTC : vers minuit, sa date du jour divergeait de celle de Paris. | `tests/format.test.ts:41` ; `solstice-ui` (`SKILL.md:63`) |
| H2 | Deux instants se comparent avec une seule horloge, celle de la base. | Un décalage d'horloge entre un conteneur et le poste faussait « l'envoi précède la modification ». | **Non tenue** |

Les autres règles de date sont rangées avec leur calcul : F5, F6, F7, C4, C5.

## 12. Envoi de mails et rappels

| N° | Règle | Cas | Tenue par |
| --- | --- | --- | --- |
| M1 | Toute valeur insérée dans le HTML d'un mail est échappée. | Le nom d'un objet était inséré tel quel : un membre pouvait y glisser un lien. | `tests/mails.test.ts:84` ; `tests/contact.test.ts:88` |
| M2 | L'échec d'envoi à une personne n'arrête ni les suivantes ni l'enregistrement. | Les alertes de changement de contenu d'une appli livrée partaient en direct, sans file d'attente : un échec pour une personne ne devait bloquer ni les autres ni l'enregistrement de la modification. | **Non tenue** |
| M3 | Ne sont pas prévenus : l'auteur de la modification, les comptes inactifs, les désabonnés. | L'auteur d'une modification recevait l'alerte de sa propre modification. | **Non tenue** |
| M4 | « Le contenu a changé » se détecte en comparant avant et après dans la même requête. | Un simple renommage faisait avancer la date de mise à jour, sans que le contenu ait changé. | **Non tenue** |
| M5 | Le jeton de désabonnement est celui du destinataire, et la page répond pareil pour « déjà désabonné » et pour un jeton inconnu. | Règle du désabonnement d'une appli livrée, pour ne rien apprendre à qui essaie des jetons. | **Non tenue** |
| M6 | Une route d'envoi planifié exige un secret, a un mode à blanc et un mode essai vers une seule adresse, et journalise chaque envoi, introuvables et erreurs compris. | Le mode essai a été redemandé pour chaque rappel (saisie des temps, relances de fin de mois). | **Non tenue** |
| M7 | La tâche planifiée tourne souvent ; une fonction pure décide si c'est le jour d'envoi, et une seule boucle d'envoi sert à toutes les routes. | L'horaire d'un rappel hebdomadaire a été ajusté deux fois, et la boucle d'envoi était recopiée dans chaque route. | **Non tenue** |
| M8 | L'activation d'une tâche planifiée (secrets, autorisations, variables) se documente geste par geste. | Une tâche fusionnée n'a jamais tourné : il manquait des gestes manuels. | **Non tenue** |
| M9 | Un rappel qui nomme des retardataires part en message privé. | Un rappel public aurait nommé les retardataires devant toute l'équipe. | **Non tenue** |
| M10 | « Oubli » et « jamais concerné » se séparent par une fenêtre d'historique. | Une personne qui n'avait jamais rien saisi noyait les vrais oublis. | **Non tenue** |

## 13. Fichiers joints

| N° | Règle | Cas | Tenue par |
| --- | --- | --- | --- |
| FI1 | Un fichier s'envoie par un Route Handler, pas par une action serveur. | Un fichier joint envoyé par une action serveur échouait sur « Unexpected end of form ». | **En partie** : la brique import-lot reçoit le fichier par un Route Handler que l'appli pose (`src/briques/import-lot/envoi.ts`, README « La brancher ») ; aucune règle de skill |
| FI2 | La limite de taille annoncée est la limite réelle. | Une limite annoncée de 10 Mo, au-dessus du plafond réel de 3 Mo, produisait une erreur générique avant l'action. | **En partie** : `solstice-ui` (`SKILL.md:95`) ; brique import-lot, qui refuse au-delà de sa limite annoncée (`src/briques/import-lot/lecture.ts:33`) ; la limite d'un proxy d'hébergeur reste à relever (README d'import-lot, « Questions ouvertes ») |
| FI3 | Le nom d'un fichier téléchargé supporte tout caractère, apostrophe typographique comprise. | Une apostrophe typographique dans un nom de fichier faisait répondre une erreur 500 au téléchargement. | **Non tenue** |

## 14. Interface et kit

| N° | Règle | Cas | Tenue par |
| --- | --- | --- | --- |
| U1 | Un tableau porte d'office le tri et les filtres, et les exports sur simple option. | Chaque tableau livré a fini par les recevoir : huit pull requests, six vagues de rattrapage. | `CLAUDE.md:22` ; `src/ui/Tableau.tsx:66` ; `tests/exports-tableau.test.ts:38` |
| U2 | Un tableau hiérarchique ne se trie pas ; son filtre masque sans recalculer. | Un tri générique a été rejeté sur un compte de résultat, où il cassait la lecture comptable. | **En partie** : `src/ui/Tableau.tsx:100`, aucun test |
| U3 | La vue d'un tableau (tri, filtres, déplis) survit à la navigation, le temps de l'onglet. | Sur un projet antérieur, les déplis survivaient même à la fermeture de l'onglet. | **En partie** : `src/ui/vueTableau.ts:7` et `CLAUDE.md:22`, aucun test |
| U4 | Volets figés et détail au clic. | Un croisement personnes × périodes de temps passés a demandé l'un puis l'autre, jusqu'au détail d'une cellule. | **En partie** : clic sur une ligne (`src/ui/Tableau.tsx:116`) ; le clic par cellule attend un tableau croisé |
| U5 | Montants, dates et pourcentages passent par un seul module de format. | Deux écrans voisins affichaient « 12 500 € » et « 12,500.00 € ». | `src/lib/format.ts:4` ; `solstice-ui` (`SKILL.md:59`) |
| U6 | Un pas de saisie ne refuse pas un montant légitime. | Un pas de 100 € refusait un reliquat de 3 334 €. | `solstice-ui` (`SKILL.md:103`) ; aucun champ montant du catalogue n'a de pas, donc aucun test |
| U7 | La fiche d'un enregistrement est en lecture seule et montre exactement les champs du formulaire ; un seul formulaire sert à créer et à modifier. | Règle maison héritée d'un projet antérieur ; les archives ne détaillent pas l'incident. | `CLAUDE.md:59` ; `src/app/dossiers/[slug]/page.tsx:18` |
| U8 | Le slug d'une fiche n'est jamais purement numérique et n'entre pas en collision avec une route du module. | Règle reprise d'un projet antérieur avec son module de slugs : une fiche nommée « Nouveau » deviendrait inatteignable. | `tests/slug.test.ts:15`, `:20` |
| U9 | Une erreur de rendu n'est jamais une page blanche : le digest reste affiché, et l'écriture a souvent eu lieu malgré l'erreur. | Des pages blanches à digest cryptique en production, après des écritures bien passées. | **En partie** : `src/app/error.tsx:3` et `solstice-ui` (`SKILL.md:66`) ; « l'écriture a eu lieu » n'est écrit nulle part |

## 15. IA et tâches longues

| N° | Règle | Cas | Tenue par |
| --- | --- | --- | --- |
| IA1 | Une réponse incomplète ou un signal absent est une erreur, jamais un verdict. | Une réponse tronquée par la limite de longueur se lisait « non pertinent », et le prospect était perdu ; ailleurs, des liens invisibles au lecteur rendaient une règle de contrôle conforme à tort. | **Non tenue** |
| IA2 | Le plafond de dépense se vérifie avant chaque appel, avec un sous-plafond par tâche. | Un passage a dépensé 3,05 $ sur un plafond de 3 $. | **Non tenue** |
| IA3 | Le modèle par défaut est le moins cher qui suffit, avec un budget par exécution. | 38 exécutions sur le modèle le plus cher ont coûté 57 $. | **Non tenue** |
| IA4 | Changer de modèle revoit la grille de prix dans le même commit ; un modèle inconnu se compte au tarif le plus cher. | Sans cela, les coûts suivis étaient gonflés d'environ 50 %. | **Non tenue** |
| IA5 | Une expiration de délai compte comme un échec. | Un délai dépassé n'incrémentait pas le compteur d'échecs : le même contact bloquait la file. | **Non tenue** |
| IA6 | Chaque tentative se consigne, avec un délai avant la suivante. | Une fiche sans résultat revenait en tête jusqu'à 60 fois par nuit. | **Non tenue** |
| IA7 | Une question posée aux données s'exécute en lecture seule imposée par la base, sous délai, et ne montre que ce que l'écran montre déjà à la même personne. | Règle d'un assistant qui répondait en interrogeant la base ; la sécurité venait du moteur, pas de la relecture du SQL. | **Non tenue** |
| IA8 | Une règle métier ajoutée au code se répercute dans les consignes du modèle. | Sinon l'assistant répondait faux là où le code répondait juste. | **Non tenue** |
| IA9 | Une donnée lue par un modèle se relit par un humain, sur ses pièges connus. | Sur une facture, le client est le destinataire et non l'émetteur, et un avoir imprimé en positif se stocke en négatif. | **Non tenue** |
| IA10 | Aucun état en mémoire pour ce qui doit survivre : une instance vaut un processus. | Un export long, suivi en mémoire, était perdu à chaque déploiement, et plusieurs processus auraient cassé son verrou. | `solstice-nouvelle-appli` (`socle.md:61`) ; A8 |

## 16. Déploiement et hébergement

| N° | Règle | Cas | Tenue par |
| --- | --- | --- | --- |
| DP1 | La CI vérifie chaque pull request dès le premier jour. | 86 pull requests ont été fusionnées avant qu'une ligne ne soit compilée ailleurs que chez l'hébergeur. | `.github/workflows/ci.yml:3` |
| DP2 | Rien ne part en production sans la CI verte. | L'hébergeur déployait `main` sans attendre la CI. | `tests/deploiement.test.ts:85`, `:166` |
| DP3 | La sonde de santé répond sans session et donne le commit en ligne. | Placée derrière l'authentification, la sonde recevait une redirection et chaque déploiement échouait. | `tests/sante.test.ts:62` ; `tests/deploiement.test.ts:144` |
| DP4 | Jamais le palier gratuit de l'hébergeur pour la base. | La base gratuite est supprimée au bout de 30 jours. | `tests/deploiement.test.ts:180` |
| DP5 | Service et base dans l'Union européenne dès le départ. | Une base a été migrée d'une région américaine vers l'Europe après coup : une migration de données en production. | `tests/deploiement.test.ts:171` |
| DP6 | Une variable ajoutée au fichier de l'hébergeur se déclare aussi dans son tableau de bord. | Les variables d'un service existant ne se resynchronisent pas depuis le fichier. | **En partie** : commentaire de `render.yaml:6` ; `tests/deploiement.test.ts:233` vérifie la déclaration, pas la resynchronisation |
| DP7 | Un service se nomme avant sa création, jamais renommé ensuite. | Un service renommé dans le tableau de bord a quitté la synchronisation, sans message ; il est revenu en reprenant son nom. | `render.yaml:9` ; `solstice-nouvelle-appli` (`socle.md:123`) |
| DP8 | Les actions de CI s'épinglent par empreinte de commit, pas par étiquette. | Une montée de version flottante d'une action a changé ce que faisait la CI, sans aucun commit du dépôt. | `.github/workflows/ci.yml:52` ; `solstice-nouvelle-appli` (`socle.md:89`) |
| DP9 | Quand l'appli tourne en conteneur, la CI construit l'image. | Un binaire qui marchait en conteneur sur le poste a refusé de démarrer chez l'hébergeur. | `solstice-nouvelle-appli` (`socle.md:87`) |
| DP10 | L'installation chez l'hébergeur se fait sans audit ni messages de financement (`--no-audit --no-fund`). | Leçon notée pour le fichier de l'hébergeur ; les archives ne détaillent pas l'incident. | `render.yaml:32` |
| DP11 | Une sauvegarde nocturne hors de l'hébergeur, avec un test de restauration, et la date d'expiration des clés notée. | Un projet antérieur sauvegardait chaque nuit vers un stockage objet et restaurait à l'essai vers une base jetable ; le catalogue n'a pas d'équivalent. | **Non tenue** |

## 17. Méthode et gardes de Claude

| N° | Règle | Cas | Tenue par |
| --- | --- | --- | --- |
| ME1 | On s'assigne un ticket avant de le prendre. | Un ticket pris deux fois a donné deux implémentations, et la mauvaise a été fusionnée. | `solstice-livrer` (`SKILL.md:15`) |
| ME2 | Une session de travail, un worktree. | D'autres sessions changeaient la branche du clone partagé juste avant un commit. | `solstice-livrer` (`SKILL.md:21`) |
| ME3 | La fusion revient à un humain : fusionner, c'est mettre en ligne. | Avec l'auto-déploiement, chaque fusion partait en production. | garde `gh pr merge` (`.claude/hooks/gardes.mjs:183`) ; `solstice-livrer` (`SKILL.md:73`) |
| ME4 | Une URL de base distante ne se colle jamais dans un terminal ni un fichier. | Collée dans un terminal, l'adresse de la base de production est restée dans l'historique, et il a fallu changer les identifiants. | garde (`.claude/hooks/gardes.mjs:21`) ; `.claude/hooks/gardes.test.mjs` |
| ME5 | Avant une PR, relire ce que le diff rend faux dans la documentation. | La dérive de documentation a été le deuxième poste de correctifs d'un projet antérieur : renvois morts, commentaires d'un état passé, une même règle écrite à quatre endroits et contredite par l'un d'eux. | agent `relecteur-docs` (`.claude/agents/relecteur-docs.md:9`) ; `CLAUDE.md` §7 |
| ME6 | Un test énonce la règle qu'il verrouille et cite le cas d'origine. | Sur deux projets antérieurs, ces intitulés ont servi de mémoire des incidents. | `solstice-livrer` (`SKILL.md:30`) ; `solstice-donnees` (`SKILL.md:215`) |
| ME7 | Escalader est un résultat normal. | Une minute d'escalade coûte moins qu'un incident en production. | `CLAUDE.md:90` |
| ME8 | Avant de modifier un élément partagé, chercher tous ses consommateurs. | Une date dérivée lue par 41 consommateurs ne pouvait pas changer de sens en douce. | **Non tenue** |
| ME9 | Chaque projet note ses dangers immédiats : quelle adresse déploie, où est la production. | Point de méthode d'un projet antérieur ; les archives ne détaillent pas l'incident. | **Non tenue** |
| ME10 | Une modification des fichiers sensibles (authentification, proxy, schéma, infrastructure) se signale. | Même origine ; la liste des fichiers reste à fixer par projet. | **Non tenue** |
| ME11 | Avant de coder un écran, demander la cible : téléphone, ordinateur ou les deux. | Les allers-retours d'interface venaient de cibles devinées. | `solstice-ui` (`SKILL.md:41`) |
| ME12 | Une règle de contrôle à seuil se mesure sur un corpus avant d'être écrite. | Des règles d'un contrôle de documents ont produit des faux positifs en série : 32 cas légitimes pour l'une, 13 pour une autre. | **Non tenue** |
| ME13 | Le spécifique d'un client vit dans la configuration, jamais dans le moteur. | Un outil livré gardait en dur les conventions et le domaine de son client : impossible à réutiliser ailleurs. | **En partie** : une brique ne connaît aucun module (tests d'isolement, par exemple `tests/echeances-isolement.test.ts:43`) et l'hébergeur ne se nomme que dans son adaptateur (`tests/deploiement.test.ts:154`) ; rien ne vérifie l'absence de convention propre à un client |

## Hors registre

Pièges propres à une pile ou à un outil que le catalogue n'a pas. Ils restent
dans l'inventaire, hors du dépôt, et reviennent ici si le catalogue adopte cette
pile : la page d'erreur d'un framework Python levée sans utilisateur ; l'ordre
entre contrôle d'accès et CORS dans un service HTTP ; l'asymétrie d'une mesure
de similarité de textes ; la capture de la page affichée plutôt qu'un nouveau
téléchargement refusé par le site ; les liens relatifs et absolus d'une page
comparée ; un ancien format de document qui perd ses modifications suivies ; les
règles d'un arbre de catégories (rangement en feuille seulement, compteurs qui
incluent la descendance, archivage qui cache ce qui bloque une suppression).

## D'où viennent les lignes

- Sections « Pièges retenus » et « Pièges verrouillés » des READMEs de
  briques : import-lot (I1 à I14, I16 à I21), validation (V1 à V8, D10, I20,
  A1, et ses variantes notées : V9 à V12, F1 à F4), mails et contact (M1,
  A9), déploiement (DP2 à DP6), et la première fiche de la brique
  notifications, écrite avant la brique mails (H1, H2, M1 à M7, M9, M10) ;
  sa fiche actuelle, reprise sur la brique mails, en garde les pièges. Les pièges de
  ces sections sans cas d'origine (règles déduites) ne sont pas des
  cicatrices et restent dans leurs READMEs ; la brique rgpd n'a que des
  pièges déduits. Les briques comptes, gestion-comptes, journal, échéances et
  calendrier n'ont pas de section de pièges : les leçons de comptes (A3 à
  A12, A15) viennent des commentaires de son code.
- Leçons relevées comme absentes du catalogue lors de la sortie de
  l'inventaire : D8, D9, D11, FI3, IA1, A13, A16, A17, P2, U6, C1, S1 à S3,
  S7, IA2, IA4 à IA7, R1, C5, C8, I21. Points ouverts relevés lors de la
  sortie des journaux : ME8 à ME10, P3, P4, DP11.
- Inventaire des applis livrées, journaux du prototype, commentaires
  « projet précédent » du code, skills, gardes et agents : le reste.
