# Brique notifications

Prévenir par mail, à jour fixe, les personnes concernées par ce qui arrive
bientôt. Premier besoin : « être prévenue 30 jours avant la fin de chaque
contrat », cadré dans l'appli contrats, banc d'essai de la brique avant son
retrait du catalogue. La brique s'appuie sur la brique mails pour l'envoi et
ne connaît pas la brique échéances : le lien entre les deux se fait côté appli
(« La brancher »).

## Ce qu'elle apporte (v1)

- **Un récapitulatif périodique, sans état.** À chaque jour d'envoi, l'appli
  fabrique la liste de ce qui est à signaler à cette date et la brique
  l'envoie. Rien ne retient ce qui est déjà parti : un passage manqué est
  rattrapé par le suivant, tant que la fenêtre de l'appli (30 jours dans
  l'exemple ci-dessous) est plus longue que l'écart entre deux envois (7
  jours). Un mail par échéance au seuil J−30 aurait obligé à retenir chaque
  envoi, sous peine de trente mails pour une même échéance, ou d'aucun si la
  tâche planifiée saute ce jour-là.
- **Une boucle d'envoi, une seule fois, dans la brique.** L'échec d'un envoi
  est noté et la boucle passe au suivant : il ne bloque ni les autres
  destinataires ni le reste du traitement. Le projet précédent avait recopié
  cette boucle dans chaque route.
- **Un déclencheur par la date.** Une route de l'appli, appelée chaque jour par
  une tâche planifiée, décide elle-même si c'est le jour d'envoi : la tâche
  tourne souvent, la route décide. Le jour d'envoi est une fonction pure ;
  « aujourd'hui » se calcule dans le fuseau du client (`aujourdhui()` de
  `src/lib/format.ts`) et s'injecte. Jour fixe, sans calendrier des jours
  fériés : un récapitulatif du lundi de Pâques attend le mardi dans la boîte.
- **Un seul envoi réel par jour et par branchement.** Avant d'envoyer, la
  route réserve le jour dans la table `notifications_lancements`, dont la clé
  primaire (branchement, jour) tranche : si le jour est déjà pris, elle
  n'envoie rien. Une tâche relancée à la main après un échec, même en même
  temps que la tâche planifiée, ou planifiée plusieurs fois par jour, n'envoie
  donc pas deux fois le récapitulatif à tout le monde. Lire le journal n'aurait
  pas suffi : sa première ligne ne s'écrit qu'après le premier envoi. Un envoi en échec ce jour-là n'est pas
  repris : la tâche l'a signalé, le récapitulatif suivant le rattrape.
