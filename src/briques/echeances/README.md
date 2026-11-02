# Brique échéances

Première brique du catalogue, née dans l'appli contrats. Elle
prévient avant qu'une date n'arrive : une vue « À venir » et une tuile
d'accueil, branchées sur n'importe quelle entité qui porte une date.

## Ce qu'elle apporte

- **Deux statuts** calculés chaque jour, dans le fuseau du client :
  - **en alerte** : la date tombe dans les `delai` prochains jours, J+`delai`
    compris ;
  - **échue récemment** : la date est passée depuis moins de `delai` jours,
    donc J−(`delai`−1) au plus loin (sauf `retardSansLimite`, ci-dessous).

  Au-delà, une ligne ne figure plus dans la vue ; elle reste dans la liste de
  son entité. Le calcul connaît aussi `a_venir` (au-delà de l'alerte), que la
  vue ne montre pas.
- **Retard sans limite**, si le branchement le demande
  (`retardSansLimite: true`) : une échéance passée ne quitte jamais la vue,
  quel que soit son âge, et son statut se dit « En retard » au lieu d'« Échue
  récemment ». Né de la GMAO, qui a servi de banc d'essai (une maintenance en
  retard de 35 jours doit rester visible) ; une fin de contrat n'en a pas
  besoin et garde la borne de J−(`delai`−1).
- **La vue « À venir »** (`VueAVenir`) : les échues récentes puis les
  échéances en alerte, par date, chacune menant à sa fiche. Elle s'affiche en
  `Tableau` sur ordinateur et en `ListeCartes` sur téléphone, avec un état
  vide explicite.
- **La tuile d'accueil** (`TuileEcheances`) : le nombre d'échéances en
  alerte, les échues récentes (ou les retards) en aide, et un lien vers la
  vue. Son libellé se règle (`intitules.tuile`) quand deux branchements
  partagent l'accueil.

Pas d'envoi de mail, de tâche planifiée, de récurrence ni de délai par ligne
en v1.

## Les fichiers

| Fichier | Rôle |
| --- | --- |
| `calcul.ts` | Les règles, en calcul pur : jours restants, statut, bornes de la vue, libellés. Importable côté client. |
| `branchement.ts` | Le type `Branchement` que l'appli remplit, et sa vérification. |
| `requete.ts` | `lireEcheances(branchement)` pour la vue et `compterEcheances(branchement)` pour la tuile : la lecture en base, par `query()` de `src/lib/db/client.ts`. Serveur seulement. |
| `VueAVenir.tsx` | La vue, côté client. |
| `TuileEcheances.tsx` | La tuile d'accueil. |

La brique n'importe que le socle : `@/ui`, `@/lib/db/client`,
`@/lib/format`, React et Next. `tests/echeances-isolement.test.ts` refuse
tout autre import, en particulier d'un module de l'appli.
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
| `branchement.ts` | types `Branchement`, `Intitules`, `PresentationEcheances` ; fonction `presentationDe(branchement)` | Déclarer le branchement (côté appli) ; ne passer au client que `PresentationEcheances`. |
| `requete.ts` (serveur seulement) | `lireEcheances(branchement, aujourdhui?)` → `Echeance[]` ; `compterEcheances(branchement, aujourdhui?)` → `{ enAlerte, echues }` | Alimenter la vue et la tuile. `aujourdhui` (« aaaa-mm-jj ») sert aux tests ; par défaut, le jour dans le fuseau du client. |
| `VueAVenir.tsx` | `VueAVenir({ presentation, echeances })` | La vue, composant client. |
| `TuileEcheances.tsx` | `TuileEcheances({ compte, presentation, href })` | La tuile ; `compte` vient de `compterEcheances`, `presentation` de `presentationDe`. |
| `calcul.ts` (pur) | types `Echeance`, `StatutEcheance`, `StatutVisible` ; `ajouterJours(date, jours)` ; `statutEcheance(date, aujourdhui, delai, retardSansLimite?)` ; `bornesDeLaVue(aujourdhui, delai)` | `Echeance` est la sortie de `lireEcheances`. `ajouterJours` sert aux scripts de démo d'une appli. `statutEcheance` et `bornesDeLaVue` sont ceux que la brique notifications fait appeler par une liaison de l'appli (son README, « La brancher ») : la brique elle-même ne les expose que pour cela. |

**Interne** : `verifierBranchement` (appelée par la lecture), `joursRestants`,
`echeanceVisible`, `libelleStatut` et `libelleJours` de `calcul.ts`. La vue
passe par `libelleStatut` parce que le libellé d'un statut dépend de
`retardSansLimite` ; une appli qui afficherait un statut elle-même devrait
faire de même, ce qui ferait de cette fonction un symbole public (à décider).

