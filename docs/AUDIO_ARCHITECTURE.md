# AKINTI — Audio Architecture

## Pipeline (spec §34, Wave B "instant polish")

```
Record (MediaRecorder) / Upload
   → Validate (format, size, magic bytes — server-side, see SECURITY.md)
   → Original file → PRIVATE `audio` storage bucket
   → audio_assets row created (processing_status = 'pending')
   → enqueue_audio_job() → audio_processing_jobs row
   → scripts/worker.ts claims it and runs, in order:
       1. clean   — sidecar POST /clean (DeepFilterNet3, else the sidecar's
                     own ffmpeg `arnndn`), else this worker's own `arnndn`
                     pass, else SKIPPED (never faked)
       2. preset  — the existing ffmpeg filter chain (PRESET_FILTERS below),
                     always runs, on whichever input step 1 produced
       3. master  — sidecar POST /master (Matchering vs. a bundled reference),
                     else ffmpeg's documented two-pass `loudnorm` recipe —
                     ALWAYS produces a result, this stage is never skipped
       4. encode  — ffmpeg to AAC/.m4a (unchanged)
       5. peaks   — sidecar POST /peaks (librosa/soundfile), else this
                     worker's own PCM-based extractor — ALWAYS produces a result
   → Processed file → PRIVATE `audio` bucket
   → complete_audio_job(..., p_enhancement_report) writes:
       - peaks → audio_assets.peaks jsonb
       - which stages ran + measured before/after LUFS + durations →
         audio_assets.enhancement_report jsonb (migration
         20260905100000_audio_enhancement_report.sql)
       - processing_status → 'ready'
   → Playback: server mints a short-lived signed URL, never a raw path
```

Never inline in a request/response cycle — Vercel serverless functions have
execution-time limits unsuitable for audio processing (spec §30), and the UI
must show real `pending / processing / ready / failed` state, never a fake
instant "done" (spec §19).

### The sidecar (`sidecar/`, see `sidecar/README.md`)

A FastAPI service next to the Node worker, giving it DeepFilterNet3/
Matchering/librosa access with no Node equivalent. Called over local HTTP
only — **never imported into the Node/Next.js codebase** — because
Matchering is GPL-3.0 and this isolation keeps that GPL code out of the
proprietary app entirely (`sidecar/README.md` "Why a separate process").

Every stage the sidecar can help with has a real local fallback; the sidecar
being down, slow, or wrong never fails a job by itself — it only downgrades
that one stage. The decision logic (`try the sidecar, on any failure fall
back`) is a testable, injectable module —
`src/lib/audio/sidecarPipeline.ts` (`selectCleanStage`/`selectMasterStage`/
`selectPeaksStage`, unit tested in `sidecarPipeline.test.ts` by mocking
`fetch`) — `scripts/worker.ts` supplies the real ffmpeg-based fallbacks and
the real `fetch`.

