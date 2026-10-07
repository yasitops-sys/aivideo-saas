"""SQLAlchemy models — see ../../SCHEMA.md. Money in minor units, credits as ints."""
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, utcnow


def _uuid() -> str:
    return uuid.uuid4().hex


class Role(Base):
    __tablename__ = "roles"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    credit_balance: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_credits_purchased: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_credits_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)
    deleted_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    role: Mapped[Role] = relationship(lazy="joined")

    __table_args__ = (CheckConstraint("credit_balance >= 0", name="ck_users_balance_nonneg"),)


class EmailVerificationToken(Base):
    __tablename__ = "email_verification_tokens"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


class CreditPackage(Base):
    __tablename__ = "credit_packages"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    credits: Mapped[int] = mapped_column(Integer, nullable=False)
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    __table_args__ = (
        CheckConstraint("credits > 0", name="ck_pkg_credits_pos"),
        CheckConstraint("price_cents >= 0", name="ck_pkg_price_nonneg"),
        Index("ix_pkg_active_sort", "is_active", "sort_order"),
    )


class AIModel(Base):
    __tablename__ = "ai_models"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    model_id: Mapped[str] = mapped_column(String(255), nullable=False)
    generation_type: Mapped[str] = mapped_column(String(20), nullable=False)  # text_to_video|image_to_video
    credit_cost: Mapped[int] = mapped_column(Integer, nullable=False)
    durations_json: Mapped[str] = mapped_column(Text, nullable=False, default="[5]")
    aspect_ratios_json: Mapped[str] = mapped_column(Text, nullable=False, default='["16:9"]')
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    __table_args__ = (CheckConstraint("credit_cost > 0", name="ck_model_cost_pos"),)


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    payment_id: Mapped[str | None] = mapped_column(String(255), unique=True)  # provider payment id
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    package_id: Mapped[str] = mapped_column(ForeignKey("credit_packages.id"), nullable=False)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False, default="stripe")
    provider_session_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    idempotency_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    credits_granted: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    user: Mapped[User] = relationship(lazy="joined")
    package: Mapped[CreditPackage] = relationship(lazy="joined")

    __table_args__ = (Index("ix_payments_user_created", "user_id", "created_at"),)


class PaymentWebhook(Base):
    __tablename__ = "payment_webhooks"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    event_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    signature_valid: Mapped[bool] = mapped_column(Boolean, nullable=False)
    processing_status: Mapped[str] = mapped_column(String(20), nullable=False)  # processed|duplicate|failed
    processed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    __table_args__ = (Index("ix_webhook_provider_type", "provider", "event_type"),)


class CreditTransaction(Base):
    """IMMUTABLE ledger. Application code must never UPDATE or DELETE rows."""
    __tablename__ = "credit_transactions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    transaction_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # signed delta
    balance_before: Mapped[int] = mapped_column(Integer, nullable=False)
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)
    reference_id: Mapped[str | None] = mapped_column(String(255), index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_by_admin_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False, index=True)

    __table_args__ = (Index("ix_ctx_user_created", "user_id", "created_at"),)


class VideoGeneration(Base):
    __tablename__ = "video_generations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    model_id: Mapped[str] = mapped_column(ForeignKey("ai_models.id"), nullable=False)
    generation_type: Mapped[str] = mapped_column(String(20), nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    input_image_key: Mapped[str | None] = mapped_column(String(512))
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    aspect_ratio: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued", index=True)
    credits_reserved: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    credits_charged: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    provider_job_id: Mapped[str | None] = mapped_column(String(255), index=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    storage_key: Mapped[str | None] = mapped_column(String(512))
    thumbnail_key: Mapped[str | None] = mapped_column(String(512))
    video_metadata_json: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    user: Mapped[User] = relationship(lazy="joined")
    model: Mapped[AIModel] = relationship(lazy="joined")

    __table_args__ = (
        Index("ix_gen_user_status", "user_id", "status"),
        Index("ix_gen_status_created", "status", "created_at"),
    )


class AdminAuditLog(Base):
    """IMMUTABLE. Every admin mutation writes a row here."""
    __tablename__ = "admin_audit_logs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    admin_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    target_type: Mapped[str | None] = mapped_column(String(50), index=True)
    target_id: Mapped[str | None] = mapped_column(String(64), index=True)
    details_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    ip_address: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False, index=True)

    admin: Mapped[User] = relationship(lazy="joined")


class SystemSetting(Base):
    __tablename__ = "system_settings"
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value_json: Mapped[str] = mapped_column(Text, nullable=False)
    updated_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False, index=True)

    __table_args__ = (Index("ix_notif_user_read", "user_id", "is_read", "created_at"),)


# Transaction types (constants, not an enum table)
TX_PURCHASE = "purchase"
TX_GENERATION_RESERVE = "generation_reserve"
TX_GENERATION_CHARGE = "generation_charge"
TX_GENERATION_REFUND = "generation_refund"
TX_ADMIN_ADJUST = "admin_adjust"
TX_SIGNUP_BONUS = "signup_bonus"

# Generation statuses
GEN_QUEUED = "queued"
GEN_PROCESSING = "processing"
GEN_COMPLETED = "completed"
GEN_FAILED = "failed"
GEN_REFUNDED = "refunded"
