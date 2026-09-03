# AKINTI — Audio Architecture

## Pipeline (spec §34)

```
Record (MediaRecorder) / Upload
   → Validate (format, size, magic bytes — server-side, see SECURITY.md)
   → Original file → PRIVATE `audio` storage bucket
   → audio_assets row created (processing_status = 'pending')
   → enqueue_audio_job() → audio_processing_jobs row
   → scripts/worker.ts claims it, runs ffmpeg (normalize/enhance + peaks)
   → Processed file → PRIVATE `audio` bucket, peaks → audio_assets.peaks jsonb
   → complete_audio_job() flips processing_status → 'ready'
   → Playback: server mints a short-lived signed URL, never a raw path
```

Never inline in a request/response cycle — Vercel serverless functions have
execution-time limits unsuitable for audio processing (spec §30), and the UI
must show real `pending / processing / ready / failed` state, never a fake
instant "done" (spec §19).

## Background job queue — the chosen design

**Postgres-backed job table (`audio_processing_jobs`) + a standalone worker
process (`scripts/worker.ts`), not a managed queue or Supabase Edge
Functions.** Rationale:

- Zero new infrastructure — Postgres is already there, `FOR UPDATE SKIP
  LOCKED` gives real concurrent-safe claiming without a broker.
- ffmpeg needs a real filesystem and no execution-time ceiling; a long-lived
  Node process (or a small fleet of them) is the natural fit, not a
  serverless function.
- Full control over retry/backoff/stall-recovery logic lives in SQL
  (`claim_audio_jobs`, `complete_audio_job`, `fail_audio_job`,
  `requeue_stalled_audio_jobs`), reviewable in one place.
- A managed queue (Inngest/Trigger.dev) remains a reasonable future swap if
  self-hosting the worker becomes operationally inconvenient — nothing in
  the schema or the worker's RPC surface prevents that later.

### Queue mechanics

- `claim_audio_jobs(worker_id, limit)` — `SELECT ... FOR UPDATE SKIP LOCKED`
  over `status = 'pending' AND run_after <= now()`, ordered by
  `(priority, run_after, id)`. Marks claimed rows `processing`, bumps
  `attempts`, records `locked_by`/`locked_at`.
- `complete_audio_job(job_id, processed_path, peaks, duration_ms, result)` —
  writes the job row `done` and the `audio_assets` row `ready` in one call.
- `fail_audio_job(job_id, error)` — re-queues with exponential backoff
  (`15s * 4^attempts`) while `attempts < max_attempts` (default 3), else
  marks the job `failed` and the asset `failed` with `processing_error` set.
- `requeue_stalled_audio_jobs(stall_after default 10 minutes)` — resets any
  job stuck `processing` past the stall window (a worker that died
  mid-flight). Called from the worker's own maintenance loop roughly once a
  minute; also safe to run from `pg_cron` if that's added later.
- One live job per `(audio_asset_id, job_type)` — a unique partial index
  prevents duplicate concurrent processing of the same asset.
- All four RPCs are `service_role`-only (revoked from `anon`/`authenticated`
  in migration 12) — a client can only *enqueue* work via
  `enqueue_audio_job()`, never claim or complete it.

### Running the worker

```
npm run worker          # loops forever, polling every 5s (WORKER_POLL_INTERVAL_MS)
npx tsx scripts/worker.ts --once   # drains the queue once and exits
```

Requires a **system `ffmpeg` + `ffprobe` on PATH** (override with
`FFMPEG_PATH`/`FFPROBE_PATH`). There is no fallback and no fake success: if
either binary is missing, the worker logs a loud warning at startup, keeps
polling, and fails every claimed job through `fail_audio_job` with an
actionable message. It never marks a job `done` without having produced and
uploaded a real file.

## Enhancement presets (spec §19)

Six accessible presets, each an ffmpeg filter chain — never exposed as raw
knobs. Defined once, in `scripts/worker.ts`'s `PRESET_FILTERS`:

| Preset | Filter chain |
|---|---|
| `natural` | `loudnorm` only |
| `studio` | noise reduction (`afftdn`) + compression (`acompressor`) + `loudnorm` |
| `clear_voice` | highpass + `afftdn` + a presence-boost EQ + `loudnorm` |
| `warm` | low-mid EQ boost, high-shelf cut, `loudnorm` |
| `deep` | bass EQ boost + `lowpass`, `loudnorm` |
| `atmospheric` | `aecho` (light reverb-like delay) + `loudnorm` |

Output is always AAC in an `.m4a` container (`-c:a aac`) — broadly
compatible, and matches `extensionForAudioMimeType("audio/mp4")` in
`src/lib/supabase/config.ts`.

