"""GoogleVeoProvider — real AI video via Google's Veo 3.1 and Gemini Omni Flash.

Uses the Gemini Developer API (Google AI Studio). Reads GEMINI_API_KEY from
env (never from the client).

Supported model_ids (set per ai_models row in admin panel):
  - "veo-3.1-fast-generate-preview"   (Veo 3.1 Fast — $0.10/s)
  - "veo-3.1-generate-preview"        (Veo 3.1 Standard — $0.40/s)
  - "veo-3.1-lite-generate-preview"   (Veo 3.1 Lite — $0.05/s)
  - "gemini-omni-flash-preview"       (Omni Flash — $0.10/s, up to 10s)

Flow: predictLongRunning returns an operation; get_status polls it until done,
then downloads the MP4 bytes directly (so storage stays local/S3 as usual).
"""
import time

import httpx

from ..config import get_settings
from .base import AIProvider, ProviderJob, ProviderStatus

settings = get_settings()
_API = "https://generativelanguage.googleapis.com/v1beta"


def _require_key() -> str:
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    return settings.GEMINI_API_KEY


def _veo_duration(duration_seconds: int, model_id: str) -> int:
    # Veo supports 4/6/8s; Omni Flash supports up to 10s. Clamp to valid.
    if "omni" in model_id:
        return max(4, min(10, duration_seconds))
    valid = (4, 6, 8)
    return min(valid, key=lambda v: abs(v - duration_seconds))


def _veo_aspect(aspect_ratio: str) -> str:
    # App uses "9:16" / "16:9" / "1:1"; Veo wants "9:16" or "16:9".
    ar = (aspect_ratio or "").strip()
    return "9:16" if ar.startswith("9") else "16:9"


class GoogleVeoProvider(AIProvider):
    name = "google_veo"

    def _post_video_request(self, *, model_id: str, prompt: str,
                            duration_seconds: int, aspect_ratio: str,
                            image_bytes: bytes | None = None,
                            image_content_type: str | None = None) -> str:
        key = _require_key()
        instance: dict = {"prompt": prompt}
        if image_bytes:
            import base64
            instance["image"] = {
                "bytesBase64Encoded": base64.b64encode(image_bytes).decode(),
                "mimeType": image_content_type or "image/jpeg",
            }
        payload = {
            "instances": [instance],
            "parameters": {
                "aspectRatio": _veo_aspect(aspect_ratio),
                "durationSeconds": _veo_duration(duration_seconds, model_id),
            },
        }
        url = f"{_API}/models/{model_id}:predictLongRunning?key={key}"
        with httpx.Client(timeout=60) as c:
            r = c.post(url, json=payload)
            r.raise_for_status()
            op = r.json()
        op_name = op.get("name")
        if not op_name:
            raise RuntimeError(f"Veo did not return an operation: {str(op)[:300]}")
        return op_name

    def text_to_video(self, *, prompt, duration_seconds, aspect_ratio, model_id):
        op_name = self._post_video_request(
            model_id=model_id, prompt=prompt,
            duration_seconds=duration_seconds, aspect_ratio=aspect_ratio)
        return ProviderJob(provider_job_id=op_name, status="processing",
                           raw={"operation": op_name})

    def image_to_video(self, *, prompt, image_bytes, image_content_type,
                       duration_seconds, aspect_ratio, model_id):
        op_name = self._post_video_request(
            model_id=model_id, prompt=prompt,
            duration_seconds=duration_seconds, aspect_ratio=aspect_ratio,
            image_bytes=image_bytes, image_content_type=image_content_type)
        return ProviderJob(provider_job_id=op_name, status="processing",
                           raw={"operation": op_name})

    def get_status(self, provider_job_id: str) -> ProviderStatus:
        key = _require_key()
        url = f"{_API}/{provider_job_id}?key={key}"
        with httpx.Client(timeout=30) as c:
            r = c.get(url)
            r.raise_for_status()
            op = r.json()
        if op.get("done"):
            err = op.get("error")
            if err:
                return ProviderStatus(status="failed",
                                      error=str(err.get("message", err))[:500],
                                      raw=op)
            try:
                videos = op["response"]["generatedVideos"]
                video_uri = videos[0]["video"]["uri"]
            except (KeyError, IndexError, TypeError):
                return ProviderStatus(status="failed",
                                      error="Veo returned no video URI",
                                      raw=op)
            # Download the MP4 bytes (URI needs the API key).
            dl_url = f"{video_uri}&key={key}" if "?" in video_uri else f"{video_uri}?key={key}"
            with httpx.Client(timeout=120) as c:
                vr = c.get(dl_url)
                vr.raise_for_status()
                video_bytes = vr.content
            if not video_bytes:
                return ProviderStatus(status="failed",
                                      error="Empty video download", raw=op)
            return ProviderStatus(status="completed", video_bytes=video_bytes,
                                  raw={"operation": provider_job_id})
        return ProviderStatus(status="processing",
                              raw={"operation": provider_job_id})
