# Travailler sur le dépôt (équipe Solstice Lab)

**Ce dépôt est entretenu par l'équipe Solstice Lab et n'accepte pas de
contribution extérieure.** Chacun peut l'utiliser, le copier et le modifier
chez soi, sous licence MIT ; une pull request venue d'ailleurs est fermée sans
être relue. Un problème se signale par un ticket, une faille de sécurité par la
voie privée de [SECURITY.md](SECURITY.md). La suite est le mode d'emploi de
l'équipe.

**In short (English).** This repository is the catalogue Solstice Lab uses to
assemble small internal web apps for its clients: a Next.js starter and
reusable "bricks", put together by `outils/assembler.mjs`; each app then writes
its own business module on the `dossiers` pattern. It is
MIT-licensed: anyone may use, copy and modify it. It is maintained by the
Solstice Lab team only and does not accept outside contributions: pull requests
from outside the team are closed without review. Report a problem by opening an
issue, in English or French; report a vulnerability privately (SECURITY.md).
Code, comments, commit messages and UI strings are in French, on purpose; the
team is French-speaking and clients read the code. The rest of this document is
the team's working guide: an issue first, a branch, tests before code, a
reviewed pull request, merged by a human, with the checks listed in
[`CLAUDE.md`](CLAUDE.md), section 6. The Solstice Lab signature in the footer
is a rule for Solstice Lab's own deliveries; see "La signature Solstice Lab" for what that
means for you. Opening the repository in Claude Code applies a `PreToolUse`
hook from `.claude/settings.json`; the README says what it blocks and how to
turn it off.

---

## Ce qu'est ce dépôt

Le catalogue de Solstice Lab : de quoi assembler, avec Claude, de petites
applis web pour les outils internes d'une entreprise (5 à 50 personnes). Il
contient un socle (kit d'interface, accès, méthode), des briques réutilisables
(échéances, calendrier, validation, import par lot, e-mails, comptes,
déploiement…) et l'assembleur qui copie ce qu'un client a choisi vers un
dossier neuf ; le module métier de chaque appli s'écrit ensuite chez elle, sur
le patron `dossiers`. Le [README](README.md) détaille le contenu et
`CLAUDE.md` les règles de travail.

Un changement n'y entre que s'il rend le socle, une brique ou la méthode plus
sûrs ou plus clairs. Le dépôt reste volontairement petit : une fonction
qu'aucune appli n'utilise encore n'y entre pas.

## Pourquoi le code est en français

Les variables, les fonctions, les commentaires, les intitulés de tests, les
messages de commit et les libellés d'interface sont en français. C'est un choix
assumé : les applis sont livrées à des équipes francophones qui lisent et
reprennent le code, et les règles métier (contrat, échéance, fournisseur) se
nomment mieux dans la langue de ceux qui les vivent. Un changement suit la
même langue ; un ticket en anglais est lu et reçoit une réponse.

## Le circuit d'un changement

1. **Un ticket d'abord.** Une anomalie ou une demande, avec les modèles
   proposés. Une demande = un changement : pas de refactor ni de correction sans
   rapport groupés dans la même PR (`CLAUDE.md`, section 5). Un ticket trop gros
   pour être relu d'un coup se découpe.
2. **Une branche** `<type>/<slug>` (`feature`, `fix`, `docs`) depuis un `main` à
   jour.
3. **Le test d'abord** quand un comportement change : il échoue, puis le code
   le fait passer. Son intitulé énonce la règle qu'il verrouille.
4. **Une PR relue** : elle renvoie au ticket, dit les vérifications lancées, qui
   a vérifié quoi et ce qui ne l'a pas été. Le gabarit de PR guide cette
   description.
5. **Une fusion par une personne**, en squash, quand la CI est verte. Aucun
   automatisme ne fusionne.

Les commits s'écrivent `Domaine : ce que ça change`, sans point final, avec un
corps qui donne le problème, la solution retenue et ce qui a été écarté.

Les dossiers `.claude/` (skills, agents relecteurs, gardes) servent à travailler
avec Claude Code. Ils sont la référence du circuit ci-dessus, en particulier la
skill `solstice-livrer`, mais rien n'oblige à passer par Claude pour travailler sur le dépôt.

Qui ouvre le dépôt dans Claude Code reçoit d'office le hook `PreToolUse` de
`.claude/settings.json` : avant chaque commande et chaque écriture de fichier
de Claude, `.claude/hooks/gardes.mjs` refuse d'écrire un `.env*` (hors
`.env.example`), `.envrc`, `.npmrc` ou une URL de base distante avec mot de passe, un tel
mot de passe dans une commande, ainsi que
`git add -f`, `--confirmer`, la fusion d'une PR, `git push --force` (`--force-with-lease`
passe) et `--no-verify`, y compris confiés à un interpréteur. Il arrête l'inadvertance,
pas qui veut passer : `SECURITY.md` dit où est la barrière réelle. Pour s'en passer sur son poste :
`{ "disableAllHooks": true }` dans `.claude/settings.local.json`, ignoré par
git. Ce réglage coupe tous les hooks, pas seulement celui-ci ; le README
(« Claude Code : un hook s'applique d'office ») donne le détail.

