/**
 * components/Visualizer.jsx — Main visualization canvas.
 *
 * Visual layer stack (bottom → top):
 *   1. Album art image  — with SVG feTurbulence displacement warp (GPU)
 *   2. Color overlay    — slowly drifting color blobs (Canvas 2D)
 *   3. Particle system  — beat-synchronized burst particles (Canvas 2D)
 *   4. Beat flash       — quick white flash on beat (CSS opacity)
 *   5. Controls UI      — play/pause/seek overlaid on top
 *
 * The SVG filter approach:
 *   An SVG <filter> with <feTurbulence> + <feDisplacementMap> is applied
 *   to the album art <img> via CSS `filter: url(#warp-filter)`.
 *   We update the filter attributes every animation frame (rAF) to animate
 *   the warp. This runs on the GPU and is very smooth (no Canvas pixel ops).
 *
 *   - baseFrequency controls the "scale" of the noise (lower = bigger waves)
 *   - scale on feDisplacementMap controls max pixel displacement
 *   - seed changes the noise pattern (we change it on beats for a glitch effect)
 */

import { useRef, useEffect, useCallback, useState } from 'react'
import { useAudioAnalyzer } from '../hooks/useAudioAnalyzer.js'
import { useVisualization } from '../hooks/useVisualization.js'
import {
  createParticleSystem,
  spawnBeatBurst,
  updateAndDrawParticles,
  generateDefaultAlbumArt,
  drawColorOverlay,
} from '../utils/visualUtils.js'
import Controls from './Controls.jsx'
import './Visualizer.css'

/**
 * @param {Object} props
 * @param {string} props.audioUrl      - URL for audio playback (from backend).
 * @param {Object} props.analysisData  - Full analysis from backend.
 * @param {string|null} props.albumArtUrl - URL or object URL for album art image.
 */
