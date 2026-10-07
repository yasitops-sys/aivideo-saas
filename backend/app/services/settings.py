"""System settings with typed defaults. Admin-editable via /api/admin/settings."""
import json

from sqlalchemy.orm import Session

from .. import models
from ..db import utcnow

DEFAULTS: dict[str, object] = {
    "site_name": "AI Video Studio",
    "logo_url": "",
    "currency": "USD",
    "maintenance_mode": False,
    "default_credit_cost": 10,
    "max_upload_mb": 10,
    "max_generation_seconds": 60,
    "registration_enabled": True,
    "signup_bonus_credits": 0,
}

PUBLIC_KEYS = {"site_name", "logo_url", "currency",
               "registration_enabled", "maintenance_mode"}

# Only super-admin may change these (provider credentials etc.)
SENSITIVE_KEYS = {"stripe_secret_key", "stripe_webhook_secret",
                  "replicate_api_token", "s3_secret_key"}


def get_setting(db: Session, key: str):
    row = db.query(models.SystemSetting).filter(models.SystemSetting.key == key).first()
    if row is None:
        return DEFAULTS.get(key)
    try:
        return json.loads(row.value_json)
    except Exception:
        return DEFAULTS.get(key)


def get_public_settings(db: Session) -> dict:
    return {k: get_setting(db, k) for k in PUBLIC_KEYS}


def get_all_settings(db: Session) -> dict:
    keys = set(DEFAULTS) | {r.key for r in db.query(models.SystemSetting.key).all()}
    out = {}
    for k in sorted(keys):
        v = get_setting(db, k)
        out[k] = "********" if k in SENSITIVE_KEYS and v else v
    return out


def get_all_settings_list(db: Session) -> list[dict]:
    """Array form for the admin UI: [{key, value, updated_at}]."""
    keys = set(DEFAULTS) | {r.key for r in db.query(models.SystemSetting.key).all()}
    rows = {r.key: r for r in db.query(models.SystemSetting).all()}
    out = []
    for k in sorted(keys):
        v = get_setting(db, k)
        out.append({
            "key": k,
            "value": "********" if k in SENSITIVE_KEYS and v else v,
            "updated_at": rows[k].updated_at.isoformat() if k in rows else None,
        })
    return out


def set_setting(db: Session, key: str, value_json: str, updated_by: str | None) -> None:
    # Validate it's JSON.
    json.loads(value_json)
    row = db.query(models.SystemSetting).filter(models.SystemSetting.key == key).first()
    if row:
        row.value_json = value_json
        row.updated_by = updated_by
        row.updated_at = utcnow()
    else:
        db.add(models.SystemSetting(key=key, value_json=value_json,
                                    updated_by=updated_by))
    db.commit()
