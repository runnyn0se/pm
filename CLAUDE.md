# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Layout

```
PM/
├── .env                    # ANTHROPIC_API_KEY (required)
└── pm/
    ├── Dockerfile          # Multi-stage build (Node → Python)
    ├── frontend/           # Next.js 16 + React 19 + TypeScript
    ├── backend/            # Python 3.12 + FastAPI + SQLite
    ├── docs/               # Schema docs and 10-part PLAN.md
    └── scripts/            # start/stop wrappers for Docker (sh, ps1, bat)
```

## Commands

### Frontend (`pm/frontend/`)

```bash
npm install
npm run dev          # Next.js dev server on :3000 (proxies /api/* → :8000)
npm run build        # Production static export (output: 'export')
npm run lint         # ESLint
npm run test         # Vitest unit tests (single run)
npm run test:unit:watch  # Vitest in watch mode
npm run test:e2e     # Playwright (requires Docker container running on :8000)
npm run test:all     # Unit + e2e
```

### Backend (`pm/backend/`)

```bash
uv sync                                          # Install dependencies
uv run uvicorn main:app --reload --port 8000    # Dev server on :8000
uv run pytest                                   # Run all tests
uv run pytest tests/test_main.py::test_name    # Run a single test
```

### Docker (full stack)

```powershell
# Windows
.\pm\scripts\start.ps1   # Build image + run container on :8000
.\pm\scripts\stop.ps1    # Stop container
```

```bash
# Linux/Mac
./pm/scripts/start.sh
./pm/scripts/stop.sh
```

## Architecture

### Dev vs Production serving

In **development**, the frontend dev server runs on `:3000` and Next.js rewrites all `/api/*` requests to `http://localhost:8000` (see `next.config.ts`). The backend runs independently on `:8000`.

In **production** (Docker), Next.js is compiled to a static export (`frontend/out/`). The backend (FastAPI on `:8000`) serves these static files via `StaticFiles`. API routes are registered first, so they take priority over static files.

### Data flow

1. `AuthWrapper` (`src/components/AuthWrapper.tsx`) bootstraps auth state via `GET /api/auth/me` before rendering anything.
2. After login, `KanbanBoard` fetches board state from `GET /api/board` → `{ columns: [...], cards: {...} }`.
3. All API calls go through typed helpers in `src/lib/api.ts` — always add new endpoints there.
4. State is React `useState` only — no Redux/Zustand.
5. Drag-and-drop uses `@dnd-kit`; reorder logic lives in `src/lib/kanban.ts`; `dragEnd` calls `apiReorder()` to persist.

### Authentication

Cookie-based sessions signed with `itsdangerous.URLSafeSerializer`. The `require_auth` FastAPI dependency validates the `session` cookie on every protected route. Credentials are hardcoded (`user`/`password`) — no user management.

### AI integration

`POST /api/ai/chat` sends the full board state as JSON in the system prompt plus the conversation history. Claude responds via tool use with a `respond` tool whose schema includes an optional `kanban_update` field. When present, the backend applies the mutation and returns the updated board in the response. Chat history is held in component state in `AISidebar.tsx` — not persisted to the database.

### Database

SQLite at `/data/kanban.db` (Docker volume) or `DB_PATH` env override. Schema is in `backend/schema.sql`; `db.init_db()` runs at FastAPI startup and is idempotent (`CREATE TABLE IF NOT EXISTS`). There is no migration system — schema changes require dropping and recreating the DB.

## Environment Variables

| Variable | Default | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Required; stored in `PM/.env` |
| `SECRET_KEY` | `dev-secret-change-in-production` | Session signing |
| `DB_PATH` | `/data/kanban.db` | Override for local dev |

## Key Files

- `backend/main.py` — All FastAPI routes and AI chat logic
- `backend/db.py` — SQLite connection and schema init
- `backend/service.py` — CRUD business logic (called by routes)
- `frontend/src/lib/api.ts` — All typed fetch helpers (add new endpoints here)
- `frontend/src/lib/kanban.ts` — Pure board-state logic (moveCard, reorder)
- `frontend/src/components/KanbanBoard.tsx` — Main board component with drag-and-drop

## Testing Notes

Backend tests use a temporary SQLite DB (`tmp_path`) and mock the Anthropic client. Frontend unit tests run in jsdom via Vitest. Playwright e2e tests target `http://localhost:8000` — the Docker container must be running.
