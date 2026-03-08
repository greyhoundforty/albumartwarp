"""
api/routes/audio.py — Upload and analyze audio files.

Endpoints:
  POST /api/audio/upload   — Accepts a multipart audio file, saves it,
                             runs librosa analysis, returns analysis JSON.
  GET  /api/audio/{name}   — Serves the raw audio file for browser playback.
                             (Also available at /uploads/{name} via StaticFiles)

The analysis is CPU-bound (librosa), so it runs in a thread pool via
asyncio.run_in_executor to avoid blocking the async event loop.
"""

import asyncio
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import aiofiles
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.config import settings
from app.models.audio import UploadResponse
from app.services.audio_processor import analyze_audio

logger = logging.getLogger(__name__)
router = APIRouter()

# Shared thread pool — limits concurrent analyses to avoid OOM on large files.
# 2 workers is conservative; raise if you have more CPU cores to spare.
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="audio-analysis")

# Audio MIME types we accept (enforced server-side for security)
ALLOWED_MIME_TYPES = {
    "audio/mpeg",  # MP3
    "audio/wav",  # WAV
    "audio/x-wav",  # WAV (alternate MIME)
    "audio/flac",  # FLAC
    "audio/x-flac",  # FLAC (alternate MIME)
    "audio/ogg",  # OGG/Vorbis
    "audio/aac",  # AAC
    "audio/mp4",  # M4A
    "audio/x-m4a",  # M4A (alternate MIME)
}


@router.post(
    "/upload", response_model=UploadResponse, summary="Upload and analyze audio"
)
async def upload_audio(file: UploadFile = File(...)) -> UploadResponse:
    """
    Upload an audio file, save it, and run librosa analysis.

    Returns the audio URL (for browser playback) and the full analysis
    data (BPM, beats, energy, etc.) needed to drive the visualization.

    Supported formats: MP3, WAV, FLAC, OGG, AAC, M4A
    Note: MP3 requires ffmpeg installed on the server.
    """
    # ── Validate file type ────────────────────────────────────────────────────
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=(
                f"Unsupported file type: {content_type!r}. "
                f"Accepted: {', '.join(sorted(ALLOWED_MIME_TYPES))}"
            ),
        )

    # ── Validate file size ────────────────────────────────────────────────────
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    # Read the entire file into memory for size check, then write async to disk.
    # For production, stream directly to disk to avoid large memory allocations.
    contents = await file.read()
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max size: {settings.max_upload_size_mb} MB",
        )

    # ── Save file with a UUID filename ────────────────────────────────────────
    # We use UUID to avoid filename collisions and to strip potentially unsafe
    # characters from user-supplied filenames.
    original_suffix = Path(file.filename or "audio").suffix.lower() or ".bin"
    server_filename = f"{uuid.uuid4()}{original_suffix}"
    save_path = settings.uploads_dir / server_filename

    logger.info("Saving upload: %s → %s", file.filename, server_filename)
    async with aiofiles.open(save_path, "wb") as f_out:
        await f_out.write(contents)

    # ── Run analysis in thread pool ───────────────────────────────────────────
    # librosa is CPU-bound and can take several seconds for long tracks.
    # run_in_executor offloads it to a background thread so FastAPI can keep
    # handling other requests while we wait.
    loop = asyncio.get_event_loop()
    try:
        analysis = await loop.run_in_executor(
            _executor,
            analyze_audio,
            save_path,
        )
    except Exception as exc:
        # Clean up the saved file if analysis fails (don't leave orphans)
        save_path.unlink(missing_ok=True)
        logger.exception("Analysis failed for %s", server_filename)
        raise HTTPException(
            status_code=422,
            detail=f"Audio analysis failed: {exc}",
        ) from exc

    # ── Build and return response ─────────────────────────────────────────────
    # The audio URL points to the StaticFiles mount defined in main.py
    audio_url = f"http://{settings.backend_host}:{settings.backend_port}/uploads/{server_filename}"
    # Use localhost for local dev (0.0.0.0 isn't routable from browser)
    if settings.backend_host == "0.0.0.0":
        audio_url = (
            f"http://localhost:{settings.backend_port}/uploads/{server_filename}"
        )

    logger.info("Upload complete: %s (%.1f BPM)", server_filename, analysis.bpm)
    return UploadResponse(
        audio_url=audio_url,
        filename=server_filename,
        analysis=analysis,
    )


@router.get("/{filename}", summary="Serve uploaded audio file")
async def get_audio(filename: str) -> FileResponse:
    """
    Serve an uploaded audio file by server-assigned filename.

    This endpoint is a convenience alias for /uploads/{filename}
    (which is also served by FastAPI's StaticFiles mount in main.py).
    """
    # Basic path traversal protection — reject any slashes or dots at start
    if "/" in filename or filename.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = settings.uploads_dir / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    return FileResponse(
        path=str(file_path),
        media_type="audio/mpeg",  # browsers accept this for most formats
    )
