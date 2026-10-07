"""Password hashing, JWT, opaque tokens, HMAC signing."""
import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import get_settings

settings = get_settings()

JWT_ALG = "HS256"


# --- passwords -------------------------------------------------------------
def _pw_digest(password: str) -> bytes:
    # SHA-256 pre-hash: sidesteps bcrypt's 72-byte limit (standard practice).
    return base64.b64encode(hashlib.sha256(password.encode("utf-8")).digest())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_pw_digest(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_pw_digest(password), password_hash.encode("utf-8"))
    except Exception:
        return False


# --- JWT access tokens ------------------------------------------------------
def create_access_token(user_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_MINUTES),
        "typ": "access",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=JWT_ALG)


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[JWT_ALG])
        if payload.get("typ") != "access":
            return None
        return payload
    except jwt.PyJWTError:
        return None


# --- opaque tokens (refresh / email verify / password reset) ----------------
def new_opaque_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    """Store only the hash of single-use tokens in the DB."""
    return hashlib.sha256(token.encode()).hexdigest()


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


# --- HMAC signing (signed file URLs) ----------------------------------------
def hmac_sign(data: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), data.encode(), hashlib.sha256).hexdigest()


def hmac_verify(data: str, signature: str) -> bool:
    return hmac.compare_digest(hmac_sign(data), signature)
