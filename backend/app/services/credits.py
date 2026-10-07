"""Credit ledger. ALL balance changes go through here, inside a DB transaction.

Every function:
  - locks the user row (SELECT ... FOR UPDATE)
  - computes balance_before / balance_after
  - writes exactly one immutable credit_transactions row
  - updates users.credit_balance (+ totals)
Never modify users.credit_balance anywhere else in the codebase.
"""
from sqlalchemy.orm import Session

from .. import models
from ..db import utcnow
from ..errors import insufficient_credits, validation


def _locked_user(db: Session, user_id: str) -> models.User:
    # populate_existing(): the session may already hold this user in its
    # identity map (expire_on_commit=False). The locked SELECT must return
    # the CURRENT row, never a stale in-memory copy — this is a money path.
    user = (
        db.query(models.User)
        .filter(models.User.id == user_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if not user or user.deleted_at:
        raise validation("User not found.")
    return user


def _append_tx(
    db: Session,
    *,
    user: models.User,
    tx_type: str,
    amount: int,
    reference_id: str | None,
    description: str,
    created_by_admin_id: str | None = None,
) -> models.CreditTransaction:
    before = user.credit_balance
    after = before + amount
    if after < 0:
        raise insufficient_credits()
    user.credit_balance = after
    if amount > 0 and tx_type in (models.TX_PURCHASE,):
        user.total_credits_purchased += amount
    if amount < 0 and tx_type in (models.TX_GENERATION_CHARGE,):
        user.total_credits_used += -amount
    tx = models.CreditTransaction(
        user_id=user.id,
        transaction_type=tx_type,
        amount=amount,
        balance_before=before,
        balance_after=after,
        reference_id=reference_id,
        description=description,
        created_by_admin_id=created_by_admin_id,
    )
    db.add(tx)
    db.flush()
    return tx


def get_balance(db: Session, user_id: str) -> dict:
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise validation("User not found.")
    return {
        "balance": user.credit_balance,
        "total_purchased": user.total_credits_purchased,
        "total_used": user.total_credits_used,
    }


def add_purchase(db: Session, *, user_id: str, credits: int, payment_id: str,
                 description: str) -> models.CreditTransaction:
    """Credits from a VERIFIED payment webhook. Idempotent via payment row check
    done by the caller (payments.credits_granted)."""
    if credits <= 0:
        raise validation("Credit amount must be positive.")
    with db.begin_nested():
        user = _locked_user(db, user_id)
        tx = _append_tx(db, user=user, tx_type=models.TX_PURCHASE, amount=credits,
                        reference_id=payment_id, description=description)
    return tx


def reserve_for_generation(db: Session, *, user_id: str, cost: int,
                           generation_id: str) -> models.CreditTransaction:
    """Deduct up-front when a generation starts. Refunded on failure."""
    if cost <= 0:
        raise validation("Invalid generation cost.")
    with db.begin_nested():
        user = _locked_user(db, user_id)
        if user.credit_balance < cost:
            raise insufficient_credits()
        tx = _append_tx(db, user=user, tx_type=models.TX_GENERATION_RESERVE,
                        amount=-cost, reference_id=generation_id,
                        description=f"Reserved for video generation {generation_id[:8]}")
    return tx


def charge_reserved(db: Session, *, user_id: str, generation_id: str) -> None:
    """Convert a reservation into a final charge (no balance change, but the
    ledger records the conversion and totals are updated)."""
    with db.begin_nested():
        user = _locked_user(db, user_id)
        gen = db.query(models.VideoGeneration).filter(
            models.VideoGeneration.id == generation_id).first()
        if not gen or gen.credits_charged:
            return  # already charged — idempotent
        cost = gen.credits_reserved
        tx = models.CreditTransaction(
            user_id=user.id,
            transaction_type=models.TX_GENERATION_CHARGE,
            amount=0,  # balance already reduced at reserve time
            balance_before=user.credit_balance,
            balance_after=user.credit_balance,
            reference_id=generation_id,
            description=f"Charged for completed generation {generation_id[:8]}",
        )
        db.add(tx)
        user.total_credits_used += cost
        gen.credits_charged = cost
        db.flush()


def refund_reserved(db: Session, *, user_id: str, generation_id: str,
                    reason: str = "Generation failed") -> None:
    """Return reserved credits after a failed generation. Idempotent."""
    with db.begin_nested():
        user = _locked_user(db, user_id)
        gen = db.query(models.VideoGeneration).filter(
            models.VideoGeneration.id == generation_id).first()
        if not gen or gen.status == models.GEN_REFUNDED or gen.credits_reserved == 0:
            return
        cost = gen.credits_reserved
        _append_tx(db, user=user, tx_type=models.TX_GENERATION_REFUND,
                   amount=cost, reference_id=generation_id,
                   description=f"{reason} — refunded {cost} credits")
        gen.status = models.GEN_REFUNDED
        db.flush()


def admin_adjust(db: Session, *, user_id: str, amount: int, reason: str,
                 admin_id: str) -> models.CreditTransaction:
    """Manual add/remove by an admin. Always audit-logged by the caller."""
    if amount == 0:
        raise validation("Amount cannot be zero.")
    with db.begin_nested():
        user = _locked_user(db, user_id)
        if user.credit_balance + amount < 0:
            raise validation("Adjustment would make the balance negative.")
        action = "added to" if amount > 0 else "removed from"
        tx = _append_tx(db, user=user, tx_type=models.TX_ADMIN_ADJUST, amount=amount,
                        reference_id=None,
                        description=f"Admin {action} balance: {reason}",
                        created_by_admin_id=admin_id)
    return tx


def grant_signup_bonus(db: Session, *, user_id: str, credits: int) -> None:
    if credits <= 0:
        return
    with db.begin_nested():
        user = _locked_user(db, user_id)
        _append_tx(db, user=user, tx_type=models.TX_SIGNUP_BONUS, amount=credits,
                   reference_id=None, description="Welcome bonus credits")
