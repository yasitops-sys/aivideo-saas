"""Admin: audit log viewer + system settings + admin account management."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ... import models, schemas
from ...db import get_db, utcnow
from ...deps import get_client_ip, require_admin, require_super_admin
from ...errors import not_found, validation
from ...security import hash_password
from ...services.audit import audit
from ...services.settings import (
    SENSITIVE_KEYS,
    get_all_settings,
    get_all_settings_list,
    set_setting,
)

router = APIRouter(prefix="/admin", tags=["admin"])


# --- audit logs -----------------------------------------------------------------
@router.get("/audit-logs")
def list_audit_logs(page: int = 1, per_page: int = 20,
                    action: str | None = None, admin_id: str | None = None,
                    admin: models.User = Depends(require_admin),
                    db: Session = Depends(get_db)):
    q = db.query(models.AdminAuditLog)
    if action:
        q = q.filter(models.AdminAuditLog.action == action)
    if admin_id:
        q = q.filter(models.AdminAuditLog.admin_id == admin_id)
    total = q.count()
    meta = schemas.paginate(page, per_page, total)
    rows = (q.order_by(models.AdminAuditLog.created_at.desc())
             .offset((meta["page"] - 1) * meta["per_page"])
             .limit(meta["per_page"]).all())
    items = [{
        "id": r.id, "admin_email": r.admin.email if r.admin else None,
        "action": r.action, "target_type": r.target_type,
        "target_id": r.target_id, "details": r.details_json,
        "ip_address": r.ip_address, "created_at": r.created_at,
    } for r in rows]
    return {**meta, "items": items}


# --- settings --------------------------------------------------------------------
@router.get("/settings")
def get_settings(admin: models.User = Depends(require_admin),
                 db: Session = Depends(get_db)):
    # Array of {key, value, updated_at} — matches the admin UI's Setting type.
    return get_all_settings_list(db)


@router.put("/settings")
def update_setting(body: schemas.SettingUpdateIn, request: Request,
                   admin: models.User = Depends(require_admin),
                   db: Session = Depends(get_db)):
    # Sensitive keys (provider secrets) are super-admin only.
    if body.key in SENSITIVE_KEYS and admin.role.name != "super_admin":
        from ...errors import forbidden
        raise forbidden("Only a super-admin can change this setting.")
    old = get_all_settings(db).get(body.key, None)
    set_setting(db, body.key, body.value, updated_by=admin.id)
    audit(db, admin_id=admin.id, action="settings.update",
          target_type="setting", target_id=body.key,
          details={"before": "********" if body.key in SENSITIVE_KEYS else old,
                   "after": "********" if body.key in SENSITIVE_KEYS else body.value},
          ip=get_client_ip(request))
    db.commit()
    return {"ok": True}


# --- admin accounts (super-admin only) --------------------------------------------
admins_router = APIRouter(prefix="/admin/admins", tags=["admin"])


@admins_router.get("")
def list_admins(admin: models.User = Depends(require_super_admin),
                db: Session = Depends(get_db)):
    rows = (db.query(models.User).join(models.Role)
              .filter(models.Role.name.in_(["admin", "super_admin"]),
                      models.User.deleted_at.is_(None))
              .order_by(models.User.created_at).all())
    return [{"id": u.id, "email": u.email, "full_name": u.full_name,
             "role": u.role.name, "is_active": u.is_active,
             "created_at": u.created_at} for u in rows]


@admins_router.post("", status_code=201)
def create_admin(body: schemas.CreateAdminIn, request: Request,
                 admin: models.User = Depends(require_super_admin),
                 db: Session = Depends(get_db)):
    exists = db.query(models.User).filter(
        models.User.email == body.email.lower().strip()).first()
    if exists:
        raise validation("An account with this email already exists.")
    role = db.query(models.Role).filter(models.Role.name == body.role).first()
    u = models.User(email=body.email.lower().strip(),
                    password_hash=hash_password(body.password),
                    full_name=body.full_name.strip(), role_id=role.id,
                    email_verified=True)
    db.add(u)
    db.flush()
    audit(db, admin_id=admin.id, action="admin.create",
          target_type="user", target_id=u.id,
          details={"email": u.email, "role": body.role},
          ip=get_client_ip(request))
    db.commit()
    return {"id": u.id}


@admins_router.delete("/{user_id}")
def demote_admin(user_id: str, request: Request,
                 admin: models.User = Depends(require_super_admin),
                 db: Session = Depends(get_db)):
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u or u.deleted_at or u.role.name not in ("admin", "super_admin"):
        raise not_found("Admin not found.")
    if u.id == admin.id:
        raise validation("You cannot demote yourself.")
    if u.role.name == "super_admin":
        remaining = (db.query(models.User).join(models.Role)
                       .filter(models.Role.name == "super_admin",
                               models.User.id != u.id,
                               models.User.deleted_at.is_(None)).count())
        if remaining == 0:
            raise validation("Cannot demote the last super-admin.")
    customer_role = db.query(models.Role).filter(models.Role.name == "customer").first()
    u.role_id = customer_role.id
    db.flush()
    audit(db, admin_id=admin.id, action="admin.demote",
          target_type="user", target_id=u.id, details={"email": u.email},
          ip=get_client_ip(request))
    db.commit()
    return {"ok": True}
