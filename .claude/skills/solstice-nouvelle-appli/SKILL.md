---
name: solstice-nouvelle-appli
description: "Démarrer un projet client à partir de ce harnais, ou un nouveau module dans l'appli : cadrer le besoin, choisir la forme la plus légère, écrire la fiche projet, poser le socle prêt pour la prod et découper en tickets. À charger dès qu'on parle de créer une appli, un outil interne, un service ou un module, avant toute ligne de code ou d'infra."
---

# solstice-nouvelle-appli — cadrer, choisir, poser le socle, découper

**Pas de code ni d'infra avant la fiche projet validée.** Une appli livrée d'un bloc,
c'est une PR que personne ne peut vérifier écran par écran.

## 1. Cadrer

Un bloc par message, chaque question avec ta recommandation. « Je ne sais pas » est une
réponse : la noter en question ouverte, avec qui tranche et avant quelle étape. Ne pas
demander ce que le code ou le `CLAUDE.md` tranchent déjà.

**Le besoin**
- À quoi ça sert, pour qui, combien de personnes, à quelle fréquence ?
- **Comment fait-on aujourd'hui ?** Une extension a été construite pour lire une interface
  alors qu'un export natif existait : supprimée neuf jours plus tard, sans avoir servi.
- **Un vrai exemple de la donnée**, avant de concevoir quoi que ce soit. Sur un vrai export,
  la date était en mois/jour/année et le titre dans une autre colonne que prévu.
- **Ce qu'on ne fait pas en v1.** Des fonctions construites « au cas où » ont été retouchées
  plusieurs fois, puis retirées.

**Les données**
- D'où viennent-elles (export d'un outil, saisie, page web, autre appli) ?
- Données personnelles ou documents clients ? Si oui : rien de tout cela dans le dépôt, et
  la durée de conservation se décide maintenant.
- Un import s'enregistre-t-il directement, ou une personne le relit-elle avant ?
  Recommandation : relecture, avec le fichier d'origine gardé.

**Les accès**
- Qui, et combien de rôles vraiment (partir d'un ou deux) ?
- Une liste d'adresses ou de domaines, ou un outil public ouvert à toute adresse
  (`ouverte` de `ENTREE`, brique `comptes`) ? L'inscription ouverte exige deux rôles
  au moins.
- Comment se connecter : code par e-mail, Google, Microsoft 365 ? Avec Microsoft,
  l'annuaire du client seul (le cas normal) ou tous les annuaires ?
- Un partage avec une personne extérieure, sans compte ? Ça se prévoit dès maintenant.

**Les écrans**
- Téléphone, ordinateur, ou les deux ? Faute de l'avoir demandé, des retouches ont été
  faites partout puis défaites sur ordinateur.
- Une charte client (PDF ou site) ? Sinon, le thème de repli du catalogue (la charte
  Solstice Lab).

**La mise en ligne** (nouvelle appli seulement)
- Les mentions légales, obligatoires pour tout site publié en France (LCEN, art. 6) :
  le statut de l'éditeur, puis, pour un éditeur professionnel, l'éditeur (nom ou raison
  sociale, adresse, téléphone, courriel), le directeur de la publication et, s'il y a
  lieu, forme juridique, capital, immatriculation (RCS ou répertoire des métiers),
  numéro de TVA. Un particulier non professionnel (sans activité lucrative sur le site :
  ni publicité, ni vente) peut ne publier que le nom et l'adresse de son hébergeur, s'il lui
  a communiqué son identité (art. 6, III, 2) : ne demander alors que la confirmation de
  cette communication ; le courriel des droits se demande au bloc suivant. Les demander
  dès le cadrage : faute de réponse, la mise en ligne attend. L'hébergeur ne se demande pas au client : la personne qui
  mène le cadrage le renseigne d'après l'hébergement retenu.
- La politique de confidentialité (RGPD, art. 13), obligatoire dès que le site traite des
  données personnelles, c'est-à-dire toujours (l'hébergeur reçoit l'adresse IP des
  visiteurs) : le courriel où exercer ses droits, le délégué à la protection des données
  s'il y en a un, l'autorité de contrôle (la CNIL en France), la base légale, la durée de
  conservation et les destinataires de chaque traitement, et les données métier que
  l'appli gardera. Ces choix engagent le client : ni Claude ni la personne
  qui mène le cadrage ne les proposent, ils sont « à faire valider » par lui (son conseil ou son délégué) tant qu'il ne les
  a pas donnés, et la mise en ligne attend.
- Quelqu'un entretiendra-t-il l'appli après la livraison (mises à jour des dépendances et des
  actions de la CI, correctifs de sécurité) ? Qui, et à quel rythme ? Recommandation : non
  tant que personne n'est nommé. Sans personne, Dependabot ouvrait une PR par semaine que
  personne ne fusionnait : il est retiré (`socle.md`, « La CI »). Un « on verra » vaut non.
