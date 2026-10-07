# Database Schema (PostgreSQL / SQLite-dev)

Conventions: `id` = UUID string PK (stored as CHAR(36)). All timestamps UTC.
Money in integer minor units (`price_cents`). Credits are integers.

## roles
| col | type | notes |
|---|---|---|
| id | uuid pk | |
| name | varchar(32) unique | `customer` \| `admin` \| `super_admin` |
| description | text nullable | |

## users
| col | type | notes |
|---|---|---|
| id | uuid pk | |
| email | citext/varchar(255) unique, indexed | normalized lowercase |
| password_hash | varchar(255) | bcrypt |
| full_name | varchar(255) | |
| role_id | fk -> roles.id | default customer |
| is_active | bool default true | false = suspended |
| email_verified | bool default false | |
| credit_balance | integer default 0, check >= 0 | |
| total_credits_purchased | integer default 0 | |
| total_credits_used | integer default 0 | |
| created_at / updated_at | timestamptz | |
| deleted_at | timestamptz nullable | soft delete |

## email_verification_tokens
id uuid pk, user_id fk -> users.id (cascade), token_hash varchar(255) unique,
expires_at, used_at nullable, created_at.

## password_reset_tokens
id uuid pk, user_id fk -> users.id (cascade), token_hash varchar(255) unique,
expires_at, used_at nullable, created_at.

## refresh_tokens
id uuid pk, user_id fk -> users.id (cascade), token_hash varchar(255) unique indexed,
expires_at, revoked_at nullable, ip_address varchar(64) nullable,
user_agent varchar(512) nullable, created_at.

## credit_packages
id uuid pk, name varchar(100), credits integer (>0),
price_cents integer (>=0), currency char(3) default 'USD',
is_active bool default true, sort_order integer default 0,
created_at, updated_at. Index on (is_active, sort_order).

## ai_models
id uuid pk, name varchar(100), provider varchar(50) (indexed),
model_id varchar(255) (provider's model identifier),
generation_type varchar(20): `text_to_video` | `image_to_video`,
credit_cost integer (>0) — cost per generation,
durations_json text (JSON array of allowed seconds, e.g. [5,10]),
aspect_ratios_json text (JSON array, e.g. ["16:9","9:16","1:1"]),
is_enabled bool default true, created_at, updated_at.

## payments
id uuid pk,
payment_id varchar(255) unique nullable — provider's payment identifier (set on webhook),
user_id fk -> users.id (indexed), package_id fk -> credit_packages.id,
amount_cents integer, currency char(3),
status varchar(20) indexed: `pending` | `completed` | `failed` | `refunded`,
provider varchar(50) default 'stripe',
provider_session_id varchar(255) unique nullable — checkout session id,
idempotency_key varchar(64) unique — generated at checkout,
credits_granted integer default 0,
created_at, completed_at nullable.
Index (user_id, created_at).

## payment_webhooks  (idempotency / replay protection)
id uuid pk, event_id varchar(255) unique — provider event id,
provider varchar(50), event_type varchar(100),
payload_json text (raw event JSON), signature_valid bool,
processing_status varchar(20): `processed` | `duplicate` | `failed`,
processed_at nullable, created_at. Index (provider, event_type).

## credit_transactions  (IMMUTABLE ledger — no UPDATE/DELETE, app-enforced)
id uuid pk, user_id fk -> users.id indexed,
transaction_type varchar(30) indexed:
  `purchase` | `generation_reserve` | `generation_charge` |
  `generation_refund` | `admin_adjust` | `signup_bonus`,
amount integer — signed delta (+ credit, - debit),
balance_before integer, balance_after integer,
reference_id varchar(255) nullable indexed — generation id / payment id,
description text,
created_by_admin_id fk -> users.id nullable — set for admin_adjust,
created_at indexed. Index (user_id, created_at).

## video_generations
id uuid pk, user_id fk -> users.id indexed,
model_id fk -> ai_models.id,
generation_type varchar(20),
prompt text,
input_image_key varchar(512) nullable — storage key of uploaded image,
duration_seconds integer, aspect_ratio varchar(10),
status varchar(20) indexed: `queued` | `processing` | `completed` | `failed` | `refunded`,
credits_reserved integer default 0, credits_charged integer default 0,
error_message text nullable,
provider varchar(50), provider_job_id varchar(255) nullable indexed,
retry_count integer default 0,
storage_key varchar(512) nullable — final video object key,
thumbnail_key varchar(512) nullable,
video_metadata_json text nullable (JSON: width/height/size/duration),
created_at indexed, updated_at, completed_at nullable.
Index (user_id, status), (status, created_at) for worker polling.

## admin_audit_logs  (IMMUTABLE)
id uuid pk, admin_id fk -> users.id,
action varchar(100) indexed (e.g. `credits.adjust`, `user.suspend`, `package.update`),
target_type varchar(50) nullable, target_id varchar(64) nullable,
details_json text (JSON: before/after values, reason),
ip_address varchar(64) nullable, created_at indexed.
Index (admin_id, created_at), (target_type, target_id).

## system_settings
key varchar(100) pk, value_json text (JSON),
updated_by fk -> users.id nullable, updated_at.
Keys: site_name, logo_url, currency, maintenance_mode(bool),
default_credit_cost, max_upload_mb, max_generation_seconds,
registration_enabled(bool).

## notifications
id uuid pk, user_id fk -> users.id indexed,
type varchar(50) indexed: `generation_completed` | `generation_failed` |
  `payment_successful` | `low_credits`,
title varchar(255), message text,
is_read bool default false, created_at indexed.
Index (user_id, is_read, created_at).

## Relationships / FK summary
users.role_id -> roles.id (restrict)
email/password/refresh tokens -> users.id (cascade)
payments.user_id -> users.id (restrict), payments.package_id -> credit_packages.id (restrict)
credit_transactions.user_id -> users.id (restrict), .created_by_admin_id -> users.id (set null)
video_generations.user_id -> users.id (restrict), .model_id -> ai_models.id (restrict)
admin_audit_logs.admin_id -> users.id (restrict)
notifications.user_id -> users.id (cascade)
system_settings.updated_by -> users.id (set null)

## Seed data
- roles: customer, admin, super_admin
- super_admin user from env (ADMIN_EMAIL / ADMIN_PASSWORD), email verified
- 4 credit packages: Starter 100, Creator 500, Pro 1500, Business 5000 (USD, active)
- 3 ai_models: "CineFast T2V" (mock/text_to_video/5,10s/cost 10),
  "CineFast I2V" (mock/image_to_video/5,10s/cost 15),
  "VisionPro T2V" (replicate/text_to_video/5s/cost 25, disabled by default)
- system_settings defaults.
