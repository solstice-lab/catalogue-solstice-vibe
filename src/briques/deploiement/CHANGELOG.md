# Journal des changements : brique déploiement

Les changements observables de la brique, du plus ancien au plus récent. La
section « Interface publique » du [README](README.md) dit ce qui compte comme
interface.

**Règle d'entretien** : tout changement d'interface publique ajoute une entrée
**en fin** de ce fichier, dans la PR qui le fait. Une entrée dit ce qui change
pour l'appelant et pourquoi ; « Rupture » veut dire qu'un appelant existant doit
être modifié. Les changements de documentation seule n'y sont pas obligatoires.

## 2026-10-22 · Création de la brique · Ajout

- **Ce qui change** : le job `deployer` de `ci.yml`, qui déclenche le commit
  vérifié puis attend de le lire sur `/sante`, et l'adaptateur Render
  (`render.yaml`, Francfort, base payante). Noms : `DEPLOIEMENT_URL`,
  `DEPLOIEMENT_DECLENCHEUR`, `COMMIT_DEPLOYE`. Interface : voir le README,
  « Interface publique ».
- **Appelant** : aucun, la brique est nouvelle. Le `socle.md` de la skill
  `solstice-nouvelle-appli` nommait le secret `RENDER_DEPLOY_HOOK` : il devient
  `DEPLOIEMENT_DECLENCHEUR`.
- **Pourquoi** : aucune appli du catalogue ne savait se mettre en
  ligne. Hébergeur tranché le 2026-10-22 : Render, avec une brique
  interchangeable.

## 2026-10-23 · Adresse publique du site · Ajout

- **Ce qui change** : `render.yaml` déclare `URL_PUBLIQUE` en `sync: false`.
  Render la demande à la création du Blueprint ; elle se remplit au geste 8
  (le domaine), sur le service de production seulement.
- **Appelant** : rien à modifier. Laissée vide, le site reste fermé aux
  moteurs de recherche et sans adresse canonique.
- **Pourquoi** : le socle lit cette variable pour le
  référencement (`src/lib/referencement.ts`), et `tests/deploiement.test.ts`
  exige que `render.yaml` déclare chaque variable de `.env.example`.

## 2026-10-23 · `IP_EN_TETE_CLIENT` · Ajout

- **Ce qui change** : `render.yaml` déclare `IP_EN_TETE_CLIENT`, l'en-tête
  où le proxy de l'hébergeur pose l'adresse IP du visiteur, lu par
  `src/lib/adresse-ip.ts` (socle). Render : `cf-connecting-ip`, à vérifier
  sur une requête réelle au premier déploiement (README, étape 7). « Déployer
  ailleurs » compte une quatrième chose propre à l'hébergeur.
