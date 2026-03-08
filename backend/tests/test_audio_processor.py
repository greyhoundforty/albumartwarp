"""
tests/test_audio_processor.py — Unit tests for the audio analysis service.

These tests call analyze_audio() directly (no HTTP layer) so they run fast
and give precise error messages if something breaks in the DSP logic.
"""

import math
from pathlib import Path

import pytest

from app.models.audio import AudioAnalysis
from app.services.audio_processor import analyze_audio


class TestAnalyzeAudio:
    """Tests for the analyze_audio() function."""

    def test_returns_audio_analysis_model(self, sample_wav: Path) -> None:
        """analyze_audio should return an AudioAnalysis pydantic model."""
        result = analyze_audio(sample_wav)
        assert isinstance(result, AudioAnalysis)

    def test_duration_is_correct(self, sample_wav: Path) -> None:
        """Duration should be within 0.5s of the expected 3-second sine wave."""
        result = analyze_audio(sample_wav)
        assert abs(result.duration - 3.0) < 0.5, (
            f"Expected ~3.0s, got {result.duration:.2f}s"
        )

    def test_bpm_is_positive(self, beat_wav: Path) -> None:
        """BPM should be a positive finite number for audio that has rhythm.

        We use beat_wav (a synthetic 120-BPM click track) rather than the
        pure sine wave, because a featureless sine has no transients for
        librosa's beat tracker to lock onto and legitimately returns 0.0.
        """
        result = analyze_audio(beat_wav)
        assert result.bpm > 0, f"Expected positive BPM from click track, got {result.bpm}"
        assert math.isfinite(result.bpm)

    def test_beat_times_are_ordered(self, sample_wav: Path) -> None:
        """Beat timestamps must be monotonically increasing."""
        result = analyze_audio(sample_wav)
        for i in range(1, len(result.beat_times)):
            assert result.beat_times[i] > result.beat_times[i - 1], (
                f"Beat times not ordered at index {i}: "
                f"{result.beat_times[i - 1]:.3f} → {result.beat_times[i]:.3f}"
            )

    def test_energy_normalized(self, sample_wav: Path) -> None:
        """Energy values should all be in [0, 1]."""
        result = analyze_audio(sample_wav)
        assert len(result.energy) > 0, "Energy list should not be empty"
        assert all(0.0 <= e <= 1.0 for e in result.energy), (
            "Energy values out of [0, 1] range"
        )

    def test_chroma_has_12_elements(self, sample_wav: Path) -> None:
        """Chromagram vector should have exactly 12 pitch classes (C…B)."""
        result = analyze_audio(sample_wav)
        assert len(result.chroma) == 12

    def test_chroma_values_nonnegative(self, sample_wav: Path) -> None:
        """Chroma values (mean energy per pitch class) should be ≥ 0."""
        result = analyze_audio(sample_wav)
        assert all(c >= 0 for c in result.chroma)

    def test_times_align_with_energy(self, sample_wav: Path) -> None:
        """The times and energy lists must have the same length."""
        result = analyze_audio(sample_wav)
        assert len(result.times) == len(result.energy), (
            f"times length {len(result.times)} ≠ energy length {len(result.energy)}"
        )

    def test_spectral_centroid_normalized(self, sample_wav: Path) -> None:
        """Spectral centroid values should be in [0, 1]."""
        result = analyze_audio(sample_wav)
        assert all(0.0 <= v <= 1.0 for v in result.spectral_centroid)

    def test_file_not_found_raises(self, tmp_path: Path) -> None:
        """analyze_audio should raise FileNotFoundError for missing files."""
        with pytest.raises(FileNotFoundError):
            analyze_audio(tmp_path / "nonexistent.wav")

    def test_sample_rate_is_sensible(self, sample_wav: Path) -> None:
        """Sample rate should be a standard audio rate."""
        result = analyze_audio(sample_wav)
        assert result.sample_rate in (8000, 11025, 16000, 22050, 44100, 48000)

    def test_hop_length_is_positive(self, sample_wav: Path) -> None:
        """Hop length must be positive."""
        result = analyze_audio(sample_wav)
        assert result.hop_length > 0

    def test_beat_wav_detected_beats(self, beat_wav: Path) -> None:
        """For a file with clear beats, at least 2 beats should be detected."""
        result = analyze_audio(beat_wav)
        assert len(result.beat_times) >= 2, (
            f"Expected multiple beats, got {len(result.beat_times)}"
        )
