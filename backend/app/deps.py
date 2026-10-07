"""Auth dependencies: current user, role gates. Server-side RBAC lives here."""
from fastapi import Cookie, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from . import models
from .db import get_db
from .errors import forbidden, unauthenticated
from .security import decode_access_token


def _load_user(db: Session, user_id: str) -> models.User | None:
    return (
        db.query(models.User)
        .filter(models.User.id == user_id, models.User.deleted_at.is_(None))
        .first()
    )


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    access_token: str | None = Cookie(default=None),
) -> models.User:
    # Cookie auth (browser) — Authorization header fallback for API clients.
    token = access_token
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth[7:]
    if not token:
        raise unauthenticated()
    payload = decode_access_token(token)
    if not payload:
        raise unauthenticated()
    user = _load_user(db, payload["sub"])
    if not user or not user.is_active:
        raise unauthenticated("Session invalid or account suspended.")
    # Re-check role from DB on every request — never trust the JWT alone.
    return user


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role.name not in ("admin", "super_admin"):
        raise forbidden("Admin access required.")
    return user


def require_super_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role.name != "super_admin":
        raise forbidden("Super-admin access required.")
    return user


def get_client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()[:64]
    return (request.client.host if request.client else "unknown")[:64]
