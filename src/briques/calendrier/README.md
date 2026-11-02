# Brique calendrier

Deuxième brique livrée du catalogue, née dans la GMAO. Elle montre les
événements d'une entité datée sur un mois : une grille sur ordinateur, une
liste en cartes sur téléphone, chaque événement menant à sa fiche. Elle se
branche sur n'importe quelle table ou vue qui porte une date.

## Ce qu'elle apporte

- **Le mois choisi par l'adresse** : `?mois=aaaa-mm`. Sans paramètre, ou avec un
  paramètre invalide (« 2026-13 », « abc », paramètre répété), la page ouvre le
  mois courant, dans le fuseau du client. Pas de page d'erreur pour une adresse
  retouchée à la main.
- **La navigation** : mois précédent, mois suivant, et « Aujourd'hui » dès
  qu'on est sur un autre mois que le mois courant. Ce sont des liens, pas des
  boutons : le mois consulté se partage et survit au rechargement.
- **La grille** (`GrilleMois` du kit, alimentée par `construireSemaines`) : des
  semaines pleines, du lundi au dimanche. Les jours des mois voisins qui
  complètent la première et la dernière semaine sont grisés et ne portent aucun
  événement : chaque événement se lit dans son propre mois, jamais deux fois.
  Le jour courant est repéré. Dans une journée, les événements sont triés par
  libellé.
- **La liste du téléphone** (`ListeCartes`) : les événements du mois par date,
  car sept colonnes sont illisibles à 375 px.
- **Un état vide explicite** pour un mois sans événement.

Elle ne montre que ce qui s'est passé ou est daté : elle ne planifie rien, ne
déplace rien par glisser-déposer, n'envoie ni mail ni rappel, n'a ni vue
semaine ni vue jour, et ne gère pas de récurrence. La semaine commence un
lundi, sans réglage.

## Les fichiers

| Fichier | Rôle |
| --- | --- |
| `calcul.ts` | Les règles, en calcul pur : lecture du mois de l'adresse, mois voisins, bornes du mois, construction des semaines. Importable côté client. |
| `branchement.ts` | Le type `Branchement` que l'appli remplit, et sa vérification. |
| `requete.ts` | `lireEvenements(branchement, mois)` : la lecture en base, par `query()` de `src/lib/db/client.ts`. Serveur seulement. |
| `VueCalendrier.tsx` | La vue (navigation, grille, cartes, état vide), rendue côté serveur. |

La grille (`GrilleMois`) et la navigation (`NavigationMois`) sont dans le kit,
`src/ui/` : ce sont des composants sans règle métier, réutilisables hors de la
brique.

La brique n'importe que le socle : `@/ui`, `@/lib/db/client`, `@/lib/format`,
React et `next/link`. `tests/calendrier-isolement.test.ts` refuse tout autre
import, en particulier d'un module de l'appli ou de la brique voisine.
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
| `branchement.ts` | types `Branchement`, `Intitules` | Déclarer le branchement (côté appli) ; `Intitules` se passe aussi à la vue. |
| `requete.ts` (serveur seulement) | `lireEvenements(branchement, mois)` → `Evenement[]` | Les événements d'un mois « aaaa-mm », bornes comprises. |
| `calcul.ts` (pur) | `lireMois(valeur, aujourdhui)` ; type `Evenement` | Le mois demandé par l'adresse (`?mois=`), ou le mois courant ; `Evenement` est la sortie de `lireEvenements`. |
| `VueCalendrier.tsx` | `VueCalendrier({ mois, evenements, intitules, aujourdhui })` | La vue, rendue côté serveur. |

**Interne** : `verifierBranchement` (appelée par la lecture), `moisPrecedent`,
`moisSuivant`, `bornesDuMois` et `construireSemaines` de `calcul.ts`.

**Règle d'entretien.** Tout changement d'interface publique (symbole ajouté,
retiré ou renommé, signature ou props modifiées, réglage ajouté au
`Branchement`) met à jour cette section et ajoute une entrée **en fin** de
[`CHANGELOG.md`](CHANGELOG.md), dans la pull request qui le fait : date, ce
qui change pour l'appelant, raison.

## La brancher sur une entité

Tout se déclare côté appli, jamais dans la brique. L'exemple suit le patron
`dossiers` du catalogue (`src/app/dossiers/`, CLAUDE.md §3) : sa table
`dossiers` porte `id`, `reference`, `client` et une colonne `echeance` de type
`date`, et `cheminDossier` de `src/lib/slug.ts` donne le chemin de sa fiche.
Le calendrier montre alors les échéances du mois. Une entité réelle remplace
les noms ; la forme reste la même.

1. **La liaison**, `src/lib/calendrier-dossiers.ts` :

   ```ts
   import type { Branchement } from "@/briques/calendrier/branchement";
   import { cheminDossier } from "@/lib/slug";

   // Les colonnes lues en plus de la date : ce que libellé, détail et lien demandent.
   type LigneDossier = { id: number; reference: string; client: string };

   export const CALENDRIER_DOSSIERS: Branchement<LigneDossier> = {
     id: "calendrier-dossiers", // stable, unique : il nomme le branchement dans les erreurs
     table: "dossiers", // table ou vue, lue sans jointure
     colonneDate: "echeance", // de type date, jamais timestamp
     colonnes: ["id", "reference", "client"],
     intitules: { entites: "échéances", date: "Échéance", detail: "Client" },
     libelle: (dossier) => dossier.reference,
     detail: (dossier) => dossier.client,
     lien: (dossier) => cheminDossier(dossier),
   };
   ```

   `intitules.entites` est au pluriel et en minuscules : il entre dans « Pas
   d'échéances en octobre 2026 » et dans le titre d'accessibilité de la grille.
   Si le lien a besoin de la date elle-même (un slug qui la porte), l'ajouter
   à `colonnes` : elle sort alors en texte « aaaa-mm-jj », pas en objet `Date`.

