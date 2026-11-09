# Brique contact

Le formulaire de contact d'un site vitrine : un visiteur, sans
compte, écrit son nom, son adresse et un message, qui part par e-mail vers
l'adresse du client. Sans service tiers ni captcha.

Elle exige la brique **mails** (l'envoi) et la **base** (la limite d'envois).
Elle n'exige pas la connexion : elle s'assemble dans une vitrine sans module métier
(`--briques mails,contact`).

## Ce qu'elle apporte

- **La page `/contact`**, publique : elle ne lit pas la session, n'a pas de
  garde, et le menu n'y montre que les entrées sans garde, comme
  `/mentions-legales`.
- **Son squelette suit l'appli.** Sans la brique comptes, l'appli est un site
  public : la page prend `PageVitrine` (en-tête de site, `Contact` en titre de la
  page, les entrées publiques du menu à droite). Avec la brique comptes, elle
  prend `AppLayout`, l'écran d'un outil, comme les autres pages d'un outil. Voir
  « Le squelette de la page » plus bas.
- **Un envoi par la brique mails** vers `CONTACT_DESTINATAIRE`, avec l'adresse
  du visiteur en « Répondre à ». L'objet est fixe : rien de ce que tape le
  visiteur n'entre dans un en-tête, hors l'adresse de réponse, que la brique
  mails vérifie. Chaque valeur est échappée dans le HTML (brique mails).
- **Trois filtres anti-spam** :
  - un champ piège, invisible pour un humain (`ChampPiege` du kit) ;
  - un délai minimal de 3 secondes entre l'affichage et l'envoi ;
  - une limite d'envois **en base** : 5 par heure et par adresse IP, et 50 par
    heure en tout. En mémoire, elle ne vaudrait que pour un seul processus.
  Le champ piège et le délai répondent **comme un envoi réussi** : rien ne dit
  au robot quel filtre l'a arrêté. La limite, elle, **le dit** au visiteur
  (« Réessayez dans une heure »). Si l'adresse IP est mal lue derrière
  l'hébergeur, des visiteurs partagent la même limite, et un faux succès
  ferait disparaître leurs messages sans que personne le voie.
  L'adresse vient de `src/lib/adresse-ip.ts` (partagé avec la brique comptes), qui ne lit que
  l'en-tête nommé par `IP_EN_TETE_CLIENT`. Sans cette variable en
  production, la limite par adresse ne s'applique pas ; le plafond global,
  si.
  Le plafond global a son revers, à dire au client : dix adresses qui
  envoient chacune cinq messages ferment le formulaire une heure pour tout le
  monde. C'est le prix d'un quota d'envoi et d'une boîte protégés.
- **Une mention d'information** sous le formulaire, avec un renvoi vers la
  politique de confidentialité (`/confidentialite`, socle).
- **La description de son traitement** pour cette politique
  (`confidentialite.ts`) : ce que le formulaire collecte, pourquoi, et ce que
  le site en garde.

**Le message n'est pas gardé.** Il vit dans la boîte du destinataire. La base
ne garde que l'empreinte (sha256, sans sel) de l'adresse IP et l'heure. Les
traces de plus d'une heure sont effacées au message suivant : sans nouveau
message, elles restent, au plus une cinquantaine. Si l'envoi échoue, le visiteur lit « Votre message n'est pas
parti » et retrouve sa saisie dans les champs ; cet envoi raté ne compte pas
dans la limite. Le journal du serveur reçoit la
raison de l'échec, jamais le message ni l'adresse.

Hors v1 : accusé de réception au visiteur, pièce jointe, objet au choix,
sauvegarde des messages en base, écran pour les relire.

## Les fichiers

| Fichier | Rôle |
| --- | --- |
| `contact.ts` | `traiterMessageContact` : filtres, validation, composition et envoi. |
| `filtres.ts` | Le champ piège, le délai minimal, la limite en base (sous verrou : deux envois simultanés ne passent pas tous deux sous la limite). |
| `champs.ts` | Les noms des champs, les longueurs et le type de la réponse, communs au formulaire et au serveur. N'importe rien. |
| `actions.ts` | La server action du formulaire. |
| `FormulaireContact.tsx` | Le formulaire (composant client) et la mention d'information. |
| `confidentialite.ts` | La description du traitement, pour la politique de confidentialité. N'importe rien : la page publique ne doit pas atteindre la base. |

La page `src/app/contact/page.tsx` part avec la brique. La table
`contact_envois` naît dans `src/lib/db/migrations.ts` (étape « Brique
contact »).

La brique n'importe que ses fichiers, le kit, `@/lib/db/client`, `@/lib/adresse-ip`,
`@/lib/format` et `@/briques/mails/envoi`. `tests/contact-isolement.test.ts`
refuse tout autre import, en particulier la session ou un module.

