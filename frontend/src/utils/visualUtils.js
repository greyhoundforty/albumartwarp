/**
 * utils/visualUtils.js — Canvas drawing helpers and the Particle system.
 *
 * All functions here operate directly on a Canvas 2D context or plain data —
 * no React, no DOM queries — making them easy to test and reason about.
 */

import { colorToCSS } from '../services/colorExtractor.js'

// ── Particle System ────────────────────────────────────────────────────────

/**
 * Create a new empty particle system state.
 * Call this once when the Visualizer mounts.
 *
 * @returns {{ particles: Array }} Mutable state object passed to other functions.
 */
export function createParticleSystem() {
  return { particles: [] }
}

/**
 * Spawn a radial burst of particles at the canvas center.
 * Call this on each detected beat.
 *
 * @param {{ particles: Array }} sys  - Particle system state (mutated in place).
 * @param {Object[]} palette          - Array of { r, g, b } colors.
 * @param {number} energy             - Current audio energy (0–1), scales burst size.
 * @param {number} canvasW            - Canvas width in pixels.
 * @param {number} canvasH            - Canvas height in pixels.
 */
export function spawnBeatBurst(sys, palette, energy, canvasW, canvasH) {
  // Number of particles scales with energy: quiet beat → 10, loud beat → 40
  const count = Math.round(10 + energy * 30)
  const cx = canvasW / 2
  const cy = canvasH / 2

  for (let i = 0; i < count; i++) {
    // Spread particles evenly in a circle, with random jitter
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5
    const speed = (1.5 + Math.random() * 4) * (0.5 + energy)

    sys.particles.push({
      x: cx,
      y: cy,
      // Velocity components
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      // Life: 1.0 = fully alive, decays to 0 = dead
      life: 1.0,
      // Random decay rate → particles fade at different speeds
      decay: 0.012 + Math.random() * 0.018,
      // Radius scales with energy
      size: 2 + Math.random() * (4 * energy),
      // Random color from the extracted palette
      color: palette[Math.floor(Math.random() * palette.length)] || { r: 255, g: 255, b: 255 },
    })
  }
}

/**
 * Advance particle physics and draw all alive particles to the canvas.
 *
 * Call this once per animation frame (requestAnimationFrame).
 *
 * @param {{ particles: Array }} sys  - Particle system state (mutated in place).
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context to draw on.
 * @param {number} canvasW
 * @param {number} canvasH
 */
export function updateAndDrawParticles(sys, ctx, canvasW, canvasH) {
  // Clear the previous frame
  ctx.clearRect(0, 0, canvasW, canvasH)

  // Filter out dead particles first (avoids iterating over them)
  sys.particles = sys.particles.filter((p) => p.life > 0.01)

  for (const p of sys.particles) {
    // Physics: apply velocity and gentle gravity
    p.x += p.vx
    p.y += p.vy
    p.vy += 0.05 // gravity pulls particles down

    // Friction: slow down over time
    p.vx *= 0.98
    p.vy *= 0.98

    // Age the particle
    p.life -= p.decay

    // Draw: circular blob, fading out as life approaches 0
    ctx.globalAlpha = Math.max(0, p.life)
    ctx.fillStyle = colorToCSS(p.color)
    ctx.beginPath()
    // Size shrinks as life decreases
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2)
    ctx.fill()
  }

  // Reset globalAlpha so other drawing operations aren't affected
  ctx.globalAlpha = 1
}

// ── Default Album Art Generator ─────────────────────────────────────────────

/**
 * Generate a radial gradient image as a data URL, derived from chroma data.
 *
 * Used when no album art is uploaded. The dominant musical pitch class
 * determines the base hue, so the gradient is musically meaningful.
 *
 * @param {number[]} chromaData - 12-element chroma vector from backend.
 * @param {number} [size=500]   - Canvas size in pixels.
 * @returns {string} data URL (PNG) suitable for use as <img src="...">
 */
export function generateDefaultAlbumArt(chromaData, size = 500) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  let hue = 260 // default purple if no chroma data

  if (chromaData && chromaData.length === 12) {
    // Find the most active pitch class and map it to a hue (0°–360°)
    // Pitch classes: C=0°, C#=30°, D=60°, D#=90°, E=120°, F=150°,
    //                F#=180°, G=210°, G#=240°, A=270°, A#=300°, B=330°
    const maxIdx = chromaData.indexOf(Math.max(...chromaData))
    hue = (maxIdx * 30) % 360
  }

  // Three-stop radial gradient: bright center → mid → dark edge
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,     // inner circle center + radius
    size / 2, size / 2, size / 1.5, // outer circle center + radius
  )
  gradient.addColorStop(0,   `hsl(${hue}, 80%, 65%)`)
  gradient.addColorStop(0.5, `hsl(${(hue + 120) % 360}, 70%, 30%)`)
  gradient.addColorStop(1,   `hsl(${(hue + 240) % 360}, 60%, 8%)`)

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  // Add subtle concentric rings for visual interest
  ctx.strokeStyle = `hsla(${hue}, 100%, 80%, 0.15)`
  ctx.lineWidth = 1
  for (let r = size * 0.1; r < size; r += size * 0.15) {
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2)
    ctx.stroke()
  }

  return canvas.toDataURL('image/png')
}

// ── Color overlay ──────────────────────────────────────────────────────────

/**
 * Draw slowly-drifting color blobs on a canvas, blended as color overlay.
 *
 * This layer becomes visible as the song progresses and the album art
 * fades into abstraction. The blobs pulse with the energy level.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object[]} palette     - Array of { r, g, b } colors.
 * @param {number} time          - Current animation time (e.g. performance.now() / 1000).
 * @param {number} intensity     - 0–1, how opaque the overlay is.
 * @param {number} energy        - 0–1, pulsing factor.
 * @param {number} w             - Canvas width.
 * @param {number} h             - Canvas height.
 */
export function drawColorOverlay(ctx, palette, time, intensity, energy, w, h) {
  if (intensity < 0.01 || palette.length === 0) return

  ctx.clearRect(0, 0, w, h)

  // Draw 3 large, slow-moving color blobs per palette color (up to 3 colors)
  const colors = palette.slice(0, 3)
  colors.forEach((color, i) => {
    // Each blob orbits the center at a different speed and radius
    const speed = 0.15 + i * 0.07
    const orbitR = Math.min(w, h) * (0.2 + i * 0.1)
    const blobX = w / 2 + Math.cos(time * speed + i * 2.1) * orbitR
    const blobY = h / 2 + Math.sin(time * speed * 0.7 + i * 1.3) * orbitR
    const blobR = Math.min(w, h) * (0.3 + energy * 0.15)

    const gradient = ctx.createRadialGradient(blobX, blobY, 0, blobX, blobY, blobR)
    gradient.addColorStop(0,   colorToCSS(color, intensity * 0.5))
    gradient.addColorStop(1,   colorToCSS(color, 0))

    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)
  })
}
