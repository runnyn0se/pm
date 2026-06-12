#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

docker build -t kanban-studio .

ENV_ARG=""
if [ -f .env ]; then
  ENV_ARG="--env-file .env"
fi

docker run -d --name kanban-studio -p 8000:8000 $ENV_ARG kanban-studio
echo "Kanban Studio running at http://localhost:8000"