- **Deux modes de répétition**, qui ignorent le jour d'envoi :
  - **à blanc** : rien ne part, rien ne s'écrit, la réponse liste ce qui
    partirait (destinataire, objet) ;
  - **essai** : chaque mail part, mais à une seule adresse, qui doit figurer
    dans `NOTIFICATIONS_ADRESSES_ESSAI`. Toute autre adresse est refusée avant
    le moindre envoi : sinon, quiconque détient le secret de la route écrirait
    à n'importe qui. Le mail d'essai commence par une ligne qui nomme le
    destinataire prévu ; le journal garde l'adresse d'essai, celle qui a
    reçu le mail.

  Le mode et l'adresse d'essai passent dans le corps de la requête, jamais
  dans son adresse : une adresse e-mail en paramètre d'URL finirait dans les
  journaux d'accès de l'hébergeur. Seul un corps vide vaut le mode réel : un
  corps qui ne nomme pas son mode (`{ "Mode": "a-blanc" }`) est une répétition
  mal tapée, refusée plutôt qu'envoyée pour de vrai.

  **Ce que le mode essai expose.** Il envoie vers une adresse d'essai, pas vers
  des adresses inventées : les destinataires prévus sont les vrais. Outre la
  ligne qui les nomme dans le mail d'essai, le rapport que renvoie la route, en
  essai comme à blanc, liste une ligne par notification avec cette adresse
  réelle (seul le mode réel n'en renvoie aucune). Trois conséquences :
  - **à qui donner l'adresse d'essai** : une adresse de l'équipe qui répète,
    jamais celle d'un tiers, car qui la lit voit les adresses réelles des
    responsables d'un vrai récapitulatif ;
  - **ne pas journaliser le rapport tel quel** : un écran, un journal
    d'application ou de tâche planifiée qui l'affiche ou l'écrit les garde, et
    un dépôt public montre à tous les journaux de GitHub Actions. L'appel à la
    main (PowerShell ci-dessous) se lit dans le terminal, sans le coller dans
    un ticket ni un message ;
  - **la tâche planifiée n'appelle que le mode réel**, dont la réponse ne
    contient que des comptes.
- **Un journal des envois** (table `notifications_envois`) : une ligne par
  mail, réel ou d'essai, réussi ou non, avec le jour d'envoi du client, le
  destinataire, l'objet, le résultat et l'erreur éventuelle (celle de la brique
  mails, qui ne cite jamais la clé ; « Erreur inattendue à l'envoi » sinon). Une
  écriture du journal qui échoue arrête la boucle : la route répond en erreur et
  la tâche planifiée le signale (lecture du code, aucun test). Le jour reste
  réservé : les destinataires suivants attendent le récapitulatif suivant. Il s'efface de lui-même au-delà de la
  durée de conservation (« Données personnelles et conservation »).
- **Une route protégée par un secret** (`NOTIFICATIONS_SECRET`), qui répond 401
  sans rien envoyer si le secret manque ou ne correspond pas, y compris quand
  la variable n'est pas posée.

## Ce qu'elle ne fait pas (v1)

- **Le déclencheur par événement** (« la fiche que vous suivez a changé ») et le
  **désabonnement par lien**. Les destinataires de la v1 sont des responsables
  internes (le responsable d'un contrat, le technicien d'une maintenance), sans
  compte, qui n'ont pas à se désabonner. Les pièges connus de ces évolutions
  sont notés plus bas.
- **Une file d'attente** : l'envoi est synchrone, dans la requête de la route.
  Une instance vaut un processus ; un très gros lot dépasserait le délai de la
  requête, ce qu'aucun usage prévu n'approche.
- **Slack** ou un autre canal, les pièces jointes, les modèles riches : ce que
  la brique mails ne fait pas, celle-ci non plus.
- **Un écran du journal.** Il se lit en base ; un envoi en échec se voit sans
  écran, par la tâche planifiée (« La brancher », étape 4).
- **Le retrait d'une copie déjà assemblée.** L'assembleur ajoute ou retire la
  brique à l'assemblage ; l'outil de mise à jour du catalogue l'ajoute ensuite à
  une appli en service, mais ne la retire pas. La retirer d'une appli déjà
  déployée laisse la table `notifications_envois` dans sa base : la supprimer
  est un geste humain.

## Données personnelles et conservation

- **Le journal garde des adresses** : celle de chaque destinataire, en
  minuscules et sans espaces, avec l'objet du mail, sa date, son mode et son
  résultat. Le contenu du mail n'est pas gardé.
- **Durée de conservation : 12 mois**, pour le journal comme pour les jours
  d'envoi (sans donnée personnelle), purgés par la route elle-même, à chaque
  envoi réel ou d'essai, sans tâche de plus (`conservationMois`, 12 par
  défaut). Elle est déclarée dans `confidentialite.ts` (clé `notifications`),
  que la politique affiche « à valider » tant que le client ne l'a pas revue,
  et que le script de purge de la brique rgpd applique aussi, pour une route
  arrêtée. Une durée différente se règle à deux endroits ensemble :
  `CONFIDENTIALITE.durees` (`src/lib/confidentialite.ts`), ce que la
  politique annonce et la purge applique, et `conservationMois`, ce que la
  route fait.
- **La politique de confidentialité** décrit le traitement d'après
  `confidentialite.ts` : des faits seulement. Le prestataire d'envoi est déjà
  déclaré par la brique mails.
- **L'export des données d'une personne** (brique rgpd, si l'appli l'a) sort
  les lignes du journal adressées à elle, par `donnees-personnelles.ts`.
  L'effacement de ses données garde ces lignes et en retire le destinataire.
  L'entrée « E-mails envoyés » de `src/config/donnees-personnelles.ts` (brique
  mails) dit que le site ne garde pas le contenu des mails qu'il envoie, ce qui
  reste vrai avec cette brique : son journal garde le destinataire et l'objet,
  exportés par cette source, jamais le contenu.
- **La réponse de la route à la tâche planifiée ne contient aucune adresse** :
  en mode réel, elle ne donne que des comptes (envoyés, en échec, sans
  destinataire). Les journaux de la tâche (GitHub Actions) peuvent être lus
  par d'autres que l'équipe, un dépôt public les montre à tous. Les modes à
  blanc et essai, appelés à la main, listent destinataires et objets : adresses
  réelles à ne pas journaliser (« Ce que le mode essai expose », plus haut).

