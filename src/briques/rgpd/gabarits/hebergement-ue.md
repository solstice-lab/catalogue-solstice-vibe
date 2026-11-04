# Checklist : hébergement dans l'Union européenne

À cocher avant la mise en ligne, puis à chaque changement d'hébergeur, de
région ou de prestataire. Cas d'origine : un hébergement a dû être déplacé
d'une région américaine vers l'Union européenne après coup, données comprises.

**Cette checklist n'est pas un avis juridique.** Un point qui ne se coche pas
se décide avec le client (son conseil juridique ou son délégué), et la
décision s'écrit dans le registre des traitements. Les champs à remplir sont
marqués `[À REMPLIR : …]`.

Hébergeur : `[À REMPLIR : nom]` · vérifié le `[À REMPLIR : aaaa-mm-jj]` par `[À REMPLIR : nom]`.

## 1. Où sont les données

- [ ] Le service de l'appli tourne dans une région de l'Union européenne :
      `[À REMPLIR : région]`. Avec la brique déploiement, la région se lit
      dans sa configuration, que la politique de confidentialité reprend.
- [ ] La base de données est dans la même région : `[À REMPLIR : région]`.
- [ ] Les sauvegardes de la base sont dans l'Union européenne :
      `[À REMPLIR : région, fréquence, durée de conservation]`.
- [ ] Les journaux de l'hébergeur (adresses IP des visiteurs, requêtes) sont
      dans l'Union européenne, avec une durée connue :
      `[À REMPLIR : lieu et durée]`. Cette durée se recopie dans les choix de
      la politique de confidentialité (traitement « Hébergement du site »).
- [ ] Les fichiers déposés par les personnes, s'il y en a, sont dans
      l'Union européenne : `[À REMPLIR : service et région, ou « aucun »]`.

## 2. Qui y accède

- [ ] La liste des sous-traitants ultérieurs de l'hébergeur est connue, avec
      leur lieu (support, surveillance, réseau de diffusion) :
      `[À REMPLIR : lien vers la liste, date de lecture]`.
- [ ] Les accès du support de l'hébergeur depuis un pays hors de l'Union
      européenne sont connus et encadrés : `[À REMPLIR : aucun, ou pays et garantie]`.
- [ ] Un hébergeur soumis à une loi étrangère qui l'obligerait à livrer les
      données (même stockées dans l'Union) est identifié, et le choix est
      assumé par le client : `[À REMPLIR : oui ou non, décision et date]`.
- [ ] Les autres prestataires de l'appli (envoi des e-mails, connexion par un
      tiers) ont aussi leur lieu de traitement connu, écrit dans la politique
      de confidentialité : `[À REMPLIR : prestataire, lieu]`.

## 3. Le contrat

- [ ] Un accord de sous-traitance (RGPD art. 28) est signé ou accepté avec
      l'hébergeur ; il a été comparé, clause par clause, à la trame
      `accord-de-sous-traitance.md` : `[À REMPLIR : date, lien]`.
- [ ] En cas de transfert hors de l'Union, la garantie est écrite (décision
      d'adéquation, clauses contractuelles types) : `[À REMPLIR : laquelle]`.
- [ ] La suppression des données en fin de contrat, sauvegardes comprises, est
      prévue avec un délai : `[À REMPLIR : délai]`.
- [ ] Les données de santé, s'il y en a, imposent un hébergeur certifié
      « hébergeur de données de santé » : `[À REMPLIR : sans objet, ou certification]`.

## 4. La sécurité

- [ ] Le site n'est servi qu'en HTTPS.
- [ ] La connexion à la base est chiffrée et son certificat vérifié (par
      défaut dans l'appli ; voir la skill `solstice-donnees`).
- [ ] Le chiffrement au repos de la base et des sauvegardes est assuré :
      `[À REMPLIR : oui ou non, par qui]`.
- [ ] Une restauration de sauvegarde a été essayée : `[À REMPLIR : date]`.
- [ ] Les secrets (clé de session, accès à la base, clé d'envoi des e-mails)
      ne sont que chez l'hébergeur, jamais dans le dépôt.

## 5. Décisions et écarts

| Point | Décision | Par qui, le |
| --- | --- | --- |
| `[À REMPLIR]` | `[À REMPLIR]` | `[À REMPLIR]` |
