"""Notifications. In-app channel is live; the email channel interface exists
so SMTP can be wired later without touching any call site."""
from sqlalchemy.orm import Session

from .. import models
from ..db import utcnow


class NotificationService:
    def __init__(self, db: Session):
        self.db = db

    def notify(self, user_id: str, type: str, title: str, message: str = "",
               channels: tuple[str, ...] = ("inapp",)) -> None:
        if "inapp" in channels:
            self.db.add(models.Notification(
                user_id=user_id, type=type, title=title, message=message))
            self.db.flush()
        if "email" in channels:
            from .email import send_email
            user = self.db.query(models.User).filter(models.User.id == user_id).first()
            if user:
                send_email(user.email, title, message)

    # --- convenience events -------------------------------------------------
    def generation_completed(self, user_id: str, generation_id: str) -> None:
        self.notify(user_id, "generation_completed",
                    "Your video is ready",
                    f"Generation {generation_id[:8]} completed successfully.")

    def generation_failed(self, user_id: str, generation_id: str) -> None:
        self.notify(user_id, "generation_failed",
                    "Video generation failed",
                    f"Generation {generation_id[:8]} failed. Your credits were refunded.")

    def payment_successful(self, user_id: str, credits: int) -> None:
        self.notify(user_id, "payment_successful",
                    "Payment successful",
                    f"{credits} credits were added to your account.")

    def low_credits(self, user_id: str, balance: int) -> None:
        self.notify(user_id, "low_credits",
                    "You're running low on credits",
                    f"Your balance is {balance} credits. Top up to keep creating.")
