# Journal des changements : brique espaces

Les changements observables de la brique, du plus ancien au plus récent. La
section « Interface publique » du [README](README.md) dit ce qui compte comme
interface.

**Règle d'entretien** : tout changement d'interface publique ajoute une entrée
**en fin** de ce fichier, dans la PR qui le fait. Une entrée dit ce qui change
pour l'appelant et pourquoi ; « Rupture » veut dire qu'un appelant existant doit
être modifié. Les changements de documentation seule n'y sont pas obligatoires.

## 2026-11-03 · Création de la brique · Ajout

- **Ce qui change** : des espaces qu'on crée ou rejoint par un code, avec leurs
  rôles, leurs invitations par e-mail plafonnées et l'accès unique
  `exigerMonEspace()` qui isole les fiches d'un module rattaché à un espace ;
  les écrans « Créer ou rejoindre » et « Mon espace », le droit
  `espaces.participer`, l'entrée de menu, les entrées des registres (effets de
  comptes, données personnelles, confidentialité). Interface : voir le README,
  « Interface publique ».
- **Appelant** : aucun, la brique est nouvelle. Côté assembleur,
  `--briques espaces` exige `comptes` et `mails`.
- **Pourquoi** : dans l'essai tours-de-coloc, cinq tickets sur seize
  réécrivaient les groupes, leurs invitations et le filtrage par groupe, la
  partie la plus risquée de l'appli.
