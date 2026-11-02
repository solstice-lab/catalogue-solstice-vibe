# Signaler une faille de sécurité

**In short (English).** Please do not open a public issue for a vulnerability.
Use GitHub's private reporting: the "Security" tab of this repository, then
"Report a vulnerability". Reports in English or French are welcome.

## Comment signaler

Pas de ticket public, pas de message dans une discussion : une faille décrite en
public est exploitable avant d'être corrigée.

1. Ouvrir l'onglet **Security** de ce dépôt.
2. Choisir **Report a vulnerability** (signalement privé).
3. Décrire ce qui est touché et comment le reproduire.

Seules les personnes qui entretiennent le dépôt lisent le signalement. Il peut
mener à un correctif et à un avis de sécurité publié avec votre accord, sous le
nom que vous choisissez.

Si le bouton n'apparaît pas, c'est que le signalement privé n'est pas activé sur
ce dépôt : ouvrir alors un ticket qui dit seulement « j'ai un signalement de
sécurité à transmettre en privé », **sans aucun détail**, et nous indiquerons
comment nous joindre en privé.

## Ce qui aide

- Ce que la faille permet (lire une donnée, passer outre un droit, exécuter du
  code…) et sous quelle condition.
- Les étapes, ou un exemple minimal, pour la reproduire.
- Le commit du dépôt, la version de Node et le système utilisés.
- Votre avis sur la gravité, si vous en avez un.

## Ce qui est concerné

Le contenu de ce dépôt : le socle et les briques, l'assembleur
(`outils/`), la CI, ainsi que les gardes et les consignes de `.claude/` (par
exemple un garde qui laisserait passer une écriture de secret).

Ne relèvent pas de ce dépôt :

- une appli assemblée puis livrée à un client : son hébergement, ses données et
  ses réglages sont ceux de la personne qui l'exploite. Si la faille vient d'un
  fichier du catalogue, signalez-la ici ; si elle vient d'un réglage ou d'une
  donnée propres à une appli, adressez-vous à celle ou celui qui l'exploite ;
- une faille d'une dépendance (Next.js, Postgres…) : la signaler à ses
  mainteneurs. Ce dépôt suit leurs correctifs par Dependabot et par la
  vérification des vulnérabilités de la CI.

## Ce que vous pouvez attendre

Le dépôt est entretenu par une petite équipe, sans astreinte. Nous accusons
réception dès que possible, puis nous disons si le signalement est confirmé et
ce que nous comptons faire. Nous ne promettons pas de délai ni de prime.

Il n'y a pas de versions publiées : seule la branche `main` est entretenue
(voir « Statut du projet » dans le [README](README.md)).
