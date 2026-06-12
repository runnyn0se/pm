# Backend — Kanban Studio

## Overview

A Python FastAPI backend. Packaged into a Docker container using `uv` for dependency management. Serves the Next.js static frontend at `/` and exposes all API routes under `/api/`.

## Tech Stack

- **Python 3.12**
- **FastAPI** — HTTP framework
- **Uvicorn** — ASGI server (run via `uv run uvicorn`)
- **uv** — package manager (replaces pip/poetry)
- **SQLite** — local database (added in Part 6)
- **Anthropic SDK** — AI calls (added in Part 8)

## File Structure

```
backend/
  main.py           FastAPI app entrypoint; all routes live here until Part 6+
  pyproject.toml    Project metadata and dependencies (uv)
  tests/
    __init__.py
    test_main.py    Pytest unit tests (run via: pytest)
```

As the project grows:
```
  db.py             Database connection and schema creation (Part 6)
  service.py        Business logic layer (Part 6)
  auth.py           Session/auth logic (Part 4)
```

## Running Locally (without Docker)

```bash
cd backend
uv sync              # install deps into .venv
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Running Tests

```bash
cd backend
uv run pytest
```

## Routes

| Method | Path           | Description                        |
|--------|----------------|------------------------------------|
| GET    | `/`            | Hello-world HTML (replaced in Part 3) |
| GET    | `/api/health`  | Health check — returns `{"status":"ok"}` |

## Docker

The `Dockerfile` at the project root builds from the `pm/` directory. The container:
1. Copies `backend/pyproject.toml` and installs deps with `uv sync --no-dev --no-install-project`
2. Copies the rest of `backend/` into `/app`
3. Runs `uvicorn` on port 8000

Build context is the `pm/` directory. Run `scripts/start.ps1` (Windows) or `scripts/start.sh` (Mac/Linux) to build and launch.
