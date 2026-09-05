# AKINTI Audio Sidecar

A small FastAPI service that gives `scripts/worker.ts` access to DSP that has
no good Node equivalent: DeepFilterNet3 denoising, Matchering reference
mastering, and librosa pYIN pitch scoring. It never runs inline in a request
cycle — the worker calls it over local HTTP as one stage of the
`process_audio`/`mix_duet` pipeline (see `docs/AUDIO_ARCHITECTURE.md`).

## Why a separate process (GPL isolation)

Matchering is GPL-3.0. Running it in-process inside the Node/Next.js app
(proprietary) would put GPL code in the same binary/deploy artifact as
everything else. Instead it lives in its own Python process, reachable only
over HTTP (`SIDECAR_URL`, default `http://127.0.0.1:8011`) — the worker talks
to it exactly like any other network service, never imports its code.

## Endpoints

All four take **either** a `path` form field (a file already on this
machine's filesystem — what the worker uses, since it already downloaded the
job's audio to a temp dir) **or** a multipart `file` upload. Exactly one of
the two must be given.

| Method | Path | Purpose | Real fallback if unavailable |
|---|---|---|---|
| POST | `/clean` | Denoise (DeepFilterNet3, else ffmpeg `arnndn` + bundled RNNoise model) | worker runs `arnndn` itself, or skips cleanup |
| POST | `/master` | Matchering reference mastering (`preset` form field selects the reference family) | worker runs ffmpeg two-pass `loudnorm` |
| POST | `/pitch-score` | pYIN pitch score 0–100 vs. a `reference_key` or the track's own detected key, plus per-second cents deviation | not on the critical path; caller shows no score |
| POST | `/peaks` | Wavesurfer-compatible normalized peaks JSON (`{version,bits,samples_per_pixel,data}` — same shape the worker already writes without the sidecar) | worker's own ffmpeg-based peak extractor |
| GET | `/health` | Reports which capabilities are **actually** importable/runnable on this machine, per-endpoint | — |

`GET /health` never reports a capability as available unless the underlying
import (or, for `arnndn`, both ffmpeg AND the bundled model file) actually
succeeded — see `app/capabilities.py`. It looks like:

```json
{
  "status": "ok",
  "capabilities": {
    "ffmpeg": true, "deepfilternet": false, "arnndn": true,
    "matchering": true, "librosa": true, "soundfile": true
  },
  "endpoints": { "clean": true, "master": true, "pitch_score": true, "peaks": true }
}
```

## What actually works on this machine (Windows, Python 3.12, no Rust)

Verified 2026-09-05 via `pip install -r requirements.txt` in a local venv:

| Dependency | Installs here? | Notes |
|---|---|---|
| fastapi / uvicorn / librosa / soundfile / numpy / scipy | ✅ | clean pip install |
| **matchering** | ✅ | pure Python + numpy, GPL-3.0, isolated per above |
| **deepfilternet** | ❌ | `deepfilterlib`'s native extension needs Cargo/Rust; not present on this machine. `/clean` automatically uses the `arnndn` fallback instead — verified end-to-end below. |

On a Linux build image with a Rust toolchain (or once a prebuilt wheel is
published for the target platform), `deepfilternet` installs normally and
`/health` flips `capabilities.deepfilternet` to `true` with **no code
change** — `dsp.py`'s `clean_audio()` already prefers it whenever the import
succeeds.

## Bundled assets

- `models/rnnoise.rnnn` — a real RNNoise model (the "beguiling-drafter"
  model from `GregorR/rnnoise-models`, CC0) used by ffmpeg's `arnndn` filter.
  ffmpeg ships no default model; without this file the `arnndn` fallback
  cannot run at all, which is why it is bundled here rather than assumed.
- `reference/{balanced,bright,warm}.wav` — **synthesized placeholder**
  reference masters (pink-noise-derived, EQ-shaped, loudness-normalized via
  ffmpeg — see the generation command in this file's git history) used as
  Matchering's reference target. AKINTI does not bundle a licensed
  commercial master; these give `/master` a real, working target today.
  `PRESET_REFERENCE_FAMILY` in `app/dsp.py` maps the six enhancement presets
  onto one of the three families. Swapping in a licensed reference track per
  genre later is a file replacement, not a code change.

## Running locally

```bash
cd sidecar
python -m venv .venv
.venv/Scripts/activate        # .venv/bin/activate on Linux/macOS
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8011
```

Or from the repo root: `npm run sidecar` (defined in `package.json`, runs the
same uvicorn command against `sidecar/.venv` if present, else the system
`python`/`py -3`).

## Running in Docker

```bash
docker build -f Dockerfile.sidecar -t akinti-sidecar .
docker run --rm -p 8011:8011 akinti-sidecar
```

The Dockerfile uses a Debian base with a Rust toolchain installed, so
`deepfilternet` is expected to install and run for real there even though it
does not on this Windows dev machine — `/health` is the source of truth in
either environment, not this document.

## Tests

```bash
cd sidecar
pytest
```

`tests/test_endpoints.py` generates a real sine-wave WAV fixture on the fly
(no binary fixture checked into the repo) and exercises every endpoint
through FastAPI's `TestClient`. Tests for a capability that `/health` reports
as unavailable are skipped with an explicit reason, never marked "passed" —
see `docs/AUDIO_ARCHITECTURE.md` and the top-level task's "no fake success"
rule.

## Configuring the worker

`scripts/worker.ts` reads:

- `SIDECAR_URL` (default `http://127.0.0.1:8011`)
- `SIDECAR_TIMEOUT_MS` (default `120000`)
- `SIDECAR_RETRIES` (default `1`)

If the sidecar is unreachable, times out, or returns a non-2xx/malformed
response, the worker logs the reason and falls back to its own ffmpeg-only
path for that stage (never silently drops a whole job) — see
`docs/AUDIO_ARCHITECTURE.md` "Pipeline" for the exact fallback matrix.
