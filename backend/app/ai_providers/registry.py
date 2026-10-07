"""Provider registry — the single place providers are wired in."""
from .base import AIProvider


class ProviderRegistry:
    def __init__(self):
        self._providers: dict[str, AIProvider] = {}

    def register(self, name: str, provider: AIProvider) -> None:
        self._providers[name] = provider

    def get(self, name: str) -> AIProvider:
        try:
            return self._providers[name]
        except KeyError:
            raise ValueError(f"Unknown AI provider: {name!r}. "
                             f"Available: {sorted(self._providers)}")

    def names(self) -> list[str]:
        return sorted(self._providers)


registry = ProviderRegistry()


def register_builtin_providers() -> None:
    from .mock import MockProvider
    from .replicate import ReplicateProvider
    from .google_veo import GoogleVeoProvider
    registry.register("mock", MockProvider())
    registry.register("replicate", ReplicateProvider())
    registry.register("google_veo", GoogleVeoProvider())
