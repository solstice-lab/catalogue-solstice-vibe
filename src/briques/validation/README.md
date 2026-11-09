# Brique validation

Fiche écrite avant le code (décision du 2026-10-15 : on code d'abord ce qu'il
faut aux applis contrats et GMAO ; le lancement de cette brique est une demande
explicite de la personne responsable du projet). Elle
dit ce que la brique fait, ce qu'on y configure, et les pièges que nos anciens
projets ont déjà payés, chacun avec le test qui le verrouille. La fiche a été
validée, puis le noyau codé : `tests/validation.test.ts`,
`validation-cycle.test.ts` et `validation-isolement.test.ts`.

La brique est un **circuit de validation** : une file de propositions que la
personne habilitée accepte ou refuse. Elle a servi aux demandes d'achat,
banc d'essai de la brique avant leur retrait du catalogue ;
les non-conformités et les congés restent à venir
(l'inventaire des applis déjà livrées, tenu hors de ce dépôt, qui place la brique troisième des prochaines briques métier). Une proposition porte un contenu opaque pour la
brique ; ce qui se passe quand on l'accepte appartient à l'appli.

Périmètre de cette fiche, décidé le 2026-10-16 : **le noyau** (la file). Les deux
variantes vues dans un projet précédent y figurent comme pièges notés, sans test.

## Ce qu'elle apporte (v1, le noyau)

- **Une file de propositions** en base, chacune d'un *type* (déclaré au
  branchement), avec un contenu, une clé de déduplication et, au choix, une clé
  de groupement. Cycle : *en attente*, *acceptée*, *refusée*. Le contenu ne se
  lit que par le rendu et l'applicateur du type ; la brique vérifie seulement
  que c'est un objet.
- **Un rescan qui rafraîchit l'attente, pas le refus** : reproposer une clé
  encore en attente met à jour son contenu et son groupe (la source a pu
  changer), pour que la personne décide sur le contenu courant. Une
  proposition décidée n'est jamais réécrite.
- **Un refus qui garde la clé.** Une proposition refusée n'est pas supprimée :
  une nouvelle proposition de même clé (le rescan de la source) ne la
  ressuscite pas. Seul un geste humain explicite lève le refus, et il
  rafraîchit le contenu (projet précédent).
- **Une acceptation qui applique** : à l'acceptation, l'applicateur du type
  s'exécute dans la même transaction que le changement de statut. S'il échoue,
  la proposition reste en attente.
- **Une revérification à l'acceptation.** Une proposition restée longtemps en
  attente peut ne plus valoir (projet précédent : un « nouveau contact » proposé, créé
  entre-temps, aurait été créé en double). Chaque type déclare comment la
  revérifier ; une proposition devenue obsolète n'est pas appliquée.
- **Une décision tracée et idempotente** : qui, quand ; décider deux fois la
  même proposition (page périmée, double clic, deux personnes) ne fait rien de
  plus et ne plante pas.
- **Une décision en lot** : accepter ou refuser plusieurs propositions d'un
  coup, avec une confirmation explicite au-delà d'un seuil.
- **Un statut de groupe** calculé, pour afficher un groupe de propositions.
- **Un statut inconnu qui se dit tel quel**, jamais comme un état sain.

## Hors v1

- **Les deux variantes du projet précédent** (voir « Pièges des variantes ») : le document
  sortant (brouillon, envoyé, inscrit) et la demande à confirmation (statut
  « annulé », état « en vol » qui expire).
- **Un écran.** La v1 est de la logique et des tables ; l'appli construit sa
  file avec `Tableau` (skill `solstice-ui`). Remonter l'écran commun dans la
  brique est une décision de l'étape suivante, quand deux applis auront écrit le
  leur (voir « Décisions prises »).
- **L'annulation d'un refus en lot**, l'indicateur de santé (âge de la plus
  ancienne proposition), les statuts configurables.
- **Les droits** : la brique ne connaît aucun rôle de l'appli (voir « La
  brancher »).

## Frontière avec la brique import-lot

`src/briques/import-lot/README.md` porte son propre cycle de lot (*en
attente*, *confirmé*, *ignoré*) ; la convergence avec cette brique reste à
décider. Correspondance et différences, pour que la reprise soit possible
sans la décider maintenant :

