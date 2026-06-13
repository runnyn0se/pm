# Database Schema

## Overview

SQLite database with four tables. Designed for a single-board-per-user MVP with room to support multiple users and boards later.

## Tables

### users
Stores user accounts. For the MVP only one user exists (`user`), but the schema supports many.

| Column   | Type    | Notes          |
|----------|---------|----------------|
| id       | INTEGER | Primary key    |
| username | TEXT    | Unique         |

### boards
One board per user for the MVP. The foreign key to `users` is in place for future multi-board support.

| Column   | Type    | Notes                     |
|----------|---------|---------------------------|
| id       | INTEGER | Primary key               |
| user_id  | INTEGER | FK → users.id             |
| name     | TEXT    | Defaults to 'My Board'    |

### columns
Five columns per board. `position` controls display order (0–4).

| Column   | Type    | Notes                     |
|----------|---------|---------------------------|
| id       | INTEGER | Primary key               |
| board_id | INTEGER | FK → boards.id            |
| title    | TEXT    | User-editable             |
| position | INTEGER | 0-indexed display order   |

### cards
Cards belong to a column. `position` controls order within the column.

| Column    | Type    | Notes                          |
|-----------|---------|--------------------------------|
| id        | INTEGER | Primary key                    |
| column_id | INTEGER | FK → columns.id                |
| title     | TEXT    |                                |
| details   | TEXT    | Defaults to empty string       |
| position  | INTEGER | 0-indexed order within column  |

## Storage

- **File location (in container):** `/data/kanban.db`
- **Host persistence:** a named Docker volume (`kanban-studio-data`) is mounted at `/data`, so data survives container restarts and rebuilds.
- **Creation:** the backend creates the DB file and runs the schema on startup if the file does not exist. No migration system — schema is applied once to a fresh DB.

## Seed data on first run

When the `user` account's board is first created, the backend inserts five default columns:

| position | title       |
|----------|-------------|
| 0        | Backlog     |
| 1        | Discovery   |
| 2        | In Progress |
| 3        | Review      |
| 4        | Done        |

No seed cards are inserted — the board starts empty.
