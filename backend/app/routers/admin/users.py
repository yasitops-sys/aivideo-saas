"""Admin user management: search, detail, suspend/reactivate, reset password,
soft-delete. All mutations are audit-logged."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ... import models, schemas
from ...db import get_db, utcnow
from ...deps import get_client_ip, require_admin
from ...errors import not_found, validation
from ...security import hash_password, hash_token, new_opaque_token
from ...services.audit import audit
from ...services.storage import get_storage

router = APIRouter(prefix="/admin/users", tags=["admin"])


def _out(u: models.User) -> dict:
    return {"id": u.id, "email": u.email, "full_name": u.full_name,
            "role": u.role.name, "is_active": u.is_active,
            "email_verified": u.email_verified,
            "credit_balance": u.credit_balance,
            "total_credits_purchased": u.total_credits_purchased,
            "total_credits_used": u.total_credits_used,
            "created_at": u.created_at}


@router.get("")
def list_users(page: int = 1, per_page: int = 20, search: str | None = None,
               role: str | None = None, is_active: bool | None = None,
               admin: models.User = Depends(require_admin),
               db: Session = Depends(get_db)):
    q = db.query(models.User).filter(models.User.deleted_at.is_(None))
    if search:
        like = f"%{search.strip().lower()}%"
        q = q.filter(models.User.email.like(like) |
                     models.User.full_name.like(like))
    if role:
        q = q.join(models.Role).filter(models.Role.name == role)
    if is_active is not None:
        q = q.filter(models.User.is_active.is_(is_active))
    total = q.count()
    meta = schemas.paginate(page, per_page, total)
    rows = (q.order_by(models.User.created_at.desc())
             .offset((meta["page"] - 1) * meta["per_page"])
             .limit(meta["per_page"]).all())
    return {**meta, "items": [_out(u) for u in rows]}


@router.get("/{user_id}")
def user_detail(user_id: str,
                admin: models.User = Depends(require_admin),
                db: Session = Depends(get_db)):
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u or u.deleted_at:
        raise not_found("User not found.")
    gens = (db.query(models.VideoGeneration)
              .filter(models.VideoGeneration.user_id == u.id)
              .order_by(models.VideoGeneration.created_at.desc()).limit(10).all())
    pays = (db.query(models.Payment)
              .filter(models.Payment.user_id == u.id)
              .order_by(models.Payment.created_at.desc()).limit(10).all())
    gen_count = db.query(models.VideoGeneration).filter(
        models.VideoGeneration.user_id == u.id).count()
    pay_count = db.query(models.Payment).filter(
        models.Payment.user_id == u.id).count()
    storage = get_storage()
    return {
        "id": u.id, "email": u.email, "full_name": u.full_name,
        "role": u.role.name, "is_active": u.is_active,
        "email_verified": u.email_verified,
        "credit_balance": u.credit_balance,
        "totals": {
            "purchased": u.total_credits_purchased,
            "used": u.total_credits_used,
            "generations": gen_count,
            "payments": pay_count,
        },
        "recent_generations": [{
            "id": g.id, "prompt": g.prompt,
            "generation_type": g.generation_type,
            "model": {"id": g.model.id, "name": g.model.name},
            "duration_seconds": g.duration_seconds,
            "aspect_ratio": g.aspect_ratio, "status": g.status,
            "credits_reserved": g.credits_reserved,
            "credits_charged": g.credits_charged,
            "video_url": storage.get_signed_url(g.storage_key) if g.storage_key else None,
            "thumbnail_url": storage.get_signed_url(g.thumbnail_key) if g.thumbnail_key else None,
            "error_message": g.error_message,
            "created_at": g.created_at, "completed_at": g.completed_at,
        } for g in gens],
        "recent_payments": [{
            "id": p.id,
            "package": {"name": p.package.name, "credits": p.package.credits},
            "amount_cents": p.amount_cents, "currency": p.currency,
            "status": p.status,
            "created_at": p.created_at, "completed_at": p.completed_at,
        } for p in pays],
        "created_at": u.created_at,
    }


@router.patch("/{user_id}")
def set_active(user_id: str, body: schemas.UserSuspendIn, request: Request,
               admin: models.User = Depends(require_admin),
               db: Session = Depends(get_db)):
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u or u.deleted_at:
        raise not_found("User not found.")
    if u.id == admin.id:
        raise validation("You cannot suspend your own account.")
    if u.role.name == "super_admin" and admin.role.name != "super_admin":
        raise validation("Only a super-admin can suspend another super-admin.")
    before = u.is_active
    u.is_active = body.is_active
    db.flush()
    audit(db, admin_id=admin.id,
          action="user.reactivate" if body.is_active else "user.suspend",
          target_type="user", target_id=u.id,
          details={"before": before, "after": body.is_active},
          ip=get_client_ip(request))
    db.commit()
    return {"user": _out(u)}


@router.post("/{user_id}/reset-password")
def admin_reset_password(user_id: str, request: Request,
                         admin: models.User = Depends(require_admin),
                         db: Session = Depends(get_db)):
    """Secure process: generates a single-use token, returned ONCE to the admin
    to share with the user over a secure channel. Token is stored hashed."""
    from datetime import timedelta
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u or u.deleted_at:
        raise not_found("User not found.")
    token = new_opaque_token()
    db.add(models.PasswordResetToken(
        user_id=u.id, token_hash=hash_token(token),
        expires_at=utcnow() + timedelta(hours=1)))
    db.flush()
    audit(db, admin_id=admin.id, action="user.password_reset",
          target_type="user", target_id=u.id,
          details={"email": u.email}, ip=get_client_ip(request))
    db.commit()
    # Shown once — the admin must deliver it securely; it is never stored raw.
    return {"reset_token": token, "expires_in": "1 hour",
            "reset_url": f"/reset-password/{token}"}


@router.delete("/{user_id}")
def delete_user(user_id: str, request: Request,
                admin: models.User = Depends(require_admin),
                db: Session = Depends(get_db)):
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u or u.deleted_at:
        raise not_found("User not found.")
    if u.id == admin.id:
        raise validation("You cannot delete your own account.")
    if u.role.name in ("admin", "super_admin"):
        raise validation("Admin accounts cannot be deleted here. Demote first.")
    u.deleted_at = utcnow()
    u.is_active = False
    u.email = f"deleted_{u.id}@deleted.local"
    db.flush()
    audit(db, admin_id=admin.id, action="user.delete",
          target_type="user", target_id=u.id, details={},
          ip=get_client_ip(request))
    db.commit()
    return {"ok": True}
