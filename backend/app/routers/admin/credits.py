"""Admin credit management: manual adjustments (always with reason + audit log)
and read access to the immutable ledger."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ... import models, schemas
from ...db import get_db
from ...deps import get_client_ip, require_admin
from ...errors import not_found
from ...services import credits as credit_service
from ...services.audit import audit
from ...services.notifications import NotificationService

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/credits/adjust")
def adjust_credits(body: schemas.CreditAdjustIn, request: Request,
                   admin: models.User = Depends(require_admin),
                   db: Session = Depends(get_db)):
    target = db.query(models.User).filter(models.User.id == body.user_id).first()
    if not target or target.deleted_at:
        raise not_found("User not found.")
    tx = credit_service.admin_adjust(
        db, user_id=target.id, amount=body.amount,
        reason=body.reason, admin_id=admin.id)
    audit(db, admin_id=admin.id, action="credits.adjust",
          target_type="user", target_id=target.id,
          details={"amount": body.amount, "reason": body.reason,
                   "balance_before": tx.balance_before,
                   "balance_after": tx.balance_after},
          ip=get_client_ip(request))
    db.commit()
    NotificationService(db).notify(
        target.id, "admin_credit_adjustment",
        "Your credit balance was adjusted",
        f"An administrator {'added' if body.amount > 0 else 'removed'} "
        f"{abs(body.amount)} credits. Reason: {body.reason}")
    db.commit()
    return {"ok": True, "balance": tx.balance_after,
            "transaction_id": tx.id}


@router.get("/credit-transactions")
def list_transactions(page: int = 1, per_page: int = 20,
                      user_id: str | None = None, type: str | None = None,
                      admin: models.User = Depends(require_admin),
                      db: Session = Depends(get_db)):
    q = db.query(models.CreditTransaction)
    if user_id:
        q = q.filter(models.CreditTransaction.user_id == user_id)
    if type:
        q = q.filter(models.CreditTransaction.transaction_type == type)
    total = q.count()
    meta = schemas.paginate(page, per_page, total)
    rows = (q.order_by(models.CreditTransaction.created_at.desc())
             .offset((meta["page"] - 1) * meta["per_page"])
             .limit(meta["per_page"]).all())
    user_ids = {t.user_id for t in rows}
    emails = {u.id: u.email for u in
              db.query(models.User).filter(models.User.id.in_(user_ids)).all()} \
        if user_ids else {}
    items = [{
        "id": t.id, "user_id": t.user_id, "user_email": emails.get(t.user_id),
        "transaction_type": t.transaction_type, "amount": t.amount,
        "balance_before": t.balance_before, "balance_after": t.balance_after,
        "reference_id": t.reference_id, "description": t.description,
        "created_at": t.created_at,
    } for t in rows]
    return {**meta, "items": items}