## Le squelette de la page

La règle : **`PageVitrine` quand l'appli n'a pas la brique comptes, `AppLayout`
sinon.** Sans comptes, aucun écran d'outil ne peut exister (chaque page de
gestion appelle `exiger`), donc l'appli est un site public ; un formulaire
au sous-titre d'écran et au menu d'outil y avait l'allure d'un écran de gestion
au milieu de pages publiques.

La page lit ce fait dans `NAVIGATION` (`src/lib/navigation.ts`) : une entrée de
menu n'y porte un garde que par la brique comptes. Elle n'importe donc pas
cette brique, qu'une appli assemblée sans elle n'a plus : l'import ne
compilerait plus (le typecheck de `npm run test:assembleur` le verrouille), et aucun réglage n'est à poser : la règle suffit, il n'y a
pas de variable ni de constante de la brique à régler.

Dans les deux cas, la page reste publique (aucune lecture de session) et le
menu n'y montre que les entrées sans garde. Sous `PageVitrine`, l'entrée vers
l'accueil n'est pas répétée : la marque de l'en-tête y mène déjà.

## Interface publique

Ce qu'une appli peut importer et appeler. Tout autre export existe pour les
fichiers de la brique ou pour ses tests : il peut changer sans entrée au
journal.

| Import | Symboles | Rôle |
| --- | --- | --- |
| `FormulaireContact.tsx` | `FormulaireContact({ afficheLe })` | Le formulaire. `afficheLe` : l'heure du rendu de la page, en millisecondes, donnée par `heureDAffichage()`. |
| `filtres.ts` | `heureDAffichage()` → `number` | L'heure à passer au formulaire, à chaque rendu (la page est en `force-dynamic`). |
| `contact.ts` | `traiterMessageContact(donnees, enTetes)` → `Promise<EtatContact>` | Le traitement d'un envoi, pour une autre page qui porterait le formulaire. Lève une erreur si `CONTACT_DESTINATAIRE` manque. |
| `champs.ts` | type `EtatContact` | `{ envoye: true }`, ou `{ erreur, valeurs }`. |
| `confidentialite.ts` | `TRAITEMENTS_CONTACT` | Le traitement du formulaire (clé `contact`), au format `Traitement` de `src/lib/confidentialite.ts`, qui l'importe, avec sa `conservation` : l'empreinte de l'adresse IP une heure (clé `contact-envois`, purgée par la brique rgpd) et les messages 3 ans hors de l'appli (clé `contact-messages`, rappelée par le script de purge). L'assembleur retire cet import et la ligne `contact` des choix quand la brique part. |

**Interne** : `envoyerMessageContact` (l'action serveur que la page branche sur le
formulaire), `CHAMPS`, `LONGUEUR_MAX` et le type `ValeursContact` (les champs et leurs
limites), les filtres anti-robot de `filtres.ts` autres que `heureDAffichage` :
`vientDUnRobot`, `reserverUnEnvoi`, `libererUnEnvoi`, `DELAI_MINIMAL_MS`, `FENETRE_S`,
`LIMITE_PAR_IP` et `PLAFOND_GLOBAL`.

**Règle d'entretien.** Tout changement d'interface publique (symbole ajouté,
retiré ou renommé, signature modifiée, variable ajoutée) met à jour cette
section et ajoute une entrée **en fin** de [`CHANGELOG.md`](CHANGELOG.md),
dans la pull request qui le fait : date, ce qui change pour l'appelant,
raison.

## La brancher

La page existe déjà : `/contact`. Le menu ne la propose pas : avec la brique
comptes, `tests/navigation.test.ts` exige un garde sur toute entrée hors
accueil, et une entrée sans garde y serait refusée. Une vitrine la lie depuis
son accueil ou son contenu (`<Link href="/contact">`) ; sans la brique comptes,
elle peut aussi l'ajouter à `src/lib/navigation.ts`.

**Avec la brique comptes** (toute route protégée par défaut) : `/contact` est
déjà dans `ROUTES_OUVERTES` (`src/briques/comptes/protection.ts`), et
`tests/comptes-proxy.test.ts` prouve que la page et l'envoi du formulaire
passent sans session. L'assembleur retire cette ligne quand la brique contact
part.

## Ce qu'on configure

| Variable | Valeur | Sans elle |
| --- | --- | --- |
| `CONTACT_DESTINATAIRE` | L'adresse du client qui reçoit les messages | L'envoi lève une erreur qui nomme la variable : le message ne part pas nulle part en passant pour reçu. |
| `IP_EN_TETE_CLIENT` (partagée avec la brique comptes) | L'en-tête où le proxy de l'hébergeur pose l'adresse du visiteur ; Render : `cf-connecting-ip` | Hors production : « local ». En production (variable vide, ou en-tête absent de la requête) : pas de limite par adresse, le plafond global reste, et le serveur l'avertit une fois. |

