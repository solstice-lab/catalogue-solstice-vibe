# Brique déploiement

La mise en ligne d'une appli : la CI vérifie le commit, le
déclenche chez l'hébergeur, puis attend de le lire sur `/sante`. Hébergeur
retenu pour la v1 : Render, région Francfort.

La brique est en deux parties. Le **cœur** ne nomme pas l'hébergeur ;
l'**adaptateur Render** tient en deux fichiers et une étape. Déployer ailleurs,
c'est remplacer l'adaptateur seul (voir « Déployer ailleurs »).

Elle n'a qu'une constante dans l'appli : `/sante` (`src/app/sante/route.ts`)
est au socle et lit déjà `COMMIT_DEPLOYE`. `confidentialite.ts` donne à la
politique de confidentialité le lieu où l'hébergeur traite les données.

## Ce qu'elle apporte

- **Rien ne part sans la CI verte.** L'auto-déploiement est coupé ; le job
  `deployer` de `ci.yml` ne part qu'après `verifier`, sur un push de `main`.
  Sur un projet précédent, l'hébergeur déployait `main` sans attendre la CI.
- **Le commit vérifié, pas la tête de `main`** : le déclenchement passe le
  SHA du commit que la CI vient de vérifier.
- **Une mise en ligne constatée** : la CI attend jusqu'à 20 minutes que
  `/sante` renvoie ce commit, et échoue sinon (l'ancienne version reste en
  ligne).
- **Une base de production dans l'Union européenne**, sur un palier payant
  (la base gratuite est supprimée au bout de 30 jours), fermée aux connexions
  depuis Internet.
- **Aucun secret dans le dépôt** : `AUTH_SECRET` est généré par l'hébergeur,
  les clés sont saisies dans son tableau de bord, l'adresse de déclenchement
  est un secret GitHub.
- **Seules les dépendances de production** au démarrage : tout s'installe pour
  le build (`next build` exige `typescript`), puis `npm prune --omit=dev`.

Hors v1 : domaine personnalisé (geste humain, ci-dessous), sauvegarde
souveraine de la base, environnement de préproduction, retour
arrière automatique, migrations jouées avant le démarrage (elles se jouent à
la première requête, `src/lib/db/client.ts`).

## Les fichiers

| Fichier | Partie | Rôle |
| --- | --- | --- |
| `.github/workflows/ci.yml`, job `deployer` | Cœur, sauf l'étape « Déclencher (adaptateur Render) » | Déclenche le commit vérifié, attend `/sante`. Borné par `# Brique déploiement` et `# Fin de la brique déploiement.` |
| `render.yaml` (racine du dépôt) | Adaptateur Render | Le Blueprint : service, base, variables, recopie du commit au démarrage. |
| `tests/deploiement.test.ts` | Verrou | Les pièges ci-dessous, sur le texte des deux fichiers. |
| `src/briques/deploiement/` | Documentation | Ce README et le journal (et `confidentialite.ts`, ligne suivante). |
| `src/briques/deploiement/confidentialite.ts` | Adaptateur Render | `LIEUX_DEPLOIEMENT` : le lieu de l'hébergeur, d'après la région de `render.yaml`, pour la politique de confidentialité. |

## Interface publique

Ce que la brique attend autour d'elle : des noms, chez GitHub et chez
l'hébergeur, neutres, qui ne changent pas avec l'hébergeur. Et une constante
dans l'appli, `LIEUX_DEPLOIEMENT`, qui change avec lui.