2. Si le libellé ou le lien demandent des colonnes d'autres tables, lire une
   **vue** plutôt qu'une table : la brique ne fait pas de jointure. La vue naît
   dans une étape ajoutée en fin de `src/lib/db/migrations.ts`, et expose la
   date en type `date` (`::date` si elle se calcule).

3. **La page**, `src/app/calendrier/page.tsx`, avec le garde d'accès de
   l'entité en première ligne (la brique ne connaît pas les droits) et
   `force-dynamic` :

   ```tsx
   import { AppLayout, Carte } from "@/ui";
   import { lireMois } from "@/briques/calendrier/calcul";
   import { lireEvenements } from "@/briques/calendrier/requete";
   import { VueCalendrier } from "@/briques/calendrier/VueCalendrier";
   import { exiger } from "@/briques/comptes/roles";
   import { CALENDRIER_DOSSIERS } from "@/lib/calendrier-dossiers";
   import { aujourdhui } from "@/lib/format";
   import { NAVIGATION, NOM_APP } from "@/lib/navigation";

   // Jamais prérendue : « aujourd'hui » change chaque jour et le mois se lit
   // en base à chaque requête ; le build ne doit pas interroger la base.
   export const dynamic = "force-dynamic";

   export default async function PageCalendrier({
     searchParams,
   }: {
     searchParams: Promise<{ mois?: string | string[] }>;
   }) {
     // La vue montre des dossiers : c'est leur garde qui s'applique.
     await exiger("dossiers.acceder");
     const aujourdhuiDuClient = aujourdhui();
     const mois = lireMois((await searchParams).mois, aujourdhuiDuClient);
     const evenements = await lireEvenements(CALENDRIER_DOSSIERS, mois);

     return (
       <AppLayout nom={NOM_APP} sousTitre="Calendrier des échéances" navigation={NAVIGATION}>
         <Carte titre="Échéances du mois">
           <VueCalendrier
             mois={mois}
             evenements={evenements}
             intitules={CALENDRIER_DOSSIERS.intitules}
             aujourdhui={aujourdhuiDuClient}
           />
         </Carte>
       </AppLayout>
     );
   }
   ```

   « Aujourd'hui » se calcule une fois, dans le fuseau du client, et sert aux
   deux : au mois par défaut et au repère du jour courant dans la grille.

4. **L'entrée de navigation**, dans `src/lib/navigation.ts`, avec le même
   garde que la page :

   ```ts
   { libelle: "Calendrier", href: "/calendrier", visible: visiblePour("dossiers.acceder") },
   ```

5. **Un test du branchement**, dans l'appli (`tests/`), sur la base locale de
   test : poser un dossier au premier jour du mois, un au dernier, un la
   veille et un le lendemain, puis vérifier que
   `lireEvenements(CALENDRIER_DOSSIERS, "aaaa-mm")` rend les deux premiers
   avec le libellé, le détail et le lien attendus, et pas les deux autres. Les
   tests de la brique couvrent le calcul (`tests/calendrier-calcul.test.ts`)
   et l'isolement ; la lecture en base, bornes du mois comprises, n'est
   vérifiée que par le test d'un branchement. Le branchement de la GMAO, banc
   d'essai de la brique avant son retrait du catalogue, la vérifiait sur une
   vue ; c'est à refaire dans chaque appli.

## Ce qu'on configure

| Réglage | Où | Exemple |
| --- | --- | --- |
| Table ou vue, colonne de date, colonnes lues | `Branchement` | `dossiers`, `echeance`, `id`, `reference`, `client` |
| Libellé, détail, lien vers la fiche | `Branchement` | référence, client, `cheminDossier` |
| Intitulés de l'écran | `Branchement.intitules` | échéances, Échéance, Client |
| Fuseau du client (« aujourd'hui », jour courant) | `FUSEAU` dans `src/lib/format.ts` | `Europe/Paris` |
| Langue des mois et des jours | `LOCALE` dans `src/lib/format.ts` | `fr-FR` |

Table et colonnes entrent telles quelles dans le SQL. Seuls des identifiants
simples (`[a-z_][a-z0-9_]*`) sont acceptés : un autre nom fait échouer la
lecture. La colonne de la date doit être de type `date` : un timestamp ou un
timestamptz est refusé à la première lecture, car le fuseau de la base
décalerait l'événement dans la case de la veille ou du lendemain. La colonne de
date, si elle figure dans `colonnes` (pour composer un lien), sort en texte
« aaaa-mm-jj » et non en objet `Date`.

Le mois demandé est borné aux années 1900 à 2100, pour une adresse retouchée à
la main : hors de cet intervalle, la page ouvre le mois courant.

## Ce qu'elle recopie de la brique échéances

La vérification du type `date` et celle des identifiants SQL sont écrites dans
cette brique comme dans la brique échéances : une brique n'importe que le
socle, pas sa voisine. Si une troisième brique en a besoin, ces deux règles
sont candidates à remonter dans le socle (`src/lib/db/`).
