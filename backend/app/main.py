"""
app/main.py — FastAPI application entry point.

Creates the FastAPI app, registers middleware, mounts static files,
and includes the API routers.

To run:
  uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

Or via mise:
  mise run dev:backend
"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import audio as audio_routes
from app.api.routes import search as search_routes
from app.config import settings
from app.services.lastfm_service import LastFmService

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ── Lifespan (startup / shutdown) ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    AsyncContextManager that runs startup code before `yield`
    and teardown code after `yield`.

    This is the FastAPI-recommended replacement for @app.on_event("startup").
    """
    # Startup: create shared service instances
    logger.info("Starting AlbumArtWarp backend")
    app.state.lastfm_service = LastFmService()

    lastfm_status = "LIVE" if settings.lastfm_enabled else "STUB (no API key)"
    logger.info("Last.fm search mode: %s", lastfm_status)

    yield  # ← app runs here, handling requests

    # Shutdown: clean up resources
    logger.info("Shutting down AlbumArtWarp backend")
    await app.state.lastfm_service.close()


# ── Application factory ───────────────────────────────────────────────────────
app = FastAPI(
    title="AlbumArtWarp API",
    description=(
        "Audio analysis backend for the AlbumArtWarp music visualizer. "
        "Processes uploaded audio files with librosa and provides Last.fm "
        "search (real or stubbed). See /docs for interactive API explorer."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS middleware ───────────────────────────────────────────────────────────
# CORS (Cross-Origin Resource Sharing) lets the browser make requests from
# the frontend origin (localhost:5173) to the backend (localhost:8000).
# Without this, the browser blocks the requests with a CORS error.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,  # Vite dev server
        "http://localhost:5173",  # fallback
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],  # GET, POST, OPTIONS, etc.
    allow_headers=["*"],  # Content-Type, Authorization, etc.
)

# ── Static file serving ───────────────────────────────────────────────────────
# Mount the uploads directory at /uploads so the frontend can stream audio.
# e.g. GET /uploads/abc123.mp3 → backend/uploads/abc123.mp3
uploads_dir = Path(__file__).parent.parent / "uploads"
uploads_dir.mkdir(parents=True, exist_ok=True)

app.mount(
    "/uploads",
    StaticFiles(directory=str(uploads_dir)),
    name="uploads",
)

# ── API Routers ───────────────────────────────────────────────────────────────
# prefix="/api/..." keeps API routes separate from static file routes
app.include_router(audio_routes.router, prefix="/api/audio", tags=["audio"])
app.include_router(search_routes.router, prefix="/api/search", tags=["search"])


# ── Utility endpoints ─────────────────────────────────────────────────────────
@app.get("/health", tags=["meta"], summary="Health check")
async def health_check() -> dict[str, str]:
    """Returns 200 OK when the server is running."""
    return {"status": "ok", "version": "0.1.0"}


@app.get("/", tags=["meta"], summary="API root")
async def root() -> dict[str, str]:
    return {
        "message": "AlbumArtWarp API",
        "docs": "/docs",
        "health": "/health",
    }