**Règle d'entretien.** Tout changement d'interface publique (symbole ajouté,
retiré ou renommé, signature ou props modifiées, option ajoutée au
`Branchement`) met à jour cette section et ajoute une entrée **en fin** de
[`CHANGELOG.md`](CHANGELOG.md), dans la pull request qui le fait : date, ce
qui change pour l'appelant, raison.

## La brancher sur une entité

Tout se déclare côté appli, jamais dans la brique. L'exemple suit le patron
`dossiers` du catalogue (`src/app/dossiers/`, CLAUDE.md §3) : sa table
`dossiers` porte `id`, `reference`, `client` et une colonne `echeance` de type
`date`, et `cheminDossier` de `src/lib/slug.ts` donne le chemin de sa fiche.
Une entité réelle remplace les noms ; la forme reste la même.

1. **La liaison**, `src/lib/echeances-dossiers.ts`. C'est ici que la brique
   apprend l'existence des dossiers ; elle-même n'en sait rien.

   ```ts
   import type { Branchement } from "@/briques/echeances/branchement";
   import { cheminDossier } from "@/lib/slug";

   // Les colonnes lues en plus de la date : ce que libellé, détail et lien demandent.
   type LigneDossier = { id: number; reference: string; client: string };

   // Prévenir 30 jours avant l'échéance de chaque dossier.
   export const ECHEANCES_DOSSIERS: Branchement<LigneDossier> = {
     id: "echeances-dossiers", // vue conservée du tableau : stable, unique dans l'appli
     table: "dossiers",
     colonneDate: "echeance", // de type date, jamais timestamp
     colonnes: ["id", "reference", "client"],
     delaiAlerteJours: 30,
     intitules: { entite: "Dossier", date: "Échéance", detail: "Client" },
     libelle: (dossier) => dossier.reference,
     detail: (dossier) => dossier.client,
     lien: (dossier) => cheminDossier(dossier),
   };
   ```

   Pour une entité dont une échéance passée doit rester visible jusqu'à son
   traitement (une maintenance), ajouter `retardSansLimite: true` et, si deux
   branchements partagent l'accueil, `intitules.tuile`.

2. **La page de la vue**, `src/app/a-venir/page.tsx`, avec le garde d'accès de
   l'entité en première ligne (la brique ne connaît pas les droits) et
   `force-dynamic` :

   ```tsx
   import { AppLayout, Carte } from "@/ui";
   import { presentationDe } from "@/briques/echeances/branchement";
   import { lireEcheances } from "@/briques/echeances/requete";
   import { VueAVenir } from "@/briques/echeances/VueAVenir";
   import { exiger } from "@/briques/comptes/roles";
   import { ECHEANCES_DOSSIERS } from "@/lib/echeances-dossiers";
   import { NAVIGATION, NOM_APP } from "@/lib/navigation";

   // Jamais prérendue : « aujourd'hui » change chaque jour et la liste se lit
   // en base à chaque requête ; le build ne doit pas interroger la base.
   export const dynamic = "force-dynamic";

   export default async function PageAVenir() {
     // La vue montre des dossiers : c'est leur garde qui s'applique.
     await exiger("dossiers.acceder");
     const echeances = await lireEcheances(ECHEANCES_DOSSIERS);

     return (
       <AppLayout nom={NOM_APP} sousTitre="À venir" navigation={NAVIGATION}>
         <Carte titre="Dossiers échus récemment ou en alerte">
           <VueAVenir presentation={presentationDe(ECHEANCES_DOSSIERS)} echeances={echeances} />
         </Carte>
       </AppLayout>
     );
   }
   ```

   `presentationDe` ne garde que ce que la vue peut recevoir côté client :
   les fonctions du branchement restent sur le serveur.

3. **L'entrée de navigation**, dans `src/lib/navigation.ts`, avec le même
   garde que la page :

   ```ts
   { libelle: "À venir", href: "/a-venir", visible: visiblePour("dossiers.acceder") },
   ```

4. **La tuile d'accueil**, si l'appli en veut une, dans un composant serveur
   de l'accueil, affichée seulement à qui a l'action de l'entité :

   ```tsx
   import { presentationDe } from "@/briques/echeances/branchement";
   import { compterEcheances } from "@/briques/echeances/requete";
   import { TuileEcheances } from "@/briques/echeances/TuileEcheances";
   import { peut, utilisateurCourant } from "@/briques/comptes/roles";
   import { ECHEANCES_DOSSIERS } from "@/lib/echeances-dossiers";

   export async function TuilesAccueil() {
     const utilisateur = await utilisateurCourant();
     return (
       <div className="sl-grille sl-grille--serree">
         {peut(utilisateur, "dossiers.acceder") && (
           <TuileEcheances
             compte={await compterEcheances(ECHEANCES_DOSSIERS)}
             presentation={presentationDe(ECHEANCES_DOSSIERS)}
             href="/a-venir"
           />
         )}
       </div>
     );
   }
   ```

