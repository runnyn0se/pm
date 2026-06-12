@echo off
cd /d "%~dp0\.."

docker build -t kanban-studio .

if exist .env (
    docker run -d --name kanban-studio -p 8000:8000 --env-file .env kanban-studio
) else (
    docker run -d --name kanban-studio -p 8000:8000 kanban-studio
)

echo Kanban Studio running at http://localhost:8000
