"""Admin: AI model configuration (name, provider, costs, enabled/disabled).
Provider credentials are NEVER exposed here — only the provider name."""
import json

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ... import models, schemas
from ...ai_providers.registry import registry
from ...db import get_db
from ...deps import get_client_ip, require_admin
from ...errors import not_found, validation
from ...services.audit import audit

router = APIRouter(prefix="/admin/models", tags=["admin"])


def _out(m: models.AIModel) -> dict:
    return {"id": m.id, "name": m.name, "provider": m.provider,
            "model_id": m.model_id, "generation_type": m.generation_type,
            "credit_cost": m.credit_cost,
            "durations": json.loads(m.durations_json),
            "aspect_ratios": json.loads(m.aspect_ratios_json),
            "is_enabled": m.is_enabled, "created_at": m.created_at}


@router.get("")
def list_models(admin: models.User = Depends(require_admin),
                db: Session = Depends(get_db)):
    return [_out(m) for m in db.query(models.AIModel).all()]


@router.post("", status_code=201)
def create_model(body: schemas.ModelUpsertIn, request: Request,
                 admin: models.User = Depends(require_admin),
                 db: Session = Depends(get_db)):
    try:
        registry.get(body.provider)
    except ValueError:
        raise validation(f"Unknown provider '{body.provider}'. "
                         f"Available: {registry.names()}")
    m = models.AIModel(
        name=body.name, provider=body.provider, model_id=body.model_id,
        generation_type=body.generation_type, credit_cost=body.credit_cost,
        durations_json=json.dumps(sorted(set(body.durations))),
        aspect_ratios_json=json.dumps(body.aspect_ratios),
        is_enabled=body.is_enabled)
    db.add(m)
    db.flush()
    audit(db, admin_id=admin.id, action="model.create",
          target_type="ai_model", target_id=m.id,
          details={k: v for k, v in body.model_dump().items()},
          ip=get_client_ip(request))
    db.commit()
    return {"id": m.id}


@router.put("/{model_id}")
def update_model(model_id: str, body: schemas.ModelUpsertIn, request: Request,
                 admin: models.User = Depends(require_admin),
                 db: Session = Depends(get_db)):
    m = db.query(models.AIModel).filter(models.AIModel.id == model_id).first()
    if not m:
        raise not_found("Model not found.")
    try:
        registry.get(body.provider)
    except ValueError:
        raise validation(f"Unknown provider '{body.provider}'.")
    before = _out(m)
    m.name, m.provider, m.model_id = body.name, body.provider, body.model_id
    m.generation_type, m.credit_cost = body.generation_type, body.credit_cost
    m.durations_json = json.dumps(sorted(set(body.durations)))
    m.aspect_ratios_json = json.dumps(body.aspect_ratios)
    m.is_enabled = body.is_enabled
    db.flush()
    audit(db, admin_id=admin.id, action="model.update",
          target_type="ai_model", target_id=m.id,
          details={"before": before, "after": body.model_dump()},
          ip=get_client_ip(request))
    db.commit()
    return {"ok": True}
