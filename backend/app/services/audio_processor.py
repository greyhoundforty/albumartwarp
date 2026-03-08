"""
services/audio_processor.py — Core audio analysis using librosa.

librosa is a Python library for audio and music analysis. It sits on top
of numpy/scipy and provides high-level functions for:
  - Loading audio (librosa.load)
  - Beat/tempo tracking (librosa.beat.beat_track)
  - Feature extraction (RMS, spectral centroid, chromagram)

All analysis happens synchronously (CPU-bound). The FastAPI route wraps
this in run_in_executor so it doesn't block the async event loop.
"""

import logging
from pathlib import Path

import librosa
import numpy as np

from app.models.audio import AudioAnalysis

logger = logging.getLogger(__name__)


def analyze_audio(filepath: str | Path) -> AudioAnalysis:
    """
    Load an audio file and extract musical features for visualization.

    The features returned map directly to visual parameters:
      bpm / beat_times → particle emission rate and beat flash timing
      energy           → warp displacement scale (beat-level reactivity)
      spectral_centroid→ color temperature shift (treble=cool, bass=warm)
      chroma           → dominant hue hint for default album art gradient

    Args:
        filepath: Path to a WAV, FLAC, OGG, or MP3 file.
                  MP3 requires ffmpeg to be installed.

    Returns:
        AudioAnalysis pydantic model with all extracted features.

    Raises:
        FileNotFoundError: if the file doesn't exist.
        RuntimeError:      if librosa fails to load the file.
    """
    filepath = Path(filepath)
    if not filepath.exists():
        raise FileNotFoundError(f"Audio file not found: {filepath}")

    logger.info("Loading audio: %s", filepath.name)

    # ── 1. Load audio ────────────────────────────────────────────────────────
    # mono=True: mix stereo to mono (features work on mono signal)
    # sr=None: use the file's native sample rate (avoids quality loss)
    # res_type='kaiser_fast': faster resampling algorithm vs default 'kaiser_best'
    try:
        y, sr = librosa.load(filepath, mono=True, res_type="kaiser_fast")
    except Exception as exc:
        raise RuntimeError(f"librosa failed to load {filepath.name}: {exc}") from exc

    duration = float(librosa.get_duration(y=y, sr=sr))
    logger.info("Loaded %.1fs of audio at %d Hz", duration, sr)

    # ── 2. Tempo & Beats ─────────────────────────────────────────────────────
    # beat_track() uses a dynamic programming algorithm to find the most likely
    # tempo and beat grid that fits the audio's onset strength signal.
    # Returns:
    #   tempo       — float, beats per minute
    #   beat_frames — 1D array of frame indices where beats occur
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")

    # Convert frame indices → seconds for the frontend's time-based lookup
    beat_times: list[float] = librosa.frames_to_time(beat_frames, sr=sr).tolist()

    # librosa can return tempo as a 0-d or 1-d array; ensure plain float
    bpm = float(np.atleast_1d(tempo)[0])

    logger.info("Detected %.1f BPM, %d beats", bpm, len(beat_times))

    # ── 3. Energy (RMS) ───────────────────────────────────────────────────────
    # hop_length: number of samples between consecutive frames.
    # At 22050 Hz with hop_length=512 → ~43 frames per second.
    hop_length = 512

    # rms shape: (1, n_frames) → flatten to (n_frames,)
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]

    # Normalize 0→1 so the frontend gets a unit-range value.
    # Add tiny epsilon (1e-8) to avoid division by zero on silent files.
    rms_max = rms.max() + 1e-8
    energy: list[float] = (rms / rms_max).tolist()

    # ── 4. Spectral Centroid ─────────────────────────────────────────────────
    # The spectral centroid is the "center of mass" of the frequency spectrum.
    # Think of it as the brightness of the sound:
    #   high centroid → treble-heavy (cymbals, strings) → cooler colors
    #   low centroid  → bass-heavy (kick drum, bass)    → warmer colors
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop_length)[0]

    # Normalize relative to Nyquist frequency (half the sample rate)
    nyquist = sr / 2.0
    spectral_centroid: list[float] = (centroid / nyquist).tolist()

    # ── 5. Chroma Features ────────────────────────────────────────────────────
    # Chromagram: 12-row matrix where each row = a pitch class (C, C#, D …)
    # and each column = a time frame. High value = that pitch class is active.
    # We average over time to get the song's overall harmonic "fingerprint",
    # which lets us pick a starting hue for the visualization.
    chroma = librosa.feature.chroma_stft(y=y, sr=sr, hop_length=hop_length)
    chroma_mean: list[float] = chroma.mean(axis=1).tolist()  # shape: (12,)

    # ── 6. Frame Timestamps ───────────────────────────────────────────────────
    # These timestamps line up 1:1 with each element of energy / spectral_centroid.
    # The frontend can binary-search this to find the current frame from currentTime.
    times: list[float] = librosa.times_like(rms, sr=sr, hop_length=hop_length).tolist()

    logger.info("Analysis complete for %s", filepath.name)

    return AudioAnalysis(
        duration=duration,
        bpm=bpm,
        beat_times=beat_times,
        energy=energy,
        spectral_centroid=spectral_centroid,
        chroma=chroma_mean,
        times=times,
        hop_length=hop_length,
        sample_rate=sr,
    )
