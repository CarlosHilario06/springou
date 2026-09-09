#!/bin/sh
# Diagnóstico rápido do servidor: diz qual versão está no ar e o que o
# banco realmente gravou nas travas de tráfego.
#
# Uso, dentro da pasta do projeto no servidor:
#   sh scripts/diagnostico.sh
set -e

echo "=== versão no repositório do servidor ==="
git log --oneline -1

echo
echo "=== imagem em uso x último commit ==="
# Se a imagem for mais antiga que o commit, falta rodar
# `docker compose up -d --build`.
echo "commit  : $(git log -1 --format=%cI)"
CID=$(docker compose ps -q app 2>/dev/null)
if [ -n "$CID" ]; then
  IMG=$(docker inspect -f '{{.Image}}' "$CID")
  echo "imagem  : $(docker inspect -f '{{.Created}}' "$IMG")"
else
  echo "imagem  : container do app fora do ar"
fi

echo
echo "=== migrations aplicadas ==="
docker compose exec -T app node_modules/.bin/prisma migrate status || true

echo
echo "=== o que está gravado nos links ==="
docker compose exec -T db psql -U springou -d springou -c \
  'SELECT id, tab, left(url, 45) AS url, probability, "fixedProbability" AS trava
     FROM "Link" ORDER BY "splitterId", tab, id;'
