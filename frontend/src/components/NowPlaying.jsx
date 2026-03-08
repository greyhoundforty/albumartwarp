/**
 * components/NowPlaying.jsx — Small track info badge.
 *
 * Displayed in the top-right corner of the visualizer.
 * Shows the current track title and artist.
 * Fades out after a few seconds when the song is playing (like controls).
 */

import './NowPlaying.css'

/**
 * @param {Object} props
 * @param {string} props.title
 * @param {string} props.artist
 * @param {boolean} [props.visible=true]
 */
export default function NowPlaying({ title, artist, visible = true }) {
  if (!title) return null

  return (
    <div className={`now-playing ${visible ? 'now-playing--visible' : 'now-playing--hidden'}`}>
      <div className="now-playing__label">Now Playing</div>
      <div className="now-playing__title">{title}</div>
      {artist && <div className="now-playing__artist">{artist}</div>}
    </div>
  )
}
