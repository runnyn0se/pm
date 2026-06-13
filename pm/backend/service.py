from db import get_conn


def apply_kanban_update(username: str, update) -> None:
    with get_conn() as conn:
        board = conn.execute(
            "SELECT b.id FROM boards b JOIN users u ON b.user_id = u.id WHERE u.username = ?",
            (username,),
        ).fetchone()
        if not board:
            raise ValueError("Board not found")
        for col in update.columns:
            conn.execute(
                "UPDATE columns SET title = ? WHERE id = ? AND board_id = ?",
                (col.title, col.id, board["id"]),
            )
        for card in update.cards:
            conn.execute(
                "UPDATE cards SET column_id = ?, title = ?, details = ?, position = ? WHERE id = ?",
                (card.column_id, card.title, card.details, card.position, card.id),
            )


def get_board(username: str) -> dict:
    with get_conn() as conn:
        board = conn.execute(
            "SELECT b.id FROM boards b JOIN users u ON b.user_id = u.id WHERE u.username = ?",
            (username,),
        ).fetchone()
        if not board:
            raise ValueError("Board not found")

        columns = conn.execute(
            "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position",
            (board["id"],),
        ).fetchall()

        result_columns = []
        all_cards = {}

        for col in columns:
            cards = conn.execute(
                "SELECT id, title, details FROM cards WHERE column_id = ? ORDER BY position",
                (col["id"],),
            ).fetchall()
            card_ids = [str(c["id"]) for c in cards]
            result_columns.append({"id": str(col["id"]), "title": col["title"], "cardIds": card_ids})
            for card in cards:
                cid = str(card["id"])
                all_cards[cid] = {"id": cid, "title": card["title"], "details": card["details"]}

        return {"columns": result_columns, "cards": all_cards}


def rename_column(username: str, column_id: int, title: str) -> None:
    with get_conn() as conn:
        row = conn.execute(
            """SELECT c.id FROM columns c
               JOIN boards b ON c.board_id = b.id
               JOIN users u ON b.user_id = u.id
               WHERE c.id = ? AND u.username = ?""",
            (column_id, username),
        ).fetchone()
        if not row:
            raise ValueError("Column not found")
        conn.execute("UPDATE columns SET title = ? WHERE id = ?", (title, column_id))


def create_card(username: str, column_id: int, title: str, details: str) -> dict:
    with get_conn() as conn:
        row = conn.execute(
            """SELECT c.id FROM columns c
               JOIN boards b ON c.board_id = b.id
               JOIN users u ON b.user_id = u.id
               WHERE c.id = ? AND u.username = ?""",
            (column_id, username),
        ).fetchone()
        if not row:
            raise ValueError("Column not found")

        max_pos = conn.execute(
            "SELECT COALESCE(MAX(position), -1) FROM cards WHERE column_id = ?",
            (column_id,),
        ).fetchone()[0]

        cursor = conn.execute(
            "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
            (column_id, title, details, max_pos + 1),
        )
        cid = str(cursor.lastrowid)
        return {"id": cid, "title": title, "details": details}


def delete_card(username: str, card_id: int) -> None:
    with get_conn() as conn:
        card = conn.execute(
            """SELECT ca.column_id, ca.position FROM cards ca
               JOIN columns co ON ca.column_id = co.id
               JOIN boards b ON co.board_id = b.id
               JOIN users u ON b.user_id = u.id
               WHERE ca.id = ? AND u.username = ?""",
            (card_id, username),
        ).fetchone()
        if not card:
            raise ValueError("Card not found")

        conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
        conn.execute(
            "UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?",
            (card["column_id"], card["position"]),
        )


def move_card(username: str, card_id: int, target_column_id: int, target_position: int) -> None:
    with get_conn() as conn:
        card = conn.execute(
            """SELECT ca.column_id, ca.position FROM cards ca
               JOIN columns co ON ca.column_id = co.id
               JOIN boards b ON co.board_id = b.id
               JOIN users u ON b.user_id = u.id
               WHERE ca.id = ? AND u.username = ?""",
            (card_id, username),
        ).fetchone()
        if not card:
            raise ValueError("Card not found")

        src_col = card["column_id"]
        src_pos = card["position"]

        if src_col == target_column_id:
            if src_pos == target_position:
                return
            if src_pos < target_position:
                conn.execute(
                    "UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ? AND position <= ?",
                    (src_col, src_pos, target_position),
                )
            else:
                conn.execute(
                    "UPDATE cards SET position = position + 1 WHERE column_id = ? AND position >= ? AND position < ?",
                    (src_col, target_position, src_pos),
                )
        else:
            conn.execute(
                "UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?",
                (src_col, src_pos),
            )
            conn.execute(
                "UPDATE cards SET position = position + 1 WHERE column_id = ? AND position >= ?",
                (target_column_id, target_position),
            )

        conn.execute(
            "UPDATE cards SET column_id = ?, position = ? WHERE id = ?",
            (target_column_id, target_position, card_id),
        )
