import os
from pathlib import Path

from fastapi import Cookie, FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from itsdangerous import BadSignature, URLSafeSerializer
from pydantic import BaseModel

app = FastAPI()

_SECRET = os.getenv("SECRET_KEY", "dev-secret-change-in-production")
_signer = URLSafeSerializer(_SECRET, salt="session")

VALID_USERNAME = "user"
VALID_PASSWORD = "password"


class LoginRequest(BaseModel):
    username: str
    password: str


def _get_session_user(session: str | None) -> str | None:
    if not session:
        return None
    try:
        return _signer.loads(session)
    except BadSignature:
        return None


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


static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
