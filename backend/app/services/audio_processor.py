"""
services/audio_processor.py — Core audio analysis using librosa.

librosa is a Python library for audio and music analysis. It sits on top
of numpy/scipy and provides high-level functions for:
  - Loading audio (librosa.load)
  - Beat/tempo tracking (librosa.beat.beat_track)
  - Feature extraction (RMS, spectral centroid, chromagram)

All analysis happens synchronously (CPU-bound). The FastAPI route wraps
this in run_in_executor so it doesn't block the async event loop.

FORMAT SUPPORT
--------------
soundfile (the default librosa backend) only handles PCM-based containers:
WAV, FLAC, OGG, AIFF, CAF, etc.  Compressed formats like M4A, MP3, and AAC
require a separate decoder step.

librosa 0.10+ deprecated its `audioread` fallback (which handled compressed
formats via external tools) and will remove it in librosa 1.0.

Our fix: for compressed formats we call ffmpeg via subprocess to decode the
audio to a 16-bit WAV in memory (stdout pipe), then pass that bytes buffer
directly to soundfile / librosa — no temp files, no deprecated path.
"""

import logging
import shutil
import subprocess
from pathlib import Path

import librosa
import numpy as np

from app.models.audio import AudioAnalysis

logger = logging.getLogger(__name__)

# Formats that soundfile can read natively (no ffmpeg needed).
# Everything else goes through the ffmpeg decode path.
_SOUNDFILE_NATIVE = {".wav", ".flac", ".ogg", ".aiff", ".aif", ".caf", ".rf64", ".w64"}

# Formats we accept at the upload endpoint (mirrors audio.py ALLOWED_MIME_TYPES).
# Listed here for documentation; enforcement happens in the route layer.
_ACCEPTED_EXTENSIONS = {
    ".wav", ".flac", ".ogg", ".aiff",
    ".mp3", ".m4a", ".aac", ".opus",
}


def _load_via_ffmpeg(filepath: Path) -> tuple[np.ndarray, int]:
    """
    Decode a compressed audio file to a float32 numpy array via ffmpeg.

    Instead of writing a temp file, we pipe the raw PCM output from ffmpeg
    directly into numpy.  This avoids touching disk a second time and keeps
    things fast for large files.

    Returns:
        (y, sr) — the same tuple that librosa.load() would return.

    Raises:
        RuntimeError: if ffmpeg is not installed or the decode fails.
    """
    ffmpeg_bin = shutil.which("ffmpeg")
    if ffmpeg_bin is None:
        raise RuntimeError(
            "ffmpeg is required to decode this audio format but was not found. "
            "Install it with: brew install ffmpeg  (macOS) or apt install ffmpeg (Linux)"
        )

    # -vn            : skip any video stream
    # -ar 22050      : resample to 22 050 Hz (librosa's default; keeps analysis fast)
    # -ac 1          : mix to mono
    # -f s16le        : output raw signed 16-bit little-endian PCM
    # pipe:1          : write to stdout instead of a file
    cmd = [
        ffmpeg_bin,
        "-i", str(filepath),
        "-vn",          # drop video if present (e.g. M4V inside M4A)
        "-ar", "22050", # target sample rate
        "-ac", "1",     # mono
        "-f", "s16le",  # raw PCM int16
        "pipe:1",
    ]

    logger.debug("ffmpeg decode: %s", " ".join(cmd))
    result = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,  # capture stderr so it doesn't pollute logs
        check=False,             # we check returncode manually for a clearer message
    )

    if result.returncode != 0:
        stderr_tail = result.stderr[-500:].decode("utf-8", errors="replace")
        raise RuntimeError(
            f"ffmpeg failed to decode {filepath.name} (exit {result.returncode}):\n{stderr_tail}"
        )

    # Convert raw int16 bytes → float32 numpy array, normalised to [-1, 1]
    pcm = np.frombuffer(result.stdout, dtype=np.int16).astype(np.float32)
    pcm /= 32768.0  # int16 max value

    sample_rate = 22050  # matches the -ar flag above
    return pcm, sample_rate


def analyze_audio(filepath: str | Path) -> AudioAnalysis:
    """
    Load an audio file and extract musical features for visualization.

    Supports WAV, FLAC, OGG, MP3, M4A, AAC, OPUS — basically anything
    ffmpeg can decode.

    The features returned map directly to visual parameters:
      bpm / beat_times → particle emission rate and beat flash timing
      energy           → warp displacement scale (beat-level reactivity)
      spectral_centroid→ color temperature shift (treble=cool, bass=warm)
      chroma           → dominant hue hint for default album art gradient

    Args:
        filepath: Path to an audio file.

    Returns:
        AudioAnalysis pydantic model with all extracted features.

    Raises:
        FileNotFoundError: if the file doesn't exist.
        RuntimeError:      if the file can't be decoded.
    """
    filepath = Path(filepath)
    if not filepath.exists():
        raise FileNotFoundError(f"Audio file not found: {filepath}")

    logger.info("Loading audio: %s", filepath.name)

    # ── 1. Load audio ────────────────────────────────────────────────────────
    # Choose the loading strategy based on the file extension:
    #   - Native soundfile formats → librosa.load() directly (fast, no subprocess)
    #   - Compressed formats       → ffmpeg pipe → numpy (avoids deprecated audioread)
    #
    # res_type='soxr_hq': use the soxr resampler (installed as a librosa dep).
    # This avoids the 'resampy' backend which is NOT in our dependency list.
    ext = filepath.suffix.lower()
    try:
        if ext in _SOUNDFILE_NATIVE:
            # soundfile reads these natively — no extra step needed
            y, sr = librosa.load(filepath, mono=True, res_type="soxr_hq")
        else:
            # Compressed format: decode via ffmpeg, then hand the numpy array to
            # librosa.  We skip librosa.load() entirely to avoid the deprecated
            # audioread fallback that librosa 1.0 will remove.
            logger.debug("Using ffmpeg decode path for %s", filepath.suffix)
            y, sr = _load_via_ffmpeg(filepath)
    except (FileNotFoundError, RuntimeError):
        raise  # re-raise our own errors as-is
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
