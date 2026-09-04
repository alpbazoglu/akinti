# AKINTI — Duet Spec

Duet is a first-class feature, not a secondary remix mode (spec §3.6, §15).
This is the schema, lifecycle, and synchronization approach an engineer
needs before touching Duet code. See also `AUDIO_ARCHITECTURE.md` (mixdown
mechanics) and `DATABASE.md` (schema map).

## Flow

```
Original Wave → Request Duet → Duet Request (PENDING)
   → Recipient accepts → Contributor records against the original
   → Both stems + offset sent to a background mix job (never client mixdown)
   → Server renders the combined audio + waveform
   → Publish → new Duet Wave, linked to the original
   → Original creator notified → Duet Wave enters discovery/profile
```

## Duet tree schema

Every `waves` row carries three duet-lineage columns, all server-derived —
a client may only propose `parent_wave_id`:

- **`parent_wave_id`** — the immediate ancestor. This is the real tree edge.
- **`original_wave_id`** — the ROOT of the chain. Makes "every Duet of X" a
  single indexed lookup (`waves_original_idx`) instead of a recursive query.
- **`duet_request_id`** — the accepted request that authorized this Wave.
- **`duet_depth`** — chain depth from the root, capped at 32.

```
Original Wave  (original_wave_id = null, parent_wave_id = null, depth 0)
  ├── Duet A    (original = Original, parent = Original, depth 1)
  │     └── Duet A2  (original = Original, parent = Duet A, depth 2)
  ├── Duet B    (original = Original, parent = Original, depth 1)
  └── Duet C    (original = Original, parent = Original, depth 1)
```

`waves_derive_duet_lineage` (trigger, migration 04) computes
`original_wave_id`/`duet_depth` from `parent_wave_id` on insert/update — a
client cannot set them directly, and cannot lie about the tree shape.
CHECK constraints enforce the shape invariant:
`(creation_type = 'duet') = (parent_wave_id is not null) = (original_wave_id is not null)`.

**A Duet never copies audio.** It references the rendered mix (its own
`audio_asset_id`, produced from the parent's audio + the contributor's new
take) — the parent's original file is read, never duplicated.

Query helpers: `listDuetsOfWave` (every descendant of a root),
`listDirectDuets` (one tree level), `listProfileDuets` (a creator's own
Duets) — all in `src/lib/db/waves.ts`.

## Duet request lifecycle

```
PENDING → ACCEPTED | DECLINED | CANCELLED | EXPIRED
```

State machine enforced by `duet_requests_guard` (migration 12), not just by
convention:

- **Insert:** `recipient_id` is always derived from the target Wave's
  creator server-side — a client's claimed `recipient_id` is discarded. New
  requests start `PENDING`; `expires_at` defaults to **14 days** and is
  clamped to at most 30 days even if a client tries to set it further out.
- **Accept/Decline:** only `recipient_id` may transition
  `PENDING → ACCEPTED | DECLINED`.
- **Cancel:** only `requester_id` may transition `PENDING → CANCELLED`.
- **Expire:** anyone may fold an already-lapsed request into `EXPIRED`
  (`new.expires_at <= now()`), but nobody may force-expire a still-live one.
  `expire_duet_requests()` sweeps all lapsed `PENDING` rows in one call —
  run from the worker's periodic maintenance tick
  (`scripts/worker.ts#runMaintenance`, roughly once a minute).
- **Terminal states are immutable.** Once a request leaves `PENDING`, its
  status cannot change again (`old.status <> 'pending' and new.status <>
  old.status` raises).
- **One live request per `(wave, requester)`** — a partial unique index
  (`duet_requests_one_pending_per_requester`) rejects duplicate/concurrent
  requests for the same Wave at the database level (spec §46).
- **Blocking cancels pending requests both ways** — `blocks_after_insert`
  (migration 12) sets any pending request between the two accounts to
  `CANCELLED` the moment either blocks the other.

## Duet permissions (spec §15)

Who may request a Duet on a Wave: **Everyone / Followers / People I follow /
Nobody**, resolved by `can_request_duet(wave_id)`:

