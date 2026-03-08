/**
 * hooks/useVisualization.js — Manages all visualization state.
 *
 * Tracks:
 *   songProgress  — normalized position (0–1) through the song
 *   warpIntensity — how much to displace the SVG warp filter (0–1)
 *   beatImpact    — decaying spike (0–1) that fires on every beat hit
 *   palette       — dominant colors extracted from the album art
 *
 * The warp curve:
 *   - At songProgress=0:   album art is pristine, no distortion
 *   - At songProgress=0.5: moderate warp, album art still recognizable
 *   - At songProgress=1.0: heavy warp + color field, abstract visual
 *   - On each beat:        momentary spike adds extra distortion
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { extractPalette, paletteFromChroma } from '../services/colorExtractor.js'
import { computeWarpIntensity } from '../utils/audioUtils.js'

/**
 * @param {Object|null} analysisData   - Backend analysis response.
 * @param {number} currentTime         - Audio playback time in seconds.
 * @param {boolean} isBeat             - True when on a detected beat.
 * @param {string|null} albumArtUrl    - URL of album art image (may be null).
 * @returns {{ songProgress, warpIntensity, beatImpact, palette }}
 */
export function useVisualization(analysisData, currentTime, isBeat, albumArtUrl) {
  const [palette, setPalette] = useState([])
  const [songProgress, setSongProgress] = useState(0)
  const [warpIntensity, setWarpIntensity] = useState(0)
  const [beatImpact, setBeatImpact] = useState(0)

  // beatImpactRef: mutable value used in rAF loop without stale closures
  const beatImpactRef = useRef(0)
  // Track the previous isBeat value to detect rising edge (false → true)
  const prevIsBeatRef = useRef(false)
  const animFrameRef = useRef(null)

  // ── Extract color palette ──────────────────────────────────────────────
  useEffect(() => {
    if (albumArtUrl) {
      // Try to extract palette from the actual album art image
      extractPalette(albumArtUrl, 6).then(setPalette)
    } else if (analysisData?.chroma) {
      // No album art → derive palette from musical key (chroma data)
      setPalette(paletteFromChroma(analysisData.chroma))
    }
  }, [albumArtUrl, analysisData])

  // ── Update song progress + warp intensity when time changes ───────────
  useEffect(() => {
    if (!analysisData?.duration || currentTime < 0) return

    const progress = Math.min(currentTime / analysisData.duration, 1)
    setSongProgress(progress)

    // Warp intensity combines the song's age (slow build) with beat impact (spikes)
    const intensity = computeWarpIntensity(progress, beatImpactRef.current)
    setWarpIntensity(intensity)
  }, [currentTime, analysisData])

  // ── Detect beat rising edge → spike beatImpact ─────────────────────────
  useEffect(() => {
    const wasOnBeat = prevIsBeatRef.current
    prevIsBeatRef.current = isBeat

    if (isBeat && !wasOnBeat) {
      // Rising edge: start of a new beat → spike to 1.0
      beatImpactRef.current = 1.0
    }
  }, [isBeat])

  // ── Decay loop: beatImpact fades exponentially each frame ──────────────
  // This runs independently of the audio/analysis effects above.
  // Using requestAnimationFrame ensures it's synced to the display refresh rate.
  const decay = useCallback(() => {
    beatImpactRef.current *= 0.90  // 10% decay per frame → fades in ~20 frames
    setBeatImpact(beatImpactRef.current)
    animFrameRef.current = requestAnimationFrame(decay)
  }, [])

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(decay)
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [decay])

  return {
    songProgress,
    warpIntensity,
    beatImpact,
    palette,
  }
}
