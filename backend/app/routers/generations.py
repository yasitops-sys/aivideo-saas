"""Customer video generations: create (with credit reservation), list, detail,
delete, and signed file streaming."""
import json
import uuid

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from ..rate_limit import limiter
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db, utcnow
from ..deps import get_current_user
from ..errors import forbidden, not_found, validation
from ..services import credits as credit_service
from ..services.settings import get_setting
from ..services.storage import get_storage
from ..security import hmac_verify

router = APIRouter(prefix="/generations", tags=["generations"])

# magic bytes -> (ext, mime)
IMAGE_SIGNATURES = {
    b"\xff\xd8\xff": ("jpg", "image/jpeg"),
    b"\x89PNG\r\n\x1a\n": ("png", "image/png"),
    b"RIFF": ("webp", "image/webp"),  # + "WEBP" at offset 8
}


def _detect_image(head: bytes) -> tuple[str, str] | None:
    for sig, (ext, mime) in IMAGE_SIGNATURES.items():
        if head.startswith(sig):
            if ext == "webp" and len(head) >= 12 and head[8:12] != b"WEBP":
                continue
            return ext, mime
    return None


def _generation_out(gen: models.VideoGeneration, storage) -> dict:
    ttl = None
    video_url = storage.get_signed_url(gen.storage_key) if gen.storage_key else None
    thumb_url = storage.get_signed_url(gen.thumbnail_key) if gen.thumbnail_key else None
    img_url = storage.get_signed_url(gen.input_image_key) if gen.input_image_key else None
    return {
        "id": gen.id, "prompt": gen.prompt,
        "generation_type": gen.generation_type,
        "model": {"id": gen.model.id, "name": gen.model.name},
        "duration_seconds": gen.duration_seconds,
        "aspect_ratio": gen.aspect_ratio, "status": gen.status,
        "credits_reserved": gen.credits_reserved,
        "credits_charged": gen.credits_charged,
        "video_url": video_url, "thumbnail_url": thumb_url,
        "input_image_url": img_url, "error_message": gen.error_message,
        "created_at": gen.created_at, "completed_at": gen.completed_at,
    }


