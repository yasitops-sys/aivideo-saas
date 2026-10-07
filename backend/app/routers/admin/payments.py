"""Admin: payments, generations, packages, models, audit logs, settings."""
import json

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ... import models, schemas
from ...db import get_db
from ...deps import get_client_ip, require_admin, require_super_admin
from ...errors import not_found, validation
from ...services.audit import audit
from ...services.settings import SENSITIVE_KEYS, get_all_settings, set_setting
from ...services.storage import get_storage

router = APIRouter(prefix="/admin", tags=["admin"])


# --- payments ---------------------------------------------------------------
@router.get("/payments")
def list_payments(page: int = 1, per_page: int = 20, status: str | None = None,
                  search: str | None = None,
                  admin: models.User = Depends(require_admin),
                  db: Session = Depends(get_db)):
    q = db.query(models.Payment)
    if status:
        q = q.filter(models.Payment.status == status)
    if search:
        like = f"%{search.lower()}%"
        q = q.join(models.User).filter(models.User.email.like(like))
    total = q.count()
    meta = schemas.paginate(page, per_page, total)
    rows = (q.order_by(models.Payment.created_at.desc())
             .offset((meta["page"] - 1) * meta["per_page"])
             .limit(meta["per_page"]).all())
    items = [{
        "id": p.id, "user_id": p.user_id, "user_email": p.user.email,
        "package": p.package.name, "credits": p.package.credits,
        "amount_cents": p.amount_cents, "currency": p.currency,
        "status": p.status, "provider": p.provider,
        "created_at": p.created_at, "completed_at": p.completed_at,
    } for p in rows]
    return {**meta, "items": items}