Plus les variables de la brique mails. En local, `MAILS_FOURNISSEUR=console`
affiche le mail dans la sortie du serveur. Avec la brique déploiement,
`render.yaml` déclare `CONTACT_DESTINATAIRE` en `sync: false` : elle se saisit
à la création du Blueprint.

Les seuils (délai, limites, fenêtre) sont des constantes en tête de
`filtres.ts`.

## Gestes humains

- **La lecture de l'adresse IP.** `IP_EN_TETE_CLIENT` nomme l'en-tête que
  pose le proxy de l'hébergeur. Render : `cf-connecting-ip`, déjà dans
  `render.yaml` avec la brique déploiement, et vérifié sur une requête réelle
  le 2026-11-05 (README de la brique déploiement, étape 7) ; Cloudflare y
  refuse une requête qui pose elle-même cet en-tête. Après les premiers
  envois, les journaux du serveur ne montrent aucune ligne `[adresse-ip]`.
  Chez un autre hébergeur, ou sans la brique déploiement, régler la variable
  chez lui et vérifier au premier déploiement :
  - deux messages envoyés depuis deux connexions (un ordinateur, un téléphone
    en 4G) donnent deux empreintes différentes dans `contact_envois`, et
    aucune ligne « sans-adresse » (en-tête absent : pas de limite par
    adresse) ;
  - APRÈS ces envois (l'avertissement ne s'écrit qu'au premier passage), les
    journaux du serveur ne montrent aucune ligne `[adresse-ip]` ;
  - un envoi qui pose lui-même l'en-tête configuré, avec une adresse forgée,
    ne donne pas l'empreinte de l'adresse forgée.
- Renseigner `CONTACT_DESTINATAIRE` chez l'hébergeur, et vérifier qu'un
  message de test arrive dans cette boîte.

## Pièges verrouillés

Tests dans `tests/contact.test.ts`, `tests/contact-page.test.ts`.

| Piège | Test |
| --- | --- |
| Un nom inséré tel quel dans le HTML du mail | « échappe chaque valeur saisie dans le HTML du mail » |
| Un saut de ligne dans l'objet qui injecte un en-tête | « n'insère jamais le nom saisi dans l'objet » |
| Deux envois simultanés qui passent tous deux sous la limite | « ne laisse pas passer deux soumissions simultanées au-delà de la limite » |
| Une adresse IP forgée par le visiteur | « ne se laisse pas contourner par un en-tête forgé » (et `tests/adresse-ip.test.ts`) |
| Une réponse qui trahit le filtre au robot | « répond de même au robot, que son message soit valide ou non » |
| Un message parti nulle part, en passant pour reçu | « refuse de démarrer sans destinataire configuré » |
| Le message d'un visiteur dans les journaux | « dit au visiteur que son message n'est pas parti quand l'envoi échoue, sans le contenu dans le journal » |
| La page qui lit la session (une vitrine n'en a pas) | « s'affiche sans session » |
| Un formulaire de site vitrine à l'allure d'un écran de gestion | « prend le squelette d'une page publique quand l'appli n'a pas de menu à gardes » et « garde le squelette d'un écran d'outil quand l'appli a un menu à gardes » |
| Une politique de confidentialité qui dirait une autre durée que la purge | « dit la vraie durée de conservation de l'empreinte de l'adresse IP » |

## Données personnelles

La politique de confidentialité (`/confidentialite`, socle) décrit le
traitement d'après `confidentialite.ts` ; la mention sous le formulaire y
renvoie, et les droits des personnes y sont. Si l'appli a la brique rgpd,
l'export des données d'une personne dit que l'empreinte de l'adresse IP ne se
relie à aucune adresse e-mail.

Restent au projet, dans `CONFIDENTIALITE` (`src/lib/confidentialite.ts`), à
faire valider par le client :

- la base légale (répondre à une demande : intérêt légitime ou mesures
  précontractuelles, à faire valider) ;
- la validation des durées de conservation que `confidentialite.ts` propose :
  une heure pour l'empreinte de l'adresse IP, 3 ans après le dernier échange
  pour les messages dans la boîte du destinataire, hors de l'appli (une durée
  autre s'écrit dans `CONFIDENTIALITE.durees`) ;
- le lieu de traitement de Resend (brique mails) et ses garanties de
  transfert hors de l'Union européenne.

Les traces de la limite : l'empreinte de l'adresse IP est effacée au premier
message reçu après une heure, et, sans nouveau message, par le script de purge
de la brique rgpd (clé `contact-envois`). Reste à trancher : c'est une
pseudonymisation, pas une anonymisation (sans sel, une adresse IPv4 se retrouve
en les essayant toutes) ; un HMAC avec un secret la renforcerait.
