import pytest
from fastapi.testclient import TestClient

import db as db_module
import main as main_module
from main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db_module, "DB_PATH", tmp_path / "test.db")
    with TestClient(app) as c:
        yield c


@pytest.fixture
def authed_client(tmp_path, monkeypatch):
    monkeypatch.setattr(db_module, "DB_PATH", tmp_path / "test.db")
    with TestClient(app) as c:
        c.post("/api/auth/login", json={"username": "user", "password": "password"})
        yield c


# --- health ---

def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


# --- auth ---

def test_login_valid_credentials(client):
    res = client.post("/api/auth/login", json={"username": "user", "password": "password"})
    assert res.status_code == 200
    assert "session" in res.cookies


def test_login_invalid_credentials(client):
    assert client.post("/api/auth/login", json={"username": "user", "password": "wrong"}).status_code == 401


def test_me_unauthenticated(client):
    assert client.get("/api/auth/me").status_code == 401


def test_me_authenticated(authed_client):
    res = authed_client.get("/api/auth/me")
    assert res.status_code == 200
    assert res.json()["username"] == "user"


def test_logout_clears_session(authed_client):
    authed_client.post("/api/auth/logout")
    assert authed_client.get("/api/auth/me").status_code == 401


# --- board ---

def test_get_board_unauthenticated(client):
    assert client.get("/api/board").status_code == 401


def test_get_board_has_five_columns(authed_client):
    board = authed_client.get("/api/board").json()
    assert len(board["columns"]) == 5
    assert board["columns"][0]["title"] == "Backlog"
    assert board["cards"] == {}


def test_rename_column(authed_client):
    board = authed_client.get("/api/board").json()
    col_id = board["columns"][0]["id"]
    authed_client.put(f"/api/columns/{col_id}", json={"title": "Todo"})
    board = authed_client.get("/api/board").json()
    assert board["columns"][0]["title"] == "Todo"


def test_create_card(authed_client):
    board = authed_client.get("/api/board").json()
    col_id = int(board["columns"][0]["id"])
    card = authed_client.post("/api/cards", json={"column_id": col_id, "title": "My card", "details": "notes"}).json()
    board = authed_client.get("/api/board").json()
    assert card["id"] in board["cards"]
    assert card["id"] in board["columns"][0]["cardIds"]


def test_delete_card(authed_client):
    board = authed_client.get("/api/board").json()
    col_id = int(board["columns"][0]["id"])
    card = authed_client.post("/api/cards", json={"column_id": col_id, "title": "Gone", "details": ""}).json()
    authed_client.delete(f"/api/cards/{card['id']}")
    board = authed_client.get("/api/board").json()
    assert card["id"] not in board["cards"]


def test_move_card_across_columns(authed_client):
    board = authed_client.get("/api/board").json()
    col0_id = int(board["columns"][0]["id"])
    col1_id = int(board["columns"][1]["id"])
    card = authed_client.post("/api/cards", json={"column_id": col0_id, "title": "Move me", "details": ""}).json()
    authed_client.put("/api/board/reorder", json={"card_id": int(card["id"]), "column_id": col1_id, "position": 0})
    board = authed_client.get("/api/board").json()
    assert card["id"] in board["columns"][1]["cardIds"]
    assert card["id"] not in board["columns"][0]["cardIds"]


# --- ai chat ---

class _ToolBlock:
    type = "tool_use"

    def __init__(self, data):
        self.input = data


class _ChatMsg:
    def __init__(self, data):
        self.content = [_ToolBlock(data)]


def _fake_anthropic(response_data):
    class _FA:
        def __init__(self, **_):
            self.messages = self

        def create(self, **_):
            return _ChatMsg(response_data)

    return _FA


def test_ai_chat_unauthenticated(client, monkeypatch):
    monkeypatch.setattr(main_module, "_ANTHROPIC_API_KEY", "fake-key")
    assert client.post("/api/ai/chat", json={"message": "hi", "history": []}).status_code == 401


def test_ai_chat_missing_key(authed_client, monkeypatch):
    monkeypatch.setattr(main_module, "_ANTHROPIC_API_KEY", None)
    res = authed_client.post("/api/ai/chat", json={"message": "hi", "history": []})
    assert res.status_code == 500
    assert "ANTHROPIC_API_KEY" in res.json()["detail"]


def test_ai_chat_conversational(authed_client, monkeypatch):
    monkeypatch.setattr(main_module, "_ANTHROPIC_API_KEY", "fake-key")
    monkeypatch.setattr(main_module._anthropic, "Anthropic", _fake_anthropic({"reply": "You have 0 cards."}))
    res = authed_client.post("/api/ai/chat", json={"message": "How many cards do I have?", "history": []})
    assert res.status_code == 200
    data = res.json()
    assert data["reply"] == "You have 0 cards."
    assert "board" in data


def test_ai_chat_board_update(authed_client, monkeypatch):
    board = authed_client.get("/api/board").json()
    done_col = next(c for c in board["columns"] if c["title"] == "Done")
    backlog_col = next(c for c in board["columns"] if c["title"] == "Backlog")
    card = authed_client.post("/api/cards", json={"column_id": int(done_col["id"]), "title": "Task A", "details": ""}).json()

    monkeypatch.setattr(main_module, "_ANTHROPIC_API_KEY", "fake-key")
    monkeypatch.setattr(main_module._anthropic, "Anthropic", _fake_anthropic({
        "reply": "Moved to Backlog.",
        "kanban_update": {
            "columns": [],
            "cards": [{"id": int(card["id"]), "column_id": int(backlog_col["id"]), "title": "Task A", "details": "", "position": 0}],
        },
    }))

    res = authed_client.post("/api/ai/chat", json={"message": "Move all Done cards to Backlog", "history": []})
    assert res.status_code == 200
    assert res.json()["reply"] == "Moved to Backlog."

    board = authed_client.get("/api/board").json()
    backlog = next(c for c in board["columns"] if c["title"] == "Backlog")
    done = next(c for c in board["columns"] if c["title"] == "Done")
    assert card["id"] in backlog["cardIds"]
    assert card["id"] not in done["cardIds"]


def test_ai_chat_passes_history(authed_client, monkeypatch):
    captured = {}

    class _FA:
        def __init__(self, **_):
            self.messages = self

        def create(self, **kwargs):
            captured.update(kwargs)
            return _ChatMsg({"reply": "OK"})

    monkeypatch.setattr(main_module, "_ANTHROPIC_API_KEY", "fake-key")
    monkeypatch.setattr(main_module._anthropic, "Anthropic", _FA)
    authed_client.post("/api/ai/chat", json={
        "message": "What's up?",
        "history": [{"role": "user", "content": "Hello"}, {"role": "assistant", "content": "Hi!"}],
    })
    msgs = captured["messages"]
    assert msgs[0] == {"role": "user", "content": "Hello"}
    assert msgs[1] == {"role": "assistant", "content": "Hi!"}
    assert msgs[2] == {"role": "user", "content": "What's up?"}
