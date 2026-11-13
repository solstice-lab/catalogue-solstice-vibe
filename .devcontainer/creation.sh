#!/usr/bin/env bash
# Création de l'environnement (postCreateCommand de devcontainer.json), une
# seule fois : npm 11.16 ou plus, puis npm ci.
set -euo pipefail

# Le npm livré avec l'image Node 24 peut être plus ancien que 11.16, et le
# .npmrc pose engine-strict : npm ci refuserait. 11.16 est la première version
# qui lit allowScripts de package.json ; en dessous, les scripts d'installation
# qu'il refuse tourneraient sans un mot (audit du 2026-11-09).
npm install --global npm@11

# Le même contrôle que la CI : un npm resté trop ancien arrête ici, avec la
# raison, plutôt qu'au premier npm ci de la personne.
version="$(npm --version)"
if [ "$(printf '%s\n' 11.16.0 "$version" | sort -V | head -n 1)" != "11.16.0" ]; then
  echo "npm $version est trop ancien : 11.16 ou plus est exigé (allowScripts de package.json n'est lu qu'à partir de là)." >&2
  exit 1
fi

npm ci
