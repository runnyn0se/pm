import pytest
from fastapi.testclient import TestClient
from main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def authed_client():
    with TestClient(app) as c:
        c.post("/api/auth/login", json={"username": "user", "password": "password"})
        yield c


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_login_valid_credentials(client):
    response = client.post("/api/auth/login", json={"username": "user", "password": "password"})
    assert response.status_code == 200
    assert response.json()["username"] == "user"
    assert "session" in response.cookies


def test_login_invalid_credentials(client):
    response = client.post("/api/auth/login", json={"username": "user", "password": "wrong"})
    assert response.status_code == 401


def test_me_unauthenticated(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_me_authenticated(authed_client):
    response = authed_client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json()["username"] == "user"


def test_logout_clears_session(authed_client):
    authed_client.post("/api/auth/logout")
    response = authed_client.get("/api/auth/me")
    assert response.status_code == 401