- **Appelant** : une appli déjà sur Render déclare la variable dans le tableau
  de bord (Render ne resynchronise pas les variables d'un service existant).
  Sans elle, les limites par adresse ne s'appliquent pas.
- **Pourquoi** : le formulaire de contact, et la connexion par
  code qui en a besoin aussi. X-Forwarded-For garde ce que le visiteur
  envoie ; l'en-tête sûr dépend de l'hébergeur.

## 2026-10-23 · `LIEUX_DEPLOIEMENT` · Ajout

- **Ce qui change** : `src/briques/deploiement/confidentialite.ts` exporte
  `LIEUX_DEPLOIEMENT`, le lieu où l'hébergeur traite les données (Union
  européenne, région de Francfort, d'après `render.yaml`). La politique de
  confidentialité (`src/lib/confidentialite.ts`) l'affiche et ne le demande
  plus à la configuration.
- **Appelant** : rien à changer. Déployer ailleurs remplace aussi ce lieu
  (README, « Déployer ailleurs »).
- **Pourquoi** : le RGPD (art. 13) demande de dire où partent les
  données, et le lieu est déjà écrit dans `render.yaml`.

## 2026-10-27 · `PGSSLMODE` · Rupture

- **Ce qui change** : `render.yaml` déclare `PGSSLMODE: no-verify`. Le client
  de la base (`src/lib/db/client.ts`, socle) vérifie désormais le certificat
  de Postgres quand `PGSSLMODE` est vide ; avant, il ne le vérifiait jamais.
  `no-verify` garde l'ancien comportement chez Render, le temps de l'essai
  réel (README, étape 7).
- **Appelant** : une appli déjà sur Render déclare `PGSSLMODE=no-verify` dans
  le tableau de bord AVANT de fusionner ce changement (Render ne
  resynchronise pas les variables d'un service existant). Sans elle, si le
  certificat de la base ne se vérifie pas, la base devient injoignable et
  `/sante` le dit.
- **Pourquoi** : une connexion chiffrée sans vérification parle à n'importe
  quel serveur qui se présente ; la coupure doit se demander en toutes
  lettres.

## 2026-11-05 · `SOUS_TRAITANTS_DEPLOIEMENT` · Ajout

- **Ce qui change** : `src/briques/deploiement/confidentialite.ts` exporte
  `SOUS_TRAITANTS_DEPLOIEMENT` : Cloudflare, que Render place devant le site.
  La politique de confidentialité (`src/lib/confidentialite.ts`) l'ajoute aux
  sous-traitants de l'hébergement du site, et réclame son lieu de traitement
  dans `CONFIDENTIALITE.lieux.cloudflare`.
- **Appelant** : une appli déjà assemblée avec la brique remplit
  `lieux.cloudflare` dans sa configuration, avec le client (lieu de
  traitement, garanties de transfert hors de l'Union) ; tant qu'il est vide,
  la page le signale comme à compléter.
- **Pourquoi** : à l'essai réel sur Render, le 2026-11-05, chaque réponse
  portait `server: cloudflare` et un `cf-ray`, et Cloudflare refusait
  lui-même un `CF-Connecting-IP` envoyé à la main. Cloudflare reçoit donc
  l'adresse IP de chaque visiteur, et le RGPD (art. 13) demande de nommer
  qui reçoit les données.

## 2026-11-05 · Déclencheur refusé · Changement

- **Ce qui change** : l'étape « Déclencher (adaptateur Render) » du job
  `deployer` lit le code HTTP au lieu de `curl -f`. Un refus de l'hébergeur,
  une adresse invalide ou sans réponse donnent un `::error::` qui nomme
  `DEPLOIEMENT_DECLENCHEUR`, le code reçu et le geste à faire. L'appel
  s'arrête au bout de 30 secondes.
- **Appelant** : rien à faire avec l'adaptateur Render. Un adaptateur
  remplacé (README, « Déployer ailleurs ») doit nommer le secret dans chacune
  de ses erreurs et lire le code HTTP s'il appelle `curl`, sans `-f` : sinon
  `tests/deploiement.test.ts` échoue.
- **Pourquoi** : à l'essai réel sur Render, le 2026-11-05, un deploy hook
  faux n'a laissé dans le journal que « curl: (22) The requested URL returned
  error: 404 », sans rien qui désigne le secret.

## 2026-11-05 · Disque de la base · Changement

- **Ce qui change** : `render.yaml` crée la base sur 1 Go (`diskSizeGB: 1`),
  avec l'agrandissement automatique (`storageAutoscalingEnabled: true`) :
  à 90 % plein, Render agrandit le disque de 50 %, arrondi au multiple de
  5 Go, puis pas avant 6 heures.
- **Appelant** : rien à faire pour une base à créer. Une base existante garde
  son disque (`diskSizeGB` n'agit qu'à la création, et un disque ne se
  réduit jamais). Son agrandissement automatique se vérifie dans le tableau
  de bord après la synchronisation du Blueprint (page Plan de la base,
  « Storage Autoscaling »), et s'y active à la main au besoin.
- **Pourquoi** : à l'essai réel sur Render, le 2026-11-05, la base est née à
  15 Go, le défaut de Render sans `diskSizeGB` : 4,50 $ par mois de disque
  vide, tant que la base existe. Sur 1 Go sans agrandissement automatique, une base
  pleine est suspendue par Render.

## 2026-11-09 · Environnement `production` et `PGSSLMODE=disable` · Rupture

- **Ce qui change** : le job `deployer` de `ci.yml` déclare
  `environment: production`, et le secret `DEPLOIEMENT_DECLENCHEUR` a vocation
  à vivre dans cet environnement. Le client de la base
  (`src/lib/db/client.ts`) refuse `PGSSLMODE=disable` quand `NODE_ENV` vaut
  `production` et que l'hôte de `DATABASE_URL` n'est pas local (de même pour un
  `sslmode=disable` écrit dans l'URL) : une erreur à
  la première requête, `/sante` comprise, qui dit quoi poser.
- **Appelant** : une appli déjà en ligne crée l'environnement `production`
  (*Settings → Environments*) avec ses relecteurs obligatoires AVANT de
  fusionner : GitHub le crée sinon au premier passage, sans relecteur. Son
  secret de dépôt reste lu tant que l'environnement n'en a pas un de même nom ;
  le déplacer dans l'environnement (README, geste 4). Une appli qui déclarait
  `PGSSLMODE=disable` chez son hébergeur le retire, ou le remplace par
  `no-verify` en connaissance de cause, avant la fusion : sinon le déploiement
  échoue au health check et l'ancienne version reste en ligne.
- **Pourquoi** : audit de sécurité du 2026-11-09. Sans environnement, aucun
  relecteur ne pouvait s'interposer avant la mise en ligne ; et un
  `.env.local` recopié chez l'hébergeur faisait circuler le mot de passe et
  les données en clair, sans une ligne au journal.
