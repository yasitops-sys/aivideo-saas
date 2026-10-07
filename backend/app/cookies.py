"""Cookie helpers — httpOnly auth cookies + readable CSRF cookie."""
from fastapi import Response

from .config import get_settings
from .security import new_csrf_token

settings = get_settings()

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"
CSRF_COOKIE = "csrf_token"


def _base_kwargs() -> dict:
    kw: dict = {
        "httponly": True,
        "secure": settings.COOKIE_SECURE,   # True in prod (HTTPS)
        "samesite": "lax",
        "path": "/",
    }
    if settings.COOKIE_DOMAIN:
        kw["domain"] = settings.COOKIE_DOMAIN
    return kw


def set_auth_cookies(resp: Response, access_token: str, refresh_token: str) -> str:
    """Sets access + refresh httpOnly cookies and a readable CSRF cookie.
    Returns the CSRF token (also sent so SPAs can bootstrap the header)."""
    kw = _base_kwargs()
    resp.set_cookie(ACCESS_COOKIE, access_token,
                    max_age=settings.ACCESS_TOKEN_MINUTES * 60, **kw)
    resp.set_cookie(REFRESH_COOKIE, refresh_token,
                    max_age=settings.REFRESH_TOKEN_DAYS * 86400, **kw)
    csrf = new_csrf_token()
    csrf_kw = dict(kw)
    csrf_kw["httponly"] = False  # JS must read it to send X-CSRF-Token
    resp.set_cookie(CSRF_COOKIE, csrf, max_age=settings.REFRESH_TOKEN_DAYS * 86400, **csrf_kw)
    return csrf


def clear_auth_cookies(resp: Response) -> None:
    kw = _base_kwargs()
    kw.pop("path", None)
    for name in (ACCESS_COOKIE, REFRESH_COOKIE):
        resp.delete_cookie(name, path="/", **kw)
    resp.delete_cookie(CSRF_COOKIE, path="/")
