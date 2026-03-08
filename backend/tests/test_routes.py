"""
tests/test_routes.py — Integration tests for the HTTP API.

Uses FastAPI's TestClient which runs the app in-process, so tests run fast
without needing a real network connection.

The `client` fixture comes from conftest.py.
"""

import io

import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient


class TestHealthEndpoints:
    """Tests for utility endpoints that don't touch audio."""

    def test_health_check(self, client: TestClient) -> None:
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "version" in data

    def test_root_returns_links(self, client: TestClient) -> None:
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "docs" in data
        assert "health" in data


class TestAudioUpload:
    """Tests for POST /api/audio/upload."""

    def _make_wav_bytes(self, duration: float = 2.0, sr: int = 22050) -> bytes:
        """Helper: generate a minimal WAV file as bytes (in-memory)."""
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)
        y = np.sin(2 * np.pi * 440 * t).astype(np.float32)
        buf = io.BytesIO()
        sf.write(buf, y, sr, format="WAV")
        buf.seek(0)
        return buf.read()

    def test_upload_wav_returns_200(self, client: TestClient) -> None:
        """Uploading a valid WAV file should return 200 with analysis data."""
        wav_bytes = self._make_wav_bytes()
        response = client.post(
            "/api/audio/upload",
            files={"file": ("test.wav", wav_bytes, "audio/wav")},
        )
        assert response.status_code == 200, response.text

    def test_upload_response_has_required_fields(self, client: TestClient) -> None:
        """Response should include audio_url, filename, and analysis."""
        wav_bytes = self._make_wav_bytes()
        response = client.post(
            "/api/audio/upload",
            files={"file": ("test.wav", wav_bytes, "audio/wav")},
        )
        data = response.json()
        assert "audio_url" in data
        assert "filename" in data
        assert "analysis" in data

    def test_upload_analysis_has_bpm(self, client: TestClient) -> None:
        """Analysis should include a BPM field that is a non-negative number.

        We use a pure sine wave here for speed, which legitimately returns
        bpm=0.0 (no transients → no beats detected).  The important thing
        is that the field exists and is a valid number, not that it is > 0.
        """
        wav_bytes = self._make_wav_bytes()
        response = client.post(
            "/api/audio/upload",
            files={"file": ("test.wav", wav_bytes, "audio/wav")},
        )
        analysis = response.json()["analysis"]
        assert "bpm" in analysis
        assert analysis["bpm"] >= 0  # 0.0 is valid for audio without clear rhythm

    def test_upload_analysis_has_beat_times(self, client: TestClient) -> None:
        """Analysis should include a list of beat timestamps."""
        wav_bytes = self._make_wav_bytes()
        response = client.post(
            "/api/audio/upload",
            files={"file": ("test.wav", wav_bytes, "audio/wav")},
        )
        analysis = response.json()["analysis"]
        assert isinstance(analysis["beat_times"], list)

    def test_upload_rejects_non_audio(self, client: TestClient) -> None:
        """Uploading a text file should return 415 Unsupported Media Type."""
        response = client.post(
            "/api/audio/upload",
            files={"file": ("notes.txt", b"not audio", "text/plain")},
        )
        assert response.status_code == 415

    def test_audio_url_is_string(self, client: TestClient) -> None:
        """The audio_url in the response should be a valid-looking URL string."""
        wav_bytes = self._make_wav_bytes()
        response = client.post(
            "/api/audio/upload",
            files={"file": ("test.wav", wav_bytes, "audio/wav")},
        )
        url = response.json()["audio_url"]
        assert isinstance(url, str)
        assert url.startswith("http")


class TestSearch:
    """Tests for GET /api/search."""

    def test_search_returns_200(self, client: TestClient) -> None:
        response = client.get("/api/search/", params={"q": "radiohead"})
        assert response.status_code == 200

    def test_search_response_shape(self, client: TestClient) -> None:
        """Search response should include query, results, and is_live fields."""
        response = client.get("/api/search/", params={"q": "tame impala"})
        data = response.json()
        assert "query" in data
        assert "results" in data
        assert "is_live" in data
        assert isinstance(data["results"], list)

    def test_search_stub_mode(self, client: TestClient) -> None:
        """Without an API key, is_live should be False (stub mode)."""
        response = client.get("/api/search/", params={"q": "test"})
        data = response.json()
        # In test env, no LASTFM_API_KEY is set → stub mode
        assert data["is_live"] is False

    def test_search_results_have_title_and_artist(self, client: TestClient) -> None:
        """Each search result should have title and artist fields."""
        response = client.get("/api/search/", params={"q": "daft punk"})
        results = response.json()["results"]
        if results:
            for track in results:
                assert "title" in track
                assert "artist" in track

    def test_search_requires_query(self, client: TestClient) -> None:
        """Missing q param should return 422 Unprocessable Entity."""
        response = client.get("/api/search/")
        assert response.status_code == 422

    def test_search_limit_param(self, client: TestClient) -> None:
        """Passing limit=3 should return at most 3 results."""
        response = client.get("/api/search/", params={"q": "jazz", "limit": 3})
        assert response.status_code == 200
        results = response.json()["results"]
        assert len(results) <= 3
