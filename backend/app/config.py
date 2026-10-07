"""Environment-driven configuration. Every secret comes from env — never code."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "AI Video Studio"
    ENV: str = "dev"  # dev | prod

    SECRET_KEY: str = "CHANGE-ME-min-32-chars-for-production-use"
    DATABASE_URL: str = "sqlite:///./data/app.db"

    ACCESS_TOKEN_MINUTES: int = 15
    REFRESH_TOKEN_DAYS: int = 30

    COOKIE_SECURE: bool = False  # MUST be True in production (HTTPS)
    COOKIE_DOMAIN: str | None = None

    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:5174"

    # Storage: "local" (dev) or "s3" (prod, S3-compatible)
    STORAGE_BACKEND: str = "local"
    STORAGE_DIR: str = "./data/storage"
    S3_BUCKET: str | None = None
    S3_ENDPOINT_URL: str | None = None
    S3_REGION: str | None = None
    S3_ACCESS_KEY: str | None = None
    S3_SECRET_KEY: str | None = None
    S3_PUBLIC_BASE_URL: str | None = None
    FILE_URL_TTL_SECONDS: int = 900  # signed URL lifetime

    # AI providers (keys never leave the server)
    AI_PROVIDER_DEFAULT: str = "mock"
    REPLICATE_API_TOKEN: str | None = None
    GEMINI_API_KEY: str | None = None

    # Stripe
    STRIPE_SECRET_KEY: str | None = None
    STRIPE_WEBHOOK_SECRET: str | None = None
    STRIPE_SUCCESS_URL: str = "http://localhost:5173/billing?payment=success"
    STRIPE_CANCEL_URL: str = "http://localhost:5173/billing?payment=cancelled"

    # Bootstrap super-admin (used by seed only)
    ADMIN_EMAIL: str = "admin@example.com"
    ADMIN_PASSWORD: str = "ChangeMe123!"
    ADMIN_NAME: str = "Site Admin"

    FRONTEND_URL: str = "http://localhost:5173"

    # Email (console-logged in dev; wire SMTP later without touching call sites)
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAIL_FROM: str = "noreply@example.com"


@lru_cache
def get_settings() -> Settings:
    return Settings()
