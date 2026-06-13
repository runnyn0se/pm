import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

import anthropic as _anthropic
import db
import service
from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from itsdangerous import BadSignature, URLSafeSerializer
from pydantic import BaseModel

_SECRET = os.getenv("SECRET_KEY", "dev-secret-change-in-production")
_ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

_RESPOND_TOOL = {
    "name": "respond",
    "description": "Reply to the user and optionally update the Kanban board.",
    "input_schema": {
        "type": "object",
        "required": ["reply"],
        "properties": {
            "reply": {"type": "string", "description": "Your text reply to the user."},
            "kanban_update": {
                "type": "object",
                "description": "Board changes to apply. Omit entirely if no changes are needed.",
                "properties": {
                    "columns": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["id", "title"],
                            "properties": {
                                "id": {"type": "integer"},
                                "title": {"type": "string"},
                            },
                        },
                    },
                    "cards": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["id", "column_id", "title", "details", "position"],
                            "properties": {
                                "id": {"type": "integer"},
                                "column_id": {"type": "integer"},
                                "title": {"type": "string"},
                                "details": {"type": "string"},
                                "position": {"type": "integer"},
                            },
                        },
                    },
                },
            },
        },
    },
}
_signer = URLSafeSerializer(_SECRET, salt="session")

VALID_USERNAME = "user"
VALID_PASSWORD = "password"


class LoginRequest(BaseModel):
    username: str
    password: str


class RenameColumnRequest(BaseModel):
    title: str


class CreateCardRequest(BaseModel):
    column_id: int
    title: str
    details: str = ""


class ReorderRequest(BaseModel):
    card_id: int
    column_id: int
    position: int


class MessageItem(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[MessageItem] = []


class ColumnSchema(BaseModel):
    id: int
    title: str


class CardSchema(BaseModel):
    id: int
    column_id: int
    title: str
    details: str = ""
    position: int


class KanbanUpdate(BaseModel):
    columns: list[ColumnSchema] = []
    cards: list[CardSchema] = []


def _get_session_user(session: str | None) -> str | None:
    if not session:
        return None
    try:
        return _signer.loads(session)
    except BadSignature:
        return None


def require_auth(session: str | None = Cookie(default=None)) -> str:
    username = _get_session_user(session)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return username


@asynccontextmanager
async def lifespan(app):
    db.init_db()
    yield


app = FastAPI(lifespan=lifespan)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/login")
def login(credentials: LoginRequest, response: Response):
    if credentials.username != VALID_USERNAME or credentials.password != VALID_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = _signer.dumps(credentials.username)
    response.set_cookie(key="session", value=token, httponly=True, samesite="lax")
    return {"username": credentials.username}


@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie("session")
    return {"ok": True}


@app.get("/api/auth/me")
def me(session: str | None = Cookie(default=None)):
    username = _get_session_user(session)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"username": username}


@app.get("/api/board")
def get_board(username: str = Depends(require_auth)):
    return service.get_board(username)


@app.put("/api/columns/{column_id}")
def rename_column(column_id: int, body: RenameColumnRequest, username: str = Depends(require_auth)):
    try:
        service.rename_column(username, column_id, body.title)
    except ValueError:
        raise HTTPException(status_code=404, detail="Column not found")
    return {"ok": True}


@app.post("/api/cards")
def create_card(body: CreateCardRequest, username: str = Depends(require_auth)):
    try:
        return service.create_card(username, body.column_id, body.title, body.details)
    except ValueError:
        raise HTTPException(status_code=404, detail="Column not found")


@app.delete("/api/cards/{card_id}")
def delete_card(card_id: int, username: str = Depends(require_auth)):
    try:
        service.delete_card(username, card_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Card not found")
    return {"ok": True}


@app.put("/api/board/reorder")
def reorder(body: ReorderRequest, username: str = Depends(require_auth)):
    try:
        service.move_card(username, body.card_id, body.column_id, body.position)
    except ValueError:
        raise HTTPException(status_code=404, detail="Card not found")
    return {"ok": True}


@app.post("/api/ai/chat")
def ai_chat(body: ChatRequest, username: str = Depends(require_auth)):
    if not _ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY is not configured")
    board = service.get_board(username)
    system = (
        "You are an AI assistant for a Kanban project management board.\n"
        f"Current board state (JSON):\n{json.dumps(board)}\n\n"
        "Use the respond tool to reply. If the user asks you to change the board, include "
        "kanban_update with the full updated columns and/or cards. Omit kanban_update if "
        "you are only answering a question."
    )
    messages = [{"role": h.role, "content": h.content} for h in body.history]
    messages.append({"role": "user", "content": body.message})
    client = _anthropic.Anthropic(api_key=_ANTHROPIC_API_KEY)
    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=system,
        tools=[_RESPOND_TOOL],
        tool_choice={"type": "tool", "name": "respond"},
        messages=messages,
    )
    tool_block = next(b for b in msg.content if b.type == "tool_use")
    reply = tool_block.input["reply"]
    raw_update = tool_block.input.get("kanban_update")
    if raw_update:
        update = KanbanUpdate(
            columns=[ColumnSchema(**c) for c in raw_update.get("columns", [])],
            cards=[CardSchema(**c) for c in raw_update.get("cards", [])],
        )
        service.apply_kanban_update(username, update)
    board = service.get_board(username)
    return {"reply": reply, "board": board}


static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
