"""Background worker: polls queued generations, runs them through the AI
provider layer, stores results, settles credits, notifies the user.

Run:  python -m app.worker.worker   (or: uvicorn api + this as 2nd process)
Job claiming uses SELECT ... FOR UPDATE SKIP LOCKED so multiple worker
processes can run safely. Temporary provider failures are retried with
backoff (max 3 attempts); permanent failure -> refund reserved credits.
"""
import json
import logging
import time
from datetime import timedelta

import httpx
from sqlalchemy.orm import Session

from .. import models
from ..ai_providers.registry import register_builtin_providers, registry
from ..db import SessionLocal, utcnow
from ..services import credits as credit_service
from ..services.notifications import NotificationService
from ..services.storage import get_storage, sha256_bytes

log = logging.getLogger("worker")
logging.basicConfig(level=logging.INFO)

MAX_ATTEMPTS = 3
POLL_INTERVAL = 5          # seconds between queue polls when idle
PROVIDER_POLL = 4          # seconds between provider status polls
PROVIDER_TIMEOUT = 600     # max seconds waiting on a provider

register_builtin_providers()


def claim_next_job(db: Session) -> models.VideoGeneration | None:
    """Atomically claim one queued generation. Returns None if queue empty."""
    job = (
        db.query(models.VideoGeneration)
        .filter(models.VideoGeneration.status == models.GEN_QUEUED)
        .order_by(models.VideoGeneration.created_at)
        .with_for_update(skip_locked=True)
        .first()
    )
    if job:
        job.status = models.GEN_PROCESSING
        job.updated_at = utcnow()
        db.commit()
    return job


def _download(url: str) -> bytes:
    with httpx.Client(timeout=120, follow_redirects=True) as c:
        r = c.get(url)
        r.raise_for_status()
        return r.content


def process_job(db: Session, gen: models.VideoGeneration) -> None:
    notif = NotificationService(db)
    storage = get_storage()
    log.info("Processing generation %s (model=%s)", gen.id, gen.model.name)

    provider = registry.get(gen.provider)
    image_bytes = None
    content_type = "image/png"
    if gen.input_image_key:
        # Input images are small; LocalBackend can resolve the path directly.
        local = getattr(storage, "resolve", None)
        if local:
            with open(local(gen.input_image_key), "rb") as f:
                image_bytes = f.read()
        else:
            image_bytes = _download(storage.get_signed_url(gen.input_image_key))

    try:
        if gen.generation_type == "image_to_video":
            if image_bytes is None:
                raise RuntimeError("image_to_video requires an input image")
            job = provider.image_to_video(
                prompt=gen.prompt, image_bytes=image_bytes,
                image_content_type=content_type,
                duration_seconds=gen.duration_seconds,
                aspect_ratio=gen.aspect_ratio, model_id=gen.model.model_id)
        else:
            job = provider.text_to_video(
                prompt=gen.prompt, duration_seconds=gen.duration_seconds,
                aspect_ratio=gen.aspect_ratio, model_id=gen.model.model_id)
        gen.provider_job_id = job.provider_job_id
        db.commit()
    except Exception as e:
        log.exception("Provider submission failed for %s", gen.id)
        _fail(db, gen, f"Provider error: {e}", notif)
        return

    # Poll the provider until terminal state.
    deadline = utcnow() + timedelta(seconds=PROVIDER_TIMEOUT)
    video_bytes: bytes | None = None
    thumb_bytes: bytes | None = None
    error: str | None = None
    while utcnow() < deadline:
        try:
            st = provider.get_status(gen.provider_job_id)
        except Exception as e:
            error = f"Status poll failed: {e}"
            break
        if st.status == "completed":
            if st.video_bytes:
                video_bytes = st.video_bytes
            elif st.video_url:
                try:
                    video_bytes = _download(st.video_url)
                except Exception as e:
                    error = f"Artifact download failed: {e}"
                    break
            else:
                error = "Provider returned no video"
                break
            thumb_bytes = st.thumbnail_bytes
            break
        if st.status == "failed":
            error = st.error or "Provider reported failure"
            break
        time.sleep(PROVIDER_POLL)

    if error is None and video_bytes is None:
        error = "Timed out waiting for provider"

    if error:
        _fail(db, gen, error, notif)
        return

    # Persist artifacts to object storage.
    vkey = f"videos/{gen.user_id}/{gen.id}.mp4"
    storage.save(video_bytes, vkey, "video/mp4")
    tkey = None
    if thumb_bytes:
        tkey = f"thumbs/{gen.user_id}/{gen.id}.jpg"
        storage.save(thumb_bytes, tkey, "image/jpeg")

    gen.status = models.GEN_COMPLETED
    gen.storage_key = vkey
    gen.thumbnail_key = tkey
    gen.video_metadata_json = json.dumps({
        "bytes": len(video_bytes),
        "sha256": sha256_bytes(video_bytes),
        "duration_seconds": gen.duration_seconds,
        "aspect_ratio": gen.aspect_ratio,
    })
    gen.completed_at = utcnow()
    gen.updated_at = utcnow()
    db.commit()

    # Settle credits: reservation -> final charge (ledger records it).
    credit_service.charge_reserved(db, user_id=gen.user_id, generation_id=gen.id)
    db.commit()
    notif.generation_completed(gen.user_id, gen.id)
    db.commit()
    log.info("Generation %s completed", gen.id)


def _fail(db: Session, gen: models.VideoGeneration, error: str,
          notif: NotificationService) -> None:
    gen.retry_count += 1
    if gen.retry_count < MAX_ATTEMPTS:
        # Transient failure: requeue with backoff.
        gen.status = models.GEN_QUEUED
        gen.error_message = f"Attempt {gen.retry_count} failed: {error[:300]}"
        gen.updated_at = utcnow()
        db.commit()
        log.warning("Generation %s failed transiently, requeued (%s)",
                    gen.id, error[:120])
        time.sleep(2 ** gen.retry_count)
        return
    gen.status = models.GEN_FAILED
    gen.error_message = error[:1000]
    gen.completed_at = utcnow()
    gen.updated_at = utcnow()
    db.commit()
    # Refund the reserved credits — money never disappears on failure.
    credit_service.refund_reserved(db, user_id=gen.user_id, generation_id=gen.id)
    db.commit()
    notif.generation_failed(gen.user_id, gen.id)
    db.commit()
    log.error("Generation %s failed permanently: %s", gen.id, error[:200])


def run_forever() -> None:
    log.info("Worker started. Polling for queued generations…")
    while True:
        db = SessionLocal()
        try:
            job = claim_next_job(db)
            if job:
                # Re-fetch in this session to avoid detached state.
                gen = db.query(models.VideoGeneration).filter(
                    models.VideoGeneration.id == job.id).first()
                process_job(db, gen)
            else:
                time.sleep(POLL_INTERVAL)
        except Exception:
            log.exception("Worker loop error")
            db.rollback()
            time.sleep(POLL_INTERVAL)
        finally:
            db.close()


if __name__ == "__main__":
    run_forever()
