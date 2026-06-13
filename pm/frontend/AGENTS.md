# Frontend — Kanban Studio

## Overview

A Next.js 16 / React 19 / TypeScript frontend. Currently a fully working in-memory Kanban demo with no backend dependency. All state lives in React state; nothing persists across page reloads.

## Tech Stack

- **Next.js 16** with App Router
- **React 19**
- **TypeScript**
- **Tailwind CSS v4** (imported via `@import "tailwindcss"` in globals.css — no config file needed)
- **dnd-kit** (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`) for drag-and-drop
- **clsx** for conditional class names
- **Vitest** + **@testing-library/react** for unit tests
- **Playwright** for e2e tests

## File Structure

```
src/
  app/
    globals.css       CSS variables + Tailwind import
    layout.tsx        Root layout; loads Space Grotesk (display) and Manrope (body) fonts
    page.tsx          Entry point; renders <KanbanBoard />
  components/
    KanbanBoard.tsx   Top-level board; owns all state, DndContext, event handlers
    KanbanColumn.tsx  A single column; droppable, renders its cards + NewCardForm
    KanbanCard.tsx    A single draggable card with a Remove button
    KanbanCardPreview.tsx  Drag overlay ghost (no remove button)
    NewCardForm.tsx   Inline add-card form (toggles open/closed per column)
  lib/
    kanban.ts         Types (Card, Column, BoardData), initialData, moveCard(), createId()
    kanban.test.ts    Unit tests for moveCard logic
  test/
    setup.ts          Vitest global setup (@testing-library/jest-dom)
    vitest.d.ts       Type augmentation for jest-dom matchers
tests/
  kanban.spec.ts      Playwright e2e tests
```

## Data Model

```ts
type Card   = { id: string; title: string; details: string }
type Column = { id: string; title: string; cardIds: string[] }
type BoardData = { columns: Column[]; cards: Record<string, Card> }
```

Columns are ordered in the `columns` array. Cards are stored in a flat map; each column holds an ordered list of card IDs.

## State Management

`KanbanBoard` holds the single `board: BoardData` state. All mutations happen via:
- `handleDragEnd` — calls `moveCard()` from `kanban.ts`
- `handleRenameColumn` — updates column title in place
- `handleAddCard` — creates a new card via `createId()` and appends to column
- `handleDeleteCard` — removes card from map and column's cardIds

## Color System

All colors are CSS custom properties set in `globals.css`:

| Variable              | Value     | Usage                        |
|-----------------------|-----------|------------------------------|
| `--accent-yellow`     | `#ecad0a` | Accent lines, highlights     |
| `--primary-blue`      | `#209dd7` | Links, key sections          |
| `--secondary-purple`  | `#753991` | Submit buttons               |
| `--navy-dark`         | `#032147` | Main headings, body text     |
| `--gray-text`         | `#888888` | Labels, supporting text      |
| `--surface`           | `#f7f8fb` | Page background              |
| `--surface-strong`    | `#ffffff` | Card / column backgrounds    |
| `--stroke`            | rgba(3,33,71,0.08) | Borders          |
| `--shadow`            | 0 18px 40px rgba(3,33,71,0.12) | Elevation |

## Fonts

- **Space Grotesk** — display font (`--font-display`), used for headings and card titles
- **Manrope** — body font (`--font-body`), used for body copy and UI labels

Apply display font with the `font-display` utility class.

## Running Tests

```bash
npm run test:unit    # Vitest unit tests
npm run test:e2e     # Playwright e2e (requires dev server running)
npm run test:all     # Both
```

## Integration Notes (for future parts)

When connecting to the backend:
- Replace `useState(() => initialData)` in `KanbanBoard` with a fetch to `GET /api/board`
- Each mutation handler should call the corresponding API endpoint before updating state
- The login/logout flow will wrap the board; an unauthenticated user gets redirected to a login page
- The AI chat sidebar will be a sibling to the `<main>` block inside `KanbanBoard`, toggled visible
