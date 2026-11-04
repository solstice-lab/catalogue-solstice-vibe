# Registre des activités de traitement

Gabarit du registre que tient le responsable du traitement (RGPD, art. 30).
Il se remplit à la mise en route du projet, avant toute mise en ligne, puis se
tient à jour à chaque traitement ajouté ou modifié.

**Ce gabarit n'est pas un avis juridique.** Il est relu et validé par le
client (son conseil juridique ou son délégué à la protection des données).

Les champs à remplir sont marqués `[À REMPLIR : …]`. Les faits que le code
établit (données, personnes concernées, durées de conservation déclarées par
chaque brique) se recopient depuis la politique de confidentialité de l'appli
(page `/confidentialite`, nourrie par `src/lib/confidentialite.ts`) : une
seule source, pas deux textes qui divergent.

## 1. Le responsable du traitement

| Champ | Valeur |
| --- | --- |
| Nom ou raison sociale | `[À REMPLIR : nom de l'organisme]` |
| Adresse | `[À REMPLIR : adresse du siège]` |
| Représentant légal | `[À REMPLIR : nom et fonction]` |
| Délégué à la protection des données | `[À REMPLIR : nom et coordonnées, ou « aucun désigné »]` |
| Courriel pour exercer ses droits | `[À REMPLIR : même adresse que la politique de confidentialité]` |
| Date de création du registre | `[À REMPLIR : aaaa-mm-jj]` |
| Dernière mise à jour | `[À REMPLIR : aaaa-mm-jj]` |

## 2. Les traitements

Une fiche par traitement de la politique de confidentialité (hébergement,
comptes et connexion, journal des modifications…), puis une par traitement
propre à l'activité du client. Copier la fiche ci-dessous autant de fois que
nécessaire.

### Fiche : `[À REMPLIR : titre du traitement, tel que la politique le nomme]`

| Champ | Valeur |
| --- | --- |
| Date de création de la fiche | `[À REMPLIR : aaaa-mm-jj]` |
| Finalité | `[À REMPLIR : reprise de la politique]` |
| Base légale (art. 6) | `[À REMPLIR : contrat, obligation légale, intérêt légitime (lequel), consentement…]` |
| Catégories de personnes concernées | `[À REMPLIR : reprise de la politique]` |
| Catégories de données | `[À REMPLIR : reprise de la politique]` |
| Données sensibles (art. 9) ou relatives à des infractions (art. 10) | `[À REMPLIR : aucune, ou lesquelles et sur quel fondement]` |
| Destinataires internes | `[À REMPLIR : services ou fonctions qui y accèdent]` |
| Sous-traitants | `[À REMPLIR : nom, rôle, lieu de traitement, accord de sous-traitance signé le…]` |
| Transferts hors de l'Union européenne | `[À REMPLIR : aucun, ou pays et garantie (décision d'adéquation, clauses contractuelles types…)]` |
| Durées de conservation | `[À REMPLIR : reprises de la politique, donnée par donnée, et ce qui les efface (purge de la brique rgpd, à la main, chez le prestataire)]` |
| Mesures de sécurité (art. 32) | `[À REMPLIR : voir la section 3, et ce qui est propre à ce traitement]` |
| Analyse d'impact (art. 35) | `[À REMPLIR : non requise (pourquoi), ou date et conclusion]` |

## 3. Mesures de sécurité communes

Ce que l'appli assure d'office, à vérifier et compléter pour le projet :

| Mesure | Dans l'appli | À compléter |
| --- | --- | --- |
| Accès réservé | Connexion par compte, droits par rôle, refus par défaut | `[À REMPLIR : qui administre les comptes, revue des accès]` |
| Traçabilité | Journal des modifications (si la brique journal est gardée), export des données d'une personne tracé | `[À REMPLIR : qui le consulte, à quelle fréquence]` |
| Minimisation | Empreintes à clé plutôt que valeurs en clair (codes, adresses IP) ; aucune valeur saisie dans le journal | `[À REMPLIR : ce que le projet ajoute]` |
| Conservation | Durées déclarées par donnée, purge en dry-run puis confirmée par un humain | `[À REMPLIR : fréquence de la purge, qui la lance]` |
| Chiffrement | Connexion chiffrée au site et à la base | `[À REMPLIR : chiffrement au repos chez l'hébergeur, sauvegardes]` |
| Sauvegardes | — | `[À REMPLIR : fréquence, lieu, durée, restauration testée le…]` |
| Violation de données | — | `[À REMPLIR : procédure, qui notifie l'autorité sous 72 heures (art. 33)]` |

## 4. Historique des mises à jour

| Date | Ce qui change | Par qui |
| --- | --- | --- |
| `[À REMPLIR]` | Création du registre | `[À REMPLIR]` |
