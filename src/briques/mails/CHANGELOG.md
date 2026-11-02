# Journal des changements : brique mails

Les changements observables de la brique, du plus ancien au plus récent. La
section « Interface publique » du [README](README.md) dit ce qui compte comme
interface.

**Règle d'entretien** : tout changement d'interface publique ajoute une entrée
**en fin** de ce fichier, dans la PR qui le fait. Une entrée dit ce qui change
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
