# Code Review — Kanban Studio MVP

Reviewed: 2026-06-13  
Scope: full repo — `backend/`, `frontend/src/`, `Dockerfile`

Findings are labelled **HIGH** (correctness or security issue), **MEDIUM** (reliability or maintainability risk), or **LOW** (polish / nice-to-have).

---

## Backend

### `main.py`

**[HIGH] Anthropic client instantiated on every AI request**  
`client = _anthropic.Anthropic(api_key=_ANTHROPIC_API_KEY)` is inside the route handler (`ai_chat`, line 221). A new HTTP connection pool is created on every call. Move to module level:
```python
_anthropic_client: _anthropic.Anthropic | None = None

@asynccontextmanager
async def lifespan(app):
    global _anthropic_client
    db.init_db()
    if _ANTHROPIC_API_KEY:
        _anthropic_client = _anthropic.Anthropic(api_key=_ANTHROPIC_API_KEY)
    yield
```

**[HIGH] `ai_chat` route is synchronous — blocks the event loop**  
`def ai_chat(...)` is a plain `def`, not `async def`, but calls a blocking Anthropic HTTP request. Under uvicorn, this blocks the single-threaded event loop for the entire duration of the Claude API call (typically 2–10 seconds). Either switch to `async def` with `asyncio.to_thread`, or mark the route with `run_in_executor`. For a single-user MVP this rarely causes problems, but it means no other requests (health checks, board refreshes) can be served while AI is thinking.

**[HIGH] `apply_kanban_update` does not verify card ownership**  
In `service.py:17–21`, the UPDATE on cards uses only `WHERE id = ?` — it does not join back to the user's board. A crafted AI response (or jailbroken model output) could update any card in the database by guessing its integer ID. Fix by adding `AND column_id IN (SELECT id FROM columns WHERE board_id = ?)`:
```python
conn.execute(
    """UPDATE cards SET column_id=?, title=?, details=?, position=?
       WHERE id=? AND column_id IN (
           SELECT id FROM columns WHERE board_id=?
       )""",
    (card.column_id, card.title, card.details, card.position, card.id, board["id"]),
)
```

**[HIGH] `move_card` does not verify the target column belongs to the user**  
`service.move_card` (line 114) checks that the card belongs to the user but does not verify `target_column_id` belongs to the same board. A request with a valid card ID and a foreign column ID would silently move the card into another user's column.

**[MEDIUM] `next(b for b in msg.content ...)` raises `StopIteration` on unexpected model output**  
`main.py:230` — if the Anthropic response somehow contains no `tool_use` block (e.g., a safety refusal or a network-level truncation), this raises an unhandled `StopIteration` that surfaces as a 500 with no useful detail. Wrap in a try/except or use `next(..., None)` and return a 422.

**[MEDIUM] No exception handling around the Anthropic API call**  
If the Anthropic API returns a rate-limit error, times out, or the network fails, the raw exception propagates as an unhandled 500. The frontend shows a generic error message either way, but the server logs become noisy and the response body is inconsistent with the documented API shape.

**[MEDIUM] `MessageItem.role` accepts any string**  
`class MessageItem(BaseModel): role: str` — nothing prevents `role: "system"` or `role: "garbage"` from being sent to the Anthropic SDK, which would raise an unhelpful SDK error. Change to `role: Literal["user", "assistant"]`.

**[MEDIUM] `get_board` executes N+1 queries**  
`service.py:33–50` — one query to get columns, then one query per column to get its cards. With 5 columns this is 6 queries per board load. A single JOIN with ORDER BY would do:
```sql
SELECT co.id, co.title, ca.id, ca.title, ca.details
FROM columns co
LEFT JOIN cards ca ON ca.column_id = co.id
WHERE co.board_id = ?
ORDER BY co.position, ca.position
```

**[MEDIUM] `ai_chat` calls `get_board` twice**  
Once to build the system prompt, once after `apply_kanban_update` to return the updated state. If no board update was applied, the second call is a redundant round-trip to SQLite.

**[MEDIUM] Session cookie missing `secure=True`**  
`main.py:149` — `response.set_cookie(..., httponly=True, samesite="lax")` does not set `secure=True`. Without it, the cookie is transmitted over plain HTTP in production. Add `secure=True` (or make it conditional on an env var for local dev).

**[LOW] `RenameColumnRequest.title` has no validation**  
An empty-string or whitespace-only title is accepted and saved. Add `@field_validator("title")` or `title: str = Field(min_length=1)`.

**[LOW] Redundant `conn.commit()` calls in `db._seed`**  
`_seed` (called from `init_db`) calls `conn.commit()` twice internally (lines 47 and 58), but `init_db` already wraps `_connect()` in a context manager which commits on exit. The extra commits are harmless but create a false impression that `_seed` manages its own transaction.

