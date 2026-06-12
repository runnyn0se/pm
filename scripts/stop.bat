@echo off
docker stop kanban-studio 2>nul
docker rm kanban-studio 2>nul
echo Kanban Studio stopped
