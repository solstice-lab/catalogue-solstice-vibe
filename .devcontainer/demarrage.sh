#!/usr/bin/env bash
# Démarrage de l'environnement (postStartCommand de devcontainer.json), à
# chaque démarrage et à chaque réveil. Un projet avec base y retrouve son
# Postgres local et ses bases, comme sur un poste ; un projet sans base n'a
# rien à démarrer.
set -euo pipefail

if [ ! -f docker-compose.yml ]; then
  exit 0
fi

# Le démon Docker de l'environnement démarre en même temps que cette commande
# et peut ne pas répondre encore.
for _ in $(seq 60); do
  docker info > /dev/null 2>&1 && break
  sleep 1
done

docker compose up -d --wait

# Crée les bases _dev et _test du projet si elles manquent, et affiche la
# ligne DATABASE_URL à mettre dans .env.local : il ne l'écrit pas, c'est à la
# personne de la coller.
npx tsx scripts/bases-locales.ts
