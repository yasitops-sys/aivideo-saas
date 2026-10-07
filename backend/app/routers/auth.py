"""Authentication: register / verify / login / logout / refresh / password flows."""
from datetime import timedelta

from fastapi import APIRouter, Cookie, Depends, Request, Response
from ..rate_limit import limiter
from sqlalchemy.orm import Session

from .. import models, schemas
from ..cookies import clear_auth_cookies, set_auth_cookies
from ..db import get_db, utcnow
from ..deps import get_client_ip, get_current_user
from ..errors import not_found, unauthenticated, validation
from ..security import (
    create_access_token,
    hash_password,
    hash_token,
    new_opaque_token,
    verify_password,
)
from ..services import credits as credit_service
from ..services.email import send_password_reset_email, send_verification_email
from ..services.settings import get_setting

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(user: models.User) -> dict:
    return {
        "id": user.id, "email": user.email, "full_name": user.full_name,
        "role": user.role.name, "email_verified": user.email_verified,
        "credit_balance": user.credit_balance, "is_active": user.is_active,
        "created_at": user.created_at,
    }


def _issue_session(db: Session, user: models.User, request: Request,
                   resp: Response) -> dict:
    """Create refresh token row (hashed), set cookies. Returns csrf token."""
    raw_refresh = new_opaque_token()
    db.add(models.RefreshToken(
        user_id=user.id,
        token_hash=hash_token(raw_refresh),
        expires_at=utcnow() + timedelta(days=30),
        ip_address=get_client_ip(request),
        user_agent=(request.headers.get("user-agent") or "")[:512],
    ))
    db.commit()
    access = create_access_token(user.id, user.role.name)
    csrf = set_auth_cookies(resp, access, raw_refresh)
    return {"user": _user_out(user), "csrf_token": csrf}


# --- registration -----------------------------------------------------------
@router.post("/register", status_code=201)
@limiter.limit("10/hour")
def register(body: schemas.RegisterIn, request: Request, response: Response,
             db: Session = Depends(get_db)):
    if not get_setting(db, "registration_enabled"):
        raise validation("Registration is currently disabled.")
    exists = db.query(models.User).filter(models.User.email == body.email).first()
    if exists:
        # Don't enumerate: pretend success but do nothing.
        return {"ok": True}
    role = db.query(models.Role).filter(models.Role.name == "customer").first()
    user = models.User(email=body.email, password_hash=hash_password(body.password),
                       full_name=body.full_name.strip(), role_id=role.id)
    db.add(user)
    db.flush()

    bonus = int(get_setting(db, "signup_bonus_credits") or 0)
    if bonus > 0:
        credit_service.grant_signup_bonus(db, user_id=user.id, credits=bonus)

    token = new_opaque_token()
    db.add(models.EmailVerificationToken(
        user_id=user.id, token_hash=hash_token(token),
        expires_at=utcnow() + timedelta(hours=24)))
    db.commit()
    try:
        send_verification_email(user.email, token)
    except Exception:
        pass  # never fail registration on email errors
    return {"ok": True, "user": _user_out(user)}


@router.post("/verify-email")
@limiter.limit("20/hour")
def verify_email(body: schemas.TokenVerifyIn, request: Request,
                 db: Session = Depends(get_db)):
    row = db.query(models.EmailVerificationToken).filter(
        models.EmailVerificationToken.token_hash == hash_token(body.token)).first()
    if not row or row.used_at or row.expires_at < utcnow():
        raise validation("Invalid or expired verification link.")
    user = db.query(models.User).filter(models.User.id == row.user_id).first()
    row.used_at = utcnow()
    if user:
        user.email_verified = True
    db.commit()
    return {"ok": True}


# --- login / logout / refresh ------------------------------------------------
@router.post("/login")
@limiter.limit("15/minute")
def login(body: schemas.LoginIn, request: Request, response: Response,
          db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == body.email).first()
    if not user or user.deleted_at or not verify_password(body.password, user.password_hash):
        raise unauthenticated("Invalid email or password.")
    if not user.is_active:
        raise unauthenticated("This account has been suspended.")
    return _issue_session(db, user, request, response)


