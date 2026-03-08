# AlbumArtWarp 🎵

A music visualization app that warps album art in sync with audio data.
Upload a track (or search Last.fm) and watch the album cover gradually dissolve
into abstract shapes driven by tempo, beat, and spectral energy.

---

## What it does

1. **Upload** a local audio file (MP3, WAV, FLAC, OGG, AAC, M4A) and optionally
   paste in an album art image.
2. **Analyse** — the Python backend extracts BPM, beat timestamps, RMS energy,
   spectral centroid, and the chromagram (pitch-class profile) using librosa.
3. **Visualise** — the React frontend layers:
   - Album art with an SVG `feTurbulence` + `feDisplacementMap` warp filter
     that slowly intensifies as the song progresses.
   - A colour-overlay canvas whose palette is derived from the album art
     (via ColorThief) or synthesised from the chromagram.
   - A particle-burst system that fires on every detected beat.
   - A subtle beat-flash overlay for the big hits.
4. **Search** Last.fm for tracks (stub mode by default; live search once you add
   an API key).

---

## Tech stack

| Layer        | Technology                          |
|--------------|-------------------------------------|
| Backend      | Python 3.10, FastAPI, uvicorn       |
| Audio DSP    | librosa, numpy, scipy, soundfile    |
| Frontend     | React 18, Vite 5                    |
| Visualizer   | SVG filters, Canvas 2D, Web Audio API |
| HTTP client  | httpx (backend → Last.fm)           |
| Packaging    | uv (Python), npm (Node)             |
| Task runner  | mise                                |
| Linting      | ruff (Python), ESLint 9 (JS)        |
| Testing      | pytest + pytest-asyncio, Vitest + RTL |

---

## Prerequisites

