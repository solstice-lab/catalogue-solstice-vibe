# Démarrer : en local et pour un projet client

Référence du démarrage d'une appli assemblée par le catalogue. Le
[README](../../README.md) donne la version courte ; ce fichier porte le détail.
Il est propre au catalogue : une appli assemblée ne le reçoit pas.

## Démarrer un projet client

Une appli client ne se copie pas depuis GitHub : elle s'assemble depuis ce
dépôt, avec la skill `creer-appli`, lancée dans une session Claude Code
ouverte à la racine du catalogue.

1. **Cadrer**, sans code : la skill s'appuie sur `solstice-nouvelle-appli`
   pour mener aux réponses du client, à la fiche projet validée et à la forme
   retenue.
2. **Assembler** : elle choisit les briques, écrit la
   blueprint, la fait relire par l'agent `relecteur-blueprint`, puis lance
   `outils/assembler.mjs` vers un dossier vide hors du catalogue (voir
   [assembler.md](assembler.md)). Elle crée ensuite le dépôt distant, privé par
   défaut, après un accord explicite (en disant d'abord si la protection de `main`
   y sera possible), puis les issues de la section 9 de la blueprint par
   `outils/creer-issues.mjs` (voir [assembler.md](assembler.md#les-issues-de-la-section-9)), et dit quoi
   taper.
3. **Régler l'appli assemblée**, ce que l'assembleur ne fait pas :
   `LOCALE`, `DEVISE` et `FUSEAU` en tête de `src/lib/format.ts` (le fuseau
   décide du jour qui compte pour les échéances). L'assembleur a écrit ce que
   l'en-tête de la blueprint déclare : le nom affiché (`NOM_APP` de
   `src/lib/navigation.ts`, repris par le titre de chaque page), la description
   et le choix site public ou fermé de `src/lib/referencement.ts`, le nom du
   service et de la base de `render.yaml` et le nom de l'hébergeur des mentions
   légales ; un champ absent laisse sa valeur de remplacement. Avant toute mise
   en ligne, remplir `src/lib/mentions-legales.ts` (statut de l'éditeur ; pour un
   professionnel, éditeur et directeur de la publication ; coordonnées de l'hébergeur) et `src/lib/confidentialite.ts`
   (contact, base légale, durée et destinataires de chaque traitement, validés
   par le client), et ajouter les pages publiques à
   `src/lib/referencement.ts`.
4. `npm ci` et, si l'appli a la base, les bases locales (voir « Démarrer en
   local » plus bas) : `DATABASE_URL` est requise par les tests et l'appli, pas par le
   build.
5. **Thématiser** : suivre la procédure de la skill `solstice-ui` pour remplir
   `src/ui/theme/tokens.css` depuis la charte du client (PDF ou site). Sans
   charte client, garder le thème de repli, la charte Solstice Lab.
6. Remplacer l'accueil (`/`) par les premiers écrans réels, en copiant le patron
   `dossiers` pour chaque module métier. L'appli assemblée n'a ni la vitrine du kit
   (`/kit`) ni les écrans de ce patron : ils restent au catalogue, où se lisent
   `src/app/kit/`, `src/app/dossiers/` et la couche données du patron
   (`src/lib/db/dossiers.ts`, sa table, son droit), qu'elle ne reçoit pas non plus.

## Démarrer en local

Il faut Docker, Node 24 ou plus (`.nvmrc`, comme la CI) et npm 11.16 ou plus :
c'est la première version de npm qui lit `allowScripts` de `package.json` ;
une version antérieure ignore le champ et lance les scripts d'installation
qu'il refuse (esbuild, unrs-resolver). Le `.npmrc` de la racine pose
`engine-strict=true` : sur un npm plus ancien, `npm ci` refuse au lieu de
avertir (`engines` seul n'est qu'un avertissement), et la CI échoue de même
avant tout `npm ci`. Docker doit tourner (Docker Desktop lancé sous Windows
et macOS) : tant que `docker info` échoue, `docker compose up` échoue aussi. `docker-compose.yml` monte un Postgres 18 sur
`127.0.0.1:5433`, sans mot de passe (`trust`, publié sur le poste seulement),
partagé par toutes les applis du poste ; ses données vivent dans le volume
`solstice-postgres-donnees`. `scripts/bases-locales.ts` crée `<appli>_dev` et
`<appli>_test` (nom de `package.json`) s'ils manquent, puis affiche la ligne
`DATABASE_URL` à mettre dans `.env.local` et la commande des tests : il ne
l'écrit pas, c'est à coller. `npm test` fait tourner les fichiers de tests en
parallèle, chaque worker sur sa propre base, `<base de test>_w1` à
`<base de test>_w4` au plus, qu'il crée à côté de la base de test et supprime à
la fin (`tests/bases-des-workers.ts`).

PowerShell :

```powershell
npm ci
docker compose up -d --wait
npx tsx scripts/bases-locales.ts
Copy-Item .env.example .env.local   # y remplacer DATABASE_URL par la ligne affichée, et remplir AUTH_SECRET (commande dans .env.example)
npm run dev                         # accueil sur http://localhost:3000
```

bash :

```bash
npm ci
docker compose up -d --wait
npx tsx scripts/bases-locales.ts
cp .env.example .env.local          # y remplacer DATABASE_URL par la ligne affichée, et remplir AUTH_SECRET (commande dans .env.example)
npm run dev                         # accueil sur http://localhost:3000
```

Un autre Postgres déjà publié sur le 5433 fait échouer `docker compose up` :
l'arrêter d'abord.
