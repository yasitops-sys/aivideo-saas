"""Pydantic request/response schemas. Validation lives here, not in routers."""
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


# --- generic ---------------------------------------------------------------
class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


class Paginated(BaseModel):
    page: int
    per_page: int
    total: int
    pages: int


def paginate(page: int, per_page: int, total: int) -> dict:
    per_page = max(1, min(per_page, 100))
    pages = max(1, -(-total // per_page))
    page = max(1, min(page, pages))
    return {"page": page, "per_page": per_page, "total": total, "pages": pages}


# --- auth ------------------------------------------------------------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)

    @field_validator("email")
    @classmethod
    def lower_email(cls, v: str) -> str:
        return v.strip().lower()


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def lower_email(cls, v: str) -> str:
        return v.strip().lower()


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    email_verified: bool
    credit_balance: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenVerifyIn(BaseModel):
    token: str = Field(min_length=10, max_length=128)


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=10, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class UpdateProfileIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)


class DeleteAccountIn(BaseModel):
    password: str


# --- generations -----------------------------------------------------------
class GenerationOut(BaseModel):
    id: str
    prompt: str
    generation_type: str
    model: dict
    duration_seconds: int
    aspect_ratio: str
    status: str
    credits_reserved: int
    credits_charged: int
    video_url: str | None = None
    thumbnail_url: str | None = None
    input_image_url: str | None = None
    error_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None


# --- credits / packages / payments -----------------------------------------
class PackageOut(BaseModel):
    id: str
    name: str
    credits: int
    price_cents: int
    currency: str


class PackageAdminOut(PackageOut):
    is_active: bool
    sort_order: int
    created_at: datetime


class PackageUpsertIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    credits: int = Field(gt=0, le=1_000_000)
    price_cents: int = Field(ge=0, le=100_000_000)
    currency: str = Field(min_length=3, max_length=3, default="USD")
    is_active: bool = True
    sort_order: int = 0


class ModelOut(BaseModel):
    id: str
    name: str
    provider: str
    generation_type: str
    credit_cost: int
    durations: list[int]
    aspect_ratios: list[str]


class ModelAdminOut(ModelOut):
    model_id: str
    is_enabled: bool
    created_at: datetime


class ModelUpsertIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    provider: str = Field(min_length=1, max_length=50)
    model_id: str = Field(min_length=1, max_length=255)
    generation_type: str = Field(pattern="^(text_to_video|image_to_video)$")
    credit_cost: int = Field(gt=0, le=100_000)
    durations: list[int] = Field(min_length=1, max_length=10)
    aspect_ratios: list[str] = Field(min_length=1, max_length=10)
    is_enabled: bool = True

    @field_validator("durations")
    @classmethod
    def sane_durations(cls, v: list[int]) -> list[int]:
        for d in v:
            if d < 1 or d > 600:
                raise ValueError("duration out of range")
        return v


class CheckoutIn(BaseModel):
    package_id: str


class CreditAdjustIn(BaseModel):
    user_id: str
    amount: int = Field(ge=-1_000_000, le=1_000_000)  # signed: +add / -remove
    reason: str = Field(min_length=5, max_length=500)

    @field_validator("amount")
    @classmethod
    def nonzero(cls, v: int) -> int:
        if v == 0:
            raise ValueError("Amount cannot be zero.")
        return v


class TransactionOut(BaseModel):
    id: str
    transaction_type: str
    amount: int
    balance_before: int
    balance_after: int
    reference_id: str | None
    description: str
    created_at: datetime


# --- admin -----------------------------------------------------------------
class UserAdminOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    email_verified: bool
    credit_balance: int
    total_credits_purchased: int
    total_credits_used: int
    created_at: datetime


class UserSuspendIn(BaseModel):
    is_active: bool


class CreateAdminIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)
    role: str = Field(pattern="^(admin|super_admin)$")


class SettingUpdateIn(BaseModel):
    key: str = Field(min_length=1, max_length=100)
    value: str = Field(max_length=10000)  # JSON-encoded string


class AuditLogOut(BaseModel):
    id: str
    admin_email: str | None
    action: str
    target_type: str | None
    target_id: str | None
    details: str
    ip_address: str | None
    created_at: datetime


class NotificationOut(BaseModel):
    id: str
    type: str
    title: str
    message: str
    is_read: bool
    created_at: datetime


class MarkReadIn(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=100)
