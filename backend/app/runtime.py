"""In-memory runtime overrides for API keys and config.

Keys set here take precedence over .env values. On startup, keys are loaded
from .env.runtime (a gitignored sidecar file) so they survive server restarts.
"""
from __future__ import annotations

import os
from pathlib import Path

_store: dict[str, str] = {}

# Sidecar file next to .env — gitignored, holds runtime-saved secrets
_RUNTIME_ENV = Path(__file__).parent.parent / ".env.runtime"


def _load_from_disk() -> None:
    """Load persisted keys from .env.runtime into the store."""
    if not _RUNTIME_ENV.exists():
        return
    for line in _RUNTIME_ENV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"')
        if k and v:
            _store[k] = v


def _save_to_disk() -> None:
    """Persist current store to .env.runtime."""
    lines = [f'{k}="{v}"' for k, v in sorted(_store.items())]
    _RUNTIME_ENV.write_text("\n".join(lines) + "\n", encoding="utf-8")


def set_key(name: str, value: str) -> None:
    if value and value.strip():
        _store[name] = value.strip()
        _save_to_disk()
    elif name in _store:
        del _store[name]
        _save_to_disk()


def get_key(name: str, default: str = "") -> str:
    return _store.get(name) or default


def is_configured(name: str, env_fallback: str = "") -> bool:
    return bool(_store.get(name) or env_fallback)


# Load persisted keys at import time
_load_from_disk()
