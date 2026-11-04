# Brique mails

L'envoi d'e-mails transactionnels : un code de connexion, une
notification, la réponse à un formulaire de contact. Une seule fonction,
`envoyerMail`, derrière laquelle le fournisseur se change sans toucher les
appelants. Fournisseur retenu : Resend.

Elle ne dépend **ni de la base ni d'une session** : la connexion par code
l'appelle avant qu'une session existe, et un site sans base peut s'en
servir.

## Ce qu'elle apporte

- **Un envoi unique** : `envoyerMail({ a, objet, contenu })`. Un destinataire
  par mail, jamais une liste : une adresse n'est jamais montrée à une autre.
- **Un gabarit sobre**, fabriqué par la brique : l'appelant donne des blocs de
  texte (paragraphe, code mis en avant, lien), jamais du HTML. Chaque valeur
  est échappée (cicatrice : HTML de mail non échappé), et une version
  texte accompagne toujours le HTML. Ni couleur ni police : les logiciels de
  messagerie ne lisent pas les variables de `src/ui/theme/tokens.css`, le mail
  prend le rendu par défaut du lecteur.
- **Rien ne part sans réglage explicite.** En local, le mail s'affiche dans la
  console du serveur ; en test, il est capturé ; seul `MAILS_FOURNISSEUR=resend`
  envoie pour de vrai.
- **Rien dans les journaux de production** : l'envoyeur console y est refusé,
  et aucun message d'erreur ne contient la clé d'API ni le contenu du mail.

Hors v1 : pièces jointes, copie (cc, cci), envoi groupé, modèles riches ou aux
couleurs du client, nouvel essai automatique, file d'attente. La brique
n'a pas d'aperçu HTML dans l'appli (rien à régler pour les en-têtes de
sécurité de `src/proxy.ts`).

## Les fichiers

| Fichier | Rôle |
| --- | --- |
| `envoi.ts` | `envoyerMail` : vérifie le mail, le compose, le passe à l'envoyeur que la configuration désigne. Seul fichier que l'appli importe. |
| `message.ts` | Les types (`Mail`, `Bloc`, `MailCompose`, `Envoyeur`) et l'erreur `ErreurEnvoi`. |
| `gabarit.ts` | Le HTML échappé et la version texte, depuis les blocs. |
| `resend.ts` | L'envoyeur Resend, par un appel HTTP direct (pas de paquet). **Seul fichier qui appelle Resend.** |
| `local.ts` | L'envoyeur console (développement) et l'envoyeur de capture (tests). |
| `confidentialite.ts` | Le traitement « Envoi des e-mails » et son sous-traitant, Resend, pour la politique de confidentialité. N'importe rien. |

La brique n'importe que ses propres fichiers et `@/lib/format` (la langue du
HTML). `tests/mails-isolement.test.ts` refuse tout autre import, en
particulier la base (`@/lib/db/`), une session ou un paquet. Elle s'assemble
donc aussi dans un site sans base (`--briques mails` seul), ce que
`tests/assembleur.test.ts` vérifie.

## Interface publique

Ce qu'une appli peut importer et appeler : l'envoi depuis `envoi.ts`, et la
description du traitement depuis `confidentialite.ts`. Tout autre export existe
pour les fichiers de la brique ou pour ses tests : il peut changer sans entrée
au journal.

| Import | Symboles | Rôle |
| --- | --- | --- |
| `envoi.ts` | `envoyerMail(mail)` → `Promise<{ id: string \| null }>` | Envoie un mail. `id` : l'identifiant chez le fournisseur, `null` en console et en test. Lève `ErreurEnvoi` si le mail est mal formé, si la configuration manque ou si le fournisseur refuse. |
| `envoi.ts` | types `Mail`, `Bloc` | `Mail` : `a` (une adresse), `objet` (une ligne), `contenu` (des `Bloc`), `repondreA` facultatif. `Bloc` : `{ paragraphe }`, `{ code }` ou `{ lien: { libelle, url } }`, l'URL en `https:` ou `http:`. |
| `envoi.ts` | classe `ErreurEnvoi` | L'erreur de la brique ; son message commence par « Brique mails : ». |
| `envoi.ts` (tests seulement) | `mailsCaptures()` → `MailCompose[]`, `viderMailsCaptures()` ; type `MailCompose` | Ce qui serait parti, en test : `a`, `objet`, `html`, `texte`, `repondreA`. |
| `confidentialite.ts` | `TRAITEMENTS_MAILS` | Le traitement (clé `mails`) et son sous-traitant (clé `resend`), au format `Traitement` de `src/lib/confidentialite.ts`, qui l'importe. Le lieu où Resend traite les e-mails dépend du compte du client : il se remplit dans `CONFIDENTIALITE.lieux`, jamais d'avance. Sa `conservation` est vide : le site ne garde aucun e-mail, et la durée que garde le prestataire, fixée par son contrat, s'écrit dans `CONFIDENTIALITE.choix.mails`. L'assembleur retire l'import et les deux clés quand la brique part. |

**Interne** : `composerMail`, `echapperHtml`, `creerEnvoyeurResend`,
`envoyeurConsole`, `envoyeurCapture` et le type `Envoyeur`.

