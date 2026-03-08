/**
 * tests/services/api.test.js — Unit tests for the API service module.
 *
 * We mock global.fetch so no real HTTP requests are made.
 * Tests verify that the functions build the right request and parse
 * the response correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { uploadAudio, searchTracks, checkHealth } from '../../src/services/api.js'

// Helper: create a mock File object (not a real File API, but close enough)
function makeFile(name, type, content = 'test content') {
  return new File([content], name, { type })
}

// Helper: create a mock fetch response
function mockResponse(body, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  })
}

describe('uploadAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls the correct endpoint', async () => {
    global.fetch = vi.fn().mockReturnValue(
      mockResponse({ audio_url: 'http://localhost/uploads/test.wav', filename: 'test.wav', analysis: {} })
    )

    const file = makeFile('song.wav', 'audio/wav')
    await uploadAudio(file)

    expect(global.fetch).toHaveBeenCalledOnce()
    const [url] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/audio/upload')
  })

  it('sends a POST request', async () => {
    global.fetch = vi.fn().mockReturnValue(
      mockResponse({ audio_url: '', filename: '', analysis: {} })
    )

    const file = makeFile('song.wav', 'audio/wav')
    await uploadAudio(file)

    const [, options] = global.fetch.mock.calls[0]
    expect(options.method).toBe('POST')
  })

  it('sends FormData as the request body', async () => {
    global.fetch = vi.fn().mockReturnValue(
      mockResponse({ audio_url: '', filename: '', analysis: {} })
    )

    const file = makeFile('song.mp3', 'audio/mpeg')
    await uploadAudio(file)

    const [, options] = global.fetch.mock.calls[0]
    expect(options.body).toBeInstanceOf(FormData)
  })

  it('returns parsed JSON on success', async () => {
    const mockData = {
      audio_url: 'http://localhost:8000/uploads/abc.wav',
      filename: 'abc.wav',
      analysis: { bpm: 128.0, duration: 240, beat_times: [] },
    }
    global.fetch = vi.fn().mockReturnValue(mockResponse(mockData))

    const result = await uploadAudio(makeFile('test.wav', 'audio/wav'))
    expect(result.audio_url).toBe('http://localhost:8000/uploads/abc.wav')
    expect(result.analysis.bpm).toBe(128.0)
  })

  it('throws an error on non-OK response', async () => {
    global.fetch = vi.fn().mockReturnValue(
      mockResponse({ detail: 'Unsupported file type' }, false, 415)
    )

    await expect(uploadAudio(makeFile('doc.txt', 'text/plain'))).rejects.toThrow(
      'Unsupported file type'
    )
  })
})

describe('searchTracks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls the correct endpoint with query params', async () => {
    global.fetch = vi.fn().mockReturnValue(
      mockResponse({ query: 'radiohead', results: [], is_live: false })
    )

    await searchTracks('radiohead', 5)

    const [url] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/search/')
    expect(url).toContain('q=radiohead')
    expect(url).toContain('limit=5')
  })

  it('returns results array', async () => {
    const mockTracks = [
      { title: 'Karma Police', artist: 'Radiohead', album_art_url: null },
    ]
    global.fetch = vi.fn().mockReturnValue(
      mockResponse({ query: 'radiohead', results: mockTracks, is_live: false })
    )

    const result = await searchTracks('radiohead')
    expect(result.results).toHaveLength(1)
    expect(result.results[0].title).toBe('Karma Police')
  })

  it('throws on non-OK response', async () => {
    global.fetch = vi.fn().mockReturnValue(
      mockResponse({ detail: 'Search failed' }, false, 502)
    )

    await expect(searchTracks('test')).rejects.toThrow('Search failed')
  })
})

describe('checkHealth', () => {
  it('returns true when backend responds OK', async () => {
    global.fetch = vi.fn().mockReturnValue(mockResponse({ status: 'ok' }))
    const result = await checkHealth()
    expect(result).toBe(true)
  })

  it('returns false when fetch throws (network error)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))
    const result = await checkHealth()
    expect(result).toBe(false)
  })

  it('returns false on non-OK status', async () => {
    global.fetch = vi.fn().mockReturnValue(mockResponse({}, false, 503))
    const result = await checkHealth()
    expect(result).toBe(false)
  })
})