**[LOW] Default `SECRET_KEY` is insecure if unset**  
`"dev-secret-change-in-production"` is a public string (visible in this repo). If deployed without `SECRET_KEY` in the environment, any session token is forgeable. Consider raising an error or warning at startup if the default is detected outside of a local-dev context.

---

## Frontend

### `src/lib/api.ts`

**[HIGH] `apiRenameColumn`, `apiDeleteCard`, and `apiReorder` silently swallow errors**  
These three functions do not check `res.ok` or throw on HTTP errors. If the server returns a 4xx or 5xx, the UI optimistic state is already updated and will now be permanently out of sync with the database. Compare with `apiCreateCard` (which does `if (!res.ok) throw`) and apply the same pattern to all mutation helpers.

### `src/lib/kanban.ts`

**[MEDIUM] `initialData` and `createId` are dead exports**  
`initialData` (the hardcoded mock board) is still exported but no longer imported by `KanbanBoard` since Part 7 wired up the real API. `createId` was used when IDs were client-generated. Both should be removed to avoid confusion about the source of truth for board data.

### `src/components/KanbanBoard.tsx`

**[MEDIUM] Board fetch errors are silently dropped**  
`apiGetBoard().then(setBoard)` (line 47) — if the fetch throws (network error, 401 after session expiry), the error is swallowed, `board` stays `null`, and the component renders nothing with no user feedback. Add a `.catch` to set an error state or redirect to the login page on 401.

**[MEDIUM] `apiReorder` called inside a `setBoard` updater function**  
Lines 92 and 97 — calling an async side-effect (`apiReorder(...)`) inside the React state updater callback is a React anti-pattern. In React Strict Mode (which Next.js enables in development), state updaters can be called twice, causing duplicate API requests. Move the `apiReorder` call outside the updater.

**[MEDIUM] No revert on `apiReorder` failure**  
The drag-and-drop optimistic update has a `savedBoard.current` snapshot used for cancel — but if `apiReorder` fails after `dragEnd`, there is no rollback. The user sees the moved card but the server still has it in the old position. Wire the `apiReorder` promise rejection to restore `savedBoard.current`.

**[LOW] `handleRenameColumnCommit` fires on every blur regardless of whether the title changed**  
An unnecessary API call goes out when the user clicks away from an unchanged column title. Store the previous title and skip the call if unchanged.

**[LOW] `if (!board) return null` shows a blank screen while loading**  
A loading skeleton or spinner would prevent the brief flash of empty content on first load.

### `src/components/KanbanColumn.tsx`

**[MEDIUM] `cards` prop can contain `undefined` values**  
In `KanbanBoard`, `column.cardIds.map((cardId) => board.cards[cardId])` will produce `undefined` if a card ID is present in a column's `cardIds` but missing from `board.cards` (e.g., due to a partial AI update). The prop is typed `Card[]` which hides this. Filter out undefined entries when passing the prop, or add a runtime guard inside `KanbanColumn`.

**[LOW] Column rename does not trim whitespace**  
`onBlur` commits `column.title` as-is. A title of `"   "` (spaces) passes through to the backend.

### `src/components/AISidebar.tsx`

**[MEDIUM] `key={i}` on message list**  
`messages.map((msg, i) => <div key={i} ...>)` (line 96) — using array index as a React key breaks when messages are prepended or removed, causing identity mismatches. Add a stable `id` to each message (e.g., `Date.now() + Math.random()`).

**[MEDIUM] `onClose` callback is not stable, causing the keydown listener to re-register every render**  
`useEffect(..., [onClose])` (line 30–34) — in `KanbanBoard`, `onClose` is `() => setSidebarOpen(false)`, a new function reference created every render. The keydown listener is therefore removed and re-added on every render. Wrap `onClose` in `useCallback` in `KanbanBoard`, or use `useRef` for the handler inside `AISidebar`.

**[LOW] No input length cap**  
Very long messages are sent to the API without any limit. The Anthropic API will reject them at the token limit, producing an opaque error.

**[LOW] Chat history grows unbounded**  
As the conversation grows, the full history is sent on every request. Long sessions will eventually hit the model's context window. Consider trimming to the last N turns or summarising older turns.

### `src/components/AuthWrapper.tsx`

**[LOW] Blank screen on auth check**  
`if (authState === "loading") return null` — same pattern as KanbanBoard loading state; shows nothing for the ~100ms it takes to check the session. A full-screen loading indicator would be cleaner.

---

## Docker & Build

