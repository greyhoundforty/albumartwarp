/**
 * components/FileUpload.jsx — Local file upload dropzone.
 *
 * Accepts:
 *   - An audio file (required): MP3, WAV, FLAC, OGG, AAC, M4A
 *   - An album art image (optional): any image format
 *
 * Supports both click-to-browse and drag-and-drop.
 * Shows a preview of the album art image if one is selected.
 */

import { useState, useRef, useCallback } from 'react'
import './FileUpload.css'

const AUDIO_ACCEPT = 'audio/mpeg,audio/wav,audio/x-wav,audio/flac,audio/x-flac,audio/ogg,audio/aac,audio/mp4,audio/x-m4a,.mp3,.wav,.flac,.ogg,.aac,.m4a'
const IMAGE_ACCEPT = 'image/*'

/**
 * @param {Object} props
 * @param {Function} props.onUpload   - (audioFile: File, albumArtFile: File|null) => void
 * @param {boolean}  props.isLoading  - Show spinner while uploading
 */
export default function FileUpload({ onUpload, isLoading }) {
  const [audioFile, setAudioFile] = useState(null)
  const [artFile, setArtFile] = useState(null)
  const [artPreview, setArtPreview] = useState(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const audioInputRef = useRef(null)
  const artInputRef = useRef(null)

  // ── File selection handlers ───────────────────────────────────────────
  const handleAudioChange = (e) => {
    const file = e.target.files?.[0]
    if (file) setAudioFile(file)
  }

  const handleArtChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setArtFile(file)
      // Create a local object URL for the preview image
      setArtPreview(URL.createObjectURL(file))
    }
  }

  // ── Drag and drop ─────────────────────────────────────────────────────
  const handleDragOver = useCallback((e) => {
    e.preventDefault()  // Required to allow drop
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    const audio = files.find((f) => f.type.startsWith('audio/'))
    const image = files.find((f) => f.type.startsWith('image/'))

    if (audio) setAudioFile(audio)
    if (image) {
      setArtFile(image)
      setArtPreview(URL.createObjectURL(image))
    }
  }, [])

  // ── Submit ────────────────────────────────────────────────────────────
  const handleSubmit = (e) => {
    e.preventDefault()
    if (!audioFile) return
    onUpload(audioFile, artFile)
  }

  return (
    <form className="file-upload" onSubmit={handleSubmit}>
      {/* ── Drop zone ───────────────────────────────────────────────── */}
      <div
        className={`file-upload__dropzone ${isDragOver ? 'file-upload__dropzone--active' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => audioInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && audioInputRef.current?.click()}
        aria-label="Drop audio file or click to browse"
      >
        {audioFile ? (
          <div className="file-upload__selected">
            <span className="file-upload__icon">🎵</span>
            <span className="file-upload__filename">{audioFile.name}</span>
            <span className="file-upload__size">
              {(audioFile.size / 1024 / 1024).toFixed(1)} MB
            </span>
          </div>
        ) : (
          <div className="file-upload__prompt">
            <span className="file-upload__icon">🎵</span>
            <p>Drop an audio file here, or click to browse</p>
            <p className="file-upload__hint">MP3 · WAV · FLAC · OGG · M4A</p>
          </div>
        )}

        {/* Hidden native file inputs */}
        <input
          ref={audioInputRef}
          type="file"
          accept={AUDIO_ACCEPT}
          onChange={handleAudioChange}
          className="file-upload__hidden-input"
          aria-label="Select audio file"
        />
      </div>

      {/* ── Optional album art ────────────────────────────────────────── */}
      <div className="file-upload__art-row">
        <button
          type="button"
          className="file-upload__art-btn"
          onClick={() => artInputRef.current?.click()}
        >
          {artPreview ? '🖼 Change album art' : '🖼 Add album art (optional)'}
        </button>

        {artPreview && (
          <img src={artPreview} alt="Album art preview" className="file-upload__art-preview" />
        )}

        <input
          ref={artInputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          onChange={handleArtChange}
          className="file-upload__hidden-input"
          aria-label="Select album art image"
        />
      </div>

      {/* ── Submit button ─────────────────────────────────────────────── */}
      <button
        type="submit"
        className="file-upload__submit"
        disabled={!audioFile || isLoading}
      >
        {isLoading ? (
          <span className="file-upload__loading">Analyzing audio…</span>
        ) : (
          'Visualize ▶'
        )}
      </button>
    </form>
  )
}