## Les fichiers

| Fichier | Rôle |
| --- | --- |
| `jour.ts` | Pur : le type `JourSemaine`, `jourDeLaSemaine(date)` et `estJourDEnvoi(aujourdhui, jours)`. Sans horloge. |
| `envoi.ts` | Serveur : le type `Notification`, `envoyerNotifications`, le rapport, `ErreurNotifications`, et pour la route `reserverLeJour` et `verifierReglages`. La boucle, les modes, l'écriture et la purge du journal. Appelle `envoyerMail` de la brique mails. |
| `route.ts` | Serveur : `routeNotifications`, le gestionnaire de la route que l'appli expose. Vérifie ses réglages dès sa création, puis à chaque appel le secret et le mode, calcule « aujourd'hui », décide du jour, appelle la fabrique de l'appli, réserve le jour et envoie. |
| `confidentialite.ts` | Le traitement « Notifications par e-mail », pour la politique de confidentialité. N'importe rien. |
| `donnees-personnelles.ts` | La source de l'export et de l'effacement des données d'une personne (brique rgpd). Serveur seulement. |

Hors du dossier : les tests `tests/notifications*.test.ts`, l'étape des tables
`notifications_envois` et `notifications_lancements` en fin de
`src/lib/db/migrations.ts` (jamais dans `schema.sql`), les variables dans
`.env.example` et (avec la brique déploiement) `render.yaml`, et ses lignes de `src/lib/confidentialite.ts`
et `src/config/donnees-personnelles.ts` (sa source de l'export et de l'effacement, et
`notifications_lancements` parmi les tables sans donnée personnelle).
L'assembleur retire tout cela quand une copie ne garde pas la brique, comme
pour la brique contact.

