"""Single settings object for the face service, sourced from env vars.

Also loads a repo-root .env if one is found by walking up from this file,
so the service picks up the monorepo's shared .env without hardcoding a path.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _find_dotenv() -> Path | None:
    """Search upward from this file for a .env, mirroring dotenv's project discovery."""
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / ".env"
        if candidate.is_file():
            return candidate
    return None


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader: KEY=VALUE per line, no external dependency required.

    Existing environment variables take precedence (never overwritten).
    """
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_dotenv_path = _find_dotenv()
if _dotenv_path is not None:
    _load_dotenv(_dotenv_path)


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    return int(raw) if raw not in (None, "") else default


@dataclass(frozen=True)
class Settings:
    """All service configuration, read once at import time."""

    det_size: int = field(default_factory=lambda: _env_int("FACE_DET_SIZE", 640))
    ctx_id: int = field(default_factory=lambda: _env_int("FACE_CTX_ID", -1))
    fetch_timeout_s: int = field(default_factory=lambda: _env_int("FACE_FETCH_TIMEOUT_S", 15))
    max_image_bytes: int = field(
        default_factory=lambda: _env_int("FACE_MAX_IMAGE_BYTES", 10 * 1024 * 1024)
    )
    port: int = field(default_factory=lambda: _env_int("PORT", 8000))


settings = Settings()