- Le site doit-il être trouvé par les moteurs de recherche ? Un outil interne mis en
  ligne ne doit pas l'être. Dans tous les cas, sa description en une ou deux phrases
  (elle s'affiche dans l'aperçu au partage d'un lien) ; si le site est public, son
  domaine et ses pages publiques. Avec la brique comptes, l'accueil reste derrière la
  connexion et n'en est pas une ; chacune s'ouvre dans la brique (son README).

## 2. Choisir la forme la plus légère

S'arrêter à la première qui répond :

| Besoin | Forme |
|---|---|
| Une fonction de plus pour les utilisateurs de l'appli | **Module dans cette appli**, en copiant le patron `dossiers` de la brique données : aucune infra à toucher. Sans les écrans du patron (appli assemblée sans `comptes`, avec ou sans base), le dire et faire trancher |
| Un site de quelques pages, sans données à garder ni connexion | **Site vitrine** : copie assemblée depuis le catalogue Solstice-vibe, sans base ni module métier (au plus les briques `mails` et `deploiement`, et `contact` pour un formulaire de contact, qui garde la base). Pas de connexion, pages rendues à chaque requête (`socle.md`, « CSP à nonce ») |
| Un produit à part, fiches, listes, formulaires, rôles | **Nouvelle appli assemblée** par la skill `creer-appli` du catalogue Solstice-vibe, avec les briques qu'elle demande ; son module métier s'écrit ensuite chez elle, sur le patron `dossiers` |
| Fichiers, exports Office lourds, navigateur sans tête, scripts de données | Ce harnais n'est pas le bon point de départ : le dire et faire trancher |

Hébergement par défaut : **un service Render par appli** (déploiements et pannes isolés).
Un autre hébergeur se pose au cadrage : avec la brique `deploiement`, seul son adaptateur
se remplace (son README, « Déployer ailleurs »).

## 3. Fiche projet

Présentée d'abord dans la conversation, corrigée, validée. Puis écrite dans `PROJET.md`
à la racine du dépôt (ou en section du `PROJET.md` existant pour un module), en premier
commit de la branche du premier ticket. Contenu :

- le besoin et les réponses, bloc par bloc ;
- ce qui n'est **pas** fait en v1 ;
- la forme retenue, et chaque option écartée avec sa raison ;
- les questions ouvertes, avec qui tranche et avant quelle étape ;
- pour une nouvelle appli (pas pour un module ajouté à une appli existante), une rubrique
  **Mentions légales** : le statut de l'éditeur (professionnel, ou particulier non professionnel
  qui ne publie que son hébergeur, avec la confirmation que son identité a été communiquée à
  l'hébergeur), les réponses du bloc « La mise en ligne », et l'hébergeur (nom,
  adresse, téléphone) d'après l'hébergement retenu. Une réponse manquante s'écrit « à
  demander » et passe aussi aux questions ouvertes (le client, avant la mise en ligne).
  Les valeurs se recopient dans `src/lib/mentions-legales.ts` (`statutEditeur`, valeur
  `"professionnel"` ou `"particulier"`, et `identiteCommuniqueeALHebergeur` pour un particulier ; avec la brique
  `deploiement`, l'assembleur y a déjà écrit le nom de l'hébergeur : adresse et
  téléphone restent à recopier), que la page
  `/mentions-legales` affiche ;
- pour une nouvelle appli aussi, une rubrique **Confidentialité** : le courriel où exercer
  ses droits, le délégué à la protection des données s'il y en a un, l'autorité de contrôle,
  la base légale, la durée de conservation et les destinataires de chaque traitement (ceux des briques gardées, que décrit
  `src/lib/confidentialite.ts`, et les données métier propres au projet), le lieu des
  sous-traitants que le code ne situe pas. Ces choix engagent le client : « à faire
  valider » tant qu'il ne les a pas validés, et la question passe aux questions ouvertes.
  Les valeurs se recopient dans `src/lib/confidentialite.ts`, que la page
  `/confidentialite` affiche ;
- pour une nouvelle appli, une rubrique **Entretien après livraison** : quelqu'un entretient-il
  l'appli (mises à jour des dépendances et des actions de la CI, correctifs de sécurité) ?
  Qui, et à quel rythme ? La réponse décide de Dependabot (`socle.md`, « La CI ») : gardé si oui, retiré sinon
  (l'assembleur le retire sans `--dependabot`).
- pour une nouvelle appli aussi, une rubrique **Référencement** : site public ou non,
  description, pages publiques, domaine. Les valeurs se recopient dans
  `src/lib/referencement.ts` ; le domaine va dans `URL_PUBLIQUE`, sur le service de
  production seulement.

La validation de la fiche vaut plan pour tout le projet ; chaque ticket garde ensuite son
plan court (skill `solstice-livrer`, étape 1).

## 4. Poser le socle

Pour une appli à part, le premier ticket pose le socle prêt pour la prod : lire
[`socle.md`](socle.md). Chaque point y est né d'un incident.

## 5. Découper

- Une issue GitHub par ticket, chacune une **tranche de bout en bout** (base, logique,
  écran, tests), assez petite pour être vérifiée à l'écran en une fois.
- Le premier ticket pose le socle et une tranche minimale (un accès, une donnée, un
  écran) qui tourne en local **et en ligne** avant tout le reste.
- Chaque issue dit ce qu'elle livre, ses critères d'acceptation et « Bloqué par #n ».
  Faire valider la liste avant `gh issue create`, bloqueurs d'abord.
- Seul le premier ticket se traite dans la session ; les suivants, chacun dans une session
  neuve, avec la skill `solstice-livrer`.