**[MEDIUM] No `.dockerignore` file**  
`COPY frontend/ .` and `COPY backend/ .` in the Dockerfile copy the entire directories into the build context, including `node_modules/` (~170MB), `.venv/`, `.pytest_cache/`, `.next/`, etc. This was visible in the build output: 167MB transferred in 14 seconds. Add a `.dockerignore` at `pm/`:
```
frontend/node_modules
frontend/.next
backend/.venv
backend/__pycache__
backend/.pytest_cache
```

**[LOW] No `HEALTHCHECK` in Dockerfile**  
Without a `HEALTHCHECK`, Docker cannot report container readiness to orchestration tools. Add:
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:8000/api/health || exit 1
```

---

## Testing Gaps

**[MEDIUM] No test for unauthorised access to `PUT /api/board/reorder`**  
There are 401 tests for `GET /api/board` and `POST /api/ai/chat`, but not for the reorder, rename-column, create-card, or delete-card endpoints. A regression could accidentally remove auth on these routes without being caught.

**[MEDIUM] `test_ai_chat_board_update` does not verify position**  
The test confirms the card moved to the right column's `cardIds` list but doesn't assert `position = 0`, which is what the mock response specifies. A position bug in `apply_kanban_update` would go undetected.

**[MEDIUM] No tests for `api.ts` fetch helpers**  
The frontend API layer (`src/lib/api.ts`) has no unit tests. Errors in URL construction, request body serialisation, or response parsing would only surface in e2e tests.

**[LOW] Anthropic mock is verbose and duplicated**  
`_fake_anthropic`, `_ToolBlock`, and `_ChatMsg` are defined inline in the test file and repeated across tests. Extract to a `tests/conftest.py` fixture or helper.

---

## Summary Table

| # | Severity | Location | Issue |
|---|----------|----------|-------|
| 1 | HIGH | `main.py:221` | Anthropic client instantiated per request |
| 2 | HIGH | `main.py:208` | Blocking sync HTTP call in async server |
| 3 | HIGH | `service.py:17` | `apply_kanban_update` — no card ownership check |
| 4 | HIGH | `service.py:114` | `move_card` — target column not verified against user |
| 5 | HIGH | `api.ts` | `apiRenameColumn`, `apiDeleteCard`, `apiReorder` swallow errors |
| 6 | MEDIUM | `main.py:230` | `StopIteration` on unexpected Anthropic response |
| 7 | MEDIUM | `main.py` | No error handling around Anthropic API call |
| 8 | MEDIUM | `main.py:88` | `MessageItem.role` unvalidated |
| 9 | MEDIUM | `service.py:33` | N+1 queries in `get_board` |
| 10 | MEDIUM | `main.py:211,239` | `get_board` called twice per AI chat |
| 11 | MEDIUM | `main.py:149` | Session cookie missing `secure=True` |
| 12 | MEDIUM | `KanbanBoard.tsx:47` | Board fetch error silently dropped |
| 13 | MEDIUM | `KanbanBoard.tsx:92,97` | Side effect inside setState updater |
| 14 | MEDIUM | `KanbanBoard.tsx` | No revert on `apiReorder` failure |
| 15 | MEDIUM | `KanbanColumn.tsx` | `cards` prop can contain `undefined` |
| 16 | MEDIUM | `AISidebar.tsx:96` | `key={i}` on message list |
| 17 | MEDIUM | `AISidebar.tsx:30` | Unstable `onClose` causes listener churn |
| 18 | MEDIUM | `Dockerfile` | No `.dockerignore` — bloated build context |
| 19 | MEDIUM | Tests | No 401 tests for mutation endpoints |
| 20 | MEDIUM | Tests | `test_ai_chat_board_update` doesn't assert position |
| 21 | MEDIUM | Tests | No tests for `api.ts` |
| 22 | LOW | `kanban.ts` | `initialData` and `createId` are dead exports |
| 23 | LOW | `main.py:14` | Default `SECRET_KEY` is publicly known |
| 24 | LOW | `main.py` | `RenameColumnRequest.title` not validated |
| 25 | LOW | `db.py:47,58` | Redundant `conn.commit()` in `_seed` |
| 26 | LOW | `KanbanBoard.tsx:118` | Rename API called even when title unchanged |
| 27 | LOW | `KanbanBoard.tsx:154` | Blank screen during board load |
| 28 | LOW | `KanbanColumn.tsx` | Column rename doesn't trim whitespace |
| 29 | LOW | `AISidebar.tsx` | No input length cap |
| 30 | LOW | `AISidebar.tsx` | Chat history grows unbounded |
| 31 | LOW | `AuthWrapper.tsx` | Blank screen during auth check |
| 32 | LOW | `Dockerfile` | No `HEALTHCHECK` |
| 33 | LOW | Tests | Anthropic mock is verbose and duplicated |
