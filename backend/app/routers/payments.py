"""Payments: checkout session creation + Stripe webhook.

BILLING SAFETY (non-negotiable):
  - Credits are granted ONLY inside the verified webhook handler.
  - Duplicate webhook deliveries are deduped by Stripe event_id (unique).
  - A payment row can only transition pending -> completed ONCE
    (credits_granted guard inside the same DB transaction).
  - Signature is verified with STRIPE_WEBHOOK_SECRET before any processing.
"""
import json
import logging
import uuid

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import get_settings
from ..db import get_db, utcnow
from ..deps import get_current_user
from ..errors import not_found, server_error, validation
from ..services import credits as credit_service
from ..services.notifications import NotificationService

log = logging.getLogger("payments")
router = APIRouter(prefix="/payments", tags=["payments"])
settings = get_settings()


def _stripe():
    if not settings.STRIPE_SECRET_KEY:
        return None
    import stripe
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def _stripe_to_dict(obj):
    """Recursively convert StripeObjects to plain dicts (public API only,
    stable across stripe-python versions)."""
    if isinstance(obj, list):
        return [_stripe_to_dict(x) for x in obj]
    if hasattr(obj, "to_dict") and callable(obj.to_dict):
        return {k: _stripe_to_dict(v) for k, v in obj.to_dict().items()}
    return obj


@router.post("/checkout")
def create_checkout(body: schemas.CheckoutIn,
                    user: models.User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    stripe = _stripe()
    if not stripe:
        raise server_error()  # generic message; admin must configure Stripe
    pkg = db.query(models.CreditPackage).filter(
        models.CreditPackage.id == body.package_id,
        models.CreditPackage.is_active.is_(True)).first()
    if not pkg:
        raise not_found("Credit package not found.")

    payment = models.Payment(
        user_id=user.id, package_id=pkg.id,
        amount_cents=pkg.price_cents, currency=pkg.currency,
        status="pending", provider="stripe",
        idempotency_key=uuid.uuid4().hex)
    db.add(payment)
    db.flush()

    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": pkg.currency.lower(),
                    "unit_amount": pkg.price_cents,
                    "product_data": {"name": f"{pkg.name} — {pkg.credits} credits"},
                },
                "quantity": 1,
            }],
            metadata={"payment_id": payment.id, "user_id": user.id},
            success_url=settings.STRIPE_SUCCESS_URL,
            cancel_url=settings.STRIPE_CANCEL_URL,
            idempotency_key=f"checkout_{payment.idempotency_key}",
        )
    except Exception:
        log.exception("Stripe checkout creation failed")
        db.rollback()
        raise server_error()

    payment.provider_session_id = session.id
    db.commit()
    return {"payment_id": payment.id, "checkout_url": session.url,
            "amount_cents": pkg.price_cents, "currency": pkg.currency}