| Nom | Où | Rôle |
| --- | --- | --- |
| `DEPLOIEMENT_URL` | Variable de dépôt GitHub (*Settings → Secrets and variables → Actions → Variables*) | L'adresse publique de l'appli, sans `/sante`. **Absente, le job `deployer` est sauté** : le catalogue et une appli pas encore hébergée n'ont rien à mettre en ligne. |
| `DEPLOIEMENT_DECLENCHEUR` | Secret de dépôt GitHub | Ce qui déclenche le déploiement chez l'hébergeur. Render : l'URL du deploy hook. Absent alors que `DEPLOIEMENT_URL` existe, le job échoue en le nommant. |
| `COMMIT_DEPLOYE` | Variable d'environnement du service | Le SHA en ligne, que `/sante` renvoie. Posée par l'adaptateur au démarrage, jamais déclarée à la main. |
| `IP_EN_TETE_CLIENT` | Variable d'environnement du service | L'en-tête où le proxy de l'hébergeur pose l'adresse IP du visiteur, lu par `src/lib/adresse-ip.ts` pour les limites par adresse (connexion par code, formulaire de contact) : seulement avec la brique `comptes` ou `contact`, sans qui l'assembleur retire fichier et variable. Render : `cf-connecting-ip`, déclaré dans `render.yaml`. En production, vide ou nommant un en-tête absent de la requête, les limites par adresse ne s'appliquent pas et le serveur l'avertit une fois, au premier passage. |
| `PGSSLMODE` | Variable d'environnement du service | Le chiffrement de la connexion à la base, lu par `src/lib/db/client.ts`. Vide, le certificat se vérifie. Render : `no-verify`, déclaré dans `render.yaml` en attendant l'essai de l'étape 7. |
| `deployer` | Job de `ci.yml` | Le nom du check, à ne pas exiger dans la protection de `main` (il ne tourne qu'après la fusion). |
| `LIEUX_DEPLOIEMENT` | `src/briques/deploiement/confidentialite.ts` | `{ hebergeur }` : où l'hébergeur traite les données, lu par `src/lib/confidentialite.ts` à la place de `CONFIDENTIALITE.lieux.hebergeur`. `tests/deploiement.test.ts` vérifie qu'il dit la région de `render.yaml`. L'assembleur retire l'import quand la brique part, et le lieu se remplit alors dans la configuration. |

**Règle d'entretien.** Tout changement d'interface publique (nom ajouté,
retiré ou renommé, comportement d'un nom modifié) met à jour cette section et
ajoute une entrée **en fin** de [`CHANGELOG.md`](CHANGELOG.md), dans la pull
request qui le fait : date, ce qui change pour l'appelant, raison.

## Mettre en ligne : les gestes humains

Claude ne les fait pas. Chaque étape se défait tant que la suivante n'a pas
eu lieu.

1. **Avant le Blueprint**, dans une PR : vérifier le nom du service et de la
   base dans `render.yaml`. L'assembleur les a écrits d'après `appli` dans
   l'en-tête de la blueprint (ou `--nom` ; le nom du paquet, et `<nom>-db` pour la base) ;
   un nom à changer se change ici, avant la création. Un service renommé après
   sa création quitte le Blueprint, sans message.
2. **Le coût** : un service web `0.5c-512mb` et une base `0.1c-256mb`, plus le
   stockage de la base, facturés chaque mois. Lire les prix sur
   render.com/pricing avant de créer.
3. **Render** : créer le compte ou l'espace de travail, puis *New → Blueprint*,
   choisir le dépôt. Render lit `render.yaml` et demande les variables en
   `sync: false` (`URL_PUBLIQUE`, à laisser vide tant que le domaine n'est pas
   branché, geste 8, et sur un service de recette ; avec la brique mails :
   `MAILS_EXPEDITEUR`, `RESEND_API_KEY` ; avec la brique comptes :
   `COMPTES_PREMIER_ADMIN`, `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`
   (vides si `"google"` n'est pas dans `METHODES`), `MICROSOFT_CLIENT_ID`,
   `MICROSOFT_CLIENT_SECRET` et `MICROSOFT_TENANT_ID` (vides si `"microsoft"`
   n'est pas dans `METHODES`), et retirer d'abord `"demo"`
   de `METHODES`, qui refuse la production ; avec la brique contact : `CONTACT_DESTINATAIRE`).
   La création lance un premier déploiement de la tête de `main`, le seul qui
   ne passe pas par la CI.
4. **Le déclencheur** : dans le service Render, *Settings → Deploy Hook*,
   copier l'URL, puis la coller à l'invite de :

   ```powershell
   gh secret set DEPLOIEMENT_DECLENCHEUR
   ```

5. **L'adresse** : celle que Render affiche sur la page du service.

   ```powershell
   gh variable set DEPLOIEMENT_URL --body "https://<nom-du-service>.onrender.com"
   ```

6. **GitHub** : protection de `main` avec le check `verifier` requis.
7. **La première fusion suivante** : la CI déclenche et attend `/sante`. Ouvrir
   `<DEPLOIEMENT_URL>/sante` : le commit est celui de la fusion, la base `ok`.
   **Puis l'adresse IP des visiteurs, sur une requête réelle** (essai à
   venir). `IP_EN_TETE_CLIENT` vaut `cf-connecting-ip` sur la foi
   d'un projet précédent : la documentation de Render ne dit pas quel en-tête
   porte l'adresse. À vérifier, avec une brique qui limite par adresse (le
   formulaire de contact) :
   - deux messages envoyés depuis deux connexions (un ordinateur, un
     téléphone en 4G) donnent deux empreintes différentes dans
     `contact_envois`, et aucune ligne « sans-adresse » ;
   - APRÈS ces envois (l'avertissement ne s'écrit qu'au premier passage),
     les journaux du service ne montrent aucune ligne `[adresse-ip]` ;
   - un envoi qui pose lui-même un `CF-Connecting-IP` forgé donne
     l'empreinte de la vraie adresse, pas celle de l'adresse forgée.
   Un écart se corrige dans `render.yaml` et dans le tableau de bord, et
   s'écrit ici.
   **Puis le certificat de la base** (essai à venir). `PGSSLMODE` vaut
   `no-verify` : on ne sait pas encore si le certificat de la base Render se
   vérifie. Retirer la variable dans le tableau de bord, redémarrer, ouvrir
   `/sante` : la base `ok`, l'entrée de `render.yaml` part ; un certificat
   refusé (journaux du service), `no-verify` se remet, ou `PGSSLROOTCERT`
   reçoit le chemin du CA de Render s'il en publie un. Le résultat s'écrit ici.
8. **Le domaine** (`socle.md` de la skill `solstice-nouvelle-appli`) : TTL du
   CNAME baissé à 300 s, *Custom Domains* sur Render, CNAME chez le registraire,
   puis `DEPLOIEMENT_URL` mise à jour avec le domaine, puis `URL_PUBLIQUE`
   (`https://<domaine>`) dans les variables du service.
9. **Les mentions légales** : le nom de l'hébergeur (Render Services, Inc.)
   est écrit par l'assembleur dans `src/lib/mentions-legales.ts` ; son adresse
   et son téléphone se recopient de sa page de mentions légales. La politique de confidentialité
   (`/confidentialite`) le reprend, avec son lieu, la région de Francfort.
   Render est une société américaine : les garanties d'accès aux données
   depuis les États-Unis sont à faire valider par le client. L'en-tête
   `cf-connecting-ip` laisse penser que Cloudflare est devant Render : à
   vérifier dans la documentation de Render, et, si c'est le cas, à nommer
   comme sous-traitant ultérieur (`CONFIDENTIALITE` ou une ligne de
   `confidentialite.ts`).

Une variable ajoutée plus tard à `render.yaml` se déclare aussi dans le
tableau de bord : Render ne resynchronise pas les variables d'un service
existant.

Retour arrière : *Revert* sur la PR, qui repart par la CI. Il ne défait pas
une migration déjà appliquée.

## Déployer ailleurs

Cinq choses sont propres à Render, et seulement cinq.

| À remplacer | Où | Par |
| --- | --- | --- |
| La configuration de l'hébergeur | `render.yaml`, entier | Celle du nouvel hébergeur, ou rien s'il se configure dans son tableau de bord. Garder ses exigences : région dans l'Union européenne, base qui n'expire pas, sonde sur `/sante`, auto-déploiement coupé, secrets générés ou saisis chez l'hébergeur, dépendances de production seules au démarrage, chaque variable de `.env.example` déclarée. |
| Le déclenchement | Étape « Déclencher (adaptateur Render) » du job `deployer` de `ci.yml` | La commande de l'hébergeur (API ou CLI) qui met en ligne `$COMMIT`, avec son jeton ou son adresse dans le secret `DEPLOIEMENT_DECLENCHEUR`. Renommer l'étape et la constante `ADAPTATEUR` de `tests/deploiement.test.ts`. |
| La recopie du commit | `startCommand` de `render.yaml` | Poser `COMMIT_DEPLOYE` depuis la variable de l'hébergeur (`VERCEL_GIT_COMMIT_SHA`…), au démarrage ou au build. |
| L'en-tête de l'adresse IP (avec la brique `comptes` ou `contact`) | `IP_EN_TETE_CLIENT` dans `render.yaml` | L'en-tête que pose le proxy du nouvel hébergeur, lu dans sa documentation puis vérifié sur une requête réelle (étape 7 ci-dessus). Jamais l'en-tête d'un service qui n'est plus devant l'appli : sans Cloudflare devant, `cf-connecting-ip` s'écrit à la main, et chacun choisit son adresse. Sans en-tête sûr, laisser la variable vide. |
| Le lieu de l'hébergeur | `LIEUX_DEPLOIEMENT` de `src/briques/deploiement/confidentialite.ts` | Le pays et la région où le nouvel hébergeur traite les données, d'après sa configuration. |

Puis réécrire, dans `tests/deploiement.test.ts`, le bloc « render.yaml :
l'adaptateur Render » pour le nouveau fichier et le cas du lieu de
l'hébergeur, et l'hébergeur dans les mentions légales (l'assembleur y a écrit
Render : le remplacer).

**Ne changent pas** : le reste du job `deployer` (`needs`, condition,
concurrence, attente de `/sante`), les noms `DEPLOIEMENT_URL`,
`DEPLOIEMENT_DECLENCHEUR`, `COMMIT_DEPLOYE` et `IP_EN_TETE_CLIENT`, la route
`/sante`, le reste du test.

## Pièges verrouillés

Tests dans `tests/deploiement.test.ts`.

| Piège | Test |
| --- | --- |
| L'hébergeur déployait `main` sans attendre la CI | « ne part qu'après le job de vérification vert » ; « coupe l'auto-déploiement » |
| La tête de `main` construite au lieu du commit vérifié | « déclenche le commit vérifié, pas la tête de main » |
| Une version annoncée en ligne sans l'être | « attend sur /sante que le commit en ligne soit celui de la CI » ; « recopie RENDER_GIT_COMMIT dans COMMIT_DEPLOYE » |
| Un `working-directory` au niveau du workflow : le déploiement jamais appelé | « aucun working-directory au niveau du workflow » |
| La base gratuite supprimée au bout de 30 jours | « n'utilise jamais le palier gratuit » |
| Une région américaine migrée vers Francfort après coup | « place le service ET la base à Francfort » |
| Une variable lue par l'appli, absente chez l'hébergeur | « déclare chaque variable de .env.example », prouvé par un cas fautif |
| `NODE_ENV=production` au build : `typescript` non installé | « ne pose pas NODE_ENV » |
| L'hébergeur nommé dans le cœur | « ne nomme l'hébergeur que dans l'étape adaptateur » |
| Une politique de confidentialité qui situerait l'hébergeur ailleurs que `render.yaml` | « dit Francfort, la région de render.yaml, et ne le réclame plus à la configuration » |

## Questions ouvertes

| Question | Qui tranche | Avant quelle étape |
| --- | --- | --- |
| La base est fermée à Internet (`ipAllowList: []`) : un script de données ou une restauration demande d'ouvrir son adresse IP le temps de l'opération. Garder ce défaut ? | Responsable du projet | Avant le premier Blueprint |