5. **Un test du branchement**, dans l'appli (`tests/`), sur la base locale de
   test : poser un dossier à J+30, un à J+31, un à J−29 et un à J−30, puis
   vérifier que `lireEcheances(ECHEANCES_DOSSIERS, aujourdhui)` rend les deux
   premiers cas visibles et pas les deux autres, avec le libellé, le détail et
   le lien attendus. Les tests de la brique vérifient le calcul et la lecture
   sur une table d'essai, pas ce que l'appli déclare (voir « Le contrat de
   lecture »).

## Ce qu'on configure

| Réglage | Où | Exemple |
| --- | --- | --- |
| Entité, colonne de date, colonnes lues | `Branchement` | `dossiers`, `echeance`, `id`, `reference`, `client` |
| Délai d'alerte, en jours | `Branchement.delaiAlerteJours` | 30 |
| Un retard ne sort jamais de la vue | `Branchement.retardSansLimite` | absent (une fin de contrat), `true` (une maintenance en retard) |
| Libellé, détail, lien vers la fiche | `Branchement` | référence, client, `cheminDossier` |
| Intitulés de l'écran | `Branchement.intitules` | Dossier, Échéance, Client |
| Fuseau du client (« aujourd'hui ») | `FUSEAU` dans `src/lib/format.ts`, à côté de la locale | `Europe/Paris` |

« Aujourd'hui » ne se calcule jamais dans le fuseau du serveur :
l'hébergeur tourne en UTC, et à 23 h 30 UTC Paris est déjà le lendemain.

Table et colonnes entrent telles quelles dans le SQL. Seuls des
identifiants simples (`[a-z_][a-z0-9_]*`) sont acceptés : un autre nom fait
échouer la lecture. La colonne de l'échéance doit être de type `date` : un
timestamp ou un timestamptz est refusé à la première lecture, car son heure
et le fuseau de la base décaleraient le jour.

## Le contrat de lecture

Ce que la brique attend de la table qu'elle lit, et ce qu'elle en fait. Chaque
phrase dit quel test la verrouille ; « aucun test » signifie que la phrase
vient de la lecture du code et que rien n'échouerait si elle devenait fausse.

Les modules qui ont servi de bancs d'essai à la brique (contrats, GMAO,
commandes) ont été retirés du catalogue avec leurs tests de branchement. Ce
que ces tests verrouillaient est dit ci-dessous comme ce qu'un branchement
doit vérifier dans l'appli, par un test posé à côté de sa liaison : la brique
ne le vérifie pas à sa place.

### La table lue peut être une vue SQL

`Branchement.table` désigne une table **ou une vue** : la brique n'écrit
qu'un `SELECT` sur son nom et lit le type de la colonne de date dans
`information_schema.columns`, qui décrit aussi les vues (aucun test dédié à ces
deux mécanismes : ils sont couverts par les tests de lecture ci-dessous). Une
vue sert quand le libellé ou le lien demandent des colonnes d'autres tables
(la brique ne fait pas de jointure), ou quand la date se calcule (la
prochaine occurrence d'un plan, par exemple).

- **Lecture par le nom d'une vue** : aucun test de la brique ne lit une vue.
  Les deux branchements qui en lisaient une (plans de maintenance, livraisons
  à venir) le vérifiaient par leur propre test, dans l'appli : à refaire pour
  tout branchement qui lit une vue.
- **La vue expose la date en type `date`** (un `::date` dans la vue quand la
  date se calcule), sans quoi la lecture est refusée. Le refus est verrouillé
  sur une colonne de table (`tests/echeances-requete.test.ts`, « refuse une
  colonne d'échéance qui n'est pas de type date ») ; **aucun test ne le fait
  échouer sur une vue**.
- **Ce qui exclut une ligne se décide dans la vue**, jamais dans la brique, qui
  n'a pas de réglage pour cela (l'absence de réglage se lit dans `Branchement`,
  aucun test ne la verrouille) : un équipement hors service, une commande déjà
  reçue, un dossier clos. Le test du branchement, dans l'appli, pose une ligne
  exclue très en retard et vérifie qu'elle n'apparaît pas.

### Une date vide exclut la ligne

Une ligne dont la colonne de date est vide n'apparaît pas dans la vue « À
venir », même avec `retardSansLimite` : la requête filtre en base par
comparaison de la date aux bornes (`requete.ts`, `lireFenetre`), et une date
vide ne satisfait aucune comparaison. Une date vide n'arrive donc jamais à
`calcul.ts`, qui ne sait pas la traiter (aucun test).