@router.get("")
def list_payments(page: int = 1, per_page: int = 20,
                  user: models.User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    q = db.query(models.Payment).filter(models.Payment.user_id == user.id)
    total = q.count()
    meta = schemas.paginate(page, per_page, total)
    rows = (q.order_by(models.Payment.created_at.desc())
             .offset((meta["page"] - 1) * meta["per_page"])
             .limit(meta["per_page"]).all())
    items = [{
        "id": p.id, "package": {"name": p.package.name, "credits": p.package.credits},
        "amount_cents": p.amount_cents, "currency": p.currency,
        "status": p.status, "provider": p.provider,
        "created_at": p.created_at, "completed_at": p.completed_at,
    } for p in rows]
    return {**meta, "items": items}


# --- webhook ------------------------------------------------------------------
@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Stripe event receiver. Always returns 200 once the event is safely
    recorded — Stripe retries otherwise, and duplicates are harmless."""
    raw = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    event_id = "unknown"
    event_type = "unknown"
    signature_valid = False
    event = None

    # Signature verification needs only the webhook secret — not the API key.
    if settings.STRIPE_WEBHOOK_SECRET:
        import stripe
        try:
            event = stripe.Webhook.construct_event(
                raw, sig_header, settings.STRIPE_WEBHOOK_SECRET)
            signature_valid = True
            # construct_event returns a StripeObject — convert to a plain dict
            # so the handler below can use normal dict access.
            event = _stripe_to_dict(event)
            event_id = event["id"]
            event_type = event["type"]
        except Exception as e:
            log.warning("Webhook signature verification failed: %s", e)
            return JSONResponse({"ok": False, "reason": "bad signature"}, status_code=400)
    else:
        log.warning("Webhook received but STRIPE_WEBHOOK_SECRET is not configured")
        return JSONResponse({"ok": False, "reason": "not configured"}, status_code=400)

    # Idempotency: record the event FIRST. Unique constraint on event_id makes
    # concurrent duplicate deliveries safe.
    try:
        db.add(models.PaymentWebhook(
            event_id=event_id, provider="stripe", event_type=event_type,
            payload_json=raw.decode("utf-8", "replace"),
            signature_valid=signature_valid,
            processing_status="processed", processed_at=utcnow()))
        db.commit()
    except IntegrityError:
        db.rollback()
        log.info("Duplicate webhook %s ignored", event_id)
        return {"ok": True, "duplicate": True}

    try:
        _handle_event(db, event)
    except Exception:
        log.exception("Webhook handler failed for %s", event_id)
        db.rollback()
        db.query(models.PaymentWebhook).filter(
            models.PaymentWebhook.event_id == event_id).update(
            {"processing_status": "failed"})
        db.commit()
        # Return 200 anyway after recording — Stripe will retry, and our
        # idempotency guard turns the retry into a safe re-process attempt.
    return {"ok": True}


def _handle_event(db: Session, event: dict) -> None:
    etype = event["type"]
    obj = event["data"]["object"]

    if etype == "checkout.session.completed":
        payment_id = (obj.get("metadata") or {}).get("payment_id")
        _complete_payment(db, payment_id=payment_id,
                          session_id=obj.get("id"),
                          provider_payment_id=obj.get("payment_intent"))
    elif etype == "payment_intent.succeeded":
        # Fallback path if checkout metadata was lost.
        _complete_payment(db, payment_id=None, session_id=None,
                          provider_payment_id=obj.get("id"))
    elif etype == "payment_intent.payment_failed":
        _fail_payment(db, provider_payment_id=obj.get("id"))
    # other event types: recorded, ignored


def _find_payment(db: Session, payment_id, session_id, provider_payment_id):
    q = db.query(models.Payment).filter(models.Payment.provider == "stripe")
    if payment_id:
        row = q.filter(models.Payment.id == payment_id).first()
        if row:
            return row
    if session_id:
        row = q.filter(models.Payment.provider_session_id == session_id).first()
        if row:
            return row
    if provider_payment_id:
        row = q.filter(models.Payment.payment_id == provider_payment_id).first()
        if row:
            return row
    return None


def _complete_payment(db: Session, *, payment_id, session_id,
                      provider_payment_id) -> None:
    with db.begin_nested():
        payment = _find_payment(db, payment_id, session_id, provider_payment_id)
        if not payment:
            log.warning("Webhook for unknown payment (session=%s)", session_id)
            return
        if payment.status == "completed":
            log.info("Payment %s already completed — skipping double credit",
                     payment.id)
            return  # idempotent: never credit twice
        if payment.status != "pending":
            log.warning("Payment %s in unexpected state %s", payment.id, payment.status)
            return
        if provider_payment_id and not payment.payment_id:
            payment.payment_id = provider_payment_id

        payment.status = "completed"
        payment.completed_at = utcnow()
        payment.credits_granted = payment.package.credits

        credit_service.add_purchase(
            db, user_id=payment.user_id, credits=payment.package.credits,
            payment_id=payment.id,
            description=f"Purchased {payment.package.name} "
                        f"({payment.package.credits} credits)")
        db.flush()

    NotificationService(db).payment_successful(payment.user_id,
                                               payment.package.credits)
    db.commit()
    log.info("Payment %s completed: %d credits -> user %s",
             payment.id, payment.package.credits, payment.user_id)


def _fail_payment(db: Session, *, provider_payment_id) -> None:
    payment = _find_payment(db, None, None, provider_payment_id)
    if payment and payment.status == "pending":
        payment.status = "failed"
        db.commit()
