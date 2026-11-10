# Brique import-lot

Décision du 2026-10-15 : on code d'abord ce qu'il faut aux applis contrats et
GMAO ; la brique a démarré ensuite, à la demande de la personne responsable du
projet. La fiche a été écrite avant le code, puis les tests,
un par piège que nos anciens projets ont déjà payé, puis le code. Branchée
d'abord sur les commandes de l'appli Demande d'achat, banc d'essai de la brique
avant son retrait du catalogue, puis, dans une appli assemblée, sur des
équipements. Elle fournit aussi ses écrans : chaque branchement en recopiait
environ 600 lignes.

La brique importe un fichier Excel (`.xlsx`) ou CSV vers un **lot à valider**,
que la personne confirme ou ignore. Chaque client part de son Excel : c'est la
brique la plus universelle du catalogue (l'inventaire des applis déjà livrées,
tenu hors de ce dépôt, la place en tête des prochaines briques métier).
Le cadrage de l'appli contrats classe « Import d'un Excel » hors v1.

## Ce qu'elle apporte (v1)

- **Une lecture par en-têtes**, avec tolérance sur les types : les colonnes se
  retrouvent par leur titre (sans tenir compte de la casse ni des espaces),
  pas par leur rang. Une ligne qu'on ne peut pas lire est **écartée avec son
  numéro de ligne dans le fichier**, jamais perdue en silence. Une colonne
  obligatoire absente du fichier est refusée d'emblée, une seule fois. Une
  règle que seule l'appli connaît (`ecarter`) écarte de la même façon, avec son
  motif, une ligne que l'écriture refuserait.
- **Un format reconnu au contenu**, pas à l'extension : `.xlsx`
  (signature zip) et CSV (texte UTF-8, séparateur virgule, point-virgule ou
  tabulation). Un `.xls` est reconnu mais **refusé avec un message qui dit
  d'enregistrer en `.xlsx`**, jamais lu de travers.
- **Un lot à valider** : le fichier lu devient un lot en base, dont les lignes
  n'écrivent dans aucune table métier. Cycle : *en attente*, *confirmé*, *ignoré*.
  La confirmation est **tout ou rien**.
- **Des doublons fusionnés avant l'écriture**, selon une clé configurable :
  deux lignes dont les clés se rapprochent après normalisation (casse,
  espaces, accents composés) n'en font qu'une. Le vide se remplit, le plein se
  garde, le conflit part au rapport du lot (`valeurRetenue`). Sans clé,
  rien n'est fusionné.
- **Une écriture dans l'entité cible** à la confirmation, par les fonctions de
  l'appli, dans une seule transaction, après validation complète.
- **Un compte rendu** de la confirmation : lignes créées, mises à jour,
  inchangées ; et sur le lot, les lignes écartées (numéro et motif) et les
  fusions.
- **Les écrans**, construits avec le kit `src/ui/` : la page
  « Importer » (envoi du fichier, liste des lots) et la page d'un lot (lignes
  retenues, lignes écartées avec leur numéro, fusions, et les gestes
  confirmer, ignorer, supprimer), ainsi que le cœur de l'envoi du fichier et
  des gestes. Les mots de l'entité et les colonnes se règlent par le
  branchement (`ecran`). **Les droits restent à l'appli** : ses pages, ses
  server actions et sa route posent leur garde, puis appellent la brique.

## Hors v1

- **Saisir un champ de décision depuis la page d'un lot**. La brique
  enregistre une décision (`renseignerDecision`) et bloque la confirmation tant
  qu'elle est vide, mais ses écrans ne savent pas la saisir : ils refusent un
  branchement qui déclare un champ `decision`, plutôt que de montrer un lot
  impossible à confirmer. Aucun branchement n'en déclare encore.
- **Lire un `.xls`** : refusé en v1, voir « Questions ouvertes ».
- **Défaire un lot confirmé.** Supprimer un lot supprime le lot et ses lignes,
  jamais ce qu'il a écrit dans l'entité (une ligne peut avoir été mise à jour
  par un lot plus récent). Retirer des lignes de l'entité est un geste
  de l'appli.
- **La grille de couverture** (période × catégorie, signalement des mois
  isolés au seuil de 10 %) : un seul projet l'utilise (une appli livrée).
- **Le tri `nulls_last`** : piège de SQLite, que Postgres ne partage pas.
- **L'export** : `src/ui/exporterTableau.ts` s'en charge déjà.
- **Plusieurs formats de fichier pour un même lot** (une appli livrée en a deux, un
  par réseau) : un branchement a une table en-tête vers champ.
- **Une file d'import en tâche de fond** : la lecture et la confirmation sont
  synchrones.

## Les fichiers

