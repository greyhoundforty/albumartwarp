/**
 * hooks/useAudioAnalyzer.js — Web Audio API integration hook.
 *
 * Sets up the audio processing graph:
 *
 *   <audio> element
 *       ↓
 *   MediaElementSourceNode   (connects HTML audio to Web Audio graph)
 *       ↓
 *   AnalyserNode             (provides real-time frequency + waveform data)
 *       ↓
 *   AudioContext.destination (speakers)
 *
 * The AnalyserNode is queried every animation frame to get live audio data.
 *
 * IMPORTANT: AudioContext requires a user gesture to start (browser policy).
 * We create it lazily on the first "play" event.
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import { computeRMS, isNearBeat } from '../utils/audioUtils.js'

/**
 * @typedef {Object} AudioAnalyzerResult
 * @property {React.RefObject<HTMLAudioElement>} audioRef - The audio element ref.
 * @property {boolean} isPlaying
 * @property {number} currentTime - Playback position in seconds.
 * @property {number} duration    - Total track duration in seconds.
 * @property {number} energy      - Real-time RMS energy (0–~0.5).
 * @property {boolean} isBeat     - True when within ~60ms of a beat timestamp.
 * @property {Function} play
 * @property {Function} pause
 * @property {Function} seek      - (seconds: number) => void
 */

/**
 * @param {string|null} audioUrl       - URL of the audio file to load.
 * @param {Object|null} analysisData   - Pre-computed analysis from the backend.
 * @returns {AudioAnalyzerResult}
 */
export function useAudioAnalyzer(audioUrl, analysisData) {
  // Refs hold mutable values that don't trigger re-renders
  const audioRef = useRef(null)      // The <audio> element
  const audioCtxRef = useRef(null)   // AudioContext (created on first play)
  const analyserRef = useRef(null)   // AnalyserNode
  const animFrameRef = useRef(null)  // requestAnimationFrame handle

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [energy, setEnergy] = useState(0)
  const [isBeat, setIsBeat] = useState(false)

  // ── Setup audio element ──────────────────────────────────────────────────
  useEffect(() => {
    if (!audioUrl) return

    // Create a new Audio element and point it at the uploaded file URL
    const audio = new Audio(audioUrl)
    audio.crossOrigin = 'anonymous'
    audioRef.current = audio

    // Update duration once metadata is loaded
    const onLoaded = () => setDuration(audio.duration)
    const onEnded = () => setIsPlaying(false)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('ended', onEnded)

    // Cleanup: stop audio and remove listeners when component unmounts
    // or when audioUrl changes
    return () => {
      audio.pause()
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('ended', onEnded)
      audioCtxRef.current?.close()
      audioCtxRef.current = null
      analyserRef.current = null
    }
  }, [audioUrl])

  // ── Web Audio API setup (lazy, runs on first play) ───────────────────────
  const initAudioContext = useCallback(() => {
    // Only create once — AudioContext creation is expensive
    if (audioCtxRef.current || !audioRef.current) return

    // AudioContext: the central object for all Web Audio API operations
    const ctx = new AudioContext()
    audioCtxRef.current = ctx

    // MediaElementSourceNode: wraps the <audio> element so Web Audio can
    // intercept the audio stream and pass it through our graph
    const source = ctx.createMediaElementSource(audioRef.current)

    // AnalyserNode: non-destructive tap in the signal chain that gives us
    // access to frequency and time-domain data for visualization
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256      // 128 frequency bins (fftSize / 2)
    analyser.smoothingTimeConstant = 0.75  // 0=jumpy, 1=very smooth

    // Connect the graph: source → analyser → speakers
    source.connect(analyser)
    analyser.connect(ctx.destination)

    analyserRef.current = analyser
  }, [])

  // ── Real-time animation loop ─────────────────────────────────────────────
  useEffect(() => {
    // Buffer that AnalyserNode fills with time-domain waveform data
    // Size = fftSize (set in initAudioContext above)
    const timeDomainBuffer = new Float32Array(256)

    const tick = () => {
      animFrameRef.current = requestAnimationFrame(tick)

      const audio = audioRef.current
      const analyser = analyserRef.current

      if (audio) {
        setCurrentTime(audio.currentTime)
      }

      // Only query analyser if Web Audio is initialized (i.e. after first play)
      if (analyser) {
        // Fill buffer with waveform samples (values in [-1, 1])
        analyser.getFloatTimeDomainData(timeDomainBuffer)

        // RMS = proxy for instantaneous loudness
        const rms = computeRMS(timeDomainBuffer)
        setEnergy(rms)
      }

      // Beat detection: compare current time to pre-computed beat timestamps
      // We use a 60ms window — wider than one frame (16ms) to catch beats
      // even if the animation frame doesn't land exactly on the beat time
      if (analysisData?.beat_times && audioRef.current) {
        const t = audioRef.current.currentTime
        setIsBeat(isNearBeat(analysisData.beat_times, t, 60))
      }
    }

    // Start the loop
    animFrameRef.current = requestAnimationFrame(tick)

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [analysisData]) // re-run only if analysis data changes

  // ── Playback controls ────────────────────────────────────────────────────

  const play = useCallback(async () => {
    if (!audioRef.current) return
    initAudioContext() // Create AudioContext on first play (user gesture)

    // Resume AudioContext if it was suspended (browser requires this)
    if (audioCtxRef.current?.state === 'suspended') {
      await audioCtxRef.current.resume()
    }

    await audioRef.current.play()
    setIsPlaying(true)
  }, [initAudioContext])

  const pause = useCallback(() => {
    audioRef.current?.pause()
    setIsPlaying(false)
  }, [])

  /**
   * Jump to a specific position in the track.
   * @param {number} seconds
   */
  const seek = useCallback((seconds) => {
    if (!audioRef.current) return
    audioRef.current.currentTime = Math.max(0, Math.min(seconds, duration))
    setCurrentTime(audioRef.current.currentTime)
  }, [duration])

  return {
    audioRef,
    isPlaying,
    currentTime,
    duration,
    energy,
    isBeat,
    play,
    pause,
    seek,
  }
}
