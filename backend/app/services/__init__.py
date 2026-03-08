# services/__init__.py
from app.services.audio_processor import analyze_audio
from app.services.lastfm_service import LastFmService

__all__ = ["analyze_audio", "LastFmService"]
