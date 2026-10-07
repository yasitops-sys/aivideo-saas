# AI Video SaaS — Architecture

Real multi-user SaaS: separate backend API, customer web app, admin panel,
database, background worker, pluggable AI provider layer, Stripe payments,
object storage. Nothing sensitive ever reaches the browser.

## Repo layout

```
aivideo-saas/
  backend/                 # FastAPI + SQLAlchemy 2.0
    app/
      main.py              # app factory, middleware, router wiring
      config.py            # env-driven settings (pydantic-settings)
      db.py                # engine, session, Base, init
      security.py          # password hashing, JWT, CSRF
      deps.py              # auth deps: current_user, require_admin, require_super_admin
      middleware.py        # rate limit wiring, security headers
      models/              # SQLAlchemy models (see SCHEMA.md)
      schemas/             # Pydantic request/response models
      routers/
        auth.py            # register/login/logout/refresh/verify/forgot/reset/me/password/delete
        generations.py     # customer generation CRUD + upload
        credits.py         # balance + ledger
        packages.py        # public credit packages
        payments.py        # checkout + Stripe webhook
        notifications.py   # in-app notifications
        admin/             # dashboard, users, credits, payments, generations,
                           # packages, models, transactions, audit-logs, settings, admins
      services/
        credits.py         # reserve/charge/refund/add — ALWAYS in DB transaction
        payments.py        # Stripe checkout + idempotent webhook handling
        storage.py         # StorageBackend ABC: LocalBackend, S3Backend; signed URLs
        notifications.py   # NotificationService (in-app now, email channel later)
        email.py           # EmailService stub (console in dev, SMTP later)
      ai_providers/
        base.py            # AIProvider ABC: text_to_video, image_to_video, get_status
        registry.py        # provider registry by name
        mock.py            # MockProvider — renders a real mp4 locally (dev/test)
        replicate.py       # ReplicateProvider skeleton (env key, real HTTP)
      worker/
        queue.py           # DB-backed job queue helpers
        worker.py          # poll loop: claim -> provider -> storage -> notify
    alembic/               # migrations
    tests/                 # pytest suite
    requirements.txt
  apps/web/                # customer React app (Vite + TS + Tailwind)
  apps/admin/              # admin React app (separate Vite build, separate layout)
  docker-compose.yml       # api, worker, postgres, (frontend via nginx)
  .env.example
  README.md
```

## Request flow — video generation

```
Browser -> POST /api/generations (auth cookie + CSRF)
  -> validate model/duration/aspect, validate upload
  -> services.credits.reserve(user, cost)        # single DB transaction
  -> create video_generations row (status=queued)
  -> enqueue job id
  <- 202 { generation_id, status: queued }

Worker (separate process):
  claim job (SELECT ... FOR UPDATE SKIP LOCKED)
  -> status=processing
  -> provider = registry.get(model.provider)
  -> provider.text_to_video(...) / image_to_video(...)
  -> poll provider.get_status(job_id) until done/failed
  -> download artifact -> storage.save() -> storage_key, thumbnail
  -> status=completed, credits_charge (reserve -> charge)
  -> notifications.notify(user, generation_completed)
  on provider failure (after retries): status=failed, credits.refund(reserved)
  -> notifications.notify(user, generation_failed)
```

Credits are reserved up-front and only *charged* on success; failures refund.
Reserve/charge/refund each write an immutable `credit_transactions` row.

## Auth design

- Access token: short-lived JWT (15 min) in memory on the client (Authorization header) — no, simpler and safer: httpOnly `access_token` cookie (15 min) + httpOnly `refresh_token` cookie (30 days, rotating, hashed in DB).
- CSRF: double-submit cookie `csrf_token` (non-httpOnly) + required `X-CSRF-Token` header on all mutating requests. Validated in middleware for cookie-authenticated requests.
- Email verification: signed token link (24h). Forgot password: single-use hashed token (1h).
- Roles: `customer`, `admin`, `super_admin`. Server-side `require_admin` / `require_super_admin` deps on every admin route AND every admin API. Customer hitting `/admin/*` API gets 403. The two frontends are separate builds; admin frontend never ships customer code and vice versa.

## Payments (Stripe)

- `POST /api/payments/checkout { package_id }` -> creates `payments` row (status=pending, idempotency_key=uuid), creates Stripe Checkout Session (or PaymentIntent), returns `checkout_url`.
- `POST /api/payments/webhook` (raw body): verify Stripe signature header with `STRIPE_WEBHOOK_SECRET`. Look up `payment_webhooks` by Stripe `event_id` — if seen, return 200 immediately (idempotent). Process `checkout.session.completed` / `payment_intent.succeeded`: in ONE DB transaction, mark payment completed and credit the user's balance via `services.credits.add_purchase`. Mark failed events accordingly. Never trust client-side success.
- Replay protection: event_id unique constraint + completed_at set once + idempotency key on payment row.

## Storage

`StorageBackend` ABC: `save(file_bytes, key) -> url`, `get_signed_url(key, expires) -> url`, `delete(key)`.
- `LocalBackend` (dev): files under `STORAGE_DIR`, served via `/api/files/...` with expiring HMAC-signed URLs.
- `S3Backend` (prod): boto3, S3-compatible, presigned URLs.
Videos, input images, thumbnails never go in the DB — only `storage_key` + metadata.

## AI provider layer

```python
class AIProvider(ABC):
    name: str
    @abstractmethod
    def text_to_video(self, *, prompt, duration_seconds, aspect_ratio, model_id, **kw) -> ProviderJob
    @abstractmethod
    def image_to_video(self, *, prompt, image_bytes, duration_seconds, aspect_ratio, model_id, **kw) -> ProviderJob
    @abstractmethod
    def get_status(self, provider_job_id) -> ProviderStatus  # queued/processing/completed/failed + video_url/error
```

`registry.register("mock", MockProvider())`, `registry.register("replicate", ReplicateProvider())`.
Selected per `ai_models.provider`. New providers = new file + one register line. Keys only in env.

## Notifications

`NotificationService.notify(user_id, type, title, message, channels=("inapp",))`.
`inapp` -> `notifications` table (polled by frontends). `email` channel interface exists; `EmailService` currently logs in dev — wire SMTP later without touching call sites.

## Security checklist (implemented)

bcrypt (passlib), JWT (pyjwt), httpOnly+Secure+SameSite cookies, CSRF double-submit,
slowapi rate limits (auth stricter), Pydantic validation everywhere, SQLAlchemy
parameterized queries only, XSS via React escaping + no dangerouslySetInnerHTML,
upload validation by magic bytes + size cap from settings, security headers
middleware, webhook HMAC verification, audit logs for all admin mutations,
secrets only via env.

## Environments

- dev: SQLite (file), LocalBackend storage, MockProvider, Stripe test keys optional.
- prod: Postgres, S3 backend, real provider, Stripe live keys, run `api` + `worker` processes.
