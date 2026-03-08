"""
models/audio.py — Pydantic models for API request/response shapes.

Pydantic validates data at runtime (raises HTTP 422 if fields are wrong)
and generates JSON Schema that shows up in the /docs OpenAPI UI automatically.
"""

from pydantic import BaseModel, Field


class AudioAnalysis(BaseModel):
    """
    All musical features extracted from an audio file by librosa.
    These values are consumed by the frontend to drive the visualization.
    """

    # Total length of the track in seconds
    duration: float = Field(..., description="Track duration in seconds")

    # Beats-per-minute detected by librosa's beat tracker
    bpm: float = Field(..., description="Estimated tempo in BPM")

    # Timestamps (seconds) where beats occur — used for real-time beat detection
    beat_times: list[float] = Field(..., description="Beat timestamps in seconds")

    # Per-frame energy (RMS), normalized 0–1. Controls warp intensity.
    # One value per audio frame (hop_length = 512 samples @ 22050 Hz → ~43 fps)
    energy: list[float] = Field(
        ..., description="Normalized RMS energy per frame (0–1)"
    )

    # Per-frame spectral centroid, normalized 0–1. Higher = brighter/trebly.
    # Used to shift color palette towards cooler/warmer tones.
    spectral_centroid: list[float] = Field(
        ..., description="Normalized spectral centroid per frame (0–1)"
    )

    # 12-element mean chromagram — represents the average pitch class content.
    # Index 0=C, 1=C#, 2=D, ..., 11=B. Maps musical key to visualization hue.
    chroma: list[float] = Field(
        ..., description="Mean chroma vector (12 pitch classes)"
    )

    # Timestamps corresponding to each energy/centroid frame
    times: list[float] = Field(..., description="Frame center timestamps in seconds")

    # Samples between frames — needed by frontend to index frames by time
    hop_length: int = Field(512, description="Hop length in samples")

    # Sample rate of the loaded audio
    sample_rate: int = Field(22050, description="Audio sample rate in Hz")


class UploadResponse(BaseModel):
    """Returned by POST /api/audio/upload on success."""

    # Relative or absolute URL the frontend uses to stream the audio
    audio_url: str = Field(..., description="URL to stream the uploaded audio")

    # Server-side filename (UUID-based, not the original name)
    filename: str = Field(..., description="Server-assigned filename")

    # Full analysis results
    analysis: AudioAnalysis


class TrackInfo(BaseModel):
    """Represents a single track from a search result."""

    title: str
    artist: str
    # Album art URL (from Last.fm or placeholder)
    album_art_url: str | None = None
    # Last.fm track page URL
    lastfm_url: str | None = None
    # MusicBrainz ID (empty string if unavailable)
    mbid: str = ""
    # Listener count string (e.g. "1,234,567")
    listeners: str = "0"


class SearchResult(BaseModel):
    """Returned by GET /api/search."""

    query: str
    results: list[TrackInfo]
    # True when results come from the real Last.fm API; False when using stubs
    is_live: bool = False
