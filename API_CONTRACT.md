# API Contract v1

Base URL: backend serves `/api/...`. Auth = httpOnly cookies (`access_token`,
`refresh_token`) + CSRF double-submit: client reads `csrf_token` cookie and
sends `X-CSRF-Token` header on POST/PUT/PATCH/DELETE. (In dev, if CSRF cookie
absent, backend still requires the header when cookies present.)

Error shape (all errors):
```json
{ "error": { "code": "string_code", "message": "safe user-facing message" } }
```
Codes: `unauthenticated`, `forbidden`, `validation_error`, `not_found`,
`insufficient_credits`, `rate_limited`, `conflict`, `server_error`.

Pagination: `?page=1&per_page=20` -> `{ "items": [...], "total": N, "page": 1, "per_page": 20, "pages": P }`

Timestamps: ISO-8601 UTC. Money: integer minor units. IDs: UUID strings.

## Public
- `GET /api/health` -> `{ ok: true }`
- `GET /api/settings/public` -> `{ site_name, logo_url, currency, registration_enabled, maintenance_mode }`
- `GET /api/packages` -> list of active packages `{ id, name, credits, price_cents, currency }`
- `GET /api/models` -> list of enabled models `{ id, name, provider, generation_type, credit_cost, durations[], aspect_ratios[] }`

## Auth (`/api/auth`)
- `POST /api/auth/register` `{ email, password>=8, full_name }` -> 201 `{ user: {id,email,full_name,role,email_verified} }`. Sends verification email (console log in dev). Rate-limited.
- `POST /api/auth/verify-email` `{ token }` -> `{ ok: true }`
- `POST /api/auth/login` `{ email, password }` -> `{ user }` + sets cookies. 401 on bad creds (generic message).
- `POST /api/auth/logout` -> clears cookies, revokes refresh token.
- `POST /api/auth/refresh` -> rotates refresh token, new access cookie.
- `GET /api/auth/me` -> `{ user: { id,email,full_name,role,email_verified,credit_balance,is_active,created_at } }`
- `PATCH /api/auth/me` `{ full_name }` -> updated user.
- `POST /api/auth/change-password` `{ current_password, new_password }` -> `{ ok: true }`
- `POST /api/auth/forgot-password` `{ email }` -> always `{ ok: true }` (no enumeration). Rate-limited hard.
- `POST /api/auth/reset-password` `{ token, new_password }` -> `{ ok: true }`
- `DELETE /api/auth/me` `{ password }` -> soft-deletes account, revokes tokens. -> `{ ok: true }`