1. The viewer must already be able to see the Wave (`can_view_wave`).
2. The viewer may not be the Wave's creator (you don't request a Duet on
   your own Wave — you just record one directly).
3. Neither party may have blocked the other.
4. `waves.duet_permission` (per-Wave override) wins if set; otherwise
   `profiles.duet_permission` (account default) applies. `NULL` on the Wave
   means "inherit the creator's profile setting" — this is resolved
   server-side, never left to client logic.

Enforced by both the `duet_requests_insert` RLS policy (checks
`can_request_duet`) and again by `waves_guard_insert` at Wave-publish time
(a Duet Wave requires an `ACCEPTED` request the caller is a party to, whose
`wave_id` matches the claimed `parent_wave_id`). Hiding the "Request a Duet"
button in the UI is not enforcement — always call `canRequestDuet()`
(`src/lib/db/duetRequests.ts`) server-side before acting on it.

### Permissions matrix

Every row below is enforced identically in three places, checked to agree
by `src/lib/duet/permissions.test.ts`: the `can_request_duet()` SQL function
(authoritative), its pure TypeScript mirror `canRequestDuet()`
(`src/lib/duet/permissions.ts`, request-page-only, never the real boundary),
and `requestDuet()`/`duet_requests_insert` RLS at write time.

| Condition | Result |
|---|---|
| Viewer signed out | DENIED (`not_signed_in`) |
| Wave soft-deleted, `only_me`, or private/`followers`-only and the viewer doesn't qualify | DENIED (`wave_unavailable`) |
| Viewer is the Wave's own creator | DENIED (`self_request` — record one directly instead) |
| Either party has blocked the other (either direction) | DENIED (`blocked`) |
| Resolved audience (`waves.duet_permission ?? profiles.duet_permission`) = `nobody` | DENIED (`duets_disabled`) |
| Resolved audience = `followers`, viewer doesn't follow the creator | DENIED (`audience_not_allowed`) |
| Resolved audience = `following` ("people I follow"), creator doesn't follow the viewer back | DENIED (`audience_not_allowed`) |
| Viewer already has a `PENDING` request on this Wave | DENIED (`duplicate_pending_request`) |
| Resolved audience = `everyone` (or a satisfied `followers`/`following`), no pending request | **ALLOWED** |

Only `status = 'pending'` blocks a new request — a prior `EXPIRED`,
`DECLINED`, or `CANCELLED` request never does (`duet_requests_one_pending_per_requester`
is a partial unique index scoped to `status = 'pending'`).

## Recording & synchronization (spec §15)

### The full UI flow (`DuetRecorder.tsx`, `/w/[id]/duet/record`)

```
accepted request → /duets "Record your Duet" → /w/[id]/duet/record?request=<id>
  → original loads (signed playback URL) → press "Record your contribution"
  → original plays locally + MediaRecorder captures the mic, together
  → press "Stop" → preview both tracks together, nudge the offset, pick a preset
  → Publish Duet → upload the take → publishDuetWave() → redirect to the new Wave
```

`DuetRecorder` does **not** use the app-wide global playback store
(`usePlaybackStore`) for the original — that store enforces "only one Wave
plays at a time" everywhere else in the app (spec §12), which is the wrong
model for a recorder that needs the original playing *while* the mic is
live. It owns a local `<audio>` element directly instead, calling
`store.pause()` once before recording/previewing starts so the rest of the
app still only ever has one thing playing.

**Offset math** (`src/lib/duet/sync.ts`, unit tested in `sync.test.ts`):

- **Base offset** — `computeBaseOffsetMs`: the original `<audio>` element's
  `currentTime` (in ms, floored at 0) at the exact instant the recorder's
  state machine transitions into `"recording"` — not at the button click,
  which races microphone-permission latency by anywhere from a few
  milliseconds to a user's explicit "Allow" tap.
- **Manual nudge** — `clampNudgeMs`: a signed correction in
  `OFFSET_NUDGE_STEP_MS` (500 ms) increments, clamped to ±`MAX_NUDGE_MS`
  (10 s), for the small human delay between hearing a cue and actually
  starting to sing/speak.
