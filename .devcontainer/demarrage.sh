#!/usr/bin/env bash
# Démarrage de l'environnement (postStartCommand de devcontainer.json), à
# chaque démarrage et à chaque réveil : le Postgres local et les bases du
# projet, comme sur un poste (`docker compose up -d --wait`, puis
# scripts/bases-locales.ts).
set -euo pipefail

# Un projet sans base n'a pas de docker-compose.yml : rien à démarrer.
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

# Crée <projet>_dev et <projet>_test s'ils manquent, et affiche la ligne
# DATABASE_URL à mettre dans .env.local : il ne l'écrit pas, c'est à la
# personne de la coller.
npx tsx scripts/bases-locales.ts
