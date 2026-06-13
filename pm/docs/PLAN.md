# Project Plan — Kanban Studio MVP

---

## Part 1: Plan (complete)

- [x] Review existing frontend code and document it in `frontend/AGENTS.md`
- [x] Enrich this PLAN.md with detailed steps, success criteria, and test checklists
- [x] User approves plan

---

## Part 2: Scaffolding

Set up Docker, FastAPI backend, and start/stop scripts. Goal: a "hello world" that proves the container runs, serves HTML at `/`, and can handle an API call.

### Steps

- [ ] Create `backend/` Python package with FastAPI app (`backend/main.py`, `backend/pyproject.toml`)
- [ ] Configure `uv` as the package manager (`uv init`, `uv add fastapi uvicorn`)
- [ ] Add a `GET /` route that serves a static HTML page saying "Hello from Kanban Studio"
- [ ] Add a `GET /api/health` route returning `{ "status": "ok" }`
- [ ] Write `Dockerfile` at project root:
  - Base image: `python:3.12-slim`
  - Install `uv`, install Python deps, copy backend
  - Expose port 8000, run uvicorn
- [ ] Write `scripts/start.sh` (Mac/Linux) and `scripts/start.bat` / `scripts/start.ps1` (Windows):
  - Build Docker image, run container with port 8000 mapped
- [ ] Write corresponding `scripts/stop.sh`, `scripts/stop.bat`, `scripts/stop.ps1`
- [ ] Update `backend/AGENTS.md` to describe the backend structure

### Tests & Success Criteria

- [ ] `docker build` completes without errors
- [ ] Running the start script launches the container
- [ ] `curl http://localhost:8000/` returns HTML with "Hello from Kanban Studio"
- [ ] `curl http://localhost:8000/api/health` returns `{"status":"ok"}`
- [ ] Running the stop script kills the container cleanly
- [ ] Backend has at least one unit test for the health endpoint (using pytest + httpx)

---

## Part 3: Add in Frontend

Replace the hello-world HTML with the statically built Next.js frontend.

### Steps

- [ ] Add `next build` as a step in the Dockerfile (install Node, build frontend, copy `out/` or `.next/` into the image)
- [ ] Configure FastAPI to serve the Next.js static output:
  - `next.config.ts`: set `output: 'export'` so Next.js produces a static `out/` directory
  - Mount `out/` as a `StaticFiles` directory in FastAPI at `/` with html mode
  - Ensure `/api/*` routes are registered before the static mount so they take priority
- [ ] Confirm the Kanban board renders at `http://localhost:8000/`

### Tests & Success Criteria

- [ ] `docker build` still completes without errors
- [ ] Hitting `http://localhost:8000/` shows the Kanban board (not the hello-world page)
- [ ] All 5 columns display with their seed cards
- [ ] Drag-and-drop still works in the browser
- [ ] `npm run test:unit` passes (run inside the container or locally)
- [ ] `npm run test:e2e` passes against the container

---

## Part 4: Fake User Sign-in

Add a login gate so only authenticated users see the board.

### Steps

- [ ] Add a `POST /api/auth/login` endpoint: accepts `{ username, password }`, validates against hardcoded `user`/`password`, returns a signed session cookie (use `itsdangerous` or a simple JWT with `python-jose`)
- [ ] Add a `POST /api/auth/logout` endpoint: clears the session cookie
- [ ] Add a `GET /api/auth/me` endpoint: returns current user or 401
- [ ] In the frontend, create a `LoginPage` component (username + password fields, submit button, error message on bad credentials)
- [ ] In `KanbanBoard` (or a new wrapper), call `GET /api/auth/me` on mount; show `LoginPage` if 401, show board if authenticated
- [ ] Add a logout button in the board header that calls `POST /api/auth/logout` and re-shows the login page
- [ ] No registration UI — login only

### Tests & Success Criteria

