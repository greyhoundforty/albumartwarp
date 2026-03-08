"""
tests/conftest.py — Shared pytest fixtures.

pytest automatically loads this file before any test in the `tests/` directory.
Fixtures defined here are available to all test files without explicit import.
"""

from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def sample_wav(tmp_path_factory) -> Path:
    """
    Generate a 3-second WAV file containing a 440 Hz (A note) sine wave.

    We use a sine wave instead of a real audio file so tests:
      - Run without requiring bundled audio assets
      - Are deterministic (same input → same analysis)
      - Are fast (no download needed)

    `scope="session"` means pytest creates this fixture once per test session
    and reuses it across all test functions that request it.
    """
    sample_rate = 22050
    duration = 3.0  # seconds
    frequency = 440.0  # Hz (A4 note)

    # Generate time array and compute sine wave
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    y = np.sin(2 * np.pi * frequency * t).astype(np.float32)

    # soundfile writes audio to disk in WAV format
    tmp_dir = tmp_path_factory.mktemp("audio")
    wav_path = tmp_dir / "test_sine_440hz.wav"
    sf.write(str(wav_path), y, sample_rate)

    return wav_path


@pytest.fixture(scope="session")
def beat_wav(tmp_path_factory) -> Path:
    """
    Generate a 4-second WAV with synthetic beats at ~120 BPM.
    Each beat is a short amplitude spike, making beat detection testable.
    """
    sample_rate = 22050
    bpm = 120.0
    duration = 4.0

    beat_interval_samples = int(sample_rate * 60.0 / bpm)
    n_samples = int(sample_rate * duration)
    y = np.zeros(n_samples, dtype=np.float32)

    # Place click sounds (short impulse) at each beat position
    click_len = int(sample_rate * 0.01)  # 10 ms click
    beat_positions = range(0, n_samples, beat_interval_samples)
    for pos in beat_positions:
        end = min(pos + click_len, n_samples)
        y[pos:end] = np.sin(2 * np.pi * 1000 * np.arange(end - pos) / sample_rate)

    # Add quiet background noise so librosa's beat tracker has something to work with
    y += np.random.default_rng(42).normal(0, 0.01, n_samples).astype(np.float32)

    tmp_dir = tmp_path_factory.mktemp("audio")
    wav_path = tmp_dir / "test_beats_120bpm.wav"
    sf.write(str(wav_path), y, sample_rate)
    return wav_path


@pytest.fixture(scope="session")
def client():
    """
    FastAPI TestClient — makes real HTTP requests to the app in-process.

    We use the context-manager form (`with TestClient(app) as c`) so that
    FastAPI's lifespan events (startup/shutdown) are triggered.  Without
    this, `app.state.lastfm_service` is never set and search routes return
    503 Service Unavailable.

    `scope="session"` reuses the same client for the entire test run,
    which avoids repeatedly creating/destroying the app.
    """
    with TestClient(app) as c:
        yield c
