/**
 * components/Controls.jsx — Playback controls overlay.
 *
 * Displayed over the visualizer at the bottom of the screen.
 * Shows play/pause button and a seek bar.
 *
 * The controls fade out after a few seconds of inactivity (like a video player).
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { formatTime } from '../utils/audioUtils.js'
import './Controls.css'

/**
 * @param {Object} props
 * @param {boolean} props.isPlaying
 * @param {number} props.currentTime  - Seconds
 * @param {number} props.duration     - Seconds
 * @param {Function} props.onPlay
 * @param {Function} props.onPause
 * @param {Function} props.onSeek     - (seconds: number) => void
 */
export default function Controls({ isPlaying, currentTime, duration, onPlay, onPause, onSeek }) {
  const [visible, setVisible] = useState(true)
  const hideTimerRef = useRef(null)

  // ── Auto-hide after 3s of no mouse movement ─────────────────────────────
  const showControls = useCallback(() => {
    setVisible(true)
    clearTimeout(hideTimerRef.current)
    // Only auto-hide when playing — keep visible when paused
    if (isPlaying) {
      hideTimerRef.current = setTimeout(() => setVisible(false), 3000)
    }
  }, [isPlaying])

  // Always show when paused
  useEffect(() => {
    if (!isPlaying) {
      setVisible(true)
      clearTimeout(hideTimerRef.current)
    }
  }, [isPlaying])

  useEffect(() => {
    window.addEventListener('mousemove', showControls)
    window.addEventListener('touchstart', showControls)
    return () => {
      window.removeEventListener('mousemove', showControls)
      window.removeEventListener('touchstart', showControls)
      clearTimeout(hideTimerRef.current)
    }
  }, [showControls])

  // ── Seek bar change ──────────────────────────────────────────────────────
  const handleSeek = (e) => {
    const fraction = Number(e.target.value) / 1000
    onSeek(fraction * duration)
  }

  // Progress as 0–1000 integer (range input step resolution)
  const progress = duration > 0 ? Math.round((currentTime / duration) * 1000) : 0

  return (
    <div
      className={`controls ${visible ? 'controls--visible' : 'controls--hidden'}`}
      onMouseEnter={showControls}
    >
      {/* Seek bar ─────────────────────────────────────────────────────── */}
      <div className="controls__seek-row">
        <span className="controls__time">{formatTime(currentTime)}</span>
        <input
          type="range"
          className="controls__seek"
          min="0"
          max="1000"
          value={progress}
          onChange={handleSeek}
          aria-label="Seek"
        />
        <span className="controls__time controls__time--right">{formatTime(duration)}</span>
      </div>

      {/* Play / Pause button ─────────────────────────────────────────── */}
      <div className="controls__buttons">
        <button
          className="controls__play-btn"
          onClick={isPlaying ? onPause : onPlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
      </div>
    </div>
  )
}
