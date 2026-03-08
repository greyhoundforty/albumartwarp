/**
 * services/api.js — HTTP client for the FastAPI backend.
 *
 * All fetch() calls live here so:
 *   - Components stay clean (no fetch logic mixed with JSX)
 *   - Easy to mock in tests (import this module and mock the functions)
 *   - Easy to swap backend URL (change API_BASE in one place)
 *
 * The Vite dev server proxies /api → http://localhost:8000/api,
 * so we use a relative URL here. In production, set VITE_API_BASE
 * in your environment to the deployed backend URL.
 */

const API_BASE = import.meta.env.VITE_API_BASE || ''

/**
 * Upload an audio file to the backend for analysis.
 *
 * @param {File} file - The audio file selected by the user.
 * @returns {Promise<{audio_url: string, filename: string, analysis: Object}>}
 * @throws {Error} if the server returns an error status.
 */
export async function uploadAudio(file) {
  // FormData is the standard way to send files over HTTP
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${API_BASE}/api/audio/upload`, {
    method: 'POST',
    body: formData,
    // Don't set Content-Type header — the browser sets it automatically
    // with the correct multipart boundary when using FormData
  })

  if (!response.ok) {
    // Try to parse the error detail from FastAPI's standard error format
    let detail = `Upload failed (HTTP ${response.status})`
    try {
      const err = await response.json()
      detail = err.detail || detail
    } catch {
      // If JSON parsing fails, keep the default message
    }
    throw new Error(detail)
  }

  return response.json()
}

/**
 * Search for tracks by query string.
 *
 * When LASTFM_API_KEY is configured on the backend, this returns real results.
 * Otherwise returns stub data (indicated by `is_live: false` in the response).
 *
 * @param {string} query - Search terms (artist name, song title, etc.)
 * @param {number} [limit=10] - Max results to return (1–50)
 * @returns {Promise<{query: string, results: Array, is_live: boolean}>}
 */
export async function searchTracks(query, limit = 10) {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  const response = await fetch(`${API_BASE}/api/search/?${params}`)

  if (!response.ok) {
    let detail = `Search failed (HTTP ${response.status})`
    try {
      const err = await response.json()
      detail = err.detail || detail
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(detail)
  }

  return response.json()
}

/**
 * Check if the backend is reachable.
 *
 * @returns {Promise<boolean>} true if backend responds, false otherwise.
 */
export async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) })
    return response.ok
  } catch {
    return false
  }
}
