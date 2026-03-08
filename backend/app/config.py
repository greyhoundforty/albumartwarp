"""
config.py — Application configuration loaded from environment variables.

Uses pydantic-settings, which automatically reads from .env files and
environment variables. Any setting can be overridden at runtime:
  LASTFM_API_KEY=abc123 uv run uvicorn app.main:app

If you're using fnox for secrets, run:
  fnox exec -- uv run uvicorn app.main:app
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── Last.fm ──────────────────────────────────────────────────────────────
    # Leave empty to use stub data (no real API calls)
    lastfm_api_key: str = ""
    lastfm_api_secret: str = ""
    lastfm_base_url: str = "https://ws.audioscrobbler.com/2.0/"

    # ── Server ────────────────────────────────────────────────────────────────
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    # URL of the Vite dev server — added to CORS allow list
    frontend_url: str = "http://localhost:5173"

    # ── Upload limits ─────────────────────────────────────────────────────────
    max_upload_size_mb: int = 100

    # ── Derived paths (not from env, computed here) ───────────────────────────
    @property
    def uploads_dir(self) -> Path:
        """Absolute path to the folder where uploaded audio files are stored."""
        return Path(__file__).parent.parent / "uploads"

    @property
    def lastfm_enabled(self) -> bool:
        """True only when a real API key is configured."""
        return bool(self.lastfm_api_key)

    # pydantic-settings config: look for a .env file in the backend/ directory
    model_config = SettingsConfigDict(
        env_file=Path(__file__).parent.parent / ".env",
        env_file_encoding="utf-8",
        extra="ignore",  # silently ignore unknown env vars
    )


# Singleton — import this object everywhere you need settings
settings = Settings()

# Ensure the uploads directory exists when the module is first imported
settings.uploads_dir.mkdir(parents=True, exist_ok=True)