@router.post("/logout")
def logout(request: Request, response: Response,
           db: Session = Depends(get_db),
           refresh_token: str | None = Cookie(default=None)):
    if refresh_token:
        row = db.query(models.RefreshToken).filter(
            models.RefreshToken.token_hash == hash_token(refresh_token)).first()
        if row:
            row.revoked_at = utcnow()
            db.commit()
    clear_auth_cookies(response)
    return {"ok": True}


@router.post("/refresh")
@limiter.limit("30/minute")
def refresh(request: Request, response: Response,
            db: Session = Depends(get_db),
            refresh_token: str | None = Cookie(default=None)):
    if not refresh_token:
        raise unauthenticated()
    row = db.query(models.RefreshToken).filter(
        models.RefreshToken.token_hash == hash_token(refresh_token)).first()
    if not row or row.revoked_at or row.expires_at < utcnow():
        raise unauthenticated("Session expired. Please log in again.")
    user = db.query(models.User).filter(
        models.User.id == row.user_id, models.User.deleted_at.is_(None)).first()
    if not user or not user.is_active:
        raise unauthenticated()
    # Rotate: revoke old, issue new.
    row.revoked_at = utcnow()
    db.commit()
    return _issue_session(db, user, request, response)


# --- profile ------------------------------------------------------------------
@router.get("/me")
def me(user: models.User = Depends(get_current_user)):
    return {"user": _user_out(user)}


@router.patch("/me")
def update_me(body: schemas.UpdateProfileIn,
              user: models.User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    user.full_name = body.full_name.strip()
    db.commit()
    return {"user": _user_out(user)}


@router.post("/change-password")
@limiter.limit("10/hour")
def change_password(body: schemas.ChangePasswordIn, request: Request,
                    user: models.User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise validation("Current password is incorrect.")
    user.password_hash = hash_password(body.new_password)
    # Revoke all other sessions.
    db.query(models.RefreshToken).filter(
        models.RefreshToken.user_id == user.id,
        models.RefreshToken.revoked_at.is_(None)).update({"revoked_at": utcnow()})
    db.commit()
    return {"ok": True}


@router.delete("/me")
def delete_account(body: schemas.DeleteAccountIn,
                   response: Response,
                   user: models.User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    if not verify_password(body.password, user.password_hash):
        raise validation("Password is incorrect.")
    user.deleted_at = utcnow()
    user.is_active = False
    user.email = f"deleted_{user.id}@deleted.local"  # free the email, keep ledger FKs
    db.query(models.RefreshToken).filter(
        models.RefreshToken.user_id == user.id).update({"revoked_at": utcnow()})
    db.commit()
    clear_auth_cookies(response)
    return {"ok": True}


# --- forgot / reset ------------------------------------------------------------
@router.post("/forgot-password")
@limiter.limit("5/hour")
def forgot_password(body: schemas.ForgotPasswordIn, request: Request,
                    db: Session = Depends(get_db)):
    # Always return ok — never reveal whether the email exists.
    user = db.query(models.User).filter(
        models.User.email == body.email.lower().strip(),
        models.User.deleted_at.is_(None)).first()
    if user and user.is_active:
        token = new_opaque_token()
        db.add(models.PasswordResetToken(
            user_id=user.id, token_hash=hash_token(token),
            expires_at=utcnow() + timedelta(hours=1)))
        db.commit()
        try:
            send_password_reset_email(user.email, token)
        except Exception:
            pass
    return {"ok": True}


@router.post("/reset-password")
@limiter.limit("10/hour")
def reset_password(body: schemas.ResetPasswordIn, request: Request,
                   db: Session = Depends(get_db)):
    row = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.token_hash == hash_token(body.token)).first()
    if not row or row.used_at or row.expires_at < utcnow():
        raise validation("Invalid or expired reset link.")
    user = db.query(models.User).filter(
        models.User.id == row.user_id, models.User.deleted_at.is_(None)).first()
    if not user:
        raise not_found("Account not found.")
    row.used_at = utcnow()
    user.password_hash = hash_password(body.new_password)
    db.query(models.RefreshToken).filter(
        models.RefreshToken.user_id == user.id,
        models.RefreshToken.revoked_at.is_(None)).update({"revoked_at": utcnow()})
    db.commit()
    return {"ok": True}
