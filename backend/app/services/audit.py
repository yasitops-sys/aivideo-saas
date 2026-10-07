"""Immutable admin audit log writer. Call on EVERY admin mutation."""
import json

from sqlalchemy.orm import Session

from .. import models


def audit(db: Session, *, admin_id: str, action: str,
          target_type: str | None = None, target_id: str | None = None,
          details: dict | None = None, ip: str | None = None) -> None:
    db.add(models.AdminAuditLog(
        admin_id=admin_id, action=action,
        target_type=target_type, target_id=target_id,
        details_json=json.dumps(details or {}, default=str),
        ip_address=ip))
    db.flush()