| Import-lot | Validation | Ce qui diffère |
| --- | --- | --- |
| lot *en attente* | proposition *en attente* | Un lot d'import est un ensemble de lignes lues d'un fichier ; une proposition est une unité. Un lot d'import serait, ici, un **groupe** de propositions. |
| *confirmé* | *acceptée* | L'import confirme **tout ou rien** (une ligne en échec annule le lot). Ici l'acceptation en lot est **proposition par proposition** : une obsolète ne bloque pas les autres. |
| *ignoré* | *refusée* | Un lot ignoré est terminé. Une proposition refusée **garde sa clé** et peut être réactivée par un geste humain. |
| écriture à la confirmation, en une transaction | applicateur à l'acceptation, en une transaction | Même principe. |

Tant que les deux cycles coexistent, l'import n'importe pas cette brique et ne
la modifie pas. Convergence possible : le lot d'import devient un groupe de
propositions dont l'applicateur écrit dans l'entité cible, et le mode « tout ou
rien » devient une option du groupe. À décider par la personne responsable du projet : l'appli
Demande d'achat, banc d'essai des deux briques, a branché import-lot à côté de
celle-ci (bilan : ce que voit l'utilisateur avec deux files, le code écrit deux
fois), et la convergence reste ouverte.

## Les fichiers

| Fichier | Rôle |
| --- | --- |
| `cycle.ts` | Les statuts (`STATUTS`), le statut d'un groupe (`statutDeGroupe`), le libellé d'un statut, y compris inconnu (`libelleStatut`). Pur, importable côté client. |
| `branchement.ts` | Le type `Branchement` que l'appli remplit (registre de types avec rendu, revérification et applicateur ; clé de groupement ; seuil ; `peutDecider`), et sa vérification. |
| `propositions.ts` | La file, par `query()`/`transaction()` de `src/lib/db/client.ts` : `proposer`, `lirePropositions`, `lireGroupes`, `decider`, `leverRefus`, `deciderEnLot`, et les erreurs `ErreurDecision`, `ErreurDroit`, `ErreurConfirmation`. Serveur seulement. |
| `donnees-personnelles.ts` | Ce que la file garde sur une adresse, pour l'export et l'effacement des données d'une personne, si l'appli a la brique rgpd. Sans elle, inutilisé. Serveur seulement. |

La table `propositions` naît par l'étape « propositions : file de la brique
validation… » de `src/lib/db/migrations.ts` (jamais dans `schema.sql`), avec son index unique
partiel `propositions_cle_ouverte_unique` dans la **même étape** (incident du 2026-09-04). La contrainte de statut
de la table et la liste de statuts du code sont comparées par un test (voir les
pièges).

Comme la brique échéances, elle n'importe que le socle : aujourd'hui
`@/lib/db/client` et `@/lib/db/bornes` (la liste blanche du test d'isolement admet aussi
`@/lib/format`). Un test d'isolement sur le modèle de
`tests/echeances-isolement.test.ts` le verrouille, avec une liste blanche, et il
est prouvé par un cas fautif qu'il doit attraper. **Elle n'importe jamais
`src/briques/comptes/roles.ts`** (qui tire `next/navigation`) ni `src/briques/import-lot/`.
Une brique n'importe une autre brique que si elle la déclare dans son `exige`
(vérifié par le test de l'assembleur du catalogue) ; celle-ci n'en
déclare aucune.

## Interface publique

Ce qu'une appli peut importer et appeler. Est public ce que le code de l'appli
(`src/`, `scripts/`) importe aujourd'hui, ce que ce README (ou la fiche d'une
brique voisine) présente comme appelable (« Les fichiers », « La brancher »),
et les types qui composent ces symboles. Tout autre export existe pour les
fichiers de la brique ou pour ses tests : il peut changer sans entrée au
journal.

