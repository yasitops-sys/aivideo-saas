# AI Video Studio — AI Video Generation SaaS

A real multi-user SaaS: customer web app, **separate** admin panel, FastAPI
backend, relational database, background worker, pluggable AI provider layer,
Stripe payments with idempotent webhooks, and object storage. No secrets ever
reach the browser.

## Architecture

```
apps/web/        customer React app  (served at /)
apps/admin/      admin React app     (served at /admin/, separate build+layout)
backend/app/
  routers/       auth, generations, payments, credits, packages, models,
                 notifications, admin/* (RBAC-enforced server-side)
  services/      credits (immutable ledger), payments, storage, notifications
  ai_providers/  AIProvider ABC (text_to_video / image_to_video / get_status)
                 + MockProvider (renders real mp4s) + ReplicateProvider
  worker/        DB-backed job queue consumer (separate process)
```

Read `ARCHITECTURE.md`, `SCHEMA.md`, `API_CONTRACT.md` for the full design.

## Quick start (development)

**1. Backend**

```bash
cd backend
cp ../.env.example ../.env        # then edit: SECRET_KEY, ADMIN_PASSWORD, ...
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='StrongPass123!' .venv/bin/python -m app.seed
.venv/bin/uvicorn app.main:app --reload --port 8000
```

**2. Worker** (second terminal — processes the generation queue)

```bash
cd backend && .venv/bin/python -m app.worker.worker
```

**3. Frontends** (two more terminals)

```bash
cd apps/web && npm install && npm run dev      # http://localhost:5173
cd apps/admin && npm install && npm run dev    # http://localhost:5174
```

Open http://localhost:5173 → register → generate. Admin: http://localhost:5174
→ log in with the super-admin from the seed step. A customer account gets
**403** on every `/api/admin/*` endpoint — separation is enforced server-side.

## Production (Docker)

```bash
cp .env.example .env   # fill in: SECRET_KEY, POSTGRES_PASSWORD, STRIPE_*,
                       # S3_*, REPLICATE_API_TOKEN, COOKIE_SECURE=true, ...
cd apps/web && npm ci && npm run build
cd ../admin && npm ci && npm run build
docker compose up --build -d
```

This starts Postgres, the API (`:8000`, serves both frontends), and the worker.
Put a TLS-terminating reverse proxy (Caddy/Nginx/Cloudflare) in front.

## Key flows

- **Credits**: `POST /api/generations` reserves credits in the same DB
  transaction that creates the job → worker charges on success, refunds on
  failure. Every change writes an immutable `credit_transactions` row.
  The frontend can never touch balances.
- **Payments**: `POST /api/payments/checkout` → Stripe Checkout → Stripe calls
  `POST /api/payments/webhook` (HMAC-verified, deduped by event id) → credits
  granted exactly once, inside one transaction. Never trust client-side
  "payment successful".
- **Admin**: separate login surface + layout; `require_admin` /
  `require_super_admin` dependencies on every admin route. All admin mutations
  write to the immutable `admin_audit_logs` table.
- **AI providers**: implement `AIProvider` in `backend/app/ai_providers/`,
  register one line in `registry.py`, then select it per-model in
  Admin → AI Models. Keys stay in env vars.

## Configuration knobs (Admin → Settings)

Site name, logo, currency, maintenance mode, default credit cost, max upload
size, max generation duration, registration on/off, signup bonus credits.
Provider secrets are super-admin only and shown masked.

## Tests

```bash
cd backend && .venv/bin/python -m pytest tests/ -q
```

19 tests: auth flows, CSRF, webhook idempotency (no double-credit),
bad-signature rejection, reserve→charge, insufficient credits (402),
failed-generation refund, upload validation, customer→admin 403s,
admin credit adjustments + audit logs, suspend/reactivate.

## Security notes

- bcrypt passwords (SHA-256 pre-hash), short-lived JWT access cookies
  (httpOnly, Secure in prod) + rotating refresh tokens, CSRF double-submit.
- slowapi rate limits (stricter on auth), security headers, generic error
  responses (internals only in server logs).
- Uploads validated by magic bytes + size cap; videos served via 15-minute
  HMAC-signed URLs, never from the database.
- `docker compose` runs the worker as a separate process; scale workers
  horizontally — job claiming uses `SELECT … FOR UPDATE SKIP LOCKED`.
