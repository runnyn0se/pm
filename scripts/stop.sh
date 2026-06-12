#!/usr/bin/env bash
docker stop kanban-studio 2>/dev/null || true
docker rm kanban-studio 2>/dev/null || true
echo "Kanban Studio stopped"
