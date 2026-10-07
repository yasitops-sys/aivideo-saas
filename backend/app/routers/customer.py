"""Customer credit balance + immutable transaction ledger (read-only)."""
import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db
from ..deps import get_current_user
from ..services import credits as credit_service

router = APIRouter(tags=["credits"])


@router.get("/credits")
def get_credits(user: models.User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    return credit_service.get_balance(db, user.id)


@router.get("/credit-transactions")
def list_transactions(page: int = 1, per_page: int = 20, type: str | None = None,
                      user: models.User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    q = db.query(models.CreditTransaction).filter(
        models.CreditTransaction.user_id == user.id)
    if type:
        q = q.filter(models.CreditTransaction.transaction_type == type)
    total = q.count()
    meta = schemas.paginate(page, per_page, total)
    rows = (q.order_by(models.CreditTransaction.created_at.desc())
             .offset((meta["page"] - 1) * meta["per_page"])
             .limit(meta["per_page"]).all())
    items = [{
        "id": t.id, "transaction_type": t.transaction_type, "amount": t.amount,
        "balance_before": t.balance_before, "balance_after": t.balance_after,
        "reference_id": t.reference_id, "description": t.description,
        "created_at": t.created_at,
    } for t in rows]
    return {**meta, "items": items}


packages_router = APIRouter(tags=["packages"])


@packages_router.get("/packages")
def list_packages(db: Session = Depends(get_db)):
    rows = (db.query(models.CreditPackage)
              .filter(models.CreditPackage.is_active.is_(True))
              .order_by(models.CreditPackage.sort_order).all())
    return [{"id": p.id, "name": p.name, "credits": p.credits,
             "price_cents": p.price_cents, "currency": p.currency} for p in rows]


models_router = APIRouter(tags=["models"])


@models_router.get("/models")
def list_models(db: Session = Depends(get_db)):
    rows = (db.query(models.AIModel)
              .filter(models.AIModel.is_enabled.is_(True)).all())
    out = []
    for m in rows:
        out.append({
            "id": m.id, "name": m.name, "provider": m.provider,
            "generation_type": m.generation_type, "credit_cost": m.credit_cost,
            "durations": json.loads(m.durations_json),
            "aspect_ratios": json.loads(m.aspect_ratios_json),
        })
    return out


notifications_router = APIRouter(prefix="/notifications", tags=["notifications"])


@notifications_router.get("")
def list_notifications(unread_only: bool = False, page: int = 1, per_page: int = 20,
                       user: models.User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    q = db.query(models.Notification).filter(models.Notification.user_id == user.id)
    if unread_only:
        q = q.filter(models.Notification.is_read.is_(False))
    total = q.count()
    meta = schemas.paginate(page, per_page, total)
    rows = (q.order_by(models.Notification.created_at.desc())
             .offset((meta["page"] - 1) * meta["per_page"])
             .limit(meta["per_page"]).all())
    items = [{"id": n.id, "type": n.type, "title": n.title, "message": n.message,
              "is_read": n.is_read, "created_at": n.created_at} for n in rows]
    return {**meta, "items": items, "unread_count": q.filter(
        models.Notification.is_read.is_(False)).count() if not unread_only else total}


@notifications_router.post("/read")
def mark_read(body: schemas.MarkReadIn,
              user: models.User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    db.query(models.Notification).filter(
        models.Notification.user_id == user.id,
        models.Notification.id.in_(body.ids)).update(
        {"is_read": True}, synchronize_session=False)
    db.commit()
    return {"ok": True}
