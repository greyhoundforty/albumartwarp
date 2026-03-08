/**
 * App.jsx — Root component and application state machine.
 *
 * States:
 *   idle     → User sees upload form + search bar (no track loaded)
 *   loading  → File is being uploaded and analyzed by the backend
 *   playing  → Track loaded, Visualizer is showing
 *
 * The track object holds everything the Visualizer needs:
 *   { audioUrl, albumArtUrl, title, artist, analysisData }
 */

import { useState } from 'react'
import SearchBar from './components/SearchBar.jsx'
import FileUpload from './components/FileUpload.jsx'
import Visualizer from './components/Visualizer.jsx'
import NowPlaying from './components/NowPlaying.jsx'
import { uploadAudio } from './services/api.js'
import './App.css'

export default function App() {
  // `track` is null when no song is loaded, or an object when a song is ready
  const [track, setTrack] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * Called by FileUpload when the user submits a file.
   * Uploads the audio to the backend, gets analysis data, loads the player.
   *
   * @param {File} audioFile    - The audio file to upload
   * @param {File|null} artFile - Optional album art image
   */
  const handleFileUpload = async (audioFile, artFile) => {
    setIsLoading(true)
    setError(null)

    try {
      // Send audio to backend — returns { audio_url, filename, analysis }
      const result = await uploadAudio(audioFile)

      // Create a local object URL for the album art so the browser can
      // display it without needing to re-upload it to the server
      const albumArtUrl = artFile ? URL.createObjectURL(artFile) : null

      // Strip extension from filename for a cleaner display title
      const title = audioFile.name.replace(/\.[^/.]+$/, '')

      setTrack({
        audioUrl: result.audio_url,
        albumArtUrl,
        title,
        artist: 'Unknown Artist',
        analysisData: result.analysis,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Reset back to the upload/search screen.
   * Revokes any object URLs we created to prevent memory leaks.
   */
  const handleBackToUpload = () => {
    if (track?.albumArtUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(track.albumArtUrl)
    }
    setTrack(null)
    setError(null)
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* Sticky header — always visible */}
      <header className="app-header">
        <h1>AlbumArtWarp</h1>
        <p>Music visualization that warps with the beat</p>
      </header>

      <main className="app-main">
        {track ? (
          /* ── Player view ─────────────────────────────────────────────── */
          <div className="player-section">
            <Visualizer
              audioUrl={track.audioUrl}
              analysisData={track.analysisData}
              albumArtUrl={track.albumArtUrl}
            />

            <NowPlaying title={track.title} artist={track.artist} />

            {/* Back button to return to upload screen */}
            <button
              className="back-btn"
              onClick={handleBackToUpload}
              aria-label="Choose another track"
            >
              ← Choose another track
            </button>
          </div>
        ) : (
          /* ── Upload / search view ─────────────────────────────────────── */
          <div className="upload-section">
            {/* Last.fm search (stub until API key is configured) */}
            <SearchBar onTrackSelect={setTrack} />

            {/* Visual separator between search and upload sections */}
            <div className="divider" aria-hidden="true">or upload a file</div>

            {/* Local file upload */}
            <FileUpload onUpload={handleFileUpload} isLoading={isLoading} />

            {/* Error display */}
            {error && (
              <p className="error-message" role="alert">
                ⚠️ {error}
              </p>
            )}

            {/* Loading state */}
            {isLoading && (
              <div className="loading-spinner" role="status" aria-label="Analyzing audio…" />
            )}
          </div>
        )}
      </main>
    </div>
  )
}
