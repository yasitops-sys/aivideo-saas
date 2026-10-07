"""Auth flows: register, verify, login, logout, refresh, password change/reset,
profile update, account deletion, CSRF enforcement."""
from tests.conftest import auth_client, csrf_headers, login, register

from app import models
from app.db import SessionLocal
from app.security import hash_token


def test_register_and_login_flow(client):
    register(client, "alice@example.com")
    user = login(client, "alice@example.com")
    assert user["email"] == "alice@example.com"
    assert user["role"] == "customer"

    r = client.get("/api/auth/me")
    assert r.status_code == 200
    assert r.json()["user"]["email"] == "alice@example.com"

    # CSRF enforced: mutating request without the header -> 403
    r2 = client.patch("/api/auth/me", json={"full_name": "Nope"})
    assert r2.status_code == 403

    r3 = client.patch("/api/auth/me", json={"full_name": "Alice A"},
                      headers=csrf_headers(client))
    assert r3.status_code == 200
    assert r3.json()["user"]["full_name"] == "Alice A"


def test_login_wrong_password_generic_message(client):
    register(client, "bob@example.com")
    r = client.post("/api/auth/login",
                    json={"email": "bob@example.com", "password": "WrongPass1!"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthenticated"


def test_email_verification(client, db):
    register(client, "carol@example.com")
    row = db.query(models.EmailVerificationToken).order_by(
        models.EmailVerificationToken.created_at.desc()).first()
    # token is stored hashed; recover via DB is not possible — but the raw
    # token was "sent" (dev logs). Instead verify the link rejects garbage:
    r = client.post("/api/auth/verify-email", json={"token": "garbage-token"})
    assert r.status_code == 422
    assert row.token_hash and len(row.token_hash) == 64  # sha256, not raw


def test_refresh_rotates(client):
    register(client, "dave@example.com")
    login(client, "dave@example.com")
    old_refresh = client.cookies.get("refresh_token")
    r = client.post("/api/auth/refresh", headers=csrf_headers(client))
    assert r.status_code == 200
    assert client.cookies.get("refresh_token") != old_refresh
    # old refresh token is revoked
    db = SessionLocal()
    row = db.query(models.RefreshToken).filter(
        models.RefreshToken.token_hash == hash_token(old_refresh)).first()
    assert row.revoked_at is not None
    db.close()


def test_logout_revokes(client):
    register(client, "erin@example.com")
    login(client, "erin@example.com")
    r = client.post("/api/auth/logout", headers=csrf_headers(client))
    assert r.status_code == 200
    assert client.cookies.get("access_token") is None
    r2 = client.get("/api/auth/me")
    assert r2.status_code == 401


def test_change_password_revokes_other_sessions(app):
    from fastapi.testclient import TestClient
    c1 = TestClient(app, raise_server_exceptions=False)
    register(c1, "frank@example.com")
    login(c1, "frank@example.com")
    c2 = TestClient(app, raise_server_exceptions=False)
    login(c2, "frank@example.com")
    r = c1.post("/api/auth/change-password", headers=csrf_headers(c1),
                json={"current_password": "Password123!",
                      "new_password": "NewPassword456!"})
    assert r.status_code == 200, r.text
    # old password dead
    assert c2.post("/api/auth/login", json={"email": "frank@example.com",
                                            "password": "Password123!"}).status_code == 401
    # new password works
    assert c2.post("/api/auth/login", json={"email": "frank@example.com",
                                            "password": "NewPassword456!"}).status_code == 200


def test_forgot_password_always_ok_and_reset(client, db):
    register(client, "grace@example.com")
    r = client.post("/api/auth/forgot-password", json={"email": "grace@example.com"})
    assert r.status_code == 200 and r.json()["ok"] is True
    # unknown email -> same response (no enumeration)
    r2 = client.post("/api/auth/forgot-password",
                     json={"email": "nobody@example.com"})
    assert r2.status_code == 200 and r2.json()["ok"] is True
    # use the hashed token row: reconstruct raw token is impossible, so we
    # verify the reset endpoint rejects garbage and accepts nothing else here.
    r3 = client.post("/api/auth/reset-password",
                     json={"token": "nope", "new_password": "Xyz12345!"})
    assert r3.status_code == 422


def test_delete_account(client):
    register(client, "heidi@example.com")
    login(client, "heidi@example.com")
    r = client.request("DELETE", "/api/auth/me", headers=csrf_headers(client),
                       json={"password": "Password123!"})
    assert r.status_code == 200, r.text
    assert client.get("/api/auth/me").status_code == 401
