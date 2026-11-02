<!-- Titre : « Domaine : ce que ça change », sans point final. Il devient le
     sujet du commit à la fusion. -->

Closes #
<!-- « Closes #n » si la fusion termine le ticket, « Refs #n » s'il continue. -->

## Ce que ça change

<!-- Le problème, la solution retenue, ce qui a été écarté. Une demande = un
     changement : rien de sans rapport. -->

## Vérifications lancées

<!-- Cocher ce qui a été lancé et tel que ça a répondu (CLAUDE.md, section 6). -->

- [ ] `node .claude/hooks/gardes.test.mjs` (si `.claude/hooks/` a changé)
- [ ] `npm run format:check`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test` (brique données : sur une base `<nom>_test_<n>` à soi)
- [ ] `npm run test:assembleur` (si `outils/` ou un extrait qu'il retire change ;
      plus de 10 min ; la CI n'en lance qu'un échantillon, le complet passe la nuit)
- [ ] `npm run build`
- [ ] Relecture : `relecteur-docs` (si un `.md` est touché ou un nom retiré),
      `relecteur-migrations` (si le schéma est touché)

## Qui a vérifié quoi, et ce qui ne l'a pas été

<!-- Dire ce qui a été vu à l'écran et par qui, et ce qui ne l'a pas été (un
     correctif de rendu non vu sur de vrais cas se dit non vérifié). -->

## Ce que la fusion déclenche

<!-- Déploiement, migration, variable à poser. Un revert ne défait pas une
     migration déjà appliquée : le dire si la PR en contient une. « Rien » est
     une réponse. -->
