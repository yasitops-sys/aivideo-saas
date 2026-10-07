"""MockProvider — renders a real, playable MP4 locally with ffmpeg.

Used for development, automated tests, and as the default provider until a
real provider API key is configured. Output is a smooth animated gradient
with the prompt rendered as overlaid text — clearly synthetic, but a genuine
video file exercising the full pipeline (queue -> provider -> storage ->
signed URL -> download).
"""
import os
import subprocess
import tempfile
import textwrap
import uuid

from .base import AIProvider, ProviderJob, ProviderStatus

ASPECTS = {"16:9": (1280, 720), "9:16": (720, 1280), "1:1": (720, 720)}


class MockProvider(AIProvider):
    name = "mock"
    _jobs: dict[str, dict] = {}

    def text_to_video(self, *, prompt, duration_seconds, aspect_ratio, model_id):
        return self._start(prompt=prompt, image_bytes=None,
                           duration_seconds=duration_seconds,
                           aspect_ratio=aspect_ratio)

    def image_to_video(self, *, prompt, image_bytes, image_content_type,
                       duration_seconds, aspect_ratio, model_id):
        return self._start(prompt=prompt, image_bytes=image_bytes,
                           duration_seconds=duration_seconds,
                           aspect_ratio=aspect_ratio)

    def _start(self, *, prompt, image_bytes, duration_seconds, aspect_ratio):
        job_id = f"mock_{uuid.uuid4().hex[:16]}"
        self._jobs[job_id] = {
            "prompt": prompt, "image_bytes": image_bytes,
            "duration": duration_seconds, "aspect": aspect_ratio,
            "polls": 0,
        }
        return ProviderJob(provider_job_id=job_id, status="processing")

    def get_status(self, provider_job_id: str) -> ProviderStatus:
        job = self._jobs.get(provider_job_id)
        if not job:
            return ProviderStatus(status="failed", error="Unknown mock job")
        job["polls"] += 1
        if job["polls"] < 2:
            # Simulate async generation: first poll still working.
            return ProviderStatus(status="processing", progress=0.5)
        try:
            video = self._render(job)
            thumb = self._thumbnail(job)
        except Exception as e:  # never crash the worker on render issues
            return ProviderStatus(status="failed", error=f"Mock render failed: {e}")
        return ProviderStatus(status="completed", video_bytes=video,
                              thumbnail_bytes=thumb, progress=1.0)

    # --- rendering ---------------------------------------------------------
    def _render(self, job: dict) -> bytes:
        w, h = ASPECTS.get(job["aspect"], (1280, 720))
        duration = max(1, min(int(job["duration"]), 60))
        caption = textwrap.fill(job["prompt"][:120], width=34).replace(":", "\\:")
        # Animated test pattern with rotating hue + caption. Clearly synthetic,
        # but a genuine playable video exercising the full pipeline.
        vf = (
            f"testsrc2=s={w}x{h}:d={duration},"
            f"hue=h='360*t/{duration}',"
            f"drawtext=text='{caption}':fontsize=28:fontcolor=white:"
            f"x=(w-text_w)/2:y=(h-text_h)/2:borderw=2"
        )
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            out = f.name
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", vf,
                 "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                 "-pix_fmt", "yuv420p", "-t", str(duration), out],
                check=True, timeout=120)
            with open(out, "rb") as f:
                return f.read()
        finally:
            os.unlink(out)

    def _thumbnail(self, job: dict) -> bytes:
        w, h = ASPECTS.get(job["aspect"], (1280, 720))
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            out = f.name
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-f", "lavfi",
                 "-i", f"color=c=0x1a1a2e:s={w}x{h}:d=1",
                 "-frames:v", "1", out],
                check=True, timeout=30)
            with open(out, "rb") as f:
                return f.read()
        finally:
            os.unlink(out)