| Endpoint | Sidecar backend | Local fallback | Ever skipped? |
|---|---|---|---|
| `/clean` | DeepFilterNet3, else sidecar's own `arnndn` | This worker's own ffmpeg `arnndn` pass (bundled model: `sidecar/models/rnnoise.rnnn`) | **Yes** — if neither the sidecar nor a local model is available, the stage is simply absent from `enhancement_report`, never faked |
| `/master` | Matchering vs. a bundled reference master (`PRESET_REFERENCE_FAMILY` in `sidecar/app/dsp.py`) | ffmpeg's documented two-pass `loudnorm` recipe | No — local ffmpeg is already a hard requirement for this worker |
| `/peaks` | librosa/soundfile | This worker's own PCM-based extractor (unchanged from before the sidecar existed) | No |
| `/pitch-score` | librosa pYIN vs. a reference key or the track's own detected key | — (best-effort, called AFTER a `process_audio`/`mix_duet` job already completed — see "Pitch score" below) | **Yes** — sidecar unreachable/erroring leaves `audio_assets.pitch_score` `null`, never fails the job |
| `/pitch-snap` | pYIN + per-segment `librosa.effects.pitch_shift` to the nearest semitone of the detected/reference key, at the requested strength | None — the `pitch_snap` Pro preset simply is this endpoint; if the sidecar is down the job fails and retries like any other sidecar-dependent stage would, since there is no local ffmpeg equivalent for pitch correction | No — Pro users chose this specific sound; silently falling back to the plain preset chain would be a fake success |
| `/harmony` | Mixes the vocal with a pitch-shifted copy (+3 or +4 semitones, chosen from the detected key's third) and a −12 semitone doubled layer at low gain (wet 0.35) | Same as `/pitch-snap` — no local equivalent, no silent fallback | No |

Env vars (`scripts/worker.ts`, `src/lib/audio/sidecarPipeline.ts`'s
`sidecarConfigFromEnv`): `SIDECAR_URL` (default `http://127.0.0.1:8011`),
`SIDECAR_TIMEOUT_MS` (default `120000`), `SIDECAR_RETRIES` (default `1`).

**Running it locally:** `npm run sidecar` (uses `sidecar/.venv` if present,
else `py -3`/`python3` on PATH — see `scripts/run-sidecar.mjs`), or directly:
`cd sidecar && pip install -r requirements.txt && uvicorn app.main:app --host 127.0.0.1 --port 8011`.
**In Docker:** `docker build -f Dockerfile.sidecar -t akinti-sidecar . && docker run -p 8011:8011 akinti-sidecar`
(includes a Rust toolchain so `deepfilternet` has a real chance to build
there, unlike the Windows dev machine this was verified on — see
`sidecar/README.md` "What actually works on this machine"). `GET /health`
is the source of truth for which capabilities are actually live in either
environment.

### Enhancement report

`audio_assets.enhancement_report` (jsonb, migration
`20260905100000_audio_enhancement_report.sql`) records exactly which
backend ran each stage and what it measured — written once per completed
job by `complete_audio_job`'s new `p_enhancement_report` parameter, alongside
`peaks`/`processing_status`. Shape (`EnhancementReport`, `src/types/domain.ts`):

```json
{
  "clean":  { "method": "arnndn", "lufsBefore": -28.4, "lufsAfter": -27.9, "durationMs": 812 },
  "master": { "method": "loudnorm_two_pass", "lufsBefore": -27.9, "lufsAfter": -14.0, "durationMs": 640 },
  "peaks":  { "method": "ffmpeg", "durationMs": 95 }
}
```

A stage that did not run (sidecar unreachable and no local fallback
applicable — only possible for `clean`) is simply **absent** from the
object, never filled with a placeholder. `method` is always prefixed
`sidecar:` when the sidecar produced that stage (e.g. `sidecar:deepfilternet3`,
`sidecar:matchering`, `sidecar:librosa`) so a report is self-describing about
which process actually did the work. Server-owned, like every other
processing column — `audio_assets_guard_update` (migration 12, extended in
migration 27) rejects a client attempt to set it directly; readable by
anon/authenticated via the explicit column grant migration 15 already
requires for anything on `audio_assets` that isn't a raw storage path.

### Pitch score

`docs/PRODUCT_V2.md` §4: "Pitch score / vocal coach ... shown after
recording as encouragement, not judgment"; `docs/design/DESIGN.md` §12: no
gamification, never print a zero metric, no exclamation marks. This shapes
both where the score lives and how it is presented.

After a `process_audio` or `mix_duet` job's `complete_audio_job` call
succeeds, `scripts/worker.ts` makes one best-effort follow-up call to the
sidecar's `POST /pitch-score` with the just-processed file, **skipped
outright when the asset is a backing-track instrumental** (checked by
looking the asset id up in `backing_tracks.audio_asset_id` — instrumentals
have no vocal to score) rather than by any job-payload flag. On success, the
result is written with `set_audio_asset_pitch_score(asset_id, jsonb)`
(migration `20260906120000_pro_presets_pitch.sql`) to
**`audio_assets.pitch_score`** — chosen over the `waves.pitch_score` column
the brief offered as the default, because a Wave row does not necessarily
exist yet when this call happens (publishing is allowed while an asset is
still `pending`/`processing` — see "Upload sequence" below — and the worker
processes an asset the moment it's finalized, before `publishWave` ever
runs). `audio_assets` is already where every other worker-computed
processing result lives (`peaks`, `enhancement_report`) for the same reason.
Any failure of this call (sidecar down, timeout, malformed response) is
caught and logged, never thrown — the job it follows is already `done`, and
a missing pitch score is a legitimate, honest `null`, not a retry condition.

Shape written to `audio_assets.pitch_score` (`PitchScore` in
`src/components/create/PitchReport.tsx` — the UI is the one consumer, so the
type lives there rather than in `src/types/domain.ts`):

```json
{
  "score_0_100": 78.4,
  "in_tune_ratio": 0.71,
  "median_cents_off": 12.5,
  "key_guess": "G major",
  "notes_detected": 34,
  "cents_trace": [4.2, 6.8, 41.0, 12.1]
}
```

`score_0_100` and `key_guess` map directly onto the sidecar's `score`/
`detected_key` (or `reference_key`, when supplied). `in_tune_ratio` is the
fraction of voiced one-second windows within 35 cents of the nearest in-key
semitone (the sidecar's own "in tune" threshold — see
`sidecar/app/dsp.py`'s `score_pitch`). `median_cents_off` is the median (not
mean, to resist a handful of wild off-pitch seconds skewing an otherwise
solid take) of `per_second_cents_deviation`. `notes_detected` counts voiced
one-second windows with pitch data at all, a rough proxy for "how much of
this had a detectable pitch" that the UI never shows as a metric on its
own — see `PitchReport.tsx`. `cents_trace` is not one of the five fields the
brief called canonical — `scripts/worker.ts` downsamples the sidecar's
`per_second_cents_deviation` to at most 60 points (`downsampleCentsTrace`)
and adds it purely so `PitchReport`'s "how your pitch tracked over this
take" mini trace has real data to draw without a second sidecar call or
column; it is optional and a score computed before this field existed simply
omits it, never backfilled with an invented one. A track with zero voiced
frames still writes a score (`0`), a ratio (`0`), and `notes_detected: 0`,
never an absent field —
`audio_assets_guard_update` and `set_audio_asset_pitch_score` both treat the
whole object as one opaque, atomically-written value.

## Upload sequence (spec §18, §36, §38)

Three Server Actions in `src/app/(app)/create/actions.ts`, driven by
`CreateFlow.tsx`'s `runPublish`, each with its own real loading/error state
and a retry that resumes from the top rather than re-running everything:

```
1. createUploadTicket({ mimeType, sizeBytes, durationMs, creationType, enhancementPreset })
     → validates limits from src/lib/supabase/config.ts
     → inserts audio_assets (processing_status defaults to 'pending' — there
       is no separate "uploading" database state; the client alone tracks
       upload progress, since nothing about the row changes while bytes move)
     → mints a signed UPLOAD url (createSignedUploadUrl) for
       audioOriginalPath(ownerId, assetId, extension) in the private `audio`
       bucket, using the caller's OWN client (the storage INSERT policy
       already scopes it to this owner — no admin client needed here)

2. Client PUTs the blob straight to that signed URL —
   supabase.storage.from('audio').uploadToSignedUrl(path, token, blob, ...)
     — never through a Vercel function; the file goes straight to storage.

3. finalizeUpload(assetId, advancedEq?)
     → re-downloads the head bytes (Range: bytes=0-63) via the ADMIN client
       and a short-lived signed URL, independent of anything the browser claimed
     → sniffAudioKind() — the exact same pure, isomorphic function
       validateFile() uses client-side (src/lib/audio/validateFile.ts has no
       "use client" directive and no DOM-only API, so it needed no porting to
       run server-side) — this call is the actual security boundary (spec §18:
       "never trust client-provided MIME types alone")
     → on a recognised format: enqueueAudioProcessing() (the owner's own
       client — enqueue_audio_job() re-checks ownership itself)
     → on an unrecognised format: markAudioAssetFailed() (admin client;
       processing_status/processing_error are server-owned columns no
       ordinary client may set — see "Storage security" below) and returns
       ok: false with an honest reason, never a fake success

4. publishWave({ assetId, title, ..., collaboratorUsernames, categories })
     → verifies the caller owns the asset and it did not fail processing
     → createWave() (categories ride on the existing waves.tags column — no
       separate "categories" column exists)
     → invites each collaborator by username (spec §16: invites, never
       memberships — an unknown/blocked username is skipped, not a publish
       failure)
     → client redirects to /w/[id] on success
```

Publishing is allowed while the asset is still `pending`/`processing` —
`mintPlaybackUrl` already falls back to the original file, so there is no
reason to block on the worker. Publishing over a `failed` asset is rejected
with the stored `processing_error`.

### Processing state on the Wave detail page

`ProcessingBanner` (`src/app/(app)/w/[id]/ProcessingBanner.tsx`) shows an
honest "still processing" or "failed" state while `processing_status !==
'ready'`. **Chosen mechanism: polling, not Realtime** — a plain
`setInterval` re-read of `processing_status`/`processing_error` through the
ordinary RLS-scoped browser client every 4 seconds, using exactly the
column grants "Storage security" below already provides. This was simpler
than standing up a `postgres_changes` subscription (connect/reconnect/
cleanup lifecycle) for a state that only changes a handful of times over a
couple of minutes. `public.audio_assets` was nonetheless added to the
`supabase_realtime` publication in migration
`20260903121600_realtime_publication.sql` (alongside `notifications` and
`messages`, needed by other stages) so a future pass can switch this one
component to push-based updates without another migration.

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

### Client tracker (`src/lib/metrics/playTracker.ts`)

Subscribes to the global `PlaybackStore`'s `onProgress`/`onEnded` events —
never per-Wave-card logic — and decides only WHEN it is worth asking the
server, never WHAT counts:

- Accumulates `listened_ms` from consecutive `currentTime` deltas, dropping
  any single jump bigger than 2 seconds (a seek or a loop-back) so a seek
  never masquerades as elapsed listening.
- Calls `reportPlayback()` (`src/lib/metrics/actions.ts`, wrapping
  `record_play_event`) exactly twice per listen at most: once the moment
  `listened_ms` first crosses `playQualifyingMs(durationMs)` (mirroring
  `play_qualifying_ms()` exactly), and once more at 90%/`ended`. This is
  deliberate, not an oversight — reporting on every `timeupdate` tick would
  hit the server's 5-second debounce constantly for no benefit.
- `wave_play_started`/`wave_replayed` fire only when the RPC's response says
  `counted_play`/`counted_replay` — both are already "fires once" signals
  from the SQL function itself (true only on the exact transition), so the
  client does not need its own long-lived "already counted" bookkeeping for
  either. `wave_play_completed` is the one client-decided event (the RPC's
  jsonb response has no `completed` field to key off), guarded per listen
  occurrence instead.
- **Module-level guard against rerender double-firing:** `attach(store)` is
  idempotent per `PlaybackStore` instance (a `WeakSet`). `usePlayTracker()`
  is safe to call from every mounted `WaveCardContainer` in a feed — only
  the very first call ever subscribes, because the store itself is already
  an app-wide singleton (`PlaybackProvider`), so this guarantees exactly one
  listener per playback event, ever, no matter how many cards are on screen.
- **Anonymous session id:** `record_play_event`'s `p_session_id` param
  exists specifically to key `wave_listens.listener_key` as `s:<session>`
  for signed-out listeners (the RPC supports it, so no threshold logic had
  to be skipped) — `src/lib/metrics/sessionId.ts` keeps a random id in a
  1-year cookie and reuses it across visits. A value is always sent, signed
  in or not, since `playbackReportSchema` requires ≥8 characters and the RPC
  simply ignores it once `auth.uid()` is present.
- **Analytics sink:** `src/lib/metrics/analyticsSink.ts` is a minimal,
  swappable seam (`console.debug` in development by default) — no
  third-party analytics backend is wired into this stage, since faking a
  destination for these events would itself be the kind of "looks done but
  isn't" the spec explicitly rules out. `setAnalyticsSink()` is where a real
  backend (or the save/share/comment/follow/duet events §40 also lists)
  plugs in later.

## Signed-URL strategy for private audio (spec §33)

The `audio` bucket is **private**, with no listener SELECT policy on
`storage.objects` at all — only the owner can sign their own object directly.
Every other listener gets audio exclusively through:

`mintSignedAudioUrl` / `mintPlaybackUrl` (`src/lib/db/audioAssets.ts`), used
by the only route that ever hands a browser a playable URL: `GET
/api/audio/[assetId]/url` (`src/app/api/audio/[assetId]/url/route.ts`).

1. Authorize using the **caller's own RLS-scoped client**, but WITHOUT
   selecting the row at all — call the `can_view_audio_asset()` RPC (`security
   definer`, so it needs no column privilege of its own) and throw
   `NotFoundError` if it returns false. Authorization and "does it exist" are
   deliberately indistinguishable here, and the route handler always answers
   with **404, never 403** for exactly that reason — a 403 would itself leak
   that a private asset exists.
2. Only after that succeeds, read `original_path`/`processed_path` and mint
   the URL with the **admin (service role) client** — required both because
   the caller may not be the object's owner AND because, as of migration 15
   below, no non-service-role client can even select those two columns.
3. TTL: **10 minutes** (`SIGNED_AUDIO_URL_TTL_SECONDS`) — long enough to
   start and finish a typical Wave and survive a seek or brief network drop;
   short enough that a leaked URL is worthless almost immediately. Longer
   Waves re-sign on demand.
4. `mintPlaybackUrl` prefers `processed_path` and falls back to
   `original_path` while a Wave is still `pending`/`processing` — so
   playback never blocks on the worker, it just plays the unenhanced file
   until processing catches up.

Raw storage paths are never sent to a client outside these two functions.
The route response is always `Cache-Control: private, no-store`.

### Storage security — column-level lockdown (spec §33, migration 15)

**The bug, and the fix.** Migration 12 granted TABLE-level `SELECT` on
`public.audio_assets` to `anon`/`authenticated`, gated only by the
`audio_assets_select` RLS policy (`can_view_audio_asset()`). Table-level
`SELECT` implicitly covers every column — including `original_path` and
`processed_path`, the raw storage keys — so anyone who could view a Wave
could also read its audio asset's raw storage paths directly through
PostgREST (`GET /audio_assets?select=original_path,processed_path`), even
though no application code ever intentionally requested those columns. That
directly contradicted this document's own "raw storage paths are never sent
to a client" claim above.

Migration `20260903121500_audio_asset_column_security.sql` fixes it. The
subtlety: **Postgres column-level `GRANT`/`REVOKE` cannot restrict a role
that already holds table-level `SELECT`** — column grants only ever *add*
access for a role that lacks the table-level privilege; a bare column
`REVOKE` while the table-level grant survives is a silent no-op. So the fix
revokes table-level `SELECT` on `audio_assets` entirely from
`anon`/`authenticated`, then re-grants `SELECT` scoped to an explicit column
list that excludes the two path columns. Every other column (processing
status, peaks, duration, mime type, ...) stays directly readable — the
"Processing" banner and waveform/duration rendering still work with no extra
round trip.

Application-side, `src/lib/db/audioAssets.ts` mirrors this split:

- `getAudioAssetById(db, assetId)` — the caller's own client, the safe
  column list only. Always returns `originalPath: ""` / a redacted
  `processedPath`; suitable for status/UI reads, never for playback.
- `getAudioAssetPathsPrivileged(admin, assetId)` (internal) — the admin
  client, `original_path`/`processed_path` only. Called exclusively from
  `mintSignedAudioUrl`/`mintPlaybackUrl`, after `assertCanViewAudioAsset`.
- `createAudioAsset` and `updateAudioAssetPreset` request the safe column
  list on their `.select()` too (an authenticated client, even the row's own
  owner, cannot select the path columns back) and reconstruct
  `originalPath` from what the caller already just wrote, rather than
  re-reading it.
- `markAudioAssetFailed(admin, assetId, reason)` — the one legitimate,
  service-role-only exception to `audio_assets`'s hand-written `Update` type
  (`src/types/database.ts`), which otherwise omits every processing column
  on purpose. Used by `finalizeUpload` when the server-side magic-byte check
  rejects an upload before any processing job exists.

See `docs/DATABASE.md` for the migration list and `supabase/migrations/down/`
for the rollback (which deliberately re-opens this hole — documented there).

## Client capture (spec §17, §18, §19, §20)

Everything below lives under `src/lib/audio/`, `src/components/audio/` and
`src/components/create/`. It is client infrastructure only — no server
actions, no Supabase calls of its own. It produces a typed `CreateWaveDraft`
(see `src/lib/audio/createDraft.ts`) and hands it to an injected `onSubmit`;
`CreateFlow.tsx`'s `runPublish` is that seam, now wired to the real
`createUploadTicket` → upload → `finalizeUpload` → `publishWave` sequence
above (`src/app/(app)/create/actions.ts`).

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
enhance → details → Publish. `CreateWaveForm`'s `onSubmit` calls
`CreateFlow.tsx`'s `runPublish`, which drives the real ticket → upload →
finalize → publish sequence documented in "Upload sequence" above, with a
distinct loading phase shown for each step and a retry that resumes from the
top on failure — never a fake success toast (spec §38, §44).

## Backing tracks (spec §4)

Full write-up: `docs/BACKING_TRACKS.md` (schema, RLS, licenses of the 12
seeded tracks, seeding script). Summary of the audio path: singing over a
backing track is modelled as a Duet-of-the-track, reusing the Duet mixdown
machinery below rather than inventing a second pipeline.

`publishWave` (`src/app/(app)/create/actions.ts`), given a `backingTrackId`:
creates the Wave with `backing_track_id` set and `parent_wave_id` left
`null` (it is not a Duet of another WAVE — `waves_not_duet_and_backing_track`,
migration `20260905110000_backing_tracks.sql`, keeps the two mutually
exclusive), then calls `enqueueBackingTrackMixJob()`
(`src/lib/db/backingTracks.ts`), which queues the *same* `mix_duet` job type
as an ordinary Duet with `reference_asset_id` = the track's own audio asset,
`offset_ms: 0` (vocal and track start together), and a new
`reference_gain_db` field (default `-6`, `DEFAULT_BACKING_TRACK_GAIN_DB`) so
the instrumental sits behind the vocal rather than at its own recorded level.
`buildDuetMixFilterComplex` (`src/lib/duet/ffmpegChain.ts`) applies that gain
as a `volume=<n>dB` filter on the reference stem before `amix` — `0` (an
ordinary Duet) adds no filter at all, so existing Duet mixes are byte-for-byte
unaffected. The contribution (vocal) stem goes through the same clean/master/
peaks pipeline described above, exactly like any other `mix_duet` job.

## Duet mixdown

Covered fully in `DUET_SPEC.md`. Summary: never trust client-side mixing.
`enqueueDuetMixJob()` (`src/lib/db/duets.ts`) queues a `mix_duet` job
carrying `{ reference_asset_id, offset_ms, preset, advanced_eq }`
(`offset_ms` signed, may be negative); the worker resolves the sign by
delaying whichever stem needs it (`adelay` itself never receives a negative
value), applies the chosen preset + advanced EQ to the new take alone before
mixing, `amix`es it against the reference, and uploads the result as the new
take's own `processed_path` — that rendered file is what the finished Duet
Wave's `audio_asset_id` points at. The contribution stem is also routed
through the clean stage (sidecar/`arnndn`/skip — see "The sidecar" above)
before mixing, exactly like a `process_audio` job; the reference is left
untouched, same as the preset/EQ rule below.

### Avoiding a duplicate `process_audio` job for a Duet contribution

A Duet contribution stem goes through the *same* `createUploadTicket` ->
upload -> `finalizeUpload` sequence documented above, then gets a `mix_duet`
job queued against it. Left unguarded, that means the same `audio_assets`
row could get **two** jobs racing to write it: the ordinary `process_audio`
job `finalizeUpload` enqueues for every asset by default, and the `mix_duet`
job queued moments later by `publishDuetWave`
(`src/app/(app)/create/duetActions.ts`). Both jobs write the row through the
same `complete_audio_job` RPC on completion, and — because `process_audio`
and `mix_duet` are different `job_type`s — the "one live job per
`(audio_asset_id, job_type)`" unique partial index (`audio_processing_jobs_active_uniq`,
migration 03) does **not** stop this: nothing in the schema prevents both
from running concurrently. Whichever finished last would win, and if
`process_audio` was still retrying after a transient failure when
`mix_duet` completed, its eventual success would silently overwrite the real
mix with the unmixed solo take.

**Fix:** `finalizeUpload` (`src/app/(app)/create/actions.ts`) takes a third,
optional `skipAutoProcessing` argument (default `false`, also on
`finalizeUploadSchema` in `src/lib/validation/audio.ts`) that skips only the
`enqueueAudioProcessing` call — the magic-byte validation immediately above
it, the actual security boundary (spec §18), always still runs.
`DuetRecorder.tsx` passes `true` for the contribution's `finalizeUpload`
call, since the `mix_duet` job about to be queued for the same asset already
applies the chosen preset/EQ as part of the mixdown (see above) — there is
nothing left for a standalone `process_audio` pass to do. The asset
legitimately stays `processing_status = 'pending'` (never a faked `'ready'`)
in the gap between finalize and the mix job completing; `mintPlaybackUrl`
already falls back to `original_path` while pending, so playback is never
blocked or faked in the meantime. If `mix_duet` itself then fails to
enqueue, `publishDuetWave` falls back to enqueuing the standalone
`process_audio` job after all, so the stem is never left with zero jobs ever
scheduled against it. Full write-up: `DUET_SPEC.md` ("Avoiding a duplicate
processing job").