export default function Visualizer({ audioUrl, analysisData, albumArtUrl }) {
  // ── DOM refs (no state, no re-renders) ─────────────────────────────────
  const albumImgRef = useRef(null)        // Album art <img> element
  const particleCanvasRef = useRef(null)  // Canvas for particle system
  const overlayCanvasRef = useRef(null)   // Canvas for color blobs
  const turbulenceRef = useRef(null)      // SVG <feTurbulence> element
  const displacementRef = useRef(null)    // SVG <feDisplacementMap> element
  const beatFlashRef = useRef(null)       // Beat flash overlay <div>
  const particleSysRef = useRef(null)     // Particle system state

  // ── Hooks ───────────────────────────────────────────────────────────────
  const {
    // audioRef is managed internally by the hook via new Audio() — not used in JSX
    isPlaying,
    currentTime,
    duration,
    energy,
    isBeat,
    play,
    pause,
    seek,
  } = useAudioAnalyzer(audioUrl, analysisData)

  const {
    warpIntensity,
    beatImpact,
    palette,
    songProgress,
  } = useVisualization(analysisData, currentTime, isBeat, albumArtUrl)

  // ── Effective album art URL ─────────────────────────────────────────────
  // If no album art was uploaded, generate one from the chroma data
  const [effectiveAlbumArt, setEffectiveAlbumArt] = useState(albumArtUrl)
  useEffect(() => {
    if (albumArtUrl) {
      setEffectiveAlbumArt(albumArtUrl)
    } else if (analysisData?.chroma) {
      setEffectiveAlbumArt(generateDefaultAlbumArt(analysisData.chroma))
    }
  }, [albumArtUrl, analysisData])

  // ── Initialize particle system ──────────────────────────────────────────
  useEffect(() => {
    particleSysRef.current = createParticleSystem()
  }, [])

  // ── SVG filter animation ────────────────────────────────────────────────
  // This effect runs whenever warpIntensity or beatImpact changes.
  // It updates the SVG filter attributes to warp the album art.
  useEffect(() => {
    if (!turbulenceRef.current || !displacementRef.current) return

    // Displacement scale: 0 = no warp, 150 = heavy warp
    // Beat impact temporarily bumps the scale for a "glitch" effect
    const scale = warpIntensity * 140 + beatImpact * 70

    // Turbulence frequency: lower = larger, smoother waves
    // Increases slightly as the song progresses
    const freq = 0.006 + warpIntensity * 0.028

    turbulenceRef.current.setAttribute('baseFrequency', `${freq.toFixed(4)} ${(freq * 1.4).toFixed(4)}`)
    displacementRef.current.setAttribute('scale', scale.toFixed(1))

    // On significant beat impacts, change the noise seed to create a visual "snap"
    if (beatImpact > 0.85) {
      const seed = Math.floor(Math.random() * 200)
      turbulenceRef.current.setAttribute('seed', String(seed))
    }
  }, [warpIntensity, beatImpact])

  // ── Beat flash ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (beatFlashRef.current) {
      beatFlashRef.current.style.opacity = (beatImpact * 0.25).toFixed(3)
    }
  }, [beatImpact])

  // ── Canvas animation loop ───────────────────────────────────────────────
  // Single rAF loop for both particle system and color overlay.
  const animFrameRef = useRef(null)
  const loopStateRef = useRef({ time: 0, prevBeatImpact: 0 })

  const animLoop = useCallback(() => {
    animFrameRef.current = requestAnimationFrame(animLoop)

    const particleCanvas = particleCanvasRef.current
    const overlayCanvas = overlayCanvasRef.current
    if (!particleCanvas || !overlayCanvas || !particleSysRef.current) return

    const w = particleCanvas.width
    const h = particleCanvas.height
    loopStateRef.current.time += 0.016 // ~60fps delta

    // Spawn particles on rising edge of beat impact
    const prevBI = loopStateRef.current.prevBeatImpact
    if (beatImpact > 0.85 && prevBI <= 0.85 && palette.length > 0) {
      spawnBeatBurst(particleSysRef.current, palette, Math.min(energy * 3, 1), w, h)
    }
    loopStateRef.current.prevBeatImpact = beatImpact

    // Update and draw particles
    const pCtx = particleCanvas.getContext('2d')
    if (pCtx) {
      updateAndDrawParticles(particleSysRef.current, pCtx, w, h)
    }

    // Draw color overlay (only visible after the song is underway)
    const oCtx = overlayCanvas.getContext('2d')
    if (oCtx && palette.length > 0) {
      drawColorOverlay(
        oCtx,
        palette,
        loopStateRef.current.time,
        songProgress * 0.6,  // max 60% opacity at song end
        energy,
        w,
        h,
      )
    }
  }, [beatImpact, energy, palette, songProgress])

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(animLoop)
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [animLoop])

  // ── Resize canvases to match container ─────────────────────────────────
  useEffect(() => {
    const resize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      for (const canvas of [particleCanvasRef.current, overlayCanvasRef.current]) {
        if (canvas) {
          canvas.width = w
          canvas.height = h
        }
      }
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="visualizer" data-testid="visualizer">
      {/* ── SVG filter definition (invisible, referenced by CSS filter below) */}
      {/* These SVG elements live in the DOM but take up no space            */}
      <svg className="visualizer__svg-defs" aria-hidden="true">
        <defs>
          <filter
            id="warp-filter"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
            colorInterpolationFilters="sRGB"
          >
            {/*
              feTurbulence generates Perlin / fractal noise.
              This noise texture is then used to displace pixels in feDisplacementMap.
              Animating baseFrequency and seed produces organic warping.
            */}
            <feTurbulence
              ref={turbulenceRef}
              id="warp-turbulence"
              type="turbulence"
              baseFrequency="0.006 0.008"
              numOctaves="4"
              seed="1"
              result="noise"
            />
            {/*
              feDisplacementMap shifts each pixel of SourceGraphic
              by an amount derived from the noise texture.
              scale=0 → no shift (clean image)
              scale=150 → heavy distortion (abstract)
            */}
            <feDisplacementMap
              ref={displacementRef}
              id="warp-displacement"
              in="SourceGraphic"
              in2="noise"
              scale="0"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      {/* ── Layer 1: Album art with warp filter ──────────────────────────── */}
      {effectiveAlbumArt && (
        <img
          ref={albumImgRef}
          src={effectiveAlbumArt}
          alt="Album art"
          className="visualizer__album-art"
          // CSS filter references the SVG filter by ID
          style={{ filter: 'url(#warp-filter)' }}
          crossOrigin="anonymous"
        />
      )}

      {/* ── Layer 2: Color overlay (mixes with album art) ────────────────── */}
      <canvas
        ref={overlayCanvasRef}
        className="visualizer__overlay"
        aria-hidden="true"
        style={{ mixBlendMode: 'overlay' }}
      />

      {/* ── Layer 3: Particle system (beat bursts) ────────────────────────── */}
      <canvas
        ref={particleCanvasRef}
        className="visualizer__particles"
        aria-hidden="true"
      />

      {/* ── Layer 4: Beat flash (white pulse on beat) ─────────────────────── */}
      <div
        ref={beatFlashRef}
        className="visualizer__beat-flash"
        aria-hidden="true"
      />

      {/* ── Layer 5: Player controls ──────────────────────────────────────── */}
      <Controls
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        onPlay={play}
        onPause={pause}
        onSeek={seek}
      />
    </div>
  )
}
