"""Single shared rate limiter for the whole app.

One instance (one in-memory storage) so limits are coherent across routers
and tests can reset it deterministically.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["600/minute"])


def reset_limiter() -> None:
    """Test hook: clear all in-memory rate-limit counters."""
    limiter._storage.reset()
