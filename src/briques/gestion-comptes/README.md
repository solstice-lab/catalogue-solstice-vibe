# Brique gestion-comptes

L'écran `/comptes`, le niveau 3 des droits : un client gère
lui-même ses utilisateurs, sans toucher à la configuration ni redéployer. Un
admin y invite une adresse, change un rôle, désactive ou réactive un compte, et
ouvre ou ferme l'accès à un domaine.

Elle est **optionnelle**. Une appli qui s'en tient à la connexion seule
(niveau 1) ou aux rôles déclarés en configuration (niveau 2) ne la prend pas :
qui entre se dit alors dans `src/config/comptes.ts`.

Elle exige la brique **comptes**, qui porte les règles
(`src/briques/comptes/administration.ts`), les tables et leur étape de
migration. Cette brique-ci n'apporte que l'écran, l'action qui le garde et son
entrée de menu. Les règles sont décrites dans le README de comptes, section
« Le niveau 3 » : qui fait foi entre la base et la configuration, le passage du
niveau 2 au niveau 3, et le dernier admin protégé à deux portes.

## Ce qu'elle apporte

- **La page `/comptes`** (`src/app/comptes/page.tsx`), réservée à
  `comptes.administrer`. Sans ce droit, un 404.
- **Six server actions** (`src/app/comptes/actions.ts`) : inviter, changer un
  rôle, désactiver, réactiver, ouvrir et fermer un domaine. Chacune commence par
  `exiger("comptes.administrer")`, puisqu'une action se poste sans passer par
  l'écran.
- **L'écran** (`EcranComptes`) :
  - un `Tableau` des comptes : numéro, adresse, rôle, statut, origine,
    dernière connexion, date de création, actions. Le numéro est celui par
    lequel le journal d'audit désigne un compte (« compte n°12 ») : filtrer la colonne « N° »
    sur ce numéro retrouve le compte d'une ligne du journal. Le filtre cherche
    dans le texte, donc « 12 » montre aussi les n°112 ou 120 ;
  - un `Tableau` des domaines, ou un `EtatVide` s'il n'y en a aucun ;
  - une `Modale` par geste, qui dit ses effets avant de les produire et
    affiche le refus du serveur s'il y en a un.

  Le dernier admin actif n'a aucune action à l'écran. Un compte de démo et un
  domaine de la configuration non plus.
- **Le droit** `comptes.administrer` (`ACTIONS_GESTION_COMPTES`), donné à
  l'admin dans `src/config/acces.ts`, et l'entrée de menu « Comptes ».

## Interface publique

| Import | Symboles | Rôle |
| --- | --- | --- |
| `domaine.ts` | `ACTIONS_GESTION_COMPTES` | Les actions de la brique, à étendre dans `ACTIONS` de `src/config/acces.ts`. `DROITS["comptes.administrer"]` doit contenir `ROLE_ADMIN` : c'est ce rôle que la brique comptes protège du « dernier admin désactivé » (`tests/gestion-comptes.test.ts` le vérifie). |
| `domaine.ts` | type `RetourAdministration` | Ce que rend une server action de `/comptes` : `{ erreur }` à afficher dans la modale, ou `{ message }` à dire une fois le geste fait. |
| `EcranComptes.tsx` | `EcranComptes({ comptes, domaines, roles, roleParDefaut, roleAdmin, emailConnecte, actions })`, type `ActionsAdministration` | Le contenu de `/comptes`, que la page entoure de `AppLayout`. Les server actions lui sont passées en `actions` : la brique n'importe rien de `src/app`. |

**Règle d'entretien.** Tout changement d'interface publique met à jour cette
section. Il ajoute aussi une entrée **en fin** de [`CHANGELOG.md`](CHANGELOG.md),
dans la pull request qui le fait.

Les server actions de `src/app/comptes/actions.ts` ne sont pas une prise pour
l'appli : ce qu'une désactivation ou une réactivation entraîne ailleurs se
déclare dans le registre des effets de comptes (`src/config/effets-comptes.ts`),
que `desactiverAction` et `reactiverAction` jouent par la brique comptes, au
nom de la personne que rend `exiger`.

## Ce qu'elle n'importe pas

Le socle (`@/ui`, React, `@/lib/format`) et la brique comptes
(`administration.ts`, `entree.ts`), qu'elle exige. Ni la base, ni la brique
mails : c'est comptes qui écrit et envoie. `tests/gestion-comptes-isolement.test.ts`
le vérifie. Hors du dossier, les actions (`src/app/comptes/actions.ts`)
importent aussi `journaliser` si l'appli a la brique journal, pour la trace
des gestes qui en prennent une : l'assembleur retire cet import sans elle.

Sans elle, l'assembleur retire la page, les actions, ses lignes de
`src/config/acces.ts` (import, `ACTIONS`, `DROITS`), l'entrée de menu et les deux lignes que l'écran ajoute
au traitement « Comptes et connexion » de la politique de confidentialité
(`src/briques/comptes/confidentialite.ts`). Les règles restent dans comptes,
sans appelant : la colonne `gere_par_l_appli` reste à faux, la table
`domaines_admis` reste vide, et l'appli se comporte exactement comme au
niveau 2.

## À savoir

- **Avec un seul rôle** dans `ROLES` (niveau 1), toute personne connectée a
  `comptes.administrer`, et peut donc administrer les autres comptes. La
  blueprint doit le dire.
- **Le mail d'invitation** porte le lien de `/connexion` si `URL_PUBLIQUE`
  est réglée (brique déploiement, référencement). Sans elle, en local ou sur
  une recette, il part sans lien. En local, il s'affiche dans le terminal de
  `npm run dev` (`MAILS_FOURNISSEUR=console`).
- **Le journal d'audit**, si l'appli a sa brique : chaque action de
  `/comptes` trace son geste dans la transaction de son effet, au nom de la
  personne que lui rend `exiger`. Inviter, changer un rôle, ouvrir et fermer
  un domaine passent une trace (brique comptes, « La trace d'un geste ») ;
  désactiver et réactiver passent par le registre des effets de comptes, où le
  journal a son entrée. Sur `/journal`, un compte se lit « compte n°12 »,
  jamais par son adresse. Sans la brique journal, l'assembleur retire ces
  branchements.
- **Ce qu'un module fait d'un compte désactivé ou réactivé** (terminer une
  appartenance, nommer un autre gestionnaire) se déclare dans
  `src/config/effets-comptes.ts` (brique comptes, « Les effets d'un compte
  désactivé, réactivé ou effacé »), pas dans `src/app/comptes/actions.ts` : ce
  fichier est celui de la brique, et ses actions jouent déjà le registre.