## Waveform peaks (spec §20)

Generated once, in the same worker pass as processing — never re-decoded on
a client request. Stored inline as compact jsonb on `audio_assets.peaks`:

```json
{ "version": 1, "bits": 8, "samples_per_pixel": 512, "data": [0..255, ...] }
```

Extraction: ffmpeg decodes the processed file to raw unsigned 8-bit mono PCM
at 8kHz (`-f u8`), piped directly to the worker process (no
`audiowaveform` dependency). Samples are bucketed to a fixed **800 points**
regardless of source duration (`samples_per_pixel = totalSamples / 800`); each
bucket's value is its peak deviation from the u8 midpoint (128), scaled to
fill 0–255. 800 points is enough resolution for a card waveform or the full
Wave-detail player at any reasonable card width, and keeps the payload small
enough to ship inline with every Wave in a feed response.

## Play and Replay — exact thresholds (spec §13)

Defined once in SQL (`play_qualifying_ms()` / `record_play_event()`,
migration 11) and mirrored here. The client reports raw playback; the server
alone decides what counts.

- **Play threshold:** `listened_ms >= max(1000, min(3000, 30% of duration))`.
  A 2s clip qualifies at 1s listened; anything ≥10s qualifies at 3s listened.
- **Completion:** `listened_ms >= 90%` of duration.
- **Replay:** a **second** qualifying listen of the same Wave by the same
  listener, at least **60 seconds** after the first Play was counted. At most
  one Replay is ever counted per `(listener, Wave)` — this is not "replay
  count = total plays".
- **Debounce:** raw events from the same listener for the same Wave within
  **5 seconds** of each other are dropped outright (protects against
  double-fires from client rerenders).
- **Self-plays never count.** If the listener is the Wave's creator,
  `record_play_event` still logs the raw event but never sets
  `counted_play`/`counted_replay`.
- **Identity for anonymous listeners:** a client-generated `session_id`
  (≥8 chars) keyed as `s:<session>`; signed-in listeners are keyed
  `u:<user_id>`. This is `wave_listens.listener_key`, the row every counter
  ultimately derives from — `play_events` is the raw, unbounded append-only
  log kept for auditing/analytics, never queried for live counts.

Analytics events (spec §40): `wave_play_started`, `wave_play_completed`,
`wave_replayed`, plus the save/share/comment/follow/duet events — all fired
from a single guarded handler, never from render logic, to avoid duplicate
counting on rerender.

## Signed-URL strategy for private audio (spec §33)

The `audio` bucket is **private**, with no listener SELECT policy on
`storage.objects` at all — only the owner can sign their own object directly.
Every other listener gets audio exclusively through:

`mintSignedAudioUrl` / `mintPlaybackUrl` (`src/lib/db/audioAssets.ts`):

1. Read the `audio_assets` row using the **caller's own RLS-scoped client**.
   The `audio_assets_select` policy calls `can_view_audio_asset()`, so this
   step alone throws `NotFoundError` for anyone who shouldn't see it —
   authorization and "does it exist" are deliberately indistinguishable here.
2. Only after that succeeds, mint the URL with the **admin (service role)
   client** — required because the caller may not be the object's owner.
3. TTL: **10 minutes** (`SIGNED_AUDIO_URL_TTL_SECONDS`) — long enough to
   start and finish a typical Wave and survive a seek or brief network drop;
   short enough that a leaked URL is worthless almost immediately. Longer
   Waves re-sign on demand.
4. `mintPlaybackUrl` prefers `processed_path` and falls back to
   `original_path` while a Wave is still `pending`/`processing` — so
   playback never blocks on the worker, it just plays the unenhanced file
   until processing catches up.

Raw storage paths are never sent to a client outside these two functions.

## Client capture (spec §17, §18, §19, §20)

Everything below lives under `src/lib/audio/`, `src/components/audio/` and
`src/components/create/`. It is client infrastructure only — no server
actions, no Supabase calls. It produces a typed `CreateWaveDraft` (see
`src/lib/audio/createDraft.ts`) and hands it to an injected `onSubmit`; a
later agent wires that to `enqueue_audio_job()` and the storage upload
described above.

### Recording (spec §17)

`getRecordingMimeType()` (`capabilities.ts`) probes
`MediaRecorder.isTypeSupported()` in preference order —
`audio/webm;codecs=opus` first (what `PRESET_FILTERS`/ffmpeg read most
cheaply), then Safari's `audio/mp4` — and returns `null` rather than letting
`MediaRecorder` pick an undocumented default.

