"""ReplicateProvider — example of a REAL provider plug-in.

Reads REPLICATE_API_TOKEN from env (never from the client). Implements the
same AIProvider interface, so switching a model from "mock" to "replicate"
in the admin panel is all it takes — no app code changes.

NOTE: model version IDs below are placeholders. An admin sets the real
`model_id` per ai_models row (e.g. a Replicate model version hash).
"""
import httpx

from ..config import get_settings
from .base import AIProvider, ProviderJob, ProviderStatus

settings = get_settings()
_API = "https://api.replicate.com/v1"


class ReplicateProvider(AIProvider):
    name = "replicate"

    def _headers(self) -> dict:
        if not settings.REPLICATE_API_TOKEN:
            raise RuntimeError("REPLICATE_API_TOKEN is not configured")
        return {"Authorization": f"Token {settings.REPLICATE_API_TOKEN}",
                "Content-Type": "application/json"}

    def text_to_video(self, *, prompt, duration_seconds, aspect_ratio, model_id):
        # model_id = Replicate model version, e.g. "owner/model:versionhash"
        owner_model, _, version = model_id.partition(":")
        payload = {"version": version or model_id,
                   "input": {"prompt": prompt,
                             "duration": duration_seconds,
                             "aspect_ratio": aspect_ratio}}
        with httpx.Client(timeout=30) as c:
            r = c.post(f"{_API}/predictions", headers=self._headers(), json=payload)
            r.raise_for_status()
            pred = r.json()
        return ProviderJob(provider_job_id=pred["id"], status="processing", raw=pred)

    def image_to_video(self, *, prompt, image_bytes, image_content_type,
                       duration_seconds, aspect_ratio, model_id):
        # Replicate needs a URL for image input; in production, upload the
        # input image to storage first and pass its signed URL here.
        raise NotImplementedError(
            "image_to_video for Replicate requires a public input-image URL — "
            "upload via storage.get_signed_url() and extend this method.")

    def get_status(self, provider_job_id: str) -> ProviderStatus:
        with httpx.Client(timeout=30) as c:
            r = c.get(f"{_API}/predictions/{provider_job_id}", headers=self._headers())
            r.raise_for_status()
            pred = r.json()
        status = pred.get("status")
        if status == "succeeded":
            out = pred.get("output")
            url = out[0] if isinstance(out, list) else out
            return ProviderStatus(status="completed", video_url=url, raw=pred)
        if status in ("failed", "canceled"):
            return ProviderStatus(status="failed",
                                  error=str(pred.get("error"))[:500], raw=pred)
        return ProviderStatus(status="processing", raw=pred)