- **Resolved offset** — `resolveOffsetMs(base, nudge) = clamp(base + nudge, ±MAX_AUDIO_DURATION_MS)`
  — sent to the server as `offsetMs`. It **may go negative** (the nudge
  pushed the contribution's effective start before the reference's) — this
  is intentional, not an edge case to reject; see the mix payload below for
  how the sign is resolved.
- **Client preview scheduling** — `computePreviewSchedule(offsetMs)` mirrors
  `buildDuetMixFilterComplex`'s own delay assignment exactly (see
  `AUDIO_ARCHITECTURE.md`), so the in-browser A/B preview of both tracks
  together matches what the server will actually render: whichever stem
  starts later gets a `setTimeout` delay, the other starts immediately.

**Recording start is gated**, not merely attempted: `DuetRecorder` refuses to
start recording until the original's signed playback URL has actually
resolved (`originalUrl` set, no `originalLoadError`) — recording against
nothing would produce a meaningless `baseOffsetMs` stuck at 0 and an
unusable Duet (spec §38 "original unavailable"). A failed load surfaces a
retryable `ErrorState`, not a dead end.

Server-side: **never trust client-side mixdown.** On publish, the client
uploads the new take as its own `audio_assets` row via the same
`createUploadTicket`/`finalizeUpload` Server Actions the ordinary `/create`
flow uses (`src/app/(app)/create/actions.ts` — see "Avoiding a duplicate
processing job" below for the one difference in how `DuetRecorder` calls
`finalizeUpload`), then `publishDuetWave()`
(`src/app/(app)/create/duetActions.ts`) calls `enqueueDuetMixJob()`
(`src/lib/db/duets.ts`), which queues a `mix_duet` job carrying:

```json
{ "preset": "studio", "reference_asset_id": "<original's audio_asset_id>", "offset_ms": 1240, "advanced_eq": null }
```

`offsetMs` here is **signed** (can be negative) and unbounded below 0 —
unlike the older `enqueueDuetMix()` helper in `src/lib/db/audioAssets.ts`
(payload `{ preset, reference_asset_id, offset_ms }`, `offset_ms >= 0` only,
no `advanced_eq`), which predates the negative-offset/EQ support and is kept
only for backward compatibility; `parseMixDuetJobPayload`
(`src/lib/duet/ffmpegChain.ts`) accepts either shape. The worker
(`runMixDuetJob`, `scripts/worker.ts`) downloads both stems, builds the
`-filter_complex` graph via `buildDuetMixFilterComplex`
(`src/lib/duet/ffmpegChain.ts`):

- `contributionDelayMs = max(0, offsetMs)`, `referenceDelayMs = max(0, -offsetMs)`
  — exactly one of the two is non-zero (or both zero, for a simultaneous
  start). `adelay` itself only ever accepts a non-negative delay, so a
  negative offset is resolved by delaying the **reference** instead of
  passing a negative value to `adelay` — never the other way around.
- The chosen enhancement preset (and, if present, the 5-band advanced EQ —
  `buildAdvancedEqFilter`) is applied to the **contribution stem only**,
  before mixing — running it over the already-mixed pair a second time
  would double-process the original, which already carries its own
  creator-chosen processing.
- `amix=inputs=2:duration=longest:dropout_transition=2` combines the two,
  and the result is written back as the **new take's own** `processed_path`
  — that rendered file is what `createDuetWave()`'s `audio_asset_id` ends up
  pointing at. Both original stems remain available in storage even after
  mixing, in case a future feature wants per-track remixing.

Full ffmpeg/worker mechanics: `AUDIO_ARCHITECTURE.md` ("Duet mixdown").

### Avoiding a duplicate processing job (the job race — resolved)

