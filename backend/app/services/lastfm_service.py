"""
services/lastfm_service.py — Last.fm API integration (with stubs).

HOW TO ENABLE REAL SEARCH:
  1. Create a free Last.fm API account: https://www.last.fm/api/account/create
  2. Set LASTFM_API_KEY in your .env file (or via fnox)
  3. The service auto-detects the key and switches from stubs to live calls.

STUB BEHAVIOUR (no API key):
  Returns realistic-looking mock data so the frontend can be fully developed
  without needing a real API key.  All stub functions are marked clearly.

ARCHITECTURE NOTE:
  The LastFmService is a class (not module-level functions) so it's easy to
  inject a mock version in tests via dependency injection.
"""

import logging
from typing import Any

import httpx

from app.config import settings
from app.models.audio import SearchResult, TrackInfo

logger = logging.getLogger(__name__)


class LastFmService:
    """
    Wrapper around the Last.fm REST API.

    Usage:
        service = LastFmService()
        results = await service.search_tracks("tame impala")
    """

    def __init__(self) -> None:
        # Shared async HTTP client — reused across requests (more efficient).
        # trust_env=False prevents httpx from picking up SOCKS_PROXY / ALL_PROXY
        # environment variables that are sometimes set in sandbox environments.
        # Without this, httpx raises an ImportError asking for the 'socksio' package.
        self._client = httpx.AsyncClient(
            base_url=settings.lastfm_base_url,
            params={"format": "json"},  # always request JSON
            timeout=10.0,
            trust_env=False,  # don't inherit proxy env vars
        )

    async def search_tracks(self, query: str, limit: int = 10) -> SearchResult:
        """
        Search for tracks matching `query`.

        Delegates to the real Last.fm API if LASTFM_API_KEY is configured,
        otherwise returns stub data so the UI still works during development.
        """
        if settings.lastfm_enabled:
            logger.info("Last.fm live search: %r", query)
            return await self._live_search(query, limit)
        else:
            logger.info("Last.fm STUB search: %r (no API key configured)", query)
            return self._stub_search(query, limit)

    # ── Real API call ─────────────────────────────────────────────────────────

    async def _live_search(self, query: str, limit: int) -> SearchResult:
        """
        Call the Last.fm track.search endpoint.

        Docs: https://www.last.fm/api/show/track.search
        Response format: {"results": {"trackmatches": {"track": [...]}}}
        """
        response = await self._client.get(
            "",  # base_url is the full endpoint already
            params={
                "method": "track.search",
                "track": query,
                "limit": limit,
                "api_key": settings.lastfm_api_key,
            },
        )
        response.raise_for_status()
        data = response.json()

        raw_tracks: list[dict[str, Any]] = (
            data.get("results", {}).get("trackmatches", {}).get("track", [])
        )

        tracks = [self._parse_track(t) for t in raw_tracks]
        return SearchResult(query=query, results=tracks, is_live=True)

    def _parse_track(self, raw: dict[str, Any]) -> TrackInfo:
        """
        Convert a raw Last.fm track dict into our TrackInfo model.

        Last.fm returns image as a list of dicts:
          [{"#text": "url", "size": "small"}, ..., {"#text": "url", "size": "extralarge"}]
        We pick the largest available image.
        """
        images: list[dict[str, str]] = raw.get("image", [])

        # Prefer "extralarge", then fall back through smaller sizes
        art_url: str | None = None
        for size in ("extralarge", "large", "medium", "small"):
            for img in images:
                if img.get("size") == size and img.get("#text"):
                    art_url = img["#text"]
                    break
            if art_url:
                break

        return TrackInfo(
            title=raw.get("name", "Unknown"),
            artist=raw.get("artist", "Unknown"),
            album_art_url=art_url,
            lastfm_url=raw.get("url"),
            mbid=raw.get("mbid", ""),
            listeners=raw.get("listeners", "0"),
        )

    # ── Stub data ─────────────────────────────────────────────────────────────

    def _stub_search(self, query: str, limit: int) -> SearchResult:
        """
        Return fake search results that mirror the real API shape.

        STUB — Replace with _live_search by setting LASTFM_API_KEY.
        The dummy album art URLs point to a placeholder image service.
        """
        # Plausible-sounding fake artists/albums for dev/testing
        stub_artists = [
            ("Tame Impala", "Currents"),
            ("Radiohead", "OK Computer"),
            ("Daft Punk", "Random Access Memories"),
            ("Kendrick Lamar", "To Pimp a Butterfly"),
            ("Boards of Canada", "Music Has the Right to Children"),
        ]

        results: list[TrackInfo] = []
        for i in range(min(limit, len(stub_artists))):
            artist, album = stub_artists[i % len(stub_artists)]
            results.append(
                TrackInfo(
                    title=f"{query.title()} — Track {i + 1}",
                    artist=artist,
                    # placehold.co generates colored placeholder images
                    album_art_url=f"https://placehold.co/500x500/1a1a2e/ffffff?text={album.replace(' ', '+')}",
                    lastfm_url=f"https://www.last.fm/music/{artist.replace(' ', '+')}",
                    mbid="",
                    listeners=str((i + 1) * 12_345),
                )
            )

        return SearchResult(query=query, results=results, is_live=False)

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def close(self) -> None:
        """Close the shared HTTP client. Called on app shutdown."""
        await self._client.aclose()
