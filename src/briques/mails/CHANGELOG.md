# Journal des changements : brique mails

Les changements observables de la brique, du plus ancien au plus récent. La
section « Interface publique » du [README](README.md) dit ce qui compte comme
interface.

**Règle d'entretien** : tout changement d'interface publique ajoute une entrée
**en fin** de ce fichier, dans la PR qui le fait, comme toute correction de
sécurité (« Sécurité »), même sans changement d'interface. Une entrée dit ce qui change
pour l'appelant et pourquoi ; « Rupture » veut dire qu'un appelant existant doit
être modifié. Les changements de documentation seule n'y sont pas obligatoires.

## 2026-10-22 · Création de la brique · Ajout

- **Ce qui change** : l'envoi d'e-mails transactionnels par `envoyerMail`, avec
  un gabarit échappé, un envoyeur Resend (appel HTTP direct, sans paquet), un
  envoyeur console en développement et une capture en test. Variables
  `MAILS_FOURNISSEUR`, `MAILS_EXPEDITEUR`, `RESEND_API_KEY`. Interface : voir le
  README, « Interface publique ».
- **Appelant** : aucun, la brique est nouvelle. Premiers appelants prévus : la
  connexion par code, les notifications.
- **Pourquoi** : aucun code d'envoi n'existait.

## 2026-10-23 · `TRAITEMENTS_MAILS` · Ajout

- **Ce qui change** : `confidentialite.ts` exporte `TRAITEMENTS_MAILS`, le
  traitement « Envoi des e-mails » et son sous-traitant Resend, que la
  politique de confidentialité (`src/lib/confidentialite.ts`) affiche.
- **Appelant** : rien à changer. Le projet remplit la base légale, la durée et les destinataires
  de la clé `mails`, et le lieu de traitement de la clé `resend`, dans
  `CONFIDENTIALITE`.
- **Pourquoi** : le RGPD (art. 13) demande de nommer les
  sous-traitants qui reçoivent les données.

## 2026-11-04 · Durées de conservation déclarées par donnée · Ajout

- **Ce qui change** : chaque traitement de `confidentialite.ts` porte un
  champ `conservation` (type `Conservation[]` de `src/lib/confidentialite.ts`) :
  vide, le site ne gardant aucun e-mail ; la durée du prestataire reste à
  écrire dans `CONFIDENTIALITE.choix.mails`.
  La politique de confidentialité les affiche, « à valider » tant que le
  projet ne les a pas revues ; le script de purge de la brique rgpd les
  applique. Aucune clé.
- **Appelant** : rien à changer pour la brique. Une appli qui a écrit son
  propre `Traitement` (dans `traitementsDuProjet`) ajoute `conservation`,
  vide ou rempli : le typecheck le signale. Une durée autre que celle proposée
  s'écrit dans `CONFIDENTIALITE.durees`, par sa clé.
- **Pourquoi** : une durée de conservation qui n'est qu'un texte de la
  politique n'est tenue par rien ; déclarée par donnée, elle se purge et se
  vérifie.