**The race, as originally shipped:** `finalizeUpload` (`create/actions.ts`)
unconditionally enqueued a standalone `process_audio` job for every newly
uploaded/recorded `audio_assets` row, with no notion of "this asset is a
Duet contribution about to be consumed by a different job." A Duet
contribution's `finalizeUpload` call and `publishDuetWave`'s
`enqueueDuetMixJob` call therefore both queued a job against the **same**
`audio_assets` row — one `process_audio`, one `mix_duet`. Both write that
row via the same `complete_audio_job` RPC on completion, and — because they
are different `job_type`s — the "one live job per `(audio_asset_id,
job_type)`" unique partial index does **not** prevent this: nothing in the
schema stops both from running concurrently. Whichever finished last won.
In the common case `process_audio` (enqueued first, strictly earlier) lost
that race harmlessly; but if it was still retrying after a transient
failure when `mix_duet` completed, its eventual success would silently
overwrite the real mix with the unmixed solo contribution — a real,
non-hypothetical bug, not a theoretical one.

**The fix:** `finalizeUpload` now accepts a third parameter,
`skipAutoProcessing?: boolean` (also threaded through
`finalizeUploadSchema` in `src/lib/validation/audio.ts`, default `false` —
every other caller is unaffected). `DuetRecorder.tsx` passes `true` for the
contribution's `finalizeUpload` call:

```ts
// src/components/duet/DuetRecorder.tsx
const finalized = await finalizeUpload(ticket.assetId, advancedEq ?? undefined, true);
```

When set, `finalizeUpload` still performs the real magic-byte validation
(the actual security boundary, spec §18) but skips the `enqueueAudioProcessing`
call — the asset legitimately stays `processing_status = 'pending'` (never a
fake `'ready'`) until the `mix_duet` job enqueued moments later by
`publishDuetWave` completes and calls `complete_audio_job` itself.
`mintPlaybackUrl` already falls back to `original_path` while an asset is
`pending`, so nothing ever serves a half-processed or fake-ready file in the
gap. Since the worker's `mix_duet` handler already applies the chosen
preset/EQ to the contribution as part of the mixdown (see above), nothing is
lost by skipping the standalone pass — the two jobs were never meant to both
run against the same asset in the first place.

**Fallback if `mix_duet` itself fails to enqueue:** `publishDuetWave`
(`create/duetActions.ts`) already published the Wave and reports
`mixQueued: false` in that case (never a silent failure). It now also
falls back to enqueuing the ordinary `process_audio` job for the
contribution, so the stem is not left `pending` forever with no job ever
scheduled against it — the published Duet Wave will play the raw, unmixed
take until someone retries the mix, but it is never stuck unprocessed.

## Publishing the Duet Wave

`createDuetWave()` (`src/lib/db/waves.ts`) inserts a Wave with
`creation_type = 'duet'`, the mixed `audio_asset_id`, `parent_wave_id`, and
`duet_request_id`. `waves_guard_insert` independently re-verifies the
request is `ACCEPTED`, belongs to the caller, and that `parent_wave_id`
matches the request's `wave_id` — the application code does not re-implement
that check, only shapes the insert. `publishDuetWave` then credits the
original creator as an **already-`accepted`** collaborator directly (not
another pending invite — see Collaborators below) and enqueues the
`mix_duet` job described above.

## Collaborators (spec §16)

`wave_collaborators`: `pending → accepted | declined`. A collaborator credit
(e.g. the Duet partner) is **always an invitation the other person must
accept** — nothing auto-adds someone as a collaborator. Invited-by tracking
(`invited_by`) and a per-Wave `role` string (e.g. "vocals") are supported.
Query/write helpers: `inviteCollaborator`, `respondToCollaboratorInvite`,
`listWaveCollaboratorProfiles` in `src/lib/db/waves.ts`.

## Notifications (spec §15, §23 — no spam)

Fired exactly on: request received (`duet_request`), accepted
(`duet_accepted`), declined (`duet_declined`), a Duet published against your
Wave (`duet_published`), collaborator invited/accepted
(`collaborator_invite`/`collaborator_accepted`). Deliberately **no**
"someone viewed your request" notification — `CANCELLED`/`EXPIRED`
transitions notify nobody. All notifications are grouped by
`group_key` (e.g. `duet_request:<request_id>`) through the shared
`push_notification()` path — see `DATABASE.md`.

## Security test scenarios to keep passing (spec §46)

```
User A disables Duets → User B's request → REQUEST DENIED
User A blocks User B → User B's request on any of A's Waves → REQUEST DENIED
User B sends a duplicate/concurrent request on the same Wave → second one REJECTED
User A's private Wave → User B (not a follower) requests a Duet → DENIED
An accepted request is re-submitted/replayed → REJECTED (terminal state is immutable)
A revoked/expired request is used to publish a Duet Wave → REJECTED
```

## Failure paths (spec §38 — no silent failures)

Every step of the flow has a real loading/error/retry state, never a fake
"done":

| Failure | Where it's caught | User-facing behavior |
|---|---|---|
| Microphone permission denied | `useRecorder()`'s `"denied"` status (`src/lib/audio/recorder.ts`) | `RecordStep` shows the recorder's own error text inline; "Record your contribution" stays available to retry (re-prompts the browser) |
| No microphone / unsupported browser | `"unsupported"` status | Record button disabled, inline error shown |
| Original Wave's audio fails to load | `DuetRecorder`'s playback-URL fetch effect sets `originalLoadError` | A retryable `ErrorState` replaces the caption; **recording is refused** (button disabled) until the original actually loads — see "Recording start is gated" above |
| Duet Request expired/cancelled/already fulfilled before recording starts | `/w/[id]/duet/record` re-checks `request.status`/`resultingWaveId` server-side on every load | An explanatory `EmptyState`, not a broken recorder; a request that already produced a Wave redirects straight to it |
| Upload (`uploadToSignedUrl`) fails or throws | `DuetRecorder.handlePublish`, mirroring `CreateFlow.tsx`'s `runPublish` | `outcome` → `"error"`, retryable `ErrorState` with the real reason, `handlePublish` re-runs from the top on retry (no partial-progress replay) |
| `finalizeUpload` rejects (bad magic bytes, expired session, etc.) | same `handlePublish` sequence | same — error surfaced, never a fake success |
| `publishDuetWave` rejects (request no longer `accepted`, race with another publish attempt, asset ownership mismatch, `resulting_wave_id` already set) | same sequence; `publishDuetWave` itself re-verifies request state and asset ownership independent of the client | same — and `waves_guard_insert` is a third, independent check at the database level even if every application-level check somehow passed |
| `mix_duet` fails to enqueue after a successful publish | `publishDuetWave` returns `{ ok: true, mixQueued: false }` (the Wave still published — collaborators aren't blocked on a mix job) and falls back to enqueuing `process_audio` so the stem isn't left unprocessed forever | Never surfaced as a publish failure (it isn't one); logged server-side, not silently swallowed |

## Test matrix

| Layer | File | Covers |
|---|---|---|
| Unit | `src/lib/duet/permissions.test.ts` | Every branch of the permissions matrix above, plus the spec §46 security scenarios expressed as pure-function inputs |
| Unit | `src/lib/duet/sync.test.ts` | `computeBaseOffsetMs`, `resolveOffsetMs` (including going negative and clamping), `computePreviewSchedule` mirroring the mix filter graph's delay assignment |
| Unit | `src/lib/duet/ffmpegChain.test.ts` | `buildDuetMixFilterComplex` (positive/negative/zero offset, `adelay` never receives a negative value, preset+EQ applied to the contribution only, never the reference or the mixed output), `buildAdvancedEqFilter`, `parseMixDuetJobPayload` (both payload shapes) |
| E2E (`E2E_SUPABASE=1`) | `e2e/duet.spec.ts` | Happy path: request → accept → record (fake mic device) → publish → the original links to the new Duet. Denial: a Wave with `duet_permission = 'nobody'`. Denial: a blocked requester. |
| Manual / needs a real Supabase project | — | The full `duet_requests_guard` state machine under real concurrent writes (`23505`/`23514` races), `expire_duet_requests()` sweeping actually-lapsed rows, the worker (`scripts/worker.ts`) actually running `mix_duet` end-to-end with real ffmpeg |
