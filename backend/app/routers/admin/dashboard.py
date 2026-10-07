"""Admin dashboard: KPIs, recent activity, charts."""
from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ... import models
from ...db import get_db, utcnow
from ...deps import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/dashboard")
def dashboard(admin: models.User = Depends(require_admin),
              db: Session = Depends(get_db)):
    now = utcnow()
    users_q = db.query(models.User).filter(models.User.deleted_at.is_(None))
    total_users = users_q.count()
    active_users = users_q.filter(models.User.is_active.is_(True)).count()

    completed = db.query(models.Payment).filter(models.Payment.status == "completed")
    total_payments = completed.count()
    revenue_cents = completed.with_entities(
        func.coalesce(func.sum(models.Payment.amount_cents), 0)).scalar() or 0

    credits_sold = db.query(models.CreditTransaction).filter(
        models.CreditTransaction.transaction_type == models.TX_PURCHASE
    ).with_entities(func.coalesce(func.sum(models.CreditTransaction.amount), 0)).scalar() or 0
    # Net consumed = reserved (negative) + refunds (positive), negated.
    consumed_sum = db.query(models.CreditTransaction).filter(
        models.CreditTransaction.transaction_type.in_(
            [models.TX_GENERATION_RESERVE, models.TX_GENERATION_REFUND])
    ).with_entities(func.coalesce(func.sum(models.CreditTransaction.amount), 0)).scalar() or 0
    credits_consumed = -int(consumed_sum)

    videos_generated = db.query(models.VideoGeneration).filter(
        models.VideoGeneration.status == models.GEN_COMPLETED).count()
    failed = db.query(models.VideoGeneration).filter(
        models.VideoGeneration.status.in_([models.GEN_FAILED, models.GEN_REFUNDED])).count()

    recent_users = (users_q.order_by(models.User.created_at.desc()).limit(5).all())
    recent_payments = (db.query(models.Payment)
                        .order_by(models.Payment.created_at.desc()).limit(5).all())
    recent_gens = (db.query(models.VideoGeneration)
                     .order_by(models.VideoGeneration.created_at.desc()).limit(5).all())

    # Charts: last 30 days.
    day = func.date(models.User.created_at)
    signups = (db.query(day.label("d"), func.count().label("c"))
                 .filter(models.User.created_at >= now - timedelta(days=30))
                 .group_by(day).all())
    rday = func.date(models.Payment.completed_at)
    revenue = (db.query(rday.label("d"), func.sum(models.Payment.amount_cents).label("c"))
                 .filter(models.Payment.status == "completed",
                         models.Payment.completed_at >= now - timedelta(days=30))
                 .group_by(rday).all())
    by_status = (db.query(models.VideoGeneration.status, func.count())
                   .group_by(models.VideoGeneration.status).all())

    return {
        "totals": {
            "users": total_users, "active_users": active_users,
            "payments": total_payments, "revenue_cents": int(revenue_cents),
            "credits_sold": int(credits_sold),
            "credits_consumed": int(credits_consumed),
            "videos_generated": videos_generated,
            "failed_generations": failed,
        },
        "recent_users": [{"id": u.id, "email": u.email, "full_name": u.full_name,
                          "created_at": u.created_at} for u in recent_users],
        "recent_payments": [{"id": p.id, "user_email": p.user.email,
                             "amount_cents": p.amount_cents, "currency": p.currency,
                             "status": p.status, "created_at": p.created_at}
                            for p in recent_payments],
        "recent_generations": [{"id": g.id, "user_email": g.user.email,
                                "status": g.status, "prompt": g.prompt[:80],
                                "created_at": g.created_at} for g in recent_gens],
        "charts": {
            "signups_by_day": [{"date": str(d), "count": c} for d, c in signups],
            "revenue_by_day": [{"date": str(d), "cents": int(c or 0)} for d, c in revenue],
            "generations_by_status": [{"status": s, "count": c} for s, c in by_status],
        },
    }