| Fichier | Rôle |
| --- | --- |
| `format.ts` | Reconnaître le format d'un fichier à sa signature. Pur. |
| `lecture.ts` | Lire un `.xlsx` ou un CSV vers des lignes brutes avec leur numéro. **Seul fichier qui importe `exceljs` et `jszip`** (ce dernier compte les octets décompressés avant `exceljs`). |
| `dates.ts` | Lire une date selon le format configuré, y compris le numéro de série d'un tableur. Pur. |
| `validation.ts` | Typer, contrôler les champs obligatoires, fusionner les clés rapprochées, ordonner les renvois. Pur. |
| `lot.ts` | Le cycle du lot, par `query()`/`transaction()` : `creerLot`, `lireLot`, `listerLots`, `renseignerDecision`, `confirmerLot`, `ignorerLot`, `supprimerLot`, et `champsDeDecisionVides` (pure). Serveur seulement. |
| `branchement.ts` | Le type `Branchement` que l'appli remplit, ses réglages d'écran (`ecran`), et leurs vérifications. |
| `types.ts` | Les types partagés. |
| `presentation.ts` | Ce que les écrans montrent, en calcul pur : statut d'un lot, colonnes et lignes affichées, textes par défaut. Importable côté client. |
| `gestes.ts` | Le corps des gestes sur un lot (`actionConfirmer`, `actionIgnorer`, `actionSupprimer`) et `lotDeLaPage`. Serveur seulement. |
| `envoi.ts` | `actionEnvoyer` : le cœur du Route Handler d'envoi (origine, plafond compté en lisant, lecture du formulaire, création du lot). Serveur seulement. |
| `donnees-personnelles.ts` | Ce que les lots gardent sur une adresse, pour l'export et l'effacement des données d'une personne, si l'appli a la brique rgpd. Sans elle, inutilisé. Serveur seulement. |
| `EcranImporter.tsx`, `EcranLot.tsx` | Les deux écrans, composants serveur. |
| `FormulaireEnvoi.tsx`, `ListeLots.tsx`, `TableauxLot.tsx`, `ActionsLot.tsx`, `BadgeStatutLot.tsx` | Leurs morceaux, côté client (le badge, des deux côtés). |