**Règle d'entretien.** Tout changement d'interface publique (symbole ajouté,
retiré ou renommé, signature modifiée, bloc ou variable ajoutés) met à jour
cette section et ajoute une entrée **en fin** de [`CHANGELOG.md`](CHANGELOG.md),
dans la pull request qui le fait : date, ce qui change pour l'appelant,
raison.

## La brancher

Côté appli, depuis une server action ou une route (serveur seulement : la clé
ne doit jamais atteindre le navigateur) :

```ts
import { envoyerMail } from "@/briques/mails/envoi";

await envoyerMail({
  a: "personne@exemple.fr",
  objet: "Votre code de connexion",
  contenu: [
    { paragraphe: "Voici votre code, valable 10 minutes :" },
    { code: "481205" },
    { lien: { libelle: "Ouvrir l'application", url: "https://appli.exemple.fr/connexion" } },
  ],
});
```

Un appelant qui ne doit pas révéler le résultat de l'envoi (la connexion par
code : le temps de réponse dirait quelles adresses ont un compte) n'attend pas
la promesse avant de répondre, et journalise l'erreur lui-même, sans le
contenu.

Dans un test de l'appli, lire ce qui serait parti :

```ts
import { mailsCaptures, viderMailsCaptures } from "@/briques/mails/envoi";

beforeEach(viderMailsCaptures);
// … après l'action testée :
expect(mailsCaptures()[0].texte).toContain("481205");
```

## Ce qu'on configure

Variables d'environnement, lues à chaque envoi. Modèle dans `.env.example`.

| Variable | Valeur | Sans elle |
| --- | --- | --- |
| `MAILS_FOURNISSEUR` | `resend` (envoi réel) ou `console` | Console hors production ; **en production, l'envoi échoue** au lieu de passer pour réussi. |
| `MAILS_EXPEDITEUR` | `Mon appli <ne-pas-repondre@exemple.fr>`, une adresse du domaine vérifié chez Resend | Avec `resend` : l'envoi échoue en la nommant. |
| `RESEND_API_KEY` | La clé d'API Resend. **Secret** : chez l'hébergeur, jamais dans le dépôt | Avec `resend` : l'envoi échoue en la nommant, jamais en citant une valeur. |

En test (`NODE_ENV=test`, posé par vitest), le mail est **toujours** capturé,
quelle que soit la configuration : une clé égarée dans l'environnement de la
CI n'envoie rien.

La langue du HTML (`lang`) est `LOCALE` de `src/lib/format.ts`.

## Resend

- API appelée : `POST https://api.resend.com/emails`, clé en en-tête
  `Authorization: Bearer`, délai de 10 secondes. Vérifiée dans la
  documentation de Resend le 2026-10-22.
- Gestes humains, à refaire pour chaque client : créer le compte Resend,
  vérifier le domaine d'envoi (enregistrements DNS chez le registraire),
  déclarer les trois variables chez l'hébergeur (avec la brique déploiement,
  `render.yaml` les porte : les deux en `sync: false` se saisissent à la
  création du Blueprint). Les quotas du forfait et les
  conditions du mode d'essai de Resend sont à lire dans sa documentation avant
  le premier envoi réel.
- **Politique de confidentialité** : Resend y figure en sous-traitant. La
  région du compte, le lieu de traitement qui s'en déduit et les garanties
  d'un transfert hors de l'Union européenne vont dans `CONFIDENTIALITE.lieux`
  (`src/lib/confidentialite.ts`), à faire valider par le client.
- **Changer de fournisseur** : écrire un autre envoyeur sur le modèle de
  `resend.ts` (il remplit le type `Envoyeur`), ajouter sa valeur à
  `MAILS_FOURNISSEUR` dans `envoi.ts`. Les appelants ne changent pas.

## Pièges verrouillés

Tests dans `tests/mails.test.ts`.

| Piège | Test |
| --- | --- |
| Un nom inséré tel quel dans le HTML | « une valeur contenant `<script>` arrive échappée » |
| Un lien `javascript:` dans un mail | « refuse un lien qui n'est ni https ni http » |
| Un mail réel envoyé depuis les tests ou la CI | « en mode test, aucun appel réseau » |
| Un succès silencieux en production sans réglage | « sans configuration en production, l'envoi échoue » |
| Un code de connexion dans les journaux de prod | « l'envoyeur console est refusé en production » |
| La clé d'API dans un message d'erreur | « le message ne contient jamais la clé ni l'adresse, même si la réponse les renvoie » |
| Un saut de ligne qui injecte un en-tête | « refuse un destinataire invalide, un objet vide ou sur plusieurs lignes, un contenu vide » |

## Questions ouvertes

| Question | Qui tranche | Avant quelle étape |
| --- | --- | --- |
| La connexion par code s'appuie sur cette brique, les notifications s'y appuient. Autoriser l'import de `src/briques/mails/` par une brique, ou placer l'envoi au socle ? **Tranchée le 2026-10-22** : une brique qui l'appelle la déclare dans son `exige`, et l'assembleur refuse de la garder sans elle. | Responsable du projet | Avant la connexion par code |
