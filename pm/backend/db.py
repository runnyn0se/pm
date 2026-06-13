import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(os.getenv("DB_PATH", "/data/kanban.db"))
_SCHEMA = Path(__file__).parent / "schema.sql"

_DEFAULT_COLUMNS = ["Backlog", "Discovery", "In Progress", "Review", "Done"]


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _connect() as conn:
        conn.executescript(_SCHEMA.read_text())
        _seed(conn)


@contextmanager
def get_conn():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _connect():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _seed(conn: sqlite3.Connection) -> None:
    conn.execute("INSERT OR IGNORE INTO users (username) VALUES (?)", ("user",))
    user_id = conn.execute("SELECT id FROM users WHERE username = ?", ("user",)).fetchone()["id"]

    existing = conn.execute("SELECT id FROM boards WHERE user_id = ?", (user_id,)).fetchone()
    if existing:
        conn.commit()
        return

    conn.execute("INSERT INTO boards (user_id, name) VALUES (?, 'My Board')", (user_id,))
    board_id = conn.execute("SELECT id FROM boards WHERE user_id = ?", (user_id,)).fetchone()["id"]

    for i, title in enumerate(_DEFAULT_COLUMNS):
        conn.execute(
            "INSERT INTO columns (board_id, title, position) VALUES (?, ?, ?)",
            (board_id, title, i),
        )
    conn.commit()