`AudioRecorder` (`recorder.ts`) is a small external store, the same shape as
`PlaybackStore`, wrapping `MediaRecorder` plus an `AnalyserNode` level meter
(RMS of `getByteTimeDomainData`, never connected to a destination — no
feedback). Every seam (`requestMicrophone`, `createRecorder`,
`createAudioContext`, `now`, the tick interval) is injectable, exactly like
`PlaybackStore.createAudio`, so `recorder.test.ts` drives the full
idle → requesting → recording → paused → stopped state machine — including
permission denial, no-device, auto-stop at `MAX_AUDIO_DURATION_MS`, and
retake — without touching a real microphone. `useRecorder()` is the React
binding (`useSyncExternalStore`) and releases the stream/AudioContext on
unmount unconditionally, so navigating away never leaves a hot mic.

### Client preview peaks and duration (spec §20)

`decodeToPeaks(blob, buckets)` and `getDurationMs(blob)`
(`decode.ts`) both call `AudioContext.decodeAudioData` once, locally, purely
so the create flow has something to show before publishing. This is **not**
the stored waveform — `scripts/worker.ts` regenerates the real 800-point
peaks server-side from the processed file, per the pipeline above. Client
peaks travel in `CreateWaveDraft.audio.previewPeaks` and must never be
persisted as-is.

### Upload validation (spec §18)

`validateFile()` (`validateFile.ts`) is fast client feedback only — size,
extension allow-list, and magic-byte sniffing (`sniffAudioKind`: MP3
ID3/frame-sync, WAV RIFF/WAVE, OGG `OggS`, FLAC `fLaC`, M4A/MP4 `ftyp`, WebM's
EBML header `1A 45 DF A3`), plus a duration check when the caller supplies
one (from `getDurationMs`). It exists so a user learns about a bad file in
milliseconds; **the server re-validates size, duration and magic bytes
independently** before ever accepting an upload (see "Security" under Audio
upload, spec §18) — a client check can always be bypassed outside the
browser.

### Enhancement presets — client preview (spec §19)

`enhancement.ts` mirrors the six preset ids in `PRESET_FILTERS`
(`scripts/worker.ts`) and `AUDIO_ENHANCEMENT_PRESETS`
(`src/types/domain.ts`) exactly: `natural`, `studio`, `clear_voice`, `warm`,
`deep`, `atmospheric`. Each preset is data — a short chain of
`{ biquad | gain | convolver-light }` steps — consumed by
`createPreviewGraph(audioContext, source, presetId)` to build a **local-only**
Web Audio graph for the `EnhancementPicker`'s Original/Enhanced A/B toggle.
This is a rough approximation of the real ffmpeg filter chain, never the
audio that gets uploaded or the thing that produces the published Wave's
actual processed file. The optional advanced 5-band EQ
(`60/250/1000/4000/12000 Hz`, ±12 dB, `createAdvancedEqGraph`) is separate and
opt-in, applied on top of the chosen preset, matching the spec's "opt-in and
secondary to the presets" framing.

### Components and the `/create` flow

`RecorderPanel`, `AudioPreview`, `EnhancementPicker` (`src/components/audio/`)
and `UploadDropzone`, `CreateWaveForm` (`src/components/create/`) are
presentation plus local state only. `AudioPreview` plays a local `blob:` URL
through the same global `PlaybackStore` a published Wave uses (spec §12: one
Wave/sound at a time, everywhere) — `EnhancementPicker`'s A/B preview uses a
dedicated `<audio>` + Web Audio graph instead (it needs a live
`MediaElementAudioSourceNode` to route through the preset chain) but still
calls `store.pause()` before playing, to hold the one-at-a-time rule against
the rest of the app.

`src/app/(app)/create/CreateFlow.tsx` sequences Record/Upload → preview →
enhance → details → Publish. `CreateWaveForm`'s `onSubmit` is the one seam a
server-side agent needs to replace — see the hand-off contract in that file's
header comment and in `createDraft.ts`. Until that seam exists, pressing
Publish renders an inline `ErrorState` ("Publishing is not connected yet")
instead of a fake success toast (spec §38, §44).

## Duet mixdown

Covered fully in `DUET_SPEC.md`. Summary: never trust client-side mixing.
`enqueueDuetMix()` queues a `mix_duet` job carrying `{ reference_asset_id,
offset_ms, preset }`; the worker downloads both stems, applies
`adelay=<offset_ms>:all=1` to the new take, `amix`es it against the
reference, runs the requested preset filter chain, and uploads the result as
the new take's own `processed_path` — that rendered file is what the
finished Duet Wave's `audio_asset_id` points at.
