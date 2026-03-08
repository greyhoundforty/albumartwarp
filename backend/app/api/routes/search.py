"""
api/routes/search.py — Song search via Last.fm.

Endpoints:
  GET /api/search?q={query}&limit={n}  — Search for tracks.
                                         Returns stubs unless LASTFM_API_KEY
                                         is set in the environment.

The LastFmService is created once at app startup (see main.py lifespan)
and injected here via FastAPI's dependency injection system.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.audio import SearchResult
from app.services.lastfm_service import LastFmService

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Dependency factory ────────────────────────────────────────────────────────
# FastAPI calls this function on every request to get the service instance.
# We store the singleton on app.state so tests can swap it out easily.
def get_lastfm_service() -> LastFmService:
    """
    Dependency that returns the app-level LastFmService singleton.

    FastAPI's Depends() calls this automatically — you don't need to
    call it manually in your route functions.
    """
    # Lazy import to avoid circular import at module load time
    from app.main import app  # noqa: PLC0415

    service: LastFmService | None = getattr(app.state, "lastfm_service", None)
    if service is None:
        raise HTTPException(status_code=503, detail="Search service unavailable")
    return service


@router.get("/", response_model=SearchResult, summary="Search for tracks")
async def search_tracks(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(default=10, ge=1, le=50, description="Max results"),
    service: LastFmService = Depends(get_lastfm_service),
) -> SearchResult:
    """
    Search for tracks matching `q`.

    When LASTFM_API_KEY is configured, this calls the real Last.fm API.
    Otherwise it returns stub data so you can develop the frontend without
    needing API credentials.

    The `is_live` field in the response indicates which mode is active.
    """
    logger.info("Search request: q=%r limit=%d", q, limit)
    try:
        result = await service.search_tracks(query=q, limit=limit)
    except Exception as exc:
        logger.exception("Search failed for query %r", q)
        raise HTTPException(
            status_code=502,
            detail=f"Search failed: {exc}",
        ) from exc

    return result
