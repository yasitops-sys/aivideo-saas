"""AI provider abstraction. The app is NEVER hard-coded to one provider.

To add a provider:
  1. Subclass AIProvider in a new file (see replicate.py).
  2. Register it in registry.py: registry.register("name", YourProvider()).
  3. Set the model's `provider` column to "name" in the admin panel.
API keys live in env vars, read only inside the provider module.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ProviderJob:
    provider_job_id: str
    status: str  # queued | processing | completed | failed
    raw: dict = field(default_factory=dict)


@dataclass
class ProviderStatus:
    status: str  # queued | processing | completed | failed
    video_url: str | None = None       # remote URL to download when completed
    video_bytes: bytes | None = None   # or bytes directly (mock providers)
    thumbnail_bytes: bytes | None = None
    error: str | None = None
    progress: float | None = None      # 0..1
    raw: dict = field(default_factory=dict)


class AIProvider(ABC):
    name: str = "base"

    @abstractmethod
    def text_to_video(self, *, prompt: str, duration_seconds: int,
                      aspect_ratio: str, model_id: str) -> ProviderJob:
        """Start a text-to-video job. Returns a provider-side job handle."""

    @abstractmethod
    def image_to_video(self, *, prompt: str, image_bytes: bytes,
                       image_content_type: str, duration_seconds: int,
                       aspect_ratio: str, model_id: str) -> ProviderJob:
        """Start an image-to-video job."""

    @abstractmethod
    def get_status(self, provider_job_id: str) -> ProviderStatus:
        """Poll a running job."""
