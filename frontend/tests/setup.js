/**
 * tests/setup.js — Global test setup for Vitest + React Testing Library.
 *
 * This file runs once before each test file (configured in vite.config.js).
 * We use it to:
 *   1. Import @testing-library/jest-dom matchers (adds toBeInTheDocument, etc.)
 *   2. Mock browser APIs not available in jsdom (AudioContext, canvas, etc.)
 *   3. Suppress expected console warnings
 */

import '@testing-library/jest-dom'
import { vi } from 'vitest'

// ── Mock Web Audio API ────────────────────────────────────────────────────
// jsdom doesn't implement AudioContext, so we mock the parts our hooks use.
// vi.fn() creates a mock function that records calls and can return values.

const mockAnalyser = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  getFloatFrequencyData: vi.fn(),
  getFloatTimeDomainData: vi.fn((buf) => buf.fill(0)), // fill with silence
  frequencyBinCount: 128,
  fftSize: 256,
  smoothingTimeConstant: 0.8,
}

const mockSource = {
  connect: vi.fn(),
  disconnect: vi.fn(),
}

global.AudioContext = vi.fn().mockImplementation(() => ({
  createAnalyser: vi.fn().mockReturnValue(mockAnalyser),
  createMediaElementSource: vi.fn().mockReturnValue(mockSource),
  destination: {},
  state: 'running',
  resume: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
}))

// Some browsers expose AudioContext under a vendor prefix
global.webkitAudioContext = global.AudioContext

// ── Mock HTMLMediaElement (audio/video playback) ───────────────────────────
// jsdom stubs these but they don't work — override with controllable mocks.
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
})
Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  value: vi.fn(),
})
Object.defineProperty(HTMLMediaElement.prototype, 'load', {
  configurable: true,
  value: vi.fn(),
})

// ── Mock Canvas 2D context ────────────────────────────────────────────────
// jsdom has a stub canvas but getContext() returns null.
// We return a basic mock with the methods our visualUtils use.
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  arc: vi.fn(),
  beginPath: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  createRadialGradient: vi.fn().mockReturnValue({
    addColorStop: vi.fn(),
  }),
  createLinearGradient: vi.fn().mockReturnValue({
    addColorStop: vi.fn(),
  }),
  putImageData: vi.fn(),
  getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
  drawImage: vi.fn(),
  // Properties that visualUtils reads
  globalAlpha: 1,
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  canvas: { width: 800, height: 600 },
})

// Also mock toDataURL (used by generateDefaultAlbumArt)
HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/png;base64,mock')

// ── Mock fetch (used by api.js) ───────────────────────────────────────────
// Tests that need specific responses can override this per-test with vi.fn()
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: vi.fn().mockResolvedValue({}),
})

// ── Suppress specific expected warnings ───────────────────────────────────
// React renders twice in StrictMode in tests — these warnings are expected.
const originalWarn = console.warn
console.warn = (...args) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('Color extraction failed') ||
      args[0].includes('Could not load image'))
  ) {
    return // suppress these expected warnings in tests
  }
  originalWarn(...args)
}
