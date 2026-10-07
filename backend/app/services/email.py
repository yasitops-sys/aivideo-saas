"""Email service. Dev mode logs to stdout; wire SMTP_HOST etc. for production.
Call sites use NotificationService with channels=("inapp","email") — no changes
needed when SMTP is configured."""
import logging
import smtplib
from email.message import EmailMessage

from ..config import get_settings

log = logging.getLogger(__name__)
settings = get_settings()


def send_email(to: str, subject: str, body: str) -> bool:
    if not settings.SMTP_HOST:
        log.info("[email:dev] to=%s subject=%s\n%s", to, subject, body)
        return True
    try:
        msg = EmailMessage()
        msg["From"] = settings.EMAIL_FROM
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(body)
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as s:
            s.starttls()
            if settings.SMTP_USER:
                s.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            s.send_message(msg)
        return True
    except Exception:
        log.exception("send_email failed to %s", to)
        return False


def send_verification_email(to: str, token: str) -> None:
    link = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    send_email(to, "Verify your email",
               f"Welcome! Please verify your email by opening this link:\n\n{link}\n\n"
               "The link expires in 24 hours.")


def send_password_reset_email(to: str, token: str) -> None:
    link = f"{settings.FRONTEND_URL}/reset-password/{token}"
    send_email(to, "Reset your password",
               f"Open this link to reset your password:\n\n{link}\n\n"
               "The link expires in 1 hour. If you didn't request this, ignore this email.")