La brique exige `donnees` (le journal) et `mails` (l'envoi). Elle n'importe que
ses propres fichiers, `@/lib/db/client`, `@/lib/format`,
`@/briques/mails/envoi` et `node:crypto` (comparer le secret en temps
constant). **Elle n'importe jamais `src/briques/echeances/`** ni un module de
l'appli. `tests/notifications-isolement.test.ts` le verrouille par une liste
blanche, sur le modèle de `tests/echeances-isolement.test.ts`, prouvée par un
cas fautif qu'il doit attraper.

## Interface publique

Ce qu'une appli peut importer et appeler. Tout autre export sert aux fichiers
de la brique ou à ses tests, et peut changer sans entrée au journal.

| Import | Symboles | Rôle |
| --- | --- | --- |
| `envoi.ts` | type `Notification` | `a` (une adresse, `null` ou vide quand l'appli n'en a pas : la ligne est journalisée « sans destinataire » et la boucle continue), `objet` (une ligne), `contenu` (des `Bloc` de la brique mails : jamais de HTML). |
| `envoi.ts` | `envoyerNotifications(notifications, options)` → `Promise<Rapport>` | La boucle. `options` : `source` (le nom du branchement, gardé au journal, par exemple `"contrats"`), `mode` (`"reel"`, `"a-blanc"` ou `"essai"`, avec alors `a`, l'adresse d'essai), `conservationMois` facultatif (12), `aujourdhui` facultatif (« aaaa-mm-jj », par défaut le jour du client, gardé au journal). Lève `ErreurNotifications` avant tout envoi si l'adresse d'essai n'est pas permise, si la source n'est pas un nom simple en minuscules, ou si la durée n'est pas un entier d'au moins 1. |
| `envoi.ts` | types `Rapport`, `LigneRapport` ; classe `ErreurNotifications` | Le rapport : le mode, les comptes (`envoyes`, `echecs`, `sansDestinataire`) et, hors mode réel, une ligne par notification (destinataire, objet, résultat, erreur). L'erreur de la brique ; son message commence par « Brique notifications : ». |
| `jour.ts` (pur) | type `JourSemaine` ; `estJourDEnvoi(aujourdhui, jours)`, `jourDeLaSemaine(date)` | `aujourdhui` en « aaaa-mm-jj », `jours` parmi `"lundi"` … `"dimanche"`. |
| `route.ts` | `routeNotifications({ source, jours, fabriquer, conservationMois? })` → `(requete: Request) => Promise<Response>` | Le gestionnaire `POST` de la route. Lève `ErreurNotifications` dès sa création si `source` ou `conservationMois` sont invalides : le build ou le démarrage casse, au lieu d'un 400 chaque matin. `fabriquer(aujourdhui)` est la fonction de l'appli qui rend les `Notification` à envoyer à cette date. Réponses : 401 sans le bon secret (en-tête `Authorization: Bearer …`) ; 400 pour une adresse qui porte des paramètres, un corps qui n'est pas un objet JSON nommant son mode, un mode inconnu, un essai sans adresse ou une adresse d'essai refusée ; 200 avec `{ envoye: false, aujourdhui, raison }` un jour sans envoi ou déjà réservé ; 200 avec `{ envoye, aujourdhui }` et le rapport sinon (`envoye` est faux en mode à blanc). |
| `confidentialite.ts` | `TRAITEMENTS_NOTIFICATIONS` | Le traitement (clé `notifications`), au format `Traitement` de `src/lib/confidentialite.ts`, avec sa `conservation` : 12 mois après l'envoi (clé `notifications`). |
| `donnees-personnelles.ts` | `SOURCES_NOTIFICATIONS` | La source de l'export et de l'effacement, au format `SourceDonnees` de la brique rgpd. Son `effacer` vide le destinataire des lignes de l'adresse et les garde. |

Le mode se choisit dans le corps JSON de la requête : corps vide pour le mode
réel, `{ "mode": "a-blanc" }`, ou `{ "mode": "essai", "a": "adresse@exemple.fr" }`.

**Interne** : `CONSERVATION_MOIS_PAR_DEFAUT` (la conservation que `envoi.ts` applique
sans `conservationMois`) et les types des paramètres et du retour décrits ci-dessus :
`Mode`, `OptionsEnvoi`, `Resultat`, `OptionsRoute`.

**Règle d'entretien.** Tout changement d'interface publique (symbole ajouté,
retiré ou renommé, signature modifiée, option ou variable ajoutées) met à jour
cette section et ajoute une entrée **en fin** de [`CHANGELOG.md`](CHANGELOG.md),
dans la pull request qui le fait : date, ce qui change pour l'appelant, raison.

## La brancher

Tout se déclare côté appli, jamais dans la brique. L'exemple suit le patron
`dossiers` du catalogue (`src/app/dossiers/`, CLAUDE.md §3) : sa table
`dossiers` porte `reference`, `client` et une colonne `echeance` de type
`date`. Chaque lundi, le responsable de chaque dossier reçoit la liste de ses
dossiers échus récemment ou à échéance dans les 30 jours, la même fenêtre que
la vue « À venir » de la brique échéances. L'exemple suppose une colonne
`responsable_email` (texte, nullable), ajoutée par une étape en fin de
`src/lib/db/migrations.ts` et saisie dans le formulaire du dossier. Une entité
réelle remplace les noms ; la forme reste la même.

1. **La liaison**, `src/lib/notifications-dossiers.ts`, fabrique les
   notifications d'une date. Elle fait sa propre requête sur `dossiers` et
   applique les règles de la brique échéances, `bornesDeLaVue` puis
   `statutEcheance` de `src/briques/echeances/calcul.ts` : le calcul des
   statuts n'est pas recopié, seule la requête l'est, et la brique échéances
   ne change pas. Elle regroupe les dossiers par responsable : un
   récapitulatif par personne, avec ses seuls dossiers (un destinataire par
   mail, règle de la brique mails). Un dossier sans e-mail de responsable va à
   l'adresse de repli `NOTIFICATIONS_DOSSIERS_REPLI`, la personne qui suit les
   dossiers : sans elle, il ne serait signalé qu'au journal, que personne ne
   lit. Sans adresse de repli non plus, il part au journal « sans
   destinataire ».

   ```ts
   import { bornesDeLaVue, statutEcheance } from "@/briques/echeances/calcul";
   import type { Notification } from "@/briques/notifications/envoi";
   import { query } from "@/lib/db/client";
   import { date } from "@/lib/format";

   // La même fenêtre que le branchement de la brique échéances sur les dossiers.
   const DELAI_JOURS = 30;

   type LigneDossier = { reference: string; client: string; echeance: string; responsable_email: string | null };

   function phrase(dossier: LigneDossier, aujourdhui: string): string {
     // Dans la fenêtre lue, le statut n'est jamais null ni « a_venir ».
     const statut = statutEcheance(dossier.echeance, aujourdhui, DELAI_JOURS);
     const quand = statut === "en_alerte" ? "arrive à échéance le" : "est échu depuis le";
     return `${dossier.reference} (${dossier.client}) ${quand} ${date(dossier.echeance)}.`;
   }

   // Les notifications d'un jour « aaaa-mm-jj » : un récapitulatif par
   // responsable, avec ses seuls dossiers. Pure vis-à-vis de l'horloge : le
   // jour vient de la route, dans le fuseau du client.
   export async function notificationsDossiers(aujourdhui: string): Promise<Notification[]> {
     const { debut, fin } = bornesDeLaVue(aujourdhui, DELAI_JOURS);
     // Une échéance vide ne passe aucune borne : le dossier n'est pas signalé.
     const dossiers = await query<LigneDossier>(
       `SELECT reference, client, echeance::text AS echeance, responsable_email
          FROM dossiers
         WHERE echeance >= $1::date AND echeance <= $2::date
         ORDER BY echeance, reference`,
       [debut, fin]
     );

     // Un branchement qui active retardSansLimite sur ses échéances ne borne
     // pas par `debut` et passe l'option à statutEcheance.
     const repli = process.env.NOTIFICATIONS_DOSSIERS_REPLI?.trim() || null;
     const parDestinataire = new Map<string | null, LigneDossier[]>();
     for (const dossier of dossiers) {
       const destinataire = dossier.responsable_email?.trim() || repli;
       parDestinataire.set(destinataire, [...(parDestinataire.get(destinataire) ?? []), dossier]);
     }

     return [...parDestinataire].map(([a, siens]) => ({
       a,
       objet: `${siens.length} dossier${siens.length > 1 ? "s" : ""} à échéance dans les ${DELAI_JOURS} jours`,
       // Des blocs de texte, jamais du HTML : la brique mails échappe tout.
       contenu: [
         { paragraphe: "Bonjour, voici vos dossiers échus récemment ou à échéance :" },
         ...siens.map((dossier) => ({ paragraphe: phrase(dossier, aujourdhui) })),
       ],
     }));
   }
   ```

2. **Une route**, `src/app/api/notifications/dossiers/route.ts`, en
   `force-dynamic` :

   ```ts
   import { routeNotifications } from "@/briques/notifications/route";
   import { notificationsDossiers } from "@/lib/notifications-dossiers";

   export const dynamic = "force-dynamic";
   export const POST = routeNotifications({
     source: "dossiers",
     jours: ["lundi"],
     fabriquer: notificationsDossiers,
   });
   ```

3. **Les routes ouvertes.** Avec la brique comptes, le proxy renvoie vers la
   connexion toute adresse qui n'est pas dans `ROUTES_OUVERTES` de
   `src/briques/comptes/protection.ts` : y ajouter `"/api/notifications"`
   (le préfixe couvre `/api/notifications/dossiers`), avec un commentaire qui
   nomme la brique, comme pour `/contact`. Et `tests/gardes-acces.test.ts`
   exige un garde `exiger(...)` dans chaque route : ajouter le fichier à sa
   liste `OUVERTS`, avec sa raison :

   ```ts
   "api/notifications/dossiers/route.ts":
     "la route des notifications, protégée par son secret (brique notifications), appelée par une tâche planifiée sans session",
   ```

   C'est le secret qui la protège, pas une session que la tâche planifiée n'a
   pas.

4. **Une tâche planifiée** (GitHub Actions), `.github/workflows/notifications.yml`,
   appelle la route chaque jour par un `POST` portant le secret ; la route
   décide si c'est le jour d'envoi. Elle échoue si le rapport compte un envoi
   en échec ou sans destinataire : GitHub prévient alors le dépôt. Tant que
   rien n'est armé (variable ou secret absents), elle s'arrête sans échouer :
   le catalogue, ou une appli pas encore hébergée, n'a rien à envoyer (la tâche pose alors, chaque jour, l'annotation « rien n'est armé » : ce n'est pas une erreur, mais une appli en ligne qui la porte n'envoie rien). Elle
   n'affiche que la réponse du mode réel, qui ne contient aucune adresse.

   ```yaml
   name: Notifications

   # Appelle chaque jour la route des notifications de l'appli : la tâche
   # tourne tous les jours, la route décide si c'est un jour d'envoi (brique
   # notifications). Deux réglages du dépôt l'arment, dans Settings → Secrets
   # and variables → Actions : la variable URL_PUBLIQUE (l'adresse de l'appli,
   # sans chemin) et le secret NOTIFICATIONS_SECRET (le même que chez
   # l'hébergeur). Sans eux, la tâche s'arrête sans échouer. Une tâche
   # planifiée ne tourne que sur la branche par défaut du dépôt.

   on:
     schedule:
       # 6 h 30 UTC chaque jour (7 h 30 ou 8 h 30 à Paris). GitHub peut
       # décaler l'heure de quelques dizaines de minutes, sans effet : la route
       # décide par le jour, pas par l'heure.
       - cron: "30 6 * * *"
     # Relance à la main, après un échec : la route ne renvoie pas deux fois
     # le récapitulatif d'un jour déjà réservé.
     workflow_dispatch:

   # Le jeton du workflow ne sert à rien ici : aucune lecture ni écriture du dépôt.
   permissions: {}

   jobs:
     notifier:
       runs-on: ubuntu-latest
       timeout-minutes: 5
       steps:
         - name: Appeler la route des notifications
           env:
             URL: ${{ vars.URL_PUBLIQUE }}
             SECRET: ${{ secrets.NOTIFICATIONS_SECRET }}
           run: |
             # Une annotation « warning » : elle se lit sur la page de
             # l'exécution, sans ouvrir le journal, et ne fait pas échouer.
             if [ -z "$URL" ]; then
               echo "::warning::Variable de dépôt URL_PUBLIQUE absente : rien n'est armé, rien n'a été appelé."
               exit 0
             fi
             if [ -z "$SECRET" ]; then
               echo "::warning::Secret NOTIFICATIONS_SECRET absent : rien n'est armé, rien n'a été appelé."
               exit 0
             fi
             # Corps vide : mode réel. En mode réel, la réponse ne contient
             # aucune adresse, seulement des comptes : elle peut s'afficher ici.
             reponse=$(curl -fsS -X POST -H "Authorization: Bearer $SECRET" "${URL%/}/api/notifications/dossiers")
             echo "$reponse"
             # Un envoi en échec ou sans destinataire fait échouer la tâche.
             # Un jour sans envoi répond sans comptes : « // 0 » le laisse passer.
             echo "$reponse" | jq -e '((.echecs // 0) == 0) and ((.sansDestinataire // 0) == 0)' > /dev/null
   ```

   Un secret faux ou une route absente font échouer `curl` (401, 404), donc la
   tâche : c'est voulu, une route qui ne répond plus se voit.

   **Les deux `URL_PUBLIQUE`** ne sont pas la même variable, et se confondent :

   | | Où | Rôle | Sur une recette |
   | --- | --- | --- | --- |
   | Celle du service | Variable d'environnement chez l'hébergeur (avec la brique déploiement, `render.yaml`, `sync: false`) | L'adresse publique de l'appli : elle ouvre aux moteurs un site déclaré public (`src/lib/referencement.ts`) et sert de base aux liens des courriels. | **Vide** (brique déploiement, geste 3) : une recette reste fermée aux moteurs. |
   | Celle de la tâche | Variable de dépôt GitHub (*Settings → Secrets and variables → Actions → Variables*) | L'adresse que la tâche appelle. **Obligatoire pour que la tâche envoie**. | **Posée**, à l'adresse du service de recette : c'est elle qui arme la tâche, sans rien ouvrir aux moteurs. |

   Sans la variable de dépôt, la tâche **se tait sans échouer** : l'exécution
   est verte, aucun rappel ne part et personne n'est prévenu. Seule une
   annotation « rien n'est armé » sur la page de l'exécution le dit (le
   code ci-dessus la pose). À la recette du 2026-11-06, la blueprint
   prévoyait un rappel quotidien sans cette variable, que le relecteur de
   blueprint a dû ramener : la consigne du README de la brique déploiement,
   « laisser `URL_PUBLIQUE` vide », ne vise que celle du service. Après le
   premier jour d'envoi attendu, ouvrir l'onglet *Actions* : une exécution
   « Notifications » qui porte cette annotation est une tâche qui ne sert à
   rien.

   La tâche tourne en UTC : une heure promise « à Paris » s'écrit avec son
   écart (7 h 30 en hiver, 8 h 30 en été pour 6 h 30 UTC).

5. **Les gestes humains**, que le code ne fait pas :

   - déclarer `NOTIFICATIONS_SECRET` (une longue chaîne aléatoire),
     `NOTIFICATIONS_ADRESSES_ESSAI` et `NOTIFICATIONS_DOSSIERS_REPLI` chez
     l'hébergeur, et les variables d'envoi de la brique mails ;
   - déclarer chez GitHub, dans les réglages du dépôt, la variable
     `URL_PUBLIQUE` et le secret `NOTIFICATIONS_SECRET`, le même que chez
     l'hébergeur ; fusionnée seule, la tâche s'arrête sans rien envoyer ;
   - répéter à blanc, puis en essai vers une adresse de l'équipe, avant de
     laisser la tâche planifiée envoyer pour de vrai (« Avant le premier envoi
     réel »).

Le branchement (liaison, route, tâche planifiée, lignes des routes ouvertes)
vit dans l'appli, avec le module qu'il notifie : l'assembleur du catalogue ne
le connaît pas. Une appli qui retire le module ou la brique retire aussi la
tâche planifiée, sans quoi elle appellerait chaque jour une route absente.

Pour répéter avant le premier envoi réel (PowerShell) :

```powershell
$secret = [Net.NetworkCredential]::new("", (Read-Host -AsSecureString "NOTIFICATIONS_SECRET")).Password
Invoke-RestMethod -Method Post -Uri "https://appli.exemple.fr/api/notifications/dossiers" -Headers @{ Authorization = "Bearer $secret" } -ContentType "application/json" -Body '{ "mode": "a-blanc" }'
```

## Ce qu'on configure

| Réglage | Où | Exemple |
| --- | --- | --- |
| Secret de la route | `NOTIFICATIONS_SECRET`, chez l'hébergeur et dans les secrets GitHub de la tâche. **Secret** : jamais dans le dépôt | une longue chaîne aléatoire |
| Adresses permises en essai | `NOTIFICATIONS_ADRESSES_ESSAI`, séparées par des virgules. Vide : le mode essai refuse tout | les adresses de l'équipe qui répète |
| Adresse de l'appli pour la tâche planifiée | variable de dépôt GitHub `URL_PUBLIQUE`, **pas celle du service** (« Les deux `URL_PUBLIQUE` ») | `https://appli.exemple.fr` |
| Clé et expéditeur | `RESEND_API_KEY`, `MAILS_EXPEDITEUR`, `MAILS_FOURNISSEUR` : brique mails | voir son README |
| Jours d'envoi | `jours` de `routeNotifications` | `["lundi"]` |
| Durée de conservation du journal | `conservationMois` de `routeNotifications` | 12 (défaut) |
| Qui prévenir, objet, contenu, fenêtre | la liaison de l'appli | le responsable de chaque dossier, 30 jours |
| Adresse de repli | `NOTIFICATIONS_DOSSIERS_REPLI`, propre à la liaison de l'exemple | la personne qui suit les dossiers |
| Fuseau du client | `FUSEAU` dans `src/lib/format.ts` | `Europe/Paris` |

Sans clé d'envoi en production, `envoyerMail` lève : chaque notification est
journalisée en échec et la tâche planifiée échoue. Jamais un succès
silencieux.

## Avant le premier envoi réel

Rien de ceci ne bloque le code : en test les mails sont capturés, en
développement ils s'affichent dans la console. Gestes humains, pour chaque
client :

- **Le compte chez le prestataire d'envoi et le domaine.** Pour un client, le
  compte et le domaine d'envoi sont les siens : il est responsable du
  traitement, le prestataire est son sous-traitant. Solstice Lab lui donne les
  enregistrements DNS (README de la brique mails, « Resend »), la personne qui
  gère son nom de domaine les pose. Pour un prototype de Solstice Lab, un
  sous-domaine d'envoi dédié, pour ne pas engager la réputation du domaine
  principal.
- **Les variables** du tableau ci-dessus chez l'hébergeur, et le secret avec
  l'adresse de l'appli dans les réglages du dépôt chez GitHub.
- **Une répétition** à blanc, puis un essai vers une adresse de l'équipe, avant
  de laisser la tâche planifiée envoyer pour de vrai.

## Pièges verrouillés

Un test par piège, écrit avant le code et intitulé d'après la règle qu'il
verrouille, dans `tests/notifications.test.ts`, `tests/notifications-jour.test.ts`
et `tests/notifications-route.test.ts`.

| Piège | Test |
| --- | --- |
| La date du jour diverge vers minuit (serveur en UTC) | « la date du jour se calcule dans le fuseau du client et s'injecte, jamais celle du serveur » |
| Jour d'envoi codé dans la route | « le jour d'envoi est décidé par une fonction pure, testable sans horloge » |
| Un échec bloque les suivants | « l'échec d'envoi à une personne ne bloque ni les suivantes ni le reste du traitement » |
| Un nom inséré tel quel dans le HTML | « un objet contenant du HTML s'affiche tel quel dans le mail, sans lien injecté » |
| Un mode essai qui écrit partout | « le mode essai n'écrit qu'à l'adresse donnée… » et « le mode essai refuse une adresse hors de la liste permise, avant tout envoi… » |
| Un mode à blanc qui envoie | « le mode à blanc n'envoie rien, n'écrit rien et liste ce qu'il enverrait » |
| Destinataire introuvable | « une adresse absente ou vide est journalisée et n'arrête pas la boucle » |
| Route appelable par n'importe qui | « sans le bon secret (…), la route répond 401 et n'envoie rien » et « sans secret configuré chez l'hébergeur, la route répond 401 à tous… » |
| Aucune trace des envois | « chaque envoi, réussi ou non, laisse une ligne au journal » |
| Succès silencieux sans clé | « sans clé d'envoi, l'envoi échoue explicitement » |
| Des adresses dans les journaux de la tâche planifiée | « en mode réel, le rapport ne contient aucune adresse : seulement des comptes » |
| Un journal gardé sans fin | « efface, à chaque envoi, les lignes plus anciennes que la durée de conservation, et garde les autres » |
| Une tâche relancée qui renvoie tout | « un deuxième appel réel le même jour n'envoie rien… » et « deux appels réels simultanés le même jour n'envoient qu'une fois… » |
| Une répétition mal tapée qui part pour de vrai | « refuse un corps qui ne nomme pas son mode par un 400, sans rien envoyer ni fabriquer » (et ses variantes) |
| Une adresse dans les journaux d'accès | « le mode et l'adresse d'essai se lisent dans le corps de la requête, jamais dans l'URL » |

Seule la frontière est réglée : comme ceux de la brique mails, les tests
posent `NODE_ENV` et les variables d'envoi par `vi.stubEnv` pour obtenir un
envoi qui échoue (sans clé en production, ou adresse mal formée), et lisent
ce qui serait parti par `mailsCaptures()`. Le journal est écrit dans une vraie
base de test.

### Pièges des évolutions (notés, leurs tests s'écriront avec elles)

- **Horloge** : comparer « le mail précède la modification » avec l'horloge de
  Postgres, pas celle de l'appli (décalage d'horloge entre conteneur et hôte).
