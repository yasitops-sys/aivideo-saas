"""Admin: view all generations."""
import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ... import models, schemas
from ...db import get_db
from ...deps import require_admin
from ...services.storage import get_storage

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/generations")
def list_generations(page: int = 1, per_page: int = 20,
                     status: str | None = None, user_id: str | None = None,
                     model_id: str | None = None, search: str | None = None,
                     admin: models.User = Depends(require_admin),
                     db: Session = Depends(get_db)):
    q = db.query(models.VideoGeneration)
    if status:
        q = q.filter(models.VideoGeneration.status == status)
    if user_id:
        q = q.filter(models.VideoGeneration.user_id == user_id)
    if model_id:
        q = q.filter(models.VideoGeneration.model_id == model_id)
    if search:
        q = q.filter(models.VideoGeneration.prompt.like(f"%{search}%"))
    total = q.count()
    meta = schemas.paginate(page, per_page, total)
    rows = (q.order_by(models.VideoGeneration.created_at.desc())
             .offset((meta["page"] - 1) * meta["per_page"])
             .limit(meta["per_page"]).all())
    storage = get_storage()
    items = []
    for g in rows:
        items.append({
            "id": g.id, "user_id": g.user_id, "user_email": g.user.email,
            "prompt": g.prompt[:200], "generation_type": g.generation_type,
            "model": g.model.name, "duration_seconds": g.duration_seconds,
            "aspect_ratio": g.aspect_ratio, "status": g.status,
            "credits_reserved": g.credits_reserved,
            "credits_charged": g.credits_charged,
            "error_message": g.error_message,
            "video_url": storage.get_signed_url(g.storage_key) if g.storage_key else None,
            "created_at": g.created_at, "completed_at": g.completed_at,
        })
    return {**meta, "items": items}