| Import | Symboles | Rôle |
| --- | --- | --- |
| `branchement.ts` | types `Branchement`, `TypeProposition`, `Decideur`, `Contenu`, `Transaction`, `Reverification` | Déclarer le branchement (côté appli). `Branchement.peutDecider` rend `boolean` ou `Promise<boolean>` (depuis le 2026-10-22). `peutDecider` et les applicateurs reçoivent le décideur passé par l'appli, rôle compris, e-mail sans espaces autour (depuis le 2026-10-28). `Transaction` est le client de `transaction()` de `src/lib/db/client.ts`. |
| `propositions.ts` (serveur seulement) | `proposer`, `lirePropositions`, `lireGroupes`, `decider`, `leverRefus`, `deciderEnLot` | La file : proposer, lire, décider une proposition, lever un refus, décider en lot. Depuis le 2026-10-28, `proposer` rafraîchit le contenu et le groupe d'une proposition encore en attente (issue `deja_en_attente`), et `proposer` comme `leverRefus` refusent un contenu qui n'est pas un objet (`Error`, `ErreurDecision` pour `leverRefus`). |
| `propositions.ts` | erreurs `ErreurDecision`, `ErreurDroit`, `ErreurConfirmation` | Ce que les fonctions ci-dessus lèvent ; l'appli les traduit en message. |
| `propositions.ts` | types `Decision`, `LignePropositions`, `Groupe`, `ResultatProposition`, `ResultatDecision`, `ResultatLeverRefus`, `ResultatLot` | Entrées et retours de ces fonctions. |
| `cycle.ts` (pur) | `STATUTS`, `libelleStatut(statut)`, `statutDeGroupe(statuts)` ; types `Statut`, `StatutGroupe`, `Ton` | Dire un statut à l'écran, y compris un statut inconnu. |
| `donnees-personnelles.ts` (serveur seulement) | `SOURCES_VALIDATION` | Si l'appli a la brique rgpd : la source `propositions` de son export, que son registre rassemble. Les propositions que la personne a décidées, ou dont le contenu cite son adresse comme valeur entière (le demandeur d'une demande d'achat). Son `effacer` garde la proposition et remplace l'adresse par « (adresse effacée) », comme décideur et comme valeur du contenu. |