- **Changement réel** : le détecter par comparaison avant et après dans la
  même requête, pas parce que la date de mise à jour a avancé : un renommage la
  fait bouger.
- **Destinataires exclus** : l'auteur de la modification, les comptes
  inactifs, les désabonnés.
- **Désabonnement** : le jeton est celui du destinataire, et la page répond
  pareil pour « déjà désabonné » et pour un jeton inconnu.
- **Oubli ou jamais concerné** : séparer par une fenêtre d'historique, pour
  qu'une personne qui n'a jamais rien eu à faire ne noie pas les vrais oublis.
- **Envoi public** : un rappel qui nomme des retardataires se fait en privé
  seulement.

## Décisions prises

Par la personne responsable du projet, le 2026-10-28 :

| Question | Décision |
| --- | --- |
| Un mail par échéance ou un récapitulatif ? | Un récapitulatif hebdomadaire, sans état, un par responsable avec ses seuls contrats ; une adresse de repli pour les contrats sans e-mail. |
| Le jour d'envoi tient-il compte des jours fériés ? | Non : jour fixe, le lundi, réglable par branchement. |
| Le mode essai accepte-t-il une adresse libre ? | Non : une liste d'adresses permises dans la configuration. Limiter aux destinataires connus ne marcherait pas : qui répète n'est souvent responsable de rien. |
| `Echeance` porte-t-elle la ligne source ? | Non : la liaison fait sa propre requête et appelle les règles de `calcul.ts`. La brique échéances ne change pas. |
| Branchement sur la GMAO ? | Pas avec la brique : les contrats d'abord, la GMAO quand le besoin se confirme. |
| Installation et retrait | L'assembleur retire la brique, sa migration et ses variables. Une base déjà déployée garde sa table si on retire la brique ensuite : la supprimer est un geste humain. Ajouter la brique à une copie déjà assemblée passe par l'outil de mise à jour du catalogue (`--ajouter notifications`, lancé depuis le catalogue) ; le détail est dans « Ce qu'elle ne fait pas (v1) ». |
| Durée du journal | 12 mois, purgés par la route à chaque envoi. |
| Domaine d'envoi et compte | Pour un client, les siens ; pour un prototype, un sous-domaine dédié de Solstice Lab. Ne bloque que la mise en ligne. |