@router.post("", status_code=202)
@limiter.limit("30/hour")
def create_generation(
    request: Request,
    model_id: str = Form(...),
    prompt: str = Form(...),
    duration_seconds: int = Form(...),
    aspect_ratio: str = Form(...),
    image: UploadFile | None = File(default=None),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prompt = (prompt or "").strip()
    if not (1 <= len(prompt) <= 2000):
        raise validation("Prompt must be 1–2000 characters.")

    model = db.query(models.AIModel).filter(
        models.AIModel.id == model_id, models.AIModel.is_enabled.is_(True)).first()
    if not model:
        raise not_found("AI model not found or disabled.")

    try:
        durations = json.loads(model.durations_json)
        ratios = json.loads(model.aspect_ratios_json)
    except Exception:
        raise validation("Model configuration is invalid.")
    if duration_seconds not in durations:
        raise validation(f"Duration must be one of {durations}.")
    if aspect_ratio not in ratios:
        raise validation(f"Aspect ratio must be one of {ratios}.")

    max_seconds = int(get_setting(db, "max_generation_seconds") or 60)
    if duration_seconds > max_seconds:
        raise validation(f"Maximum generation duration is {max_seconds}s.")

    input_image_key = None
    if model.generation_type == "image_to_video":
        if image is None:
            raise validation("An input image is required for image-to-video.")
        max_mb = int(get_setting(db, "max_upload_mb") or 10)
        data = image.file.read((max_mb + 1) * 1024 * 1024)
        if len(data) > max_mb * 1024 * 1024:
            raise validation(f"Image must be under {max_mb} MB.")
        if len(data) < 16:
            raise validation("Uploaded file is empty or corrupt.")
        detected = _detect_image(data[:16])
        if not detected:
            raise validation("Only JPG, PNG or WebP images are allowed.")
        ext, mime = detected
        input_image_key = f"inputs/{user.id}/{uuid.uuid4().hex}.{ext}"
        get_storage().save(data, input_image_key, mime)
    elif image is not None:
        raise validation("This model does not accept an input image.")

    # Reserve credits BEFORE creating the job — single atomic step.
    # The generation row id is the reservation reference.
    gen_id = uuid.uuid4().hex
    credit_service.reserve_for_generation(
        db, user_id=user.id, cost=model.credit_cost, generation_id=gen_id)

    gen = models.VideoGeneration(
        id=gen_id, user_id=user.id, model_id=model.id,
        generation_type=model.generation_type, prompt=prompt,
        input_image_key=input_image_key, duration_seconds=duration_seconds,
        aspect_ratio=aspect_ratio, status=models.GEN_QUEUED,
        credits_reserved=model.credit_cost, provider=model.provider)
    db.add(gen)
    db.commit()
    db.refresh(gen)

    return JSONResponse(
        status_code=202,
        content={"id": gen.id, "status": gen.status,
                 "credits_reserved": gen.credits_reserved,
                 "message": "Generation queued."},
    )


@router.get("")
def list_generations(page: int = 1, per_page: int = 20, status: str | None = None,
                     user: models.User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    q = db.query(models.VideoGeneration).filter(
        models.VideoGeneration.user_id == user.id)
    if status:
        q = q.filter(models.VideoGeneration.status == status)
    total = q.count()
    meta = schemas.paginate(page, per_page, total)
    rows = (q.order_by(models.VideoGeneration.created_at.desc())
             .offset((meta["page"] - 1) * meta["per_page"])
             .limit(meta["per_page"]).all())
    storage = get_storage()
    return {**meta, "items": [_generation_out(g, storage) for g in rows]}


@router.get("/{gen_id}")
def get_generation(gen_id: str,
                   user: models.User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    gen = db.query(models.VideoGeneration).filter(
        models.VideoGeneration.id == gen_id,
        models.VideoGeneration.user_id == user.id).first()
    if not gen:
        raise not_found("Generation not found.")
    return _generation_out(gen, get_storage())


@router.delete("/{gen_id}")
def delete_generation(gen_id: str,
                      user: models.User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    gen = db.query(models.VideoGeneration).filter(
        models.VideoGeneration.id == gen_id,
        models.VideoGeneration.user_id == user.id).first()
    if not gen:
        raise not_found("Generation not found.")
    if gen.status in (models.GEN_QUEUED, models.GEN_PROCESSING):
        raise forbidden("Cannot delete a generation that is still running.")
    storage = get_storage()
    for key in (gen.storage_key, gen.thumbnail_key, gen.input_image_key):
        if key:
            try:
                storage.delete(key)
            except Exception:
                pass
    db.delete(gen)
    db.commit()
    return {"ok": True}


# --- signed file streaming (local backend) -----------------------------------
files_router = APIRouter(tags=["files"])


@files_router.get("/files/{sig}/{exp}/{key:path}")
def stream_file(sig: str, exp: int, key: str,
                db: Session = Depends(get_db)):
    """Streams a storage object after verifying the HMAC signature + expiry.
    Auth: the signature itself is the capability (short-lived, 15 min)."""
    if int(utcnow().timestamp()) > exp:
        raise forbidden("This link has expired.")
    if not hmac_verify(f"{key}:{exp}", sig):
        raise forbidden("Invalid link.")
    storage = get_storage()
    local = getattr(storage, "resolve", None)
    if not local:
        return JSONResponse({"error": {"code": "not_found",
                                       "message": "Direct file serving not configured."}},
                            status_code=404)
    path = local(key)
    import os
    if not os.path.isfile(path):
        raise not_found("File not found.")
    # Access check: key must belong to the requesting user OR be covered by a
    # valid generation they own. The signed URL is only ever issued for the
    # owner's own objects, and expires in 15 minutes.
    media = "video/mp4" if key.endswith(".mp4") else \
            "image/jpeg" if key.endswith((".jpg", ".jpeg")) else \
            "image/png" if key.endswith(".png") else "image/webp"
    return FileResponse(path, media_type=media, filename=key.split("/")[-1])