- **Vue « À venir »** : **aucun test de la brique** ne pose une date vide. Le
  branchement des plans de maintenance le vérifiait avec `retardSansLimite`
  (« n'expose jamais un plan exclu, même très en retard : la date vide ne
  passe aucune borne de lecture ») ; sans `retardSansLimite`, rien ne l'a
  jamais vérifié. Un branchement dont la colonne de date admet le vide (c'est
  le cas de `dossiers.echeance`) le vérifie dans l'appli.
- **Tuile d'accueil** : `compterEcheances` passe par la même fonction
  `lireFenetre` que la vue, donc exclut la même ligne. **Aucun test ne le
  verrouille** : les comptes vérifiés par les bancs d'essai ne posaient aucune
  ligne à date vide que la brique ait eu à écarter elle-même (une vue SQL
  l'écartait avant, par `IS NOT NULL`).

### Les textes codés dans la brique

Les textes de l'écran viennent de `VueAVenir.tsx`, de `TuileEcheances.tsx` et
de `calcul.ts`. Seuls quatre se règlent, par `Branchement.intitules` (liste
lue dans le type `Intitules` de `branchement.ts`, aucun test) ; tous les autres
sont écrits en français dans la brique, et **ne suivent pas `LOCALE`** de
`src/lib/format.ts`, qui ne règle que le format des dates et des nombres
(lecture du code, aucun test). Les changer, c'est modifier la brique et, quand
il existe, le test cité.

**Réglés par `intitules`** (aucun test : ni `VueAVenir` ni `TuileEcheances`
n'est rendu par un test) :

| Réglage | Texte affiché | Si absent |
| --- | --- | --- |
| `entite` | titre de la colonne du libellé (« Dossier ») | obligatoire |
| `date` | titre de la colonne de date et libellé du champ de la carte (« Échéance ») | obligatoire |
| `detail` | titre de la colonne de détail et libellé du champ de la carte (« Client ») | la colonne et le champ n'existent pas, même si le branchement fournit `detail()` |
| `tuile` | libellé de la tuile d'accueil (« Maintenances à traiter ») | « Échéances à N jours », N étant `delaiAlerteJours` |

**Codés, qui ne se règlent pas :**

| Texte | Où | Test |
| --- | --- | --- |
| « Échue récemment », « En alerte » ; « En retard » à la place de « Échue récemment » quand `retardSansLimite` est vrai | `calcul.ts`, `libelleStatut` | `tests/echeances-calcul.test.ts`, « nomme « En retard » ce qui n'a pas de limite d'âge… » |
| « Aujourd'hui », « Demain », « Hier », « Dans N jours », « Il y a N jours » | `calcul.ts`, `libelleJours` | `tests/echeances-calcul.test.ts`, « dit l'écart en mots plutôt qu'en nombre signé » |
| « Statut » (titre de colonne), « Échéance » (titre de colonne et libellé du champ de la carte) | `VueAVenir.tsx` | aucun test |
| « Rien n'arrive à échéance » (titre de l'état vide) | `VueAVenir.tsx` | aucun test |
| « Aucune échéance dans les N prochains jours, et aucune en retard. » (avec `retardSansLimite`) ou « … ni passée depuis moins de N jours. » (sans) : seul N se règle, par `delaiAlerteJours` | `VueAVenir.tsx` | aucun test |
| « Aucune échéance ne correspond aux filtres. » (tableau filtré jusqu'au vide) | `VueAVenir.tsx` | aucun test |
| « et 1 échue récemment », « et N échues récemment » ; « et 1 en retard », « et N en retard » avec `retardSansLimite` ; rien quand le compte est nul | `TuileEcheances.tsx` | aucun test |
| Messages d'erreur d'un branchement mal déclaré (identifiant non simple, colonne qui n'est pas de type `date`, délai qui n'est pas un entier d'au moins 1), lus par la personne qui développe | `branchement.ts`, `requete.ts` | `tests/echeances-requete.test.ts` pour les deux premiers, sur un fragment du message (`/identifiant/`, `/type date/`) ; aucun pour le délai |

Le détail affiché par ligne (`detail()`), le libellé (`libelle()`) et le
format des dates (`date()` de `src/lib/format.ts`) viennent du branchement ou
du socle, pas de la brique. Aucun test ne verrouille cette répartition : un
test de branchement, dans l'appli, vérifie le libellé et le détail dans les
données lues, pas leur affichage ni le format des dates
(`tests/format.test.ts` couvre `date()` en fuseau négatif, pas son rendu dans
la vue).