- [ ] Hitting `http://localhost:8000/` without a session shows the login page
- [ ] Entering wrong credentials shows an error message
- [ ] Entering `user`/`password` shows the Kanban board
- [ ] Clicking logout returns to the login page
- [ ] Directly navigating to `/` after logout shows the login page (cookie cleared)
- [ ] Backend tests: login with valid creds returns 200 + cookie; invalid creds returns 401
- [ ] Frontend unit tests: `LoginPage` renders correctly, shows error on bad response

---

## Part 5: Database Modeling

Design and document the SQLite schema before writing any database code.

### Steps

- [ ] Design schema covering: users, boards (1 per user for MVP), columns (fixed 5), cards
- [ ] Save schema as `docs/schema.md` (human-readable) and `docs/schema.sql` (CREATE TABLE statements)
- [ ] Document the approach: SQLite file location, creation strategy, migration approach (none for MVP — schema created fresh if DB missing)
- [ ] Present to user for sign-off before proceeding to Part 6

### Schema (proposed — subject to user approval)

```sql
CREATE TABLE users (
  id        INTEGER PRIMARY KEY,
  username  TEXT NOT NULL UNIQUE
);

CREATE TABLE boards (
  id        INTEGER PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES users(id),
  name      TEXT NOT NULL DEFAULT 'My Board'
);

CREATE TABLE columns (
  id        INTEGER PRIMARY KEY,
  board_id  INTEGER NOT NULL REFERENCES boards(id),
  title     TEXT NOT NULL,
  position  INTEGER NOT NULL  -- 0-indexed display order
);

CREATE TABLE cards (
  id        INTEGER PRIMARY KEY,
  column_id INTEGER NOT NULL REFERENCES columns(id),
  title     TEXT NOT NULL,
  details   TEXT NOT NULL DEFAULT '',
  position  INTEGER NOT NULL  -- 0-indexed order within column
);
```

### Tests & Success Criteria

- [ ] User has reviewed and approved the schema
- [ ] `docs/schema.md` and `docs/schema.sql` committed

---

## Part 6: Backend API

Add full CRUD API routes backed by SQLite.

### Steps

- [ ] Add `aiosqlite` (or `sqlite3` sync) to backend deps; create `backend/db.py` for connection management
- [ ] On app startup: create DB file if missing, run `schema.sql`, seed the `user` account with an empty board and 5 default columns if not already present
- [ ] Implement routes (all require valid session cookie):
  - `GET /api/board` — returns full board JSON `{ columns: [...], cards: {...} }`
  - `PUT /api/columns/{id}` — rename a column
  - `POST /api/cards` — create a card `{ column_id, title, details }`
  - `PUT /api/cards/{id}` — update card (title, details, column_id, position)
  - `DELETE /api/cards/{id}` — delete a card
  - `PUT /api/board/reorder` — move a card (update column_id + position for affected cards)
- [ ] Keep route handlers thin; business logic in `backend/service.py`

### Tests & Success Criteria

- [ ] Backend unit tests (pytest) for every route: happy path + key error cases
- [ ] DB is created automatically on first run; schema is correct
- [ ] Seeded user has 5 columns (Backlog, Discovery, In Progress, Review, Done) and no cards on fresh DB
- [ ] All CRUD operations round-trip correctly in tests
- [ ] 401 returned for all `/api/board*` and `/api/cards*` routes when no session cookie

---

## Part 7: Frontend + Backend Integration

Wire the frontend to the real API so state persists.

### Steps

- [ ] Create `src/lib/api.ts` in the frontend with typed fetch helpers for each endpoint
- [ ] In `KanbanBoard`: replace `useState(() => initialData)` with a `useEffect` that calls `GET /api/board` and sets state; show a loading state while fetching
- [ ] Replace each local mutation handler with an API call followed by a state update (optimistic update is fine)
- [ ] On drag end: call `PUT /api/board/reorder`; on rename: call `PUT /api/columns/{id}`; on add card: call `POST /api/cards`; on delete: call `DELETE /api/cards/{id}`
- [ ] Remove `initialData` import from `KanbanBoard` (it moves to a backend seed only)

### Tests & Success Criteria