- [mise](https://mise.jdx.dev/) — toolchain & task runner (`brew install mise`)
- [uv](https://docs.astral.sh/uv/) — Python package manager (`brew install uv`)
- Python 3.10 (managed by mise or pre-installed)
- Node 20+ (managed by mise or pre-installed)

---

## Quick start

```bash
# 1. Clone and enter the project
git clone <repo-url>
cd albumartwarp

# 2. Install all dependencies (Python venv + npm)
mise run install

# 3. Start both servers in two separate terminals
mise run dev:backend    # → http://localhost:8000
mise run dev:frontend   # → http://localhost:5173
```

Open http://localhost:5173 in your browser.

---

## Available mise tasks

```
mise run install          # Install backend + frontend dependencies
mise run dev:backend      # Start FastAPI with hot-reload (port 8000)
mise run dev:frontend     # Start Vite dev server (port 5173)
mise run build            # Production build of the frontend
mise run test:backend     # Run pytest
mise run test:frontend    # Run Vitest
mise run lint:backend     # ruff check + format check
mise run lint:frontend    # ESLint
mise run lint:fix         # ruff --fix + ESLint --fix
mise run clean            # Remove build artefacts and caches
```

---

## Project layout

```
albumartwarp/
├── mise.toml               # Task runner config
├── .env.example            # Copy to .env and fill in secrets
│
├── backend/
│   ├── pyproject.toml      # Python project metadata + deps
│   ├── .python-version     # Pin Python 3.10
│   ├── app/
│   │   ├── main.py         # FastAPI app, lifespan, CORS, static files
│   │   ├── config.py       # Settings (pydantic-settings, reads .env)
│   │   ├── models/
│   │   │   └── audio.py    # Pydantic models: AudioAnalysis, UploadResponse, etc.
│   │   ├── api/routes/
│   │   │   ├── audio.py    # POST /api/audio/upload, GET /api/audio/{filename}
│   │   │   └── search.py   # GET /api/search/?q=...
│   │   └── services/
│   │       ├── audio_processor.py  # librosa analysis → AudioAnalysis
│   │       └── lastfm_service.py   # Last.fm search (live or stub)
│   ├── tests/
│   │   ├── conftest.py             # Shared fixtures (WAV generators, TestClient)
│   │   ├── test_audio_processor.py # Unit tests for DSP logic (27 tests total)
│   │   └── test_routes.py          # Integration tests for HTTP endpoints
│   └── uploads/            # Uploaded audio files stored here
│
└── frontend/
    ├── package.json        # npm deps + scripts
    ├── vite.config.js      # Vite + Vitest config, /api proxy
    ├── eslint.config.js    # ESLint 9 flat config
    ├── src/
    │   ├── App.jsx         # Root component, upload/player state machine
    │   ├── components/
    │   │   ├── Visualizer.jsx   # Main visual layer stack + rAF loop
    │   │   ├── Controls.jsx     # Play/pause/seek, auto-hide
    │   │   ├── FileUpload.jsx   # Drag-and-drop audio + art input
    │   │   ├── SearchBar.jsx    # Debounced Last.fm search UI
    │   │   └── NowPlaying.jsx   # Track info overlay
    │   ├── hooks/
    │   │   ├── useAudioAnalyzer.js   # Web Audio API, beat detection, playback
    │   │   └── useVisualization.js   # warpIntensity, beatImpact, palette
    │   ├── services/
    │   │   ├── api.js              # fetch wrappers for backend endpoints
    │   │   └── colorExtractor.js   # ColorThief palette + chroma-to-hue mapping
    │   └── utils/
    │       ├── audioUtils.js       # isNearBeat, findFrameIndex, computeWarpIntensity
    │       └── visualUtils.js      # Particle system, colour overlay, default art gen
    └── tests/
        ├── setup.js                       # Mock AudioContext, Canvas, fetch
        ├── services/api.test.js           # 11 unit tests for api.js
        └── components/Visualizer.test.jsx # 7 smoke tests for the Visualizer
```

---

## Environment variables

Copy `.env.example` to `.env` in the project root (or `backend/.env`) and fill in:

```bash
# Optional — omit to stay in stub mode
LASTFM_API_KEY=your_key_here
LASTFM_API_SECRET=your_secret_here

# Defaults that are fine for local dev
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
FRONTEND_URL=http://localhost:5173
MAX_UPLOAD_SIZE_MB=50
```

Get a free Last.fm API key at https://www.last.fm/api/account/create.
Without a key the app still works — search returns plausible stub results.

---

## API reference

All endpoints are also documented interactively at http://localhost:8000/docs.

### `POST /api/audio/upload`

Upload an audio file for analysis.

**Request** — `multipart/form-data` with a `file` field (MP3 / WAV / FLAC / OGG / AAC / M4A).

**Response** — `200 OK`:
```json
{
  "audio_url": "http://localhost:8000/uploads/abc123.wav",
  "filename": "abc123.wav",
  "analysis": {
    "duration": 245.3,
    "bpm": 128.0,
    "beat_times": [0.46, 0.93, 1.39, ...],
    "energy": [0.12, 0.45, ...],
    "spectral_centroid": [0.31, 0.58, ...],
    "chroma": [0.1, 0.05, ...],
    "times": [0.0, 0.023, ...],
    "hop_length": 512,
    "sample_rate": 22050
  }
}
```

### `GET /api/search/?q={query}&limit={n}`

Search Last.fm (or stub data) for tracks.

**Response** — `200 OK`:
```json
{
  "query": "tame impala",
  "results": [
    {
      "title": "The Less I Know the Better",
      "artist": "Tame Impala",
      "album_art_url": "https://...",
      "lastfm_url": "https://www.last.fm/music/...",
      "mbid": "...",
      "listeners": "1234567"
    }
  ],
  "is_live": false
}
```

`is_live: true` when the response comes from the real Last.fm API.

### `GET /health`

```json
{ "status": "ok", "version": "0.1.0" }
```

---

## How the visualization works

### Warp effect

An SVG filter sits in the DOM containing two primitives:

- `<feTurbulence>` — generates coherent Perlin-style noise.
  `baseFrequency` controls scale (lower = bigger waves).
- `<feDisplacementMap>` — uses the turbulence to displace pixels.
  `scale` controls max displacement in pixels.

Each animation frame (via `requestAnimationFrame`) the frontend updates:

```
baseFrequency = 0.006 + warpIntensity × 0.028
scale         = warpIntensity × 140 + beatImpact × 70
```

`warpIntensity` is `sqrt(songProgress)` — grows slowly at first, faster at the end.
`beatImpact` spikes to `1.0` on a detected beat then decays at 10% per frame.
When `beatImpact > 0.85` the turbulence seed changes randomly for a glitch snap.

### Beat detection

The backend computes beat timestamps with `librosa.beat.beat_track`.
The frontend checks every animation frame whether the current audio time falls
within 60 ms of any beat timestamp (`isNearBeat`).  This is much lighter than
running an FFT in the browser and guarantees the frontend and backend agree.

### Colour palette

When an album art URL is available, ColorThief extracts 6 dominant colours
from the image.  Otherwise, the 12-element chromagram is mapped to HSL hues:
C→red, D→orange, E→yellow … and so on around the colour wheel.

---

## Running tests

```bash
# Backend (pytest)
cd backend
uv run pytest tests/ -v

# Frontend (Vitest)
cd frontend
npm run test -- --run
```

The backend tests generate synthetic audio (sine waves and click tracks) in
memory so no audio files need to be bundled with the repo.

---

## Secrets management (fnox)

If you use [fnox](https://github.com/fnox-sh/fnox) for secret management you
can load `LASTFM_API_KEY` without writing it to `.env`:

```bash
fnox run -- mise run dev:backend
```

---

## Contributing / extending

A few obvious next steps if you want to keep building:

- **Streaming audio search**: integrate Spotify / SoundCloud / MusicBrainz so
  clicking a search result loads a playable file automatically.
- **Beat-reactive colour shifts**: use the chroma vector to shift the hue of the
  overlay palette in real time as the dominant pitch class changes.
- **Mobile layout**: the visualizer is full-viewport; the controls need touch-
  friendly sizing for phones.
- **Export**: render the visualization to a video file using `MediaRecorder`.
