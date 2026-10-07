"""Shared fixtures: isolated SQLite DB, TestClient, CSRF helpers."""
import hashlib
import hmac
import json
import os
import tempfile
import time

import pytest

_tmp = tempfile.mkdtemp(prefix="aivideo_test_")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["SECRET_KEY"] = "test-secret-key-min-32-chars-xxxxxxxx"
os.environ["STRIPE_WEBHOOK_SECRET"] = "whsec_test123"
os.environ["STORAGE_DIR"] = f"{_tmp}/storage"
os.environ["ADMIN_EMAIL"] = "admin@example.com"
os.environ["ADMIN_PASSWORD"] = "AdminPass123!"

from fastapi.testclient import TestClient  # noqa: E402

from app import models  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import create_app  # noqa: E402
from app.security import hash_password  # noqa: E402
from app.seed import seed  # noqa: E402


@pytest.fixture(scope="function")
def app():
    # Function-scoped: each test gets a fresh app. The rate limiter is a
    # single shared instance — reset its counters per test so tests can't
    # 429 each other on register/login limits.
    from app.rate_limit import reset_limiter
    reset_limiter()
    Base.metadata.create_all(bind=engine)
    seed()
    return create_app()


@pytest.fixture()
def client(app):
    c = TestClient(app, raise_server_exceptions=False)
    yield c
    c.close()


@pytest.fixture()
def db(app):
    s = SessionLocal()
    yield s
    s.close()


def csrf_headers(client: TestClient) -> dict:
    tok = client.cookies.get("csrf_token")
    return {"X-CSRF-Token": tok} if tok else {}


def register(client: TestClient, email: str, password: str = "Password123!",
             name: str = "Test User") -> dict:
    r = client.post("/api/auth/register",
                    json={"email": email, "password": password, "full_name": name})
    assert r.status_code in (200, 201), r.text
    return r.json()


def login(client: TestClient, email: str, password: str = "Password123!") -> dict:
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["user"]


def auth_client(app, email: str, password: str = "Password123!") -> TestClient:
    c = TestClient(app, raise_server_exceptions=False)
    login(c, email, password)
    return c


def stripe_header(payload: bytes, secret: str = "whsec_test123") -> str:
    ts = int(time.time())
    sig = hmac.new(secret.encode(), f"{ts}.".encode() + payload,
                   hashlib.sha256).hexdigest()
    return f"t={ts},v1={sig}"


def make_user(db, email: str, role: str = "customer", balance: int = 0,
              password: str = "Password123!") -> models.User:
    role_row = db.query(models.Role).filter(models.Role.name == role).first()
    u = models.User(email=email, password_hash=hash_password(password),
                    full_name="U", role_id=role_row.id, email_verified=True,
                    credit_balance=balance)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def get_model(db, name="CineFast T2V") -> models.AIModel:
    return db.query(models.AIModel).filter(models.AIModel.name == name).first()
