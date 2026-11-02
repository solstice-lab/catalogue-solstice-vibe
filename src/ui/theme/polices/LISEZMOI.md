# Polices du thème par défaut

IBM Plex Sans (300, 400, 500, 600, 700) et IBM Plex Mono (400, 500, 600),
sous-ensemble « Latin1 » en woff2 : il couvre le français (œ, « », ’, …, —, €).

- **Origine** : paquets npm officiels `@ibm/plex-sans` 1.1.0 et
  `@ibm/plex-mono` 2.5.0, dossier `fonts/split/woff2/`, fichiers copiés tels
  quels.
- **Licence** : SIL Open Font License 1.1, copyright IBM Corp. (nom réservé
  « Plex »). Le texte est dans `LICENCE-OFL.txt` et doit rester à côté des
  fichiers : la licence l'exige pour toute redistribution.
- **Pourquoi dans le dépôt** : `next/font/google` télécharge les fichiers chez
  Google à chaque build, et un téléchargement refusé fait échouer le build
  (CI du catalogue, 2026-10-22 et 2026-10-23, sans rapport avec ce qui
  était relu). Un test
  (`tests/polices-locales.test.ts`) interdit d'y revenir.
- **Charger** : `src/app/layout.tsx`, par `next/font/local`, qui alimente
  `--police-sans` et `--police-mono` (lues par `tokens.css`).
- **Remplacer pour un client** : voir la skill `solstice-ui`, section
  « Thématiser pour un client », étape des polices.
