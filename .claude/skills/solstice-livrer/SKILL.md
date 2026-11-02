---
name: solstice-livrer
description: "Circuit d'un changement, du ticket à la vérification en ligne : ticket, branche, plan, tests, rendu validé par un humain, relecture par sous-agents, commit, pull request, fusion par un humain, contrôle. À charger au début de toute tâche qui modifie le code de l'appli, même petite (un champ, un bouton, un correctif)."
---

# solstice-livrer — du ticket à la mise en ligne

Plusieurs personnes et plusieurs sessions Claude travaillent en même temps ; une seule
personne fusionne. GitHub protège `main`, les gardes du harnais
(`.claude/hooks/gardes.mjs`) refusent `gh pr merge`. Seul ce qui ne va pas de soi est
écrit ici.

## 1. Avant de coder

- **S'assigner l'issue** (`gh issue edit <n> --add-assignee @me`) : un ticket pris deux
  fois a donné deux implémentations, et la mauvaise a été fusionnée.
- **Trop gros pour une PR relue d'un coup** : découper en issues, chacune une tranche de
  bout en bout (base, logique, écran, tests), vérifiable à l'écran en une fois, avec
  « Bloqué par #n ». Faire valider le découpage, puis `gh issue create`.
- Branche `<type>/<slug>` (`feature`, `fix`, `docs`) depuis un `origin/main` à jour.
  **Une session Claude = un worktree.**
- **Plan** de quelques lignes, accord avant d'écrire. Une demande = un changement : pas de
  refactor ni de correction sans rapport au passage (`CLAUDE.md` §5).

## 2. Coder

- Écran : skill `solstice-ui`. Base, migration, module, import (appli avec la brique données) :
  skill `solstice-donnees`.
- **Comportement qui change : le test d'abord**, qui échoue, puis juste assez de code.
  - Son intitulé énonce la règle qu'il verrouille et cite le cas d'origine.
  - Tester par l'interface publique, pas par l'intérieur.
  - Ne simuler que les frontières (API externes, temps). Avec la brique données, la base est
    une vraie base locale jetable.
  - Pas de test qui fige du balisage ou des classes CSS : il casse à chaque retouche.
- Une règle d'architecture qui ne tient que par convention devient un **test-verrou**,
  prouvé par un cas fautif qu'il doit attraper.
- Lancer les vérifications du `CLAUDE.md` (§6). Première étape rouge : la rapporter telle
  quelle.

## 3. Montrer (si l'interface change)

Pas de serveur de développement ni de navigateur côté Claude (`CLAUDE.md` §6) : donner à
la personne qui pilote le projet quoi regarder, en trois à cinq points (URL, écran, cas à
essayer). **La personne valide, jamais Claude.** Un correctif de rendu non vu sur de vrais
cas se dit non vérifié.

## 4. Relire

Avant la PR, sur `git diff origin/main...HEAD`, par des sous-agents lancés en parallèle,
sans leur souffler de conclusion :

- **toujours**, un sous-agent général : les écarts aux règles du `CLAUDE.md` ; ce que le
  ticket demande et qui manque ; ce que le diff fait sans qu'on le demande. Citer la règle
  ou la ligne du ticket, moins de 400 mots ;
- **`relecteur-migrations`** si le diff touche `src/lib/db/` ou le schéma ;
- **`relecteur-docs`** s'il renomme ou retire un fichier, un symbole, une route, une
  variable, une commande, ou s'il touche un `.md`.

Corriger, puis rejouer **toutes** les vérifications.

## 5. Commit et pull request

- Commit : `Domaine : ce que ça change`. Le corps donne le problème, la solution retenue,
  ce qui a été écarté. Seulement les fichiers de la tâche.
- PR (`gh pr create`) : `Closes #n`, les vérifications lancées, **qui a vérifié quoi et ce
  qui ne l'a pas été**, ce que la fusion déclenche (déploiement, migration).
- CI lue sans boucle d'attente. Branche à mettre à jour : `git rebase origin/main`, puis
  `git push --force-with-lease`, **sur sa propre branche seulement**. Deux branches qui
  ajoutent une migration : la rejouer en local après le rebase.

## 6. Fusion et contrôle

- CI verte : dire que la PR est prête. **Un humain fusionne**, en squash.
- Après le déploiement : `/sante` (voir le socle de la skill `solstice-nouvelle-appli`)
  renvoie le commit de la fusion si `COMMIT_DEPLOYE` est posée (au démarrage par la brique
  déploiement, ou à la main chez l'hébergeur sans elle), « inconnu » sinon. Avec cette brique, le
  job `deployer` de la CI l'a déjà attendu.
- Annuler, c'est un *Revert* sur la PR. Il ne défait pas une migration déjà appliquée : le
  dire si la PR en contenait une.

**Ce qu'un humain fait seul** : tout ce qui touche la prod (fusion, hébergeur, DNS,
secrets, `--confirmer`, restauration). Claude prépare et dit quoi taper. Une URL de prod
ne se colle jamais en clair : variable saisie sans écho (`read -rs DATABASE_URL`).