## Les vérifications à lancer

Avant d'ouvrir une PR, lancer celles que donne `CLAUDE.md`, section 6 : mise en
forme (`npm run format:check`), lint, typecheck, tests, build, plus les gardes si `.claude/hooks/` a changé, et le test
de l'assembleur (`npm run test:assembleur`, plus de 10 minutes) si `outils/` ou un
extrait qu'il retire change. La CI les rejoue sur chaque PR ; le job `assembleur`
de `assemblage.yml` n'y lance qu'un échantillon de combinaisons, le test complet
passe la nuit sur main.

## Une base de test locale par session

La brique données (Postgres) a des tests qui **vident la base qu'ils visent**.
Ils exigent donc une base locale jetable : `vitest.config.ts` refuse toute
`DATABASE_URL` hors de la machine, et toute base dont le nom ne finit pas par
`_test` ou `_test_<n>`. Cela ne se contourne pas.

Deux `npm test` simultanés sur la même base se perturbent (blocages, table
supprimée sous les pieds de l'autre : 29 échecs un jour où deux lancements se
sont croisés). Chaque personne, chaque session, chaque branche en parallèle a
donc sa **propre base**, `<nom>_test_<n>`, avec `n` le numéro du ticket. La
création et la commande exacte sont dans `CLAUDE.md`, section 6, et la base
elle-même vient du `docker-compose.yml`. Une modification de documentation seule
n'en demande pas.

## Ajouter une brique

Une brique est un comportement réutilisable branché sur une entité. Elle ne se
conçoit pas dans le vide : elle naît dans une vraie appli, puis s'extrait
quand une deuxième appli en a besoin. Ouvrir donc d'abord une **demande** qui
décrit les deux usages concrets, ce que la brique ne fera pas en v1, et ce
qu'elle exige du socle.

Une brique livrée contient, dans `src/briques/<nom>/` :

- son code (une brique peut n'être que de la méthode, comme `deploiement`) et un
  `README.md` avec une section « Interface publique » (ce qu'une appli peut
  importer) ; si le module métier de l'appli s'y raccorde, une section « La
  brancher » qui commence par « Tout se déclare côté appli » quand la brique
  arrive sans appelant, ou qui part du patron `dossiers` quand elle arrive
  branchée sur lui : l'outil de mise à jour l'annonce ainsi « à brancher » ou
  « à rattacher » quand elle s'ajoute à une appli ;
- un `CHANGELOG.md` : tout changement d'interface publique y ajoute une entrée en
  fin, dans la PR qui le fait ;
- ses tests, quand elle porte du code ; ceux des briques existantes comptent un
  test d'isolement, qui refuse tout import hors du socle et des briques
  déclarées dans `exige` ;
- une entrée dans `BRIQUES` de `outils/modules.mjs`, avec ses fichiers, ses
  tests et les extraits qu'elle ajoute aux fichiers partagés : c'est ce qui permet
  à l'assembleur de la donner, ou de la retirer entière.

Le plus simple est de lire une brique existante, `src/briques/echeances/` par
exemple, et de la prendre pour patron.

## La signature Solstice Lab

Les squelettes de page du kit d'interface (`AppLayout`, `PageVitrine`) affichent
en pied de page « Conçu par Solstice Lab ». C'est **une règle des livraisons de Solstice Lab** : une appli
que l'agence livre à un client porte sa signature, même pour un prototype, et
`CLAUDE.md` demande de ne jamais la retirer dans ce cadre. Dans ce dépôt, une PR
ne la retire donc pas, ne la déplace pas dans un composant qu'une page peut
omettre, et n'en thématise pas les couleurs.

Ce n'est pas une obligation de la licence. La licence MIT permet à quiconque de
copier ce code, de le modifier et d'en retirer la signature ; elle n'impose que
de garder l'avis de droit d'auteur et le texte de la licence (fichier
`LICENSE`). Une personne qui reprend le catalogue pour ses propres applis en est
libre, et ce document ne dit pas le contraire.

Une appli assemblée n'est elle-même pas publiée sous MIT : l'assembleur ne
copie pas le fichier `LICENSE` et marque la copie `UNLICENSED` dans son
`package.json`. Ses droits relèvent du contrat avec le client. Elle contient
pourtant le code du catalogue, et la licence MIT exige que son avis accompagne
toute copie de ce code. L'assembleur écrit donc à la racine de l'appli un fichier `NOTICE` : l'avis de
droit d'auteur et le texte MIT du catalogue, puis l'avis de la SIL Open Font
License 1.1 des polices IBM Plex du kit, dont le texte complet reste dans
`src/ui/theme/polices/LICENCE-OFL.txt`. Ce fichier ne donne aucune licence à
l'appli et ne change rien à ses droits.

## Signaler une faille

Pas dans un ticket public : voir [SECURITY.md](SECURITY.md).
