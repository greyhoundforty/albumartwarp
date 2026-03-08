/**
 * tests/components/Visualizer.test.jsx
 *
 * Smoke tests for the Visualizer component.
 * We test that the component renders without crashing and that key
 * DOM elements are present. We don't test the actual visualization
 * (that would require a real browser + canvas).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import Visualizer from '../../src/components/Visualizer.jsx'

// ── Module mocks ────────────────────────────────────────────────────────────
// ColorThief ships as a CommonJS module and can't be `new`-ed inside jsdom
// (the default export isn't a constructor in that context).  We replace it
// with a lightweight stub that satisfies the interface used by colorExtractor.
vi.mock('colorthief', () => ({
  default: class ColorThief {
    // Returns an array of [r, g, b] tuples (the palette)
    getPalette() {
      return [
        [30, 50, 100],
        [200, 80, 60],
        [60, 180, 120],
      ]
    }
    // Returns a single [r, g, b] dominant colour
    getColor() {
      return [128, 100, 80]
    }
  },
}))

// Minimal analysis data — enough to prevent null-pointer errors in hooks
const mockAnalysis = {
  duration: 180.0,
  bpm: 120.0,
  beat_times: [0.5, 1.0, 1.5, 2.0, 2.5],
  energy: Array(100).fill(0.5),
  spectral_centroid: Array(100).fill(0.4),
  chroma: Array(12).fill(0.1),
  times: Array.from({ length: 100 }, (_, i) => i * 0.1),
  hop_length: 512,
  sample_rate: 22050,
}

describe('Visualizer', () => {
  beforeEach(() => {
    // Reset the mock fetch before each test
    vi.clearAllMocks()
    // Mock requestAnimationFrame so rAF loops don't run indefinitely
    vi.spyOn(global, 'requestAnimationFrame').mockImplementation((_cb) => {
      // Return a fake ID without calling _cb (prevents infinite loops in tests)
      return 1
    })
    vi.spyOn(global, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  it('renders without crashing', () => {
    render(
      <Visualizer
        audioUrl="http://localhost:8000/uploads/test.wav"
        analysisData={mockAnalysis}
        albumArtUrl={null}
      />
    )
    // If we get here without throwing, the component rendered
    expect(document.querySelector('[data-testid="visualizer"]')).toBeTruthy()
  })

  it('renders the visualizer container', () => {
    const { container } = render(
      <Visualizer
        audioUrl="http://localhost:8000/uploads/test.wav"
        analysisData={mockAnalysis}
        albumArtUrl={null}
      />
    )
    expect(container.querySelector('.visualizer')).toBeTruthy()
  })

  it('renders the SVG filter definitions', () => {
    const { container } = render(
      <Visualizer
        audioUrl="http://localhost:8000/uploads/test.wav"
        analysisData={mockAnalysis}
        albumArtUrl={null}
      />
    )
    expect(container.querySelector('svg')).toBeTruthy()
    expect(container.querySelector('#warp-filter')).toBeTruthy()
    expect(container.querySelector('#warp-turbulence')).toBeTruthy()
    expect(container.querySelector('#warp-displacement')).toBeTruthy()
  })

  it('renders play controls', () => {
    render(
      <Visualizer
        audioUrl="http://localhost:8000/uploads/test.wav"
        analysisData={mockAnalysis}
        albumArtUrl={null}
      />
    )
    // Controls should show a play button when paused
    const playBtn = screen.getByRole('button', { name: /play/i })
    expect(playBtn).toBeInTheDocument()
  })

  it('renders album art when albumArtUrl is provided', () => {
    const { container } = render(
      <Visualizer
        audioUrl="http://localhost:8000/uploads/test.wav"
        analysisData={mockAnalysis}
        albumArtUrl="https://example.com/art.jpg"
      />
    )
    const img = container.querySelector('.visualizer__album-art')
    expect(img).toBeTruthy()
    expect(img.src).toContain('example.com')
  })

  it('renders particle canvas', () => {
    const { container } = render(
      <Visualizer
        audioUrl="http://localhost:8000/uploads/test.wav"
        analysisData={mockAnalysis}
        albumArtUrl={null}
      />
    )
    expect(container.querySelector('.visualizer__particles')).toBeTruthy()
  })

  it('handles null analysisData gracefully', () => {
    // Should not throw even with minimal/null props
    expect(() => {
      render(
        <Visualizer
          audioUrl="http://localhost:8000/uploads/test.wav"
          analysisData={null}
          albumArtUrl={null}
        />
      )
    }).not.toThrow()
  })
})