**Interne** : `verifierBranchement` (appelée par chaque fonction de la file) et
`estStatutConnu`. La table `propositions` n'est pas une interface : l'appli
passe par les fonctions ci-dessus. Un cas connu a dérogé : le banc d'essai
(demandes d'achat) relisait le contenu d'une proposition par un `SELECT`
direct, pour le « contenu frais » de `leverRefus`. Une appli qui fait de même
le dit dans sa liaison : un changement de la table doit chercher cet appel.

**Règle d'entretien.** Tout changement d'interface publique (symbole ajouté,
retiré ou renommé, signature ou forme d'un retour modifiée, réglage ajouté au
`Branchement`) met à jour cette section et ajoute une entrée **en fin** de
[`CHANGELOG.md`](CHANGELOG.md), dans la pull request qui le fait : date, ce
qui change pour l'appelant, raison.

## La brancher

Tout se déclare côté appli, jamais dans la brique. L'exemple suit le patron
`dossiers` (CLAUDE.md §3), qui se lit dans le catalogue public
(`src/lib/db/dossiers.ts` du dépôt `solstice-lab/catalogue-solstice-vibe`),
pas dans l'appli : l'appli branche à sa place son propre module écrit sur ce
patron (sa table, son droit, ses fonctions de données). Dans l'exemple, une
proposition de **nouveau dossier** (venue d'un formulaire public, d'un rescan
ou d'un fichier), que la personne habilitée accepte, ce qui crée le dossier,
ou refuse. Une entité réelle remplace les noms ; la forme reste la même.

1. **La liaison**, `src/lib/validation-dossiers.ts` : un type par sorte de
   proposition, avec son rendu, sa revérification et son applicateur.

   ```ts
   import type { Branchement, Contenu } from "@/briques/validation/branchement";
   import { peut, utilisateurDeLEmail } from "@/briques/comptes/roles";
   import { creerDossier } from "@/lib/db/dossiers";

   // Stocké en clé dans la file : un identifiant simple.
   export const TYPE_NOUVEAU_DOSSIER = "nouveau_dossier";

   const CONTENU_ILLISIBLE = "Le contenu de la proposition est illisible : elle ne peut pas être appliquée.";

   // Le contenu est opaque pour la brique : seule l'appli sait le lire, et elle
   // dit quand elle ne peut pas (jamais d'exception dans `rendu`).
   type NouveauDossier = { reference: string; client: string; echeance: string | null };

   function lireNouveauDossier(contenu: Contenu): NouveauDossier | null {
     const { reference, client, echeance } = contenu;
     if (typeof reference !== "string" || typeof client !== "string") return null;
     return { reference, client, echeance: typeof echeance === "string" ? echeance : null };
   }

   export const PROPOSITIONS_DOSSIERS: Branchement = {
     id: "dossiers",
     types: {
       [TYPE_NOUVEAU_DOSSIER]: {
         libelle: "Nouveau dossier",
         rendu: (contenu) => {
           const dossier = lireNouveauDossier(contenu);
           return dossier ? `${dossier.reference} — ${dossier.client}` : "Proposition illisible";
         },
         // Rejouée à chaque acceptation : la référence a pu être prise pendant
         // que la proposition attendait. Elle reste alors en attente, avec ce motif.
         reverifier: async (contenu, tx) => {
           const dossier = lireNouveauDossier(contenu);
           if (!dossier) return { valide: false, motif: CONTENU_ILLISIBLE };
           const prise = await tx.queryOne(`SELECT 1 FROM dossiers WHERE reference = $1`, [dossier.reference]);
           return prise ? { valide: false, motif: `La référence ${dossier.reference} est déjà prise.` } : { valide: true };
         },
         // L'effet de l'acceptation, dans la transaction de la décision (`tx`) :
         // par `query()` il en sortirait, et une acceptation annulée le laisserait.
         appliquer: async (contenu, tx) => {
           const dossier = lireNouveauDossier(contenu);
           if (!dossier) throw new Error(CONTENU_ILLISIBLE);
           await creerDossier({ ...dossier, montant_centimes: 0, statut: "en_cours", notes: null }, tx);
         },
       },
     },
     // Les propositions d'une même source (un fichier, un rescan) se présentent ensemble.
     groupe: (_type, contenu) => (typeof contenu.source === "string" ? contenu.source : null),
     seuilLot: 20,
     // Seconde ligne de défense : le garde de la page et de l'action passe
     // d'abord. Une adresse inconnue de l'appli ne décide pas.
     peutDecider: async (decideur) => peut(await utilisateurDeLEmail(decideur.email), "dossiers.decider"),
   };
   ```

   Deux adaptations du module de l'appli que l'exemple suppose : l'action
   `dossiers.decider` s'ajoute à ses actions (`ACTIONS_DOSSIERS` de
   `src/lib/dossiers-domaine.ts` dans le patron) et à `DROITS`
   (`src/config/acces.ts`) ; et sa fonction de création (`creerDossier` de
   `src/lib/db/dossiers.ts` dans le patron) reçoit le client de la transaction
   en dernier paramètre (type `Transaction` de la brique), que le patron du
   catalogue ne prend pas encore : l'ajouter, facultatif, avec
   `query`/`queryOne` du socle par défaut.

2. **Proposer**, depuis une server action ou un script de l'appli, avec une
   clé qui identifie la source (la référence, ici) : reproposer la même clé
   rafraîchit l'attente et ne ressuscite jamais un refus.

   ```ts
   await proposer(PROPOSITIONS_DOSSIERS, {
     type: TYPE_NOUVEAU_DOSSIER,
     cle: reference,
     contenu: { reference, client, echeance, source: "formulaire" },
   });
   ```

3. **Les server actions de décision**, `src/app/dossiers/a-decider/actions.ts`,
   avec le garde `exiger(action)` de `briques/comptes/roles.ts` **en première
   ligne de chacune** (accepter, refuser, lever un refus, décider en lot). La
   brique ne vérifie les droits que par `peutDecider` : c'est une seconde ligne
   de défense, pas la première, et elle ne remplace pas le garde.

   ```ts
   "use server";

   import type { Decision } from "@/briques/validation/propositions";
   import { decider, deciderEnLot, leverRefus } from "@/briques/validation/propositions";
   import { exiger } from "@/briques/comptes/roles";
   import { PROPOSITIONS_DOSSIERS } from "@/lib/validation-dossiers";

   // `exiger` rend la personne de la session, e-mail et rôle : c'est le
   // décideur que la brique transmet à `peutDecider` et aux applicateurs.
   export async function deciderAction(id: number, decision: Decision) {
     const decideur = await exiger("dossiers.decider");
     return decider(PROPOSITIONS_DOSSIERS, { id, decision, decideur });
   }

   export async function deciderEnLotAction(decisions: { id: number; decision: Decision }[], confirme: boolean) {
     const decideur = await exiger("dossiers.decider");
     return deciderEnLot(PROPOSITIONS_DOSSIERS, { decisions, decideur, confirme });
   }

   // Lever un refus est un geste humain, avec le contenu frais que l'appli relit.
   export async function leverRefusAction(id: number, contenu: Record<string, unknown>) {
     const decideur = await exiger("dossiers.decider");
     return leverRefus(PROPOSITIONS_DOSSIERS, { id, contenu, decideur });
   }
   ```

   L'appli traduit en message les retours (`issue`) et les erreurs
   `ErreurDecision`, `ErreurDroit`, `ErreurConfirmation`.

4. **La page de file**, `src/app/dossiers/a-decider/page.tsx`, en
   `force-dynamic`, avec le même garde en première ligne : elle lit
   `lirePropositions(PROPOSITIONS_DOSSIERS, { statut: "en_attente" })` (et
   `lireGroupes` si les propositions se groupent), montre chaque ligne par
   `PROPOSITIONS_DOSSIERS.types[ligne.type].rendu(ligne.contenu)` dans un
   `Tableau` du kit, son statut par `libelleStatut` de `cycle.ts` (qui sait
   dire un statut inconnu), et appelle les server actions. Une décision en lot
   au-delà de `seuilLot` passe par une `Modale` de confirmation, qui envoie
   `confirme: true`.

5. **Une entrée de navigation**, avec le même garde que la page.

6. **Un test dans l'appli** : la server action refuse une personne sans le
   droit (rien n'est écrit) ; c'est ce que les tests de la brique ne peuvent
   pas vérifier (« Précision sur le test des droits »). Le banc d'essai le
   vérifiait avec ses propres modules ; chaque appli le refait pour les siens.

La décision se prend **avec la session de la personne** (celle que passe le
garde), jamais par un lien à jeton (cas d'une appli livrée). La brique ne peut
pas distinguer une session d'un objet fabriqué : elle exige un décideur
identifié par son e-mail et le transmet tel quel, rôle compris, à
`peutDecider` et aux applicateurs. Que ce décideur vienne bien d'une session,
c'est l'engagement du garde de la page et de la server action, côté appli.

## Ce qu'on configure

| Réglage | Où | Rôle |
| --- | --- | --- |
| Identifiant du branchement | `Branchement.id` | Stable et unique dans l'appli ; il nomme le branchement dans les erreurs. |
| Registre de types | `Branchement.types` | Pour chaque type : libellé, une ligne de rendu, **revérification** et **applicateur** (reçoit le contenu, la transaction et le décideur, rôle compris), tous deux obligatoires : un type sans appariement répond `{ valide: true }` explicitement, il ne l'oublie pas. |
| Clé de groupement | `Branchement.groupe` | Fonction du contenu : les propositions d'une même source se présentent ensemble. Facultative. |
| Seuil de confirmation en lot | `Branchement.seuilLot` | Au-delà, une décision en lot exige `confirme: true`. |
| Rôles qui décident | `Branchement.peutDecider` | Fonction de la personne, branchée sur `peut(utilisateur, action)` par l'appli. Rend un booléen ou une promesse de booléen : une appli qui relit le rôle en base à chaque requête ne le connaît pas d'avance. La brique l'attend toujours. |
| Statuts ouverts et terminaux | — | **Fixes en v1** (voir « Décisions prises »). Une base plus récente que le code peut porter un statut inconnu : il s'affiche tel quel. |

La table `propositions` est fixe. Les noms de type sont stockés en clé : seuls
des identifiants simples (`[a-z_][a-z0-9_]*`) sont acceptés, et un branchement
fautif casse fort (`verifierBranchement`).

## Décisions prises

Les trois premières ont été tranchées par la personne responsable du projet au lancement
de la brique ; les suivantes sont des propositions de cette fiche, validées telles
quelles, puis codées.

| Décision | Proposition | Qui tranche |
| --- | --- | --- |
| Noyau seul ou avec variantes | **Noyau seul** (tranché) | Responsable du projet |
| Frontière avec import-lot | Cycle propre à chaque brique, correspondance ci-dessus, rien partagé en v1 (tranché) | Responsable du projet |
| Où vit le contrôle statut du code contre contrainte de la base | **Un test de la brique**, qui lit la contrainte `CHECK` de la table ; sa généralisation est à venir (tranché) | Responsable du projet |
| Statuts configurables ou fixes | Fixes (*en attente*, *acceptée*, *refusée*) : un test peut alors comparer le code à la contrainte. La demande initiale cite « statuts ouverts et terminaux » comme réglage ; ils n'ont de sens qu'avec les variantes. | Responsable du projet |
| Décision en lot : tout ou rien ou proposition par proposition | **Proposition par proposition**, avec un rapport (acceptée, obsolète, déjà décidée). Une proposition obsolète ne doit pas bloquer les quarante-neuf autres. | Responsable du projet |
| Une proposition obsolète à l'acceptation | Elle **reste en attente**, avec le motif ; c'est la personne qui la refuse. Pas de refus automatique : un refus garde la clé. | Responsable du projet |
| Statut d'un groupe mixte (acceptées et refusées, aucune en attente) | Un statut inconnu l'emporte sur tout (un groupe illisible ne se dit pas sain) ; sinon « en attente » prime ; sinon *refusée* si toutes le sont, sinon *acceptée* si toutes le sont, sinon ***partielle***. | Responsable du projet |
| L'acceptation libère-t-elle la clé ? | Oui : seule une proposition en attente ou refusée tient la clé. Une acceptée a produit son effet, la source ne la reproposera pas si l'appariement est revérifié. | Responsable du projet |
| Un écran dans la brique | Pas en v1 : attendre qu'un deuxième branchement ait écrit sa file. | Responsable du projet |

## Pièges retenus et tests qui les verrouillent

Un test par piège, écrit avant le code et intitulé d'après le cas d'origine. Sources :
l'inventaire des applis déjà livrées, tenu hors de ce dépôt (un projet précédent et
deux applis livrées). Les cas du projet précédent n'ont pas été revérifiés
un à un, sauf la
contrainte Slack (voir le dernier piège) ; ceux des applis livrées non plus, par cette
fiche. À relire avant d'en citer un dans un test.

| Piège | Test | Source |
| --- | --- | --- |
| Un rescan ressuscite une proposition refusée | « un refus ne libère pas la clé : le rescan ne ressuscite pas la proposition » | projet précédent |
| Un refus qui revient tout seul, ou qui garde un contenu périmé | « lever un refus est un geste humain qui rafraîchit le contenu » | projet précédent |
| Une proposition ancienne crée un doublon | « accepter une proposition ancienne revérifie l'appariement » | projet précédent |
| Un lot entièrement ignoré affiché « confirmé » | « un groupe entièrement refusé finit « refusee », jamais « acceptee » » et « « en attente » prime » (`validation-cycle.test.ts`), relus par `lireGroupes` (`validation.test.ts`) | une appli livrée (import-lot, couverture) |
| Page périmée soumise deux fois | « décider deux fois la même proposition ne fait rien de plus » | une appli livrée |
| Deux décisions simultanées | « une demande ne produit qu'un dépôt : deux acceptations simultanées n'appliquent qu'une fois » | une appli livrée |
| Décision par lien à jeton | « une décision exige un décideur identifié, jamais un jeton à la place » : sans décideur identifié, rien n'est décidé | une appli livrée |
| Décision prise sur un contenu périmé | « un rescan rafraîchit le contenu et le groupe d'une proposition encore en attente, jamais ceux d'une proposition décidée » | relecture de la brique |
| Contenu absent qui casse en base | « un contenu absent ou qui n'est pas un objet est refusé avant la base » | relecture de la brique |
| Décideur réduit à son e-mail, refusé par une règle qui lit le rôle | « peutDecider et l'applicateur reçoivent le décideur avec son rôle, pas un e-mail seul » | relecture de la brique |
| Choix laissé vide et rempli par défaut | « une décision vide bloque, jamais prise par défaut » | une appli livrée |
| Statut écrit par le code et refusé par la base | « tout statut que le code peut écrire passe la contrainte de la base, et la base n'en admet pas d'autre » | projet précédent, confirmé directement |
| Statut inconnu lu comme sain | « un statut inconnu s'affiche comme tel, avec sa valeur, jamais comme un état sain » | projet précédent |
| Décision sans droit | « décider refuse un utilisateur sans droit : rien n'est appliqué ni écrit » (voir la précision plus bas) | `CLAUDE.md` §3 |

Tests de plus, déduits des décisions de la fiche, sans cas d'origine :
« une décision en lot au-delà du seuil exige une confirmation explicite » ;
« une proposition obsolète ne bloque pas le reste d'un lot » ; « un applicateur
qui échoue laisse la proposition en attente et n'écrit rien » (l'applicateur et
le changement de statut sont une seule transaction). Le test d'isolement est une
règle d'architecture : prouvé par un cas fautif qu'il doit attraper
(`solstice-livrer`).

**Précision sur le test des droits.** La demande initiale exige qu'« une server action
de décision refuse un utilisateur sans droit ». Une brique n'importe pas
`briques/comptes/roles.ts` et ne porte donc aucune server action : elle ne peut tester que
sa fonction `decider` avec un `peutDecider` qui refuse (rien n'est écrit). Le
test de la server action elle-même, garde en première ligne comprise,
appartient au ticket de branchement de chaque appli. Cette fiche ne le promet
pas.

### Pièges des variantes (notés, sans test à ce stade)

- **Document sortant** : un brouillon périmé se traite par une mise à jour
  **explicite**, jamais par un recalcul silencieux ; « envoyé sans
  facture » bloque « Préparer » ; un seul brouillon ouvert par
  (client, période) ; le système externe d'abord, la base ensuite.
- **Demande à confirmation** : un état « en vol » doit expirer, avec une
  péremption supérieure au délai d'abandon du traitement (30 min contre 25 min
  de délai) ; la barrière d'arrêt se place dans l'étape
  irréversible ; l'agent n'annonce jamais lui-même son succès ; la matrice
  rôle × motif de blocage se teste par comportement, pas par lecture du
  source.

## Questions ouvertes

| Question | Qui tranche | Avant quelle étape |
| --- | --- | --- |
| Le retrait de la table `propositions` d'une copie client : l'assembleur du catalogue retire la brique, ses tests et son étape de migration, et un test le vérifie ; à confirmer par l'essai complet. | Responsable du projet | Avant la prochaine copie client |
| Un rescan rafraîchit le contenu d'une proposition en attente : s'il passe entre l'affichage de la file et le clic, `decider` (qui ne reçoit que l'id) applique un contenu que la personne n'a pas vu. Proposition : `decider` reçoit en option le contenu affiché et rend `obsolete` s'il a changé. Le banc d'essai (demandes d'achat) proposait toujours une clé neuve : le cas ne s'est pas présenté. | Responsable du projet | Au premier branchement dont la source repropose une clé |
| Le contenu est du JSON opaque : sa forme par type n'est vérifiée que par l'appli. Faut-il une validation au branchement (un schéma par type) ? | Responsable du projet | Au prochain type de proposition |
| Les identifiants des acteurs : l'e-mail de la session (`Utilisateur.email`) sert de trace. Depuis la brique comptes, il vient d'un compte en base, rangé en minuscules (en démo, d'un compte fictif). Depuis la connexion par code, l'adresse est prouvée par un code reçu à cette adresse. Depuis la connexion avec Google, elle vient de Google, qui n'est retenu que s'il l'a vérifiée et en fait autorité (Gmail ou Workspace, voir le README de comptes). Depuis la connexion avec Microsoft, elle vient de Microsoft, qui n'est retenu que si le jeton dit le domaine de l'adresse vérifié (`xms_edov`) ; ce que vaut cette garantie pour un compte personnel est à confirmer au premier essai. | Responsable du projet | Après le premier essai réel de la connexion avec Microsoft |

## Sources

- L'inventaire des applis déjà livrées, tenu hors de ce dépôt : la brique
  retenue ; la file de propositions à valider du projet précédent ;
  le cycle en attente, confirmé, ignoré du lot d'import d'une appli livrée ; la demande
  d'autorisation et la décision avec session d'une autre appli livrée.
- `src/briques/import-lot/README.md` : le cycle de lot repris dans la
  frontière ci-dessus.
- `src/briques/echeances/README.md` : le modèle de ce document.
