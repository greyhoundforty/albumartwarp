/**
 * components/SearchBar.jsx — Last.fm song search.
 *
 * Queries GET /api/search?q=... and displays a list of results.
 * Results show track title, artist, and album art thumbnail.
 *
 * NOTE: Without a LASTFM_API_KEY configured on the backend, this returns
 * stub data (is_live: false). Results will say "stub" in dev mode.
 *
 * Clicking a result calls props.onTrackSelect with a track object.
 * Since search results don't include a downloadable audio file, we
 * open the Last.fm page for the user to play it elsewhere (for now).
 * Future enhancement: integrate a streaming service API here.
 */

import { useState, useCallback, useRef } from 'react'
import { searchTracks } from '../services/api.js'
import './SearchBar.css'

/**
 * @param {Object} props
 * @param {Function} props.onTrackSelect - Called with track info when user picks a result.
 *                                         For now, opens the Last.fm URL.
 */
// onTrackSelect is a placeholder for future streaming integration; currently
// results open the Last.fm URL instead. Prefix with _ to satisfy the linter.
export default function SearchBar({ onTrackSelect: _onTrackSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState(null)
  const [isLive, setIsLive] = useState(false)

  // Debounce timer ref — avoids firing a search on every keystroke
  const debounceRef = useRef(null)

  const handleQueryChange = useCallback((e) => {
    const q = e.target.value
    setQuery(q)

    // Clear previous timer
    clearTimeout(debounceRef.current)

    if (!q.trim()) {
      setResults([])
      return
    }

    // Wait 400ms after the user stops typing before searching
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true)
      setError(null)
      try {
        const data = await searchTracks(q, 8)
        setResults(data.results)
        setIsLive(data.is_live)
      } catch (err) {
        setError(err.message)
        setResults([])
      } finally {
        setIsSearching(false)
      }
    }, 400)
  }, [])

  const handleResultClick = useCallback((track) => {
    // If the track has a Last.fm URL, open it in a new tab
    // TODO: When streaming integration is added, call onTrackSelect instead
    if (track.lastfm_url) {
      window.open(track.lastfm_url, '_blank', 'noopener,noreferrer')
    }
    // Future: onTrackSelect(track)
  }, [])

  return (
    <div className="search-bar">
      <div className="search-bar__input-wrap">
        <span className="search-bar__icon" aria-hidden="true">🔍</span>
        <input
          type="search"
          className="search-bar__input"
          placeholder="Search songs (Last.fm)"
          value={query}
          onChange={handleQueryChange}
          aria-label="Search for songs"
        />
        {isSearching && <span className="search-bar__spinner" aria-hidden="true" />}
      </div>

      {/* Status badge: shows live vs stub mode */}
      {results.length > 0 && (
        <p className="search-bar__status">
          {isLive ? '✅ Live results' : '🔧 Stub results — add LASTFM_API_KEY for real search'}
        </p>
      )}

      {error && <p className="search-bar__error">{error}</p>}

      {/* Results list */}
      {results.length > 0 && (
        <ul className="search-bar__results" role="listbox">
          {results.map((track, idx) => (
            <li
              key={`${track.artist}-${track.title}-${idx}`}
              className="search-bar__result"
              onClick={() => handleResultClick(track)}
              role="option"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleResultClick(track)}
              aria-selected="false"
            >
              {track.album_art_url ? (
                <img
                  src={track.album_art_url}
                  alt={`${track.artist} album art`}
                  className="search-bar__result-art"
                  loading="lazy"
                />
              ) : (
                <div className="search-bar__result-art search-bar__result-art--placeholder" />
              )}

              <div className="search-bar__result-info">
                <span className="search-bar__result-title">{track.title}</span>
                <span className="search-bar__result-artist">{track.artist}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
