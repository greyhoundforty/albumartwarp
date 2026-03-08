/**
 * services/colorExtractor.js — Extract dominant colors from an image.
 *
 * Uses the ColorThief library, which implements a median cut algorithm
 * to find the N most visually distinct colors in an image.
 *
 * The palette drives:
 *   - Particle colors (beat bursts use palette colors)
 *   - Color overlay blobs (blended over the warped album art)
 *   - Default gradient when no album art is available
 *
 * Cross-origin note:
 *   For externally-hosted images (e.g. Last.fm URLs), the image server must
 *   send CORS headers (Access-Control-Allow-Origin: *). Without them, the
 *   canvas-based color extraction will throw a SecurityError. We catch this
 *   and return a fallback palette.
 */

import ColorThief from 'colorthief'

const colorThief = new ColorThief()

/**
 * @typedef {{ r: number, g: number, b: number }} Color
 */

/**
 * Extract the dominant color palette from an image URL.
 *
 * @param {string} imageUrl - URL of the image to analyze.
 * @param {number} [colorCount=6] - Number of colors to extract (2–10).
 * @returns {Promise<Color[]>} Array of { r, g, b } objects.
 */
export async function extractPalette(imageUrl, colorCount = 6) {
  // If no URL provided, return the default dark-rainbow palette right away
  if (!imageUrl) {
    return getDefaultPalette()
  }

  return new Promise((resolve) => {
    const img = new Image()
    // crossOrigin must be set BEFORE setting src, otherwise the browser
    // sends the request without CORS headers and caches the non-CORS version
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      try {
        // getPalette returns [[r,g,b], ...] arrays — convert to {r,g,b} objects
        const raw = colorThief.getPalette(img, colorCount)
        resolve(raw.map(([r, g, b]) => ({ r, g, b })))
      } catch (err) {
        // This fires on cross-origin security errors or canvas issues
        console.warn('Color extraction failed, using fallback palette:', err.message)
        resolve(getDefaultPalette())
      }
    }

    img.onerror = () => {
      console.warn('Could not load image for color extraction:', imageUrl)
      resolve(getDefaultPalette())
    }

    img.src = imageUrl
  })
}

/**
 * Generate a color palette from chroma data (music pitch class analysis).
 *
 * Used when no album art is available. Maps the 12 musical pitch classes
 * (C, C#, D, ..., B) to hues around the color wheel.
 *
 * @param {number[]} chromaData - 12-element array from backend analysis.
 * @returns {Color[]} Array of 6 { r, g, b } colors.
 */
export function paletteFromChroma(chromaData) {
  if (!chromaData || chromaData.length !== 12) {
    return getDefaultPalette()
  }

  // Find the 3 most active pitch classes (highest chroma values)
  const indexed = chromaData.map((v, i) => ({ v, i }))
  indexed.sort((a, b) => b.v - a.v)
  const topNotes = indexed.slice(0, 3).map((x) => x.i)

  // Each pitch class maps to a hue: C=0°, C#=30°, D=60°, ... B=330°
  const colors = []
  for (const note of topNotes) {
    const hue = (note * 30) % 360
    // Generate two variations per note: bright + muted
    colors.push(hslToRgb(hue, 0.8, 0.6))
    colors.push(hslToRgb((hue + 20) % 360, 0.6, 0.3))
  }
  return colors
}

/**
 * Convert a { r, g, b } color to a CSS rgba() string.
 *
 * @param {Color} color
 * @param {number} [alpha=1] - Opacity 0–1
 * @returns {string} e.g. "rgba(255, 100, 50, 0.8)"
 */
export function colorToCSS({ r, g, b }, alpha = 1) {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Interpolate between two colors at position t (0=a, 1=b).
 *
 * @param {Color} a
 * @param {Color} b
 * @param {number} t - 0 to 1
 * @returns {Color}
 */
export function lerpColor(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  }
}

// ── Private helpers ────────────────────────────────────────────────────────

/**
 * Dark violet-to-teal fallback palette — looks good even without album art.
 * @returns {Color[]}
 */
function getDefaultPalette() {
  return [
    { r: 30,  g: 0,   b: 120 },
    { r: 120, g: 0,   b: 180 },
    { r: 0,   g: 80,  b: 200 },
    { r: 0,   g: 180, b: 160 },
    { r: 180, g: 60,  b: 0   },
    { r: 220, g: 220, b: 255 },
  ]
}

/**
 * Convert HSL to RGB. All inputs/outputs 0–255 range for r/g/b,
 * hue 0–360, saturation/lightness 0–1.
 *
 * @param {number} h - Hue (0–360)
 * @param {number} s - Saturation (0–1)
 * @param {number} l - Lightness (0–1)
 * @returns {Color}
 */
function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l)
  const f = (n) => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
  }
  return {
    r: Math.round(f(0) * 255),
    g: Math.round(f(8) * 255),
    b: Math.round(f(4) * 255),
  }
}