- [ ] Adding a card, reloading the page — card is still there
- [ ] Moving a card, reloading — card is in its new column
- [ ] Renaming a column, reloading — new name persists
- [ ] Deleting a card, reloading — card is gone
- [ ] Playwright e2e tests cover the full persist-and-reload cycle for each operation
- [ ] `npm run test:unit` still passes (mock the fetch helpers in unit tests)

---

## Part 8: AI Connectivity

Connect the backend to the Anthropic API.

### Steps

- [ ] Add `anthropic` to backend Python deps
- [ ] Read `ANTHROPIC_API_KEY` from environment (loaded via `.env` at container start with `--env-file`)
- [ ] Add a `POST /api/ai/test` endpoint that sends the message `"What is 2+2?"` to `claude-sonnet-4-6` and returns the response text — for smoke testing only, not exposed in the UI
- [ ] Confirm the key is passed into the container correctly in start scripts

### Tests & Success Criteria

- [ ] `POST /api/ai/test` returns a response containing "4"
- [ ] If `ANTHROPIC_API_KEY` is missing, the endpoint returns a clear 500 with a message
- [ ] Backend test mocks the Anthropic client and asserts the call is made correctly

---

## Part 9: AI Backend with Structured Outputs

Extend the backend to support AI-powered Kanban updates.

### Steps

- [ ] Define a Pydantic `ChatRequest` model: `{ message: str, history: list[{ role, content }] }`
- [ ] Define a Pydantic `AIResponse` structured output:
  ```python
  class KanbanUpdate(BaseModel):
      columns: list[ColumnSchema]
      cards: list[CardSchema]

  class AIResponse(BaseModel):
      reply: str
      kanban_update: KanbanUpdate | None
  ```
- [ ] Implement `POST /api/ai/chat`:
  - Fetch the current board state for the authenticated user
  - Build a system prompt that includes the board JSON and explains the AI's capabilities
  - Send user message + history to `claude-sonnet-4-6` using tool use or structured output (via `response_format` / tools)
  - Parse response: extract `reply` and optional `kanban_update`
  - If `kanban_update` is present, apply it to the DB before returning
  - Return `{ reply, board }` where `board` is the (potentially updated) board state
- [ ] Remove the `/api/ai/test` endpoint or gate it behind an env flag

### Tests & Success Criteria

- [ ] `POST /api/ai/chat` with `"Move all Done cards to Backlog"` applies the update to the DB (verified by querying the DB in the test)
- [ ] `POST /api/ai/chat` with a conversational message (e.g. `"How many cards do I have?"`) returns a correct `reply` and `null` kanban_update
- [ ] Conversation history is passed correctly (mock test verifies messages array)
- [ ] 401 returned when no session cookie

---

## Part 10: AI Chat Sidebar

Add the chat UI and wire it to the backend.

### Steps

- [ ] Add a sidebar toggle button (top-right of the board header); stores open/closed state in React state
- [ ] Create `src/components/AISidebar.tsx`:
  - Full-height panel, slides in from the right
  - Chat message list (user messages right-aligned, AI messages left-aligned)
  - Text input at the bottom with a Send button
  - Sends `POST /api/ai/chat` with message and accumulated history
  - On response: appends AI reply to message list; if `board` in response differs from current board state, replaces board state (triggering a re-render of the Kanban)
- [ ] Match color scheme: sidebar bg `--surface`, border `--stroke`, send button `--secondary-purple`
- [ ] Show a loading indicator while waiting for AI response
- [ ] History is kept in component state (not persisted across sessions for MVP)

### Tests & Success Criteria

- [ ] Clicking the toggle button opens/closes the sidebar
- [ ] Sending a message appends it to the chat list
- [ ] AI reply appears below the user message
- [ ] If the AI updates the board, the Kanban re-renders without a page reload
- [ ] Playwright e2e: open sidebar, send "Add a card called Test Card to Backlog", verify card appears on the board
- [ ] Sidebar is accessible (keyboard-navigable, focus trapped when open)