## Customer — generations (`/api/generations`) [auth]
- `POST /api/generations` multipart/form-data:
  fields: `model_id` (uuid), `prompt` (1..2000 chars), `duration_seconds` (int, must be in model's durations),
  `aspect_ratio` (must be in model's aspect_ratios), optional file `image` (required iff model.generation_type == image_to_video; jpg/png/webp <= max_upload_mb, magic-byte validated).
  -> 202 `{ id, status: "queued", credits_reserved, estimated }`
  -> 402 `{ error: { code: "insufficient_credits", ... } }` when balance < cost.
- `GET /api/generations?page=&per_page=&status=` -> paginated list:
  `{ id, prompt, generation_type, model: {id,name}, duration_seconds, aspect_ratio, status, credits_charged, video_url (signed, nullable), thumbnail_url (nullable), input_image_url (nullable), error_message (nullable), created_at, completed_at }`
- `GET /api/generations/:id` -> same single object. 404 if not owner.
- `DELETE /api/generations/:id` -> deletes record + storage objects (owner only, not while queued/processing). -> `{ ok: true }`
- `GET /api/files/:token` -> streams file for a signed token (video/image). Token = HMAC-signed, 15-min expiry, bound to storage key + user.

## Customer — credits & billing [auth]
- `GET /api/credits` -> `{ balance, total_purchased, total_used }`
- `GET /api/credit-transactions?page=&per_page=&type=` -> paginated `{ id, transaction_type, amount, balance_before, balance_after, reference_id, description, created_at }`
- `GET /api/payments` -> paginated `{ id, package: {name, credits}, amount_cents, currency, status, provider, created_at, completed_at }`
- `POST /api/payments/checkout` `{ package_id }` -> `{ payment_id, checkout_url, amount_cents, currency }`
- `POST /api/payments/webhook` — Stripe only, raw body, `Stripe-Signature` header. Always 200 on valid receipt (even duplicates).

## Customer — notifications [auth]
- `GET /api/notifications?unread_only=` -> list `{ id, type, title, message, is_read, created_at }`
- `POST /api/notifications/read` `{ ids: [...] }` -> `{ ok: true }`

## Admin (`/api/admin/*`) [auth + role admin|super_admin; super-only marked ★]
All list endpoints: `?page&per_page&search&q&status&sort&order&from&to`.

- `GET /api/admin/dashboard` -> `{ totals: { users, active_users, payments, revenue_cents, credits_sold, credits_consumed, videos_generated, failed_generations }, recent_users[5], recent_payments[5], recent_generations[5], charts: { signups_by_day[30], revenue_by_day[30], generations_by_status } }`
- `GET /api/admin/users?search=&role=&is_active=` -> paginated `{ id,email,full_name,role,is_active,email_verified,credit_balance,created_at }`
- `GET /api/admin/users/:id` -> `{ id, email, full_name, role, is_active, email_verified, credit_balance, totals: { purchased, used, generations, payments }, recent_generations[10]: [{ id, prompt, generation_type, model: {id,name}, duration_seconds, aspect_ratio, status, credits_reserved, credits_charged, video_url, thumbnail_url, error_message, created_at, completed_at }], recent_payments[10]: [{ id, package: {name,credits}, amount_cents, currency, status, created_at, completed_at }], created_at }`
- `PATCH /api/admin/users/:id` `{ is_active }` -> suspend/reactivate (audit-logged)
- `POST /api/admin/users/:id/reset-password` -> creates reset token, returns it once for admin to share via secure channel (audit-logged). Body `{}`.
- `DELETE /api/admin/users/:id` -> soft delete (audit-logged)
- `GET /api/admin/generations?status=&user_id=&model_id=` -> paginated (all fields incl. user email)
- `GET /api/admin/payments?status=` -> paginated incl. user email + package name
- `GET /api/admin/credit-transactions?user_id=&type=` -> paginated ledger
- `POST /api/admin/credits/adjust` `{ user_id, amount (signed int, !=0), reason (>=5 chars) }` -> `{ balance }`. Creates `admin_adjust` transaction + audit log. Amount>0 adds, <0 removes (fails if would go negative).
- `GET /api/admin/packages` -> all packages incl. inactive
- `POST /api/admin/packages` / `PUT /api/admin/packages/:id` `{ name, credits, price_cents, currency, is_active, sort_order }` (audit-logged)
- `GET /api/admin/models` -> all models incl. disabled
- `POST /api/admin/models` / `PUT /api/admin/models/:id` `{ name, provider, model_id, generation_type, credit_cost, durations[], aspect_ratios[], is_enabled }` (audit-logged)
- `GET /api/admin/audit-logs?action=&admin_id=` -> paginated `{ id, admin: {email}, action, target_type, target_id, details, ip_address, created_at }`
- `GET /api/admin/settings` -> `[ { key, value, updated_at } ]` (sensitive values masked as `********`)
- `PUT /api/admin/settings` `{ key, value }` (★ for sensitive keys: provider api config) (audit-logged)
- `GET /api/admin/admins` (★) -> list admin/super_admin users
- `POST /api/admin/admins` (★) `{ email, password, full_name, role: admin|super_admin }` -> creates admin (audit-logged)
- `DELETE /api/admin/admins/:id` (★) -> demote to customer (cannot demote self / last super_admin) (audit-logged)

## Frontend routes (for reference)
Customer app: `/login /register /forgot-password /reset-password/:token /verify-email?token= /dashboard /generate /history /billing /transactions /settings`
Admin app (separate build, served at `/admin/`): `/admin/login /admin/dashboard /admin/users /admin/users/:id /admin/generations /admin/payments /admin/packages /admin/models /admin/transactions /admin/audit-logs /admin/settings /admin/admins`
Backend also serves a JSON 403 for any `/api/admin/*` hit by a non-admin.
