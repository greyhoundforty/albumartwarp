/**
 * utils/audioUtils.js — Helper functions for audio timing and analysis.
 *
 * These are pure utility functions (no React, no DOM) so they're easy to
 * unit-test and reuse in both hooks and components.
 */

/**
 * Given a list of beat timestamps (seconds) and a current playback position,
 * return true if we're within `windowMs` milliseconds of any beat.
 *
 * This is how we detect "is the music on a beat right now?" for visual effects.
 *
 * @param {number[]} beatTimes - Sorted array of beat timestamps in seconds.
 * @param {number} currentTime - Current audio playback time in seconds.
 * @param {number} [windowMs=60] - Detection window in milliseconds.
 * @returns {boolean}
 */
export function isNearBeat(beatTimes, currentTime, windowMs = 60) {
  const windowSec = windowMs / 1000
  // Binary search would be O(log n) but for typical beat arrays (< 500 items)
  // a linear .some() is fast enough and much simpler to read
  return beatTimes.some((bt) => Math.abs(bt - currentTime) < windowSec)
}

/**
 * Find the index into the `times` array that's closest to `currentTime`.
 *
 * Use this to index into the pre-computed energy/spectral_centroid arrays:
 *   const frameIdx = findFrameIndex(analysis.times, audio.currentTime)
 *   const energy   = analysis.energy[frameIdx]
 *
 * @param {number[]} times - Sorted array of frame timestamps in seconds.
 * @param {number} currentTime - Current playback time in seconds.
 * @returns {number} Index into the times array (clamped to valid range).
 */
export function findFrameIndex(times, currentTime) {
  if (!times || times.length === 0) return 0
  // Clamp to array bounds first
  if (currentTime <= times[0]) return 0
  if (currentTime >= times[times.length - 1]) return times.length - 1

  // Binary search for the closest frame
  let lo = 0
  let hi = times.length - 1

  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1 // integer division by 2
    if (times[mid] <= currentTime) {
      lo = mid
    } else {
      hi = mid
    }
  }

  // Return whichever neighbor is closer
  const distLo = Math.abs(times[lo] - currentTime)
  const distHi = Math.abs(times[hi] - currentTime)
  return distLo <= distHi ? lo : hi
}

/**
 * Calculate instantaneous energy (RMS) from a Web Audio time-domain buffer.
 *
 * analyserNode.getFloatTimeDomainData() fills a Float32Array with
 * waveform samples in the range [-1, 1]. RMS (root mean square) gives
 * a good measure of loudness/energy.
 *
 * @param {Float32Array} timeDomainData - Raw waveform samples from AnalyserNode.
 * @returns {number} RMS energy value, typically 0–0.5 range.
 */
export function computeRMS(timeDomainData) {
  let sum = 0
  for (let i = 0; i < timeDomainData.length; i++) {
    sum += timeDomainData[i] * timeDomainData[i]
  }
  return Math.sqrt(sum / timeDomainData.length)
}

/**
 * Compute normalized warp intensity for a given song progress.
 *
 * The curve is:
 *   - Starts at 0 when the song begins
 *   - Grows quickly at first (sqrt curve), then plateaus
 *   - Max value ~0.9 (album art never fully disappears)
 *   - beatImpact adds an instantaneous spike on beat hits
 *
 * @param {number} songProgress - 0 to 1 (currentTime / duration)
 * @param {number} beatImpact   - 0 to 1 (decaying value from last beat)
 * @returns {number} warpIntensity, 0–1
 */
export function computeWarpIntensity(songProgress, beatImpact) {
  // sqrt gives a faster initial ramp-up: at 25% through the song you're
  // already at 50% warp intensity — early and mid-song feel exciting
  const baseWarp = Math.sqrt(Math.min(songProgress, 1)) * 0.85
  // Beat impact contributes up to 15% extra warp
  return Math.min(baseWarp + beatImpact * 0.15, 1.0)
}

/**
 * Format a time in seconds as "m:ss".
 *
 * @param {number} seconds
 * @returns {string} e.g. "3:47"
 */
export function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
