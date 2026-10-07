"""FastAPI application factory: middleware, security, routers, error handling."""
import logging
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded

from .rate_limit import limiter
from starlette.middleware.base import BaseHTTPMiddleware

from .ai_providers.registry import register_builtin_providers
from .config import get_settings
from .cookies import CSRF_COOKIE

settings = get_settings()
log = logging.getLogger("api")

# Endpoints that never require CSRF (public or signature-authenticated).
CSRF_EXEMPT = {
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/register"),
    ("POST", "/api/auth/verify-email"),
    ("POST", "/api/auth/forgot-password"),
    ("POST", "/api/auth/reset-password"),
    ("POST", "/api/auth/refresh"),
    ("POST", "/api/payments/webhook"),
    ("GET", "/api/health"),
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        resp = await call_next(request)
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        resp.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if settings.ENV == "prod":
            resp.headers["Strict-Transport-Security"] = \
                "max-age=31536000; includeSubDomains"
        return resp


class CsrfMiddleware(BaseHTTPMiddleware):
    """Double-submit CSRF: mutating requests authenticated via cookie must
    present X-CSRF-Token matching the readable csrf_token cookie."""

    async def dispatch(self, request: Request, call_next):
        if (request.method in ("POST", "PUT", "PATCH", "DELETE")
                and request.url.path.startswith("/api")
                and (request.method, request.url.path) not in CSRF_EXEMPT):
            has_cookie_auth = bool(request.cookies.get("access_token"))
            uses_header_auth = request.headers.get("Authorization", "").lower().startswith("bearer ")
            if has_cookie_auth and not uses_header_auth:
                cookie_token = request.cookies.get(CSRF_COOKIE)
                header_token = request.headers.get("X-CSRF-Token")
                if not cookie_token or not header_token or cookie_token != header_token:
                    return JSONResponse(
                        status_code=403,
                        content={"error": {"code": "forbidden",
                                           "message": "CSRF validation failed."}})
        return await call_next(request)


def create_app() -> FastAPI:
    register_builtin_providers()
    app = FastAPI(title=settings.APP_NAME, docs_url="/api/docs",
                  redoc_url=None, openapi_url="/api/openapi.json")
    app.state.limiter = limiter

    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(CsrfMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
        return JSONResponse(status_code=429, content={
            "error": {"code": "rate_limited",
                      "message": "Too many requests. Please slow down."}})

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        # Our errors carry {"code","message"} in detail -> wrap as {"error": ...}.
        detail = exc.detail
        if isinstance(detail, dict) and "code" in detail:
            return JSONResponse(status_code=exc.status_code,
                                content={"error": detail})
        msg = str(detail)[:200] if detail else "Request failed."
        return JSONResponse(status_code=exc.status_code, content={
            "error": {"code": "error", "message": msg}})

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception):
        # Safe user-facing message; technical details go to the server log only.
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={
            "error": {"code": "server_error",
                      "message": "Something went wrong. Please try again later."}})

    # --- API routers -------------------------------------------------------
    from .routers import auth, customer, generations, payments, public
    from .routers import admin as admin_pkg

    app.include_router(public.router, prefix="/api")
    app.include_router(auth.router, prefix="/api")
    app.include_router(customer.router, prefix="/api")
    app.include_router(customer.packages_router, prefix="/api")
    app.include_router(customer.models_router, prefix="/api")
    app.include_router(customer.notifications_router, prefix="/api")
    app.include_router(generations.router, prefix="/api")
    app.include_router(generations.files_router, prefix="/api")
    app.include_router(payments.router, prefix="/api")
    for r in (admin_pkg.dashboard_router, admin_pkg.users_router,
              admin_pkg.credits_router, admin_pkg.payments_router,
              admin_pkg.generations_router, admin_pkg.packages_router,
              admin_pkg.aimodels_router, admin_pkg.settings_router,
              admin_pkg.admins_router):
        app.include_router(r, prefix="/api")

    # --- frontend static serving (prod) ------------------------------------
    # In production the built customer app is served at / and the admin app at
    # /admin/. In dev, run the Vite dev servers instead (see README).
    web_dist = os.path.join(os.path.dirname(__file__), "..", "..",
                            "apps", "web", "dist")
    admin_dist = os.path.join(os.path.dirname(__file__), "..", "..",
                              "apps", "admin", "dist")
    if os.path.isdir(os.path.join(admin_dist, "assets")) or \
            os.path.isfile(os.path.join(admin_dist, "index.html")):
        app.mount("/admin", StaticFiles(directory=admin_dist, html=True),
                  name="admin")
    if os.path.isfile(os.path.join(web_dist, "index.html")):
        app.mount("/", StaticFiles(directory=web_dist, html=True), name="web")

    return app


app = create_app()