La brique n'importe que le socle : `@/lib/db/client`, `@/lib/db/bornes` (le plus
grand INTEGER, importable côté client), `@/lib/cle-rapprochement`
et `@/lib/import-fusion` (la règle de fusion `valeurRetenue` et le parseur CSV,
déplacés de `scripts/lib/cli.ts`, qui les ré-exporte), et, pour ses écrans,
`@/ui`, `@/lib/format`, React et Next (`next/navigation`, `next/cache`) ;
`exceljs` et `jszip` dans `lecture.ts` seulement. Jamais `@/briques/comptes/roles` : la brique ne
connaît pas les droits. `tests/import-lot-isolement.test.ts` le verrouille par
une liste blanche, prouvée par un cas fautif qu'il doit attraper.
Une brique n'importe une autre brique que si elle la déclare dans son `exige`
(vérifié par le test de l'assembleur du catalogue) ; celle-ci n'en
déclare aucune.

Deux tables, créées par une étape en fin de `src/lib/db/migrations.ts` :
`import_lots` et `import_lot_lignes` (les lignes meurent avec leur lot, et
rien d'autre ne les référence).

## Interface publique

Ce qu'une appli peut importer et appeler. Est public ce que le code de l'appli
(`src/`, `scripts/`) importe aujourd'hui, ce que ce README (ou la fiche d'une
brique voisine) présente comme appelable (« Les fichiers », « La brancher »),
et les types qui composent ces symboles. Tout autre export existe pour les
fichiers de la brique ou pour ses tests : il peut changer sans entrée au
journal.

| Import | Symboles | Rôle |
| --- | --- | --- |
| `branchement.ts` | types `Branchement`, `ChampImport`, `TypeChamp`, `FormatDate`, `ModeEcriture`, `ResultatEcriture`, `ValeursLigne`, `EcranImport`, `ColonneEcran`, `TextesEcran` | Déclarer le branchement (côté appli), dont les réglages facultatifs `ecarter` et `ecran` (voir « Ce qu'on configure »). |
| `types.ts` | type `Client` | Le client de la transaction de la confirmation, reçu par `ecrire` et `remplacer`. |
| `lot.ts` (serveur seulement) | `creerLot`, `lireLot`, `listerLots`, `renseignerDecision`, `confirmerLot`, `ignorerLot`, `supprimerLot` | Le cycle du lot. `listerLots` alimente aussi `EcranImporter`. |
| `lot.ts` | `champsDeDecisionVides` (pure) ; erreur `ErreurLot` ; types `Lot`, `LigneDeLot`, `StatutLot`, `RapportConfirmation` | Savoir ce qui bloque la confirmation ; message d'un refus du cycle ; ce que les fonctions du lot renvoient. |
| `lecture.ts` | erreur `ErreurFichier` ; constante `OCTETS_MAX` | Le message d'un fichier illisible (levée par `creerLot`) ; le plafond d'envoi, qu'`actionEnvoyer` applique avant de lire. |
| `types.ts`, `validation.ts` | types `LigneEcartee`, `Fusion` | Les lignes écartées et les fusions que porte un `Lot`. |
| `gestes.ts` (serveur seulement) | `actionConfirmer(branchement, lotId)`, `actionIgnorer(branchement, lotId)`, `actionSupprimer(branchement, lotId)` → `RetourGeste` ; `lotDeLaPage(branchement, id)` → `Lot` ou 404 | Le corps des server actions de l'appli, appelé après son garde ; le lot de la page `${chemin}/<id>`. |
| `envoi.ts` (serveur seulement) | `actionEnvoyer(branchement, request)` → `Response` | Le corps du Route Handler `${chemin}/envoi` de l'appli, appelé après son garde. |
| `presentation.ts` | type `RetourGeste` | Ce que rendent les gestes : `{ reussite, message }`. |
| `donnees-personnelles.ts` (serveur seulement) | `SOURCES_IMPORT_LOT` | Si l'appli a la brique rgpd : la source `lignes-importees` de son export, que son registre rassemble. Les lignes d'un fichier importé où l'adresse figure comme valeur entière. Son `effacer` garde la ligne et y remplace l'adresse par « (adresse effacée) ». |
| `EcranImporter.tsx` | `EcranImporter({ branchement, lots })` | La page « Importer », composant serveur ; `lots` vient de `listerLots(branchement.id)`. |
| `EcranLot.tsx` | `EcranLot({ branchement, lot, actions })` | La page d'un lot, composant serveur ; `lot` vient de `lotDeLaPage`, `actions` (`confirmer`, `ignorer`, `supprimer`) des server actions de l'appli. |
| `ActionsLot.tsx` | type `ActionsDuLot` | La forme de `actions`. |

**Interne** : `verifierBranchement` (appelée par `creerLot` et `confirmerLot`),
`verifierEcran` (appelée par les écrans et `actionEnvoyer`),
`lireFichier`, `LIGNES_MAX`, `OCTETS_DECOMPRESSES_MAX` et le type `Lecture` de `lecture.ts`, tout
`dates.ts` et `format.ts`, les autres exports de `validation.ts`
(`validerLignes`, `colonnesObligatoiresAbsentes`, `estVide`, `typerValeur` et
les types `LigneRetenue`, `ResultatValidation`) et le type `LigneBrute` ; les
autres exports de `presentation.ts` et les morceaux client des écrans
(`FormulaireEnvoi`, `ListeLots`, `TableauxLot`, `ActionsLot`, `BadgeStatutLot`).
Les tables `import_lots` et `import_lot_lignes` ne sont pas une interface :
l'appli passe par les fonctions de `lot.ts`.

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
patron (sa table, son droit, ses fonctions de données). Dans l'exemple, un
tableur de dossiers (référence, client, montant, échéance) importé en lot, qui
crée les dossiers nouveaux et met à jour ceux dont la référence existe. Une
entité réelle remplace les noms ; la forme reste la même.

1. **La liaison**, `src/lib/import-dossiers.ts`. `ecrire` appelle les
   fonctions de `src/lib/db/` de l'appli avec le `client` reçu : une écriture
   qui prendrait `query()` sortirait de la transaction de la confirmation, et
   l'échec d'une ligne plus loin laisserait les précédentes écrites.

   ```ts
   import type { Branchement, ValeursLigne } from "@/briques/import-lot/branchement";
   import type { RapportConfirmation } from "@/briques/import-lot/lot";
   import type { Client } from "@/briques/import-lot/types";
   import { creerDossier, lireDossierParReference, modifierDossier } from "@/lib/db/dossiers";
   import { montantCentimes } from "@/lib/format";

   // Une ligne que l'appli refuse d'écrire : le message nomme le dossier, pour
   // que la personne le retrouve dans son tableur. La brique ne transmet pas le
   // numéro de ligne à `ecrire` : c'est la référence qui identifie la ligne.
   export class ErreurImportDossier extends Error {
     constructor(message: string) {
       super(message);
       this.name = "ErreurImportDossier";
     }
   }

   // Écrit UNE ligne retenue, avec le client de la transaction de la confirmation.
   async function ecrireDossier(client: Client, valeurs: ValeursLigne): Promise<"cree" | "mis_a_jour" | "inchange"> {
     const reference = String(valeurs.reference);
     const montant_centimes = Math.round(Number(valeurs.montant ?? 0) * 100);
     // La base refuse au-delà de l'INTEGER : sans ce contrôle, la confirmation
     // tomberait sur une erreur brute qui ne dit pas quelle ligne est en cause.
     if (!Number.isFinite(montant_centimes) || montant_centimes < 0) {
       throw new ErreurImportDossier(`Dossier ${reference} : le montant « ${String(valeurs.montant)} » est illisible.`);
     }
     const echeance = valeurs.echeance === null ? null : String(valeurs.echeance);
     const existant = await lireDossierParReference(reference, client);

     if (!existant) {
       await creerDossier(
         { reference, client: String(valeurs.client), montant_centimes, statut: "en_cours", echeance, notes: null },
         client
       );
       return "cree";
     }

     // Mise à jour en place. Ce que le fichier ne dit pas reste : une cellule
     // vide ne vide jamais une échéance saisie dans l'appli ; statut et notes
     // ne sont pas des colonnes du fichier. La référence ne change pas.
     const champs = {
       reference: existant.reference,
       client: String(valeurs.client),
       montant_centimes,
       statut: existant.statut,
       echeance: echeance ?? existant.echeance,
       notes: existant.notes,
     };
     const identique =
       existant.client === champs.client &&
       existant.montant_centimes === champs.montant_centimes &&
       existant.echeance === champs.echeance;
     if (identique) return "inchange";
     await modifierDossier(existant.id, champs, client);
     return "mis_a_jour";
   }

   function nombreDe(nombre: number, singulier: string, pluriel: string): string {
     return `${nombre} ${nombre > 1 ? pluriel : singulier}`;
   }

   // Le compte rendu, dans l'ordre où la personne le lit : nouveau, changé, inchangé.
   function phraseDuRapport(rapport: RapportConfirmation): string {
     return [
       nombreDe(rapport.creees, "dossier créé", "dossiers créés"),
       nombreDe(rapport.mises_a_jour, "mis à jour", "mis à jour"),
       nombreDe(rapport.inchangees, "inchangé", "inchangés"),
     ].join(", ");
   }

   export const IMPORT_DOSSIERS: Branchement = {
     id: "dossiers",
     champs: [
       // Du texte : « 00417 » garde ses zéros de tête.
       { champ: "reference", entetes: ["Référence"], type: "texte", obligatoire: true },
       { champ: "client", entetes: ["Client"], type: "texte", obligatoire: true },
       { champ: "montant", entetes: ["Montant", "Montant HT"], type: "nombre" },
       { champ: "echeance", entetes: ["Échéance"], type: "date" },
     ],
     // La référence identifie un dossier : deux lignes qui la partagent fusionnent
     // avant l'écriture, et une référence existante se met à jour au lieu de se dupliquer.
     cle: ["reference"],
     // Jamais deviné : « 03/04/2026 » est le 3 avril dans un export français.
     formatDate: "jour_mois",
     mode: "mise_a_jour",
     ecrire: ecrireDossier,
     // Les écrans de la brique, dits avec les mots des dossiers.
     ecran: {
       chemin: "/importer",
       // Seule la confirmation écrit des dossiers : leur liste est à revalider.
       cheminsEcrits: ["/dossiers"],
       colonnes: [
         { champ: "reference", titre: "Référence", largeur: "130px" },
         { champ: "client" },
         { champ: "echeance", titre: "Échéance" },
         { champ: "montant", affichage: (montant) => montantCentimes(Math.round(Number(montant) * 100)) },
       ],
       textes: {
         fichier: "Fichier des dossiers",
         dansLEntite: "dans les dossiers",
         ecriture: "créés si la référence est nouvelle, mis à jour sinon.",
         ecritsRestent: "Les dossiers qu'il a déjà écrits restent en place.",
         rienEcrit: "aucun dossier n'a été écrit",
         aucuneFusion: "Aucune référence n'apparaît deux fois dans le fichier.",
         rapport: phraseDuRapport,
       },
       // Les messages de l'import disent eux-mêmes ce qu'il en est du lot ; toute
       // autre erreur est une panne, qui mène à la page d'erreur.
       refus: (erreur) => (erreur instanceof ErreurImportDossier ? `${erreur.message} Rien n'a été écrit.` : null),
     },
   };
   ```

   Une adaptation du module de l'appli que l'exemple suppose : ses fonctions
   de lecture par référence, de création et de modification
   (`lireDossierParReference`, `creerDossier` et `modifierDossier` dans
   l'exemple) reçoivent le client de la transaction en dernier paramètre. Le
   patron du catalogue (`src/lib/db/dossiers.ts`) ne le prend pas encore (et
   n'a pas de lecture par référence) : l'ajouter, facultatif, avec
   `query`/`queryOne` du socle par défaut.

2. **Quatre fichiers sous `src/app/importer/`** (le `chemin` déclaré dans
   `ecran`), qui posent chacun le garde de `briques/comptes/roles.ts` en
   première ligne (patron `dossiers`), puis appellent la brique. La brique ne
   connaît pas les droits ; l'action `dossiers.importer` se déclare dans les
   actions du module (`ACTIONS_DOSSIERS` de `src/lib/dossiers-domaine.ts` dans
   le patron) et dans `DROITS` (`src/config/acces.ts`), à un rôle
   d'administration.

   - `actions.ts`, une server action par geste :

     ```ts
     "use server";

     import { actionConfirmer, actionIgnorer, actionSupprimer } from "@/briques/import-lot/gestes";
     import type { RetourGeste } from "@/briques/import-lot/presentation";
     import { exiger } from "@/briques/comptes/roles";
     import { IMPORT_DOSSIERS } from "@/lib/import-dossiers";

     // Un lot se manipule par un identifiant posté à la main, sans passer par
     // l'écran : chaque geste pose le garde, puis appelle la brique.
     export async function confirmerLotAction(lotId: number): Promise<RetourGeste> {
       await exiger("dossiers.importer");
       return actionConfirmer(IMPORT_DOSSIERS, lotId);
     }

     export async function ignorerLotAction(lotId: number): Promise<RetourGeste> {
       await exiger("dossiers.importer");
       return actionIgnorer(IMPORT_DOSSIERS, lotId);
     }

     // Supprime le lot et ses lignes, jamais les dossiers qu'il a écrits.
     export async function supprimerLotAction(lotId: number): Promise<RetourGeste> {
       await exiger("dossiers.importer");
       return actionSupprimer(IMPORT_DOSSIERS, lotId);
     }
     ```

   - `envoi/route.ts` : un Route Handler, car une Server Action refuse un
     fichier de plus de 1 Mo (voir « Questions ouvertes ») ; même garde, avec
     un 404 nu faute de page :

     ```ts
     import { actionEnvoyer } from "@/briques/import-lot/envoi";
     import { peut, utilisateurCourant } from "@/briques/comptes/roles";
     import { IMPORT_DOSSIERS } from "@/lib/import-dossiers";

     export async function POST(request: Request): Promise<Response> {
       // Pas de page à qui rendre notFound() : la réponse est un 404 nu. Un
       // membre ne doit pas apprendre que l'URL existe.
       if (!peut(await utilisateurCourant(), "dossiers.importer")) return new Response(null, { status: 404 });
       return actionEnvoyer(IMPORT_DOSSIERS, request);
     }
     ```

   - `page.tsx`, en `force-dynamic` :

     ```tsx
     import { AppLayout } from "@/ui";
     import { EcranImporter } from "@/briques/import-lot/EcranImporter";
     import { listerLots } from "@/briques/import-lot/lot";
     import { exiger } from "@/briques/comptes/roles";
     import { IMPORT_DOSSIERS } from "@/lib/import-dossiers";
     import { NAVIGATION, NOM_APP } from "@/lib/navigation";

     // Jamais prérendue : les lots se lisent en base à chaque requête, et le
     // build ne doit pas interroger la base.
     export const dynamic = "force-dynamic";

     export default async function PageImporter() {
       await exiger("dossiers.importer");
       const lots = await listerLots(IMPORT_DOSSIERS.id);

       return (
         <AppLayout nom={NOM_APP} sousTitre="Importer des dossiers" navigation={NAVIGATION}>
           <EcranImporter branchement={IMPORT_DOSSIERS} lots={lots} />
         </AppLayout>
       );
     }
     ```

   - `[id]/page.tsx`, en `force-dynamic` ; `lotDeLaPage` rend un 404 pour un
     identifiant illisible ou le lot d'une autre entité :

     ```tsx
     import { AppLayout } from "@/ui";
     import { EcranLot } from "@/briques/import-lot/EcranLot";
     import { lotDeLaPage } from "@/briques/import-lot/gestes";
     import { exiger } from "@/briques/comptes/roles";
     import { IMPORT_DOSSIERS } from "@/lib/import-dossiers";
     import { NAVIGATION, NOM_APP } from "@/lib/navigation";
     import { confirmerLotAction, ignorerLotAction, supprimerLotAction } from "../actions";

     export const dynamic = "force-dynamic";

     export default async function PageLot({ params }: { params: Promise<{ id: string }> }) {
       await exiger("dossiers.importer");
       const lot = await lotDeLaPage(IMPORT_DOSSIERS, (await params).id);

       return (
         <AppLayout nom={NOM_APP} sousTitre={`Lot d'import : ${lot.nomFichier}`} navigation={NAVIGATION}>
           <EcranLot
             branchement={IMPORT_DOSSIERS}
             lot={lot}
             actions={{ confirmer: confirmerLotAction, ignorer: ignorerLotAction, supprimer: supprimerLotAction }}
           />
         </AppLayout>
       );
     }
     ```

3. **Une entrée de navigation**, dans `src/lib/navigation.ts`, avec le même
   garde que les pages :

   ```ts
   { libelle: "Importer", href: "/importer", visible: visiblePour("dossiers.importer") },
   ```

4. **Un test du branchement**, dans l'appli (`tests/`), sur la base locale de
   test : un lot lu d'un classeur fabriqué, confirmé, puis réimporté avec une
   ligne changée, vérifie qu'`ecrire` crée, met à jour en place et laisse
   inchangé ce qui n'a pas bougé, et qu'un montant illisible laisse le lot en
   attente sans rien écrire. Les tests de la brique (`tests/import-lot*.test.ts`)
   verrouillent la lecture et le cycle du lot sur un branchement d'essai, pas
   l'écriture d'une entité réelle : le banc d'essai la vérifiait avec ses
   propres modules, chaque appli le refait pour les siens.

5. Le retrait d'une copie client qui n'en veut pas : les deux tables et leur
   étape de migration. C'est l'assembleur du catalogue qui le fait,
   voir « Questions ouvertes ».

## Ce qu'on configure (`Branchement`)

| Réglage | Rôle |
| --- | --- |
| `id` | Identifiant stable du branchement : rattache les lots à leur entité, et refuse de confirmer un lot dans la mauvaise. |
| `champs` | La table en-tête vers champ : un ou plusieurs en-têtes (graphies d'un même export), un type (`texte`, `nombre`, `date`), `obligatoire`, `decision`. Un identifiant à zéros de tête se déclare `texte`. |
| `cle` | Les champs qui identifient une ligne, ou **aucune**. |
| `formatDate` | `jour_mois` ou `mois_jour`. Jamais deviné. |
| `mode` | `mise_a_jour` : `ecrire` met à jour en place. `remplacement` : `remplacer` efface la période avant les écritures. |
| `ecrire` | Écrit une ligne retenue, renvoie `cree`, `mis_a_jour` ou `inchange`. |
| `ecarter` | Facultatif. Appelée à la lecture, une fois par ligne retenue : rend le motif qui écarte la ligne (listée avec tous ses numéros, comme une ligne mal typée), ou `null`. Pour une règle que seule l'appli connaît et qui se lit en base ; `ecrire` garde sa propre vérification, car la base peut changer avant la confirmation. Appelée après l'ordre des renvois : écarter la cible d'un renvoi laisse la ligne qui la vise sans cible. |
| `remplacer` | Mode remplacement seulement : appelée une fois, quand tout est validé. |
| `renvoi` | Si l'entité se référence : le champ qui renvoie, et le champ renvoyé. La ligne qui renvoie s'écrit après sa cible. |
| `ecran` | Exigé par les écrans de la brique (un branchement qui garde ses propres pages s'en passe) : où ils vivent et ce qu'ils disent de l'entité. Détail ci-dessous. |

### Les réglages d'écran (`ecran`)

| Réglage | Rôle | Par défaut |
| --- | --- | --- |
| `chemin` | Adresse des pages : la liste, `${chemin}/<id>`, `${chemin}/envoi`. Commence par « / », sans « / » final. | aucun : obligatoire. La brique ne nomme pas les pages d'une appli ; un « /importer » écrit dans son code passait pour une trace du module qui la branchait, dans une copie qui ne garde que la brique. |
| `cheminsEcrits` | Pages que la confirmation change, revalidées avec la liste et la page du lot (liste de l'entité, accueil). Ignorer et supprimer n'écrivent rien dans l'entité : ils ne les revalident pas. | aucune |
| `colonnes` | Colonnes des lignes retenues, dans l'ordre : `champ`, `titre`, `largeur`, `affichage` (ce que la cellule montre, calculé sur le serveur ; le tri reste sur la valeur du lot). Une cellule vide montre « — ». La colonne « Ligne » (numéros dans le fichier) vient toujours en tête. | tous les champs dans l'ordre déclaré, titrés par leur premier en-tête, une date formatée |
| `textes` | Les phrases de l'entité, déclarées entières parce que genre et nombre changent d'une entité à l'autre : `fichier`, `dansLEntite`, `ecriture`, `ecritsRestent`, `rienEcrit`, `aucuneFusion`, `rapport(rapport)`, `aideRetenues`. Chacune est facultative et commentée dans `branchement.ts` ; `aideRetenues` n'a pas de valeur par défaut. | des phrases neutres, qui parlent de lignes |
| `refus` | `(erreur) => message ou null` : le message à montrer pour une erreur levée par `ecrire` (une référence prise au même instant, une ligne liée introuvable). Une erreur non traduite est une panne : elle mène à la page d'erreur. Les refus du cycle (`ErreurLot`) s'affichent toujours. | aucune traduction |

Ce qui ne se règle pas : la forme des deux écrans, les colonnes des lignes
écartées et des fusions (titrée par la ou les colonnes de la clé), les
statuts et leurs couleurs, les fenêtres de confirmation et de suppression,
le tout ou rien, et ce que la suppression fait (le lot et ses lignes, jamais
l'entité). Les tableaux portent l'`id` du branchement dans le leur : deux
imports d'une même appli ne mélangent pas leurs vues conservées.

## Décisions prises

Prises par la personne responsable du projet le 2026-10-16, en demandant de coder avec les propositions
de la fiche. Les écarts à ces propositions sont dits.

| Décision | Retenu |
| --- | --- |
| Deux lignes identiques : une appli livrée les refuse, le projet précédent (absences) les lit comme deux demi-journées. | La clé est un réglage explicite ; sans clé, rien n'est fusionné. **Écart : les lignes de même clé sont fusionnées** (et leurs conflits rapportés), pas refusées : c'est ce qu'exige le piège de la collision de clé (« fusionnées avant l'écriture »). |
| Mise à jour en place ou remplacement par période. | Les deux modes. Le remplacement n'efface qu'une fois les décisions complètes, dans la transaction : une écriture qui échoue restitue la période. |
| Ligne mal typée. | Écartée avec son numéro, jamais silencieuse. **Une confirmation avec des lignes écartées reste permise** : le rapport les montre. À reprendre si la personne doit pouvoir la bloquer. |
| Frontière avec la brique circuit de validation. | La v1 porte son propre cycle de lot, sans dépendre de la brique validation. Celle-ci existe désormais (`src/briques/validation/`) : sa fiche tranche, pour sa v1, que rien n'est partagé et donne la correspondance entre les deux cycles (section « Frontière avec la brique import-lot »). La convergence reste à décider. |
| Format de fichier. | `.xlsx` et CSV. Le `.xls` est refusé. |

## Pièges retenus et leurs tests

Sources : l'inventaire des applis déjà livrées, tenu hors de ce dépôt
(une appli livrée ; un projet précédent, par fonctionnalité). Les cas de l'appli
livrée ont été relus dans son dépôt d'origine : ses commits existent et leurs
messages disent ce qu'on leur attribue. Ceux du projet précédent n'ont pas été
revérifiés un à un. Les tests sont dans
`tests/import-lot*.test.ts`, intitulés d'après la règle.

| Piège | Règle verrouillée | Source |
| --- | --- | --- |
| Une date ambiguë lue jour/mois au lieu de mois/jour | « une date ambiguë se lit selon le format configuré, jamais devinée » ; une date impossible dans ce sens est refusée, jamais relue dans l'autre | une appli livrée, qui fixe le format dans le code et demande de le revérifier pour toute nouvelle source, d'où le réglage |
| Une colonne au nom trompeur qui contient déjà le total | « une colonne qui contient déjà le total est lue telle quelle, jamais recalculée » | une appli livrée |
| Une ligne mal typée ou sans correspondance disparaît | « écartée avec son numéro, jamais perdue en silence » ; « sans correspondance » s'entend d'une ligne sans champ obligatoire ou sans clé | une appli livrée ; projet précédent (finance) |
| Format décidé par l'extension | « un fichier se reconnaît à son contenu, pas à son extension » | une appli livrée |
| Erreur brute au-delà d'environ 90 lignes | « un lot de plusieurs centaines de lignes se confirme sans erreur » (1 500 lignes au test) | une appli livrée : la cause était la limite de champs de formulaire de Django ; ici, les lignes du lot s'insèrent en un seul paramètre JSON. Le risque d'un formulaire qui renvoie toutes les lignes reste à vérifier côté écran |
| Confirmation interrompue qui laisse un état partiel | « un échec au milieu de la confirmation ne laisse aucun état partiel » | une appli livrée |
| Écriture commencée avant la fin de la lecture | « tout le fichier est validé avant la première écriture » : créer un lot n'écrit rien dans l'entité | projet précédent (finance, absences) |
| Page périmée soumise deux fois | « confirmer deux fois le même lot ne crée rien et ne plante pas », y compris deux confirmations simultanées (verrou sur le lot) | une appli livrée |
| Suppression d'un lot qui efface les données d'un autre | « supprimer un lot ne touche aucune ligne d'un autre lot » ni l'entité | une appli livrée |
| Réimport qui efface la trace précédente | « un réimport met à jour en place et garde la trace du lot précédent » | une appli livrée (la trace reste consultable). La mise à jour en place est faite par `ecrire`, donc par l'appli : la brique verrouille la trace conservée et le rapport « mises à jour » ; dans cette appli, elle vient d'une contrainte d'unicité et d'un test du réimport qui chevauche le précédent |
| Choix laissé vide et rempli par défaut | « un champ de décision vide bloque la confirmation, jamais rempli par défaut » | une appli livrée |
| Zéros de tête perdus par le tableur | « un identifiant à zéros de tête reste du texte », en xlsx comme en CSV | projet précédent (finance, absences) |
| Date convertie en nombre par un tableur | « une date devenue nombre de série se relit comme une date » ; un petit nombre (« 2026 ») n'en est pas une | projet précédent (absences) |
| Chaîne vide dans une colonne de date | « une cellule de date vide devient absente, la ligne n'est pas rejetée » | projet précédent (marketing) |
| Collision de clé après normalisation | « deux clés que la normalisation rapproche sont fusionnées avant l'écriture » | projet précédent |
| Renvoi inséré avant son original | « une ligne qui renvoie à une autre du même lot s'insère après elle » ; un renvoi circulaire est écarté avec ses numéros | projet précédent |

Règles ajoutées après la revue du code, sans cas d'origine : une décision saisie à la main se type comme une cellule du fichier et ne change plus une fois le lot traité (verrou sur le lot, comme la confirmation) ; « 1,234 » est refusé, jamais deviné entre 1,234 et 1 234 ; un CSV non UTF-8 est refusé sur tout le fichier, pas sur ses premiers Ko ; deux colonnes de même titre sont refusées ; l'ISO d'un export (heure, Z, barres) se lit par son jour ; l'ordre d'écriture est une colonne (`ordre`), pas l'ordre des identifiants.

Règles ajoutées par la fiche, sans cas d'origine : sans clé de dédoublonnage,
deux lignes identiques sont deux lignes (le projet précédent, pour les absences, contre une appli livrée) ; un
remplacement dont une écriture échoue restitue la période ; un lot sans ligne
retenue ne se confirme pas, il s'ignore (une appli livrée : un lot
entièrement rejeté s'affichait « Confirmé ») ; un lot d'un autre branchement
ne se confirme pas ; en-têtes sans casse ni espaces, plusieurs graphies d'un
même champ (la première valeur non vide l'emporte, comme dans une appli livrée) ;
un champ facultatif illisible écarte la ligne (cette appli gardait la ligne
pour son taux facultatif : écart assumé, rien ne se perd en silence), alors
qu'une date facultative vide ne l'écarte pas.

## Questions ouvertes

| Question | Qui tranche | Avant quelle étape |
| --- | --- | --- |
| **Un vrai Excel anonymisé** pour vérifier le modèle : le cadrage de l'appli contrats le demande avant le premier vrai fichier, il n'est pas dans le dépôt. Les tests utilisent des classeurs fabriqués : la table en-tête vers champ et les formats de date d'un vrai client restent à vérifier. | Responsable du projet | Avant le premier vrai fichier |
| **Lire un `.xls`.** Constaté dans une appli livrée : l'export natif de LinkedIn est un `.xls`, lu par `xlrd` ; le `.xlsx` y a été ajouté ensuite. `exceljs` lit le `.xlsx` et le CSV, d'après nos connaissances de la bibliothèque, non vérifié dans sa documentation. Un vrai export client peut être un `.xls` : il faudrait une seconde bibliothèque, donc une dépendance à valider. | Responsable du projet | Quand un client en apporte un |
| **CSV : numéros de ligne.** Les lignes blanches sont comptées, donc le numéro annoncé est celui du fichier. Une cellule entre guillemets qui contient un saut de ligne, elle, décale encore les numéros suivants : le numéro est alors celui de l'enregistrement. En xlsx, le numéro est celui du tableur. | Responsable du projet | Si le cas se présente |
| **CSV : encodage.** Un CSV en Windows-1252 (l'option « CSV » d'un Excel français, hors « CSV UTF-8 ») est refusé comme format non reconnu, avec un message qui demande l'UTF-8. | Responsable du projet | Quand un client en apporte un |
| **Taille limite d'un fichier téléversé.** La brique refuse au-delà de 10 Mo envoyés, de 100 Mo une fois l'archive décompressée toutes feuilles comprises, et de 50 000 lignes (`OCTETS_MAX`, `OCTETS_DECOMPRESSES_MAX`, `LIGNES_MAX` dans `lecture.ts`). Le plafond de 10 Mo, compressé, ne protégeait pas la mémoire : un .xlsx de quelques Mo peut contenir des Go de XML, et `exceljs` décompresse toutes les feuilles avant que les lignes soient comptées (audit du 2026-11-09). La borne de 100 Mo se vérifie donc avant `exceljs`, sur les octets réellement décompressés et non sur la taille annoncée, qu'un fichier hostile falsifie. Mesuré : 50 000 lignes de 20 colonnes font 5 Mo envoyés, 55 Mo décompressés, 26 s de lecture et environ 1 Go de tas en plus ; la borne laisse donc un pic possible de 2 Go, à baisser si l'hébergeur en offre moins. **Tranché le 2026-10-19 par la personne responsable du projet : l'envoi passe par un Route Handler** (le `envoi/route.ts` de l'appli, dont le cœur est `envoi.ts` de la brique) et le plafond est celui de la brique. Une Server Action refuse un fichier dès 2 Mo (413, limite de 1 Mo, constatée sur Next 16.3.4, après l'échec « Unexpected end of form » vécu sur le projet précédent) ; le Route Handler a lu 12 Mo. L'essai était local : la limite d'un proxy d'hébergeur reste à relever. | Responsable du projet | Avant toute mise en ligne |
| **Retrait d'une copie client** : l'assembleur du catalogue retire la brique, ses tests et son étape de migration d'une copie neuve, et un test le vérifie ; à confirmer par l'essai complet. | Responsable du projet | Avant la prochaine copie client |
| **Durée d'une confirmation** de plusieurs milliers de lignes : une transaction unique (1 500 lignes testées), ou par paquets sans perdre le tout ou rien ? | Responsable du projet | Si un fichier réel dépasse le millier de lignes |
| Les cas cités du projet précédent (collision de clé, renvoi avant son original) ne sont pas revérifiés. | Responsable du projet | Avant de les citer ailleurs |

## Sources

- L'inventaire des applis déjà livrées, tenu hors de ce dépôt : la brique
  retenue (première des prochaines briques métier), « Import tabulaire vers un
  lot à valider, avec couverture » (une appli livrée), et pour le projet
  précédent : import prestataire, finance, absences,
  marketing ; le tableau récapitulatif en tête de cet inventaire.
- Le dépôt de cette appli livrée (lecture seule) : sa lecture des dates, sa
  correspondance des colonnes, ses imports de fichiers et ses tests d'import.
- `src/lib/cle-rapprochement.ts`, `src/lib/import-fusion.ts` et
  `tests/import-fusion.test.ts` : la clé de rapprochement et la règle de
  fusion réutilisées.
- `src/briques/echeances/README.md` : le modèle de ce document.
