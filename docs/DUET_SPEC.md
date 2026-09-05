# AKINTI — Duet Spec v2 (Wave D — "Duets as the center")

Duet is the center of the product (`docs/PRODUCT_V2.md` §3-4), not a
secondary remix mode. This is the schema, lifecycle, modes and
synchronization approach an engineer needs before touching Duet code. See
also `AUDIO_ARCHITECTURE.md` (mixdown mechanics) and `DATABASE.md` (schema
map).

v2 (Wave D) adds three things on top of the v1 flow below: **Open Calls**
(skip request/accept entirely), **Duet modes** (`atisma` call-and-response
and `cypher` sequential verses, alongside the original simultaneous `layer`
mix), and **chains** (a queryable tree instead of only "every descendant,
flat" / "one level").

## Flow

```
Original Wave → Request Duet → Duet Request (PENDING)
   → Recipient accepts → Contributor records against the original
   → Both stems + offset (+ mode-specific data) sent to a background mix job
   → Server renders the combined audio + waveform
   → Publish → new Duet Wave, linked to the original
   → Original creator notified → Duet Wave enters discovery/profile
```

**v2 shortcut — Open Calls:**

```
Creator marks a Wave "open for anyone to Duet" (optional prompt + deadline)
   → Anyone who could otherwise request a Duet instead answers the call
   → answerOpenCall(waveId) creates an ACCEPTED Duet Request directly
   → Contributor records immediately — no accept step to wait on
   → Creator gets one "X answered your open call" notification
```

## Duet tree schema

Every `waves` row carries three duet-lineage columns, all server-derived —
a client may only propose `parent_wave_id`:

- **`parent_wave_id`** — the immediate ancestor. This is the real tree edge.
- **`original_wave_id`** — the ROOT of the chain. Makes "every Duet of X" a
  single indexed lookup (`waves_original_idx`) instead of a recursive query.
- **`duet_request_id`** — the accepted request that authorized this Wave.
- **`duet_depth`** — chain depth from the root, capped at **6** (tightened
  from an arbitrary 32 in Wave D — `docs/PRODUCT_V2.md` §3-4).

```
Original Wave  (original_wave_id = null, parent_wave_id = null, depth 0)
  ├── Duet A    (original = Original, parent = Original, depth 1)
  │     └── Duet A2  (original = Original, parent = Duet A, depth 2)
  │           └── … up to depth 6
  ├── Duet B    (original = Original, parent = Original, depth 1)
  └── Duet C    (original = Original, parent = Original, depth 1)
```

`waves_derive_duet_lineage` (trigger, migration 04, extended in Wave D's
migration 31) computes `original_wave_id`/`duet_depth` from `parent_wave_id`
on insert/update — a client cannot set them directly, and cannot lie about
the tree shape. CHECK constraints enforce the shape invariant:
`(creation_type = 'duet') = (parent_wave_id is not null) = (original_wave_id is not null)`.

**Duetting a Duet already worked at the schema level before Wave D** — the
lineage trigger recurses through any parent regardless of that parent's own
`creation_type`, and `can_request_duet`/`waves_guard_insert` never
special-cased "the target is itself a Duet." Wave D's only structural change
here is lowering the depth ceiling from 32 to a deliberate product cap of 6,
plus deriving the two new mode-related columns below in the same trigger
pass — see "Duet modes."

**A Duet never copies audio.** It references the rendered mix (its own
`audio_asset_id`, produced from the parent's audio + the contributor's new
take) — the parent's original file is read, never duplicated. For `cypher`
mode specifically, "the parent's audio" means the parent's OWN rendered
mix — which itself already contains every earlier verse concatenated in, so
nothing upstream is ever re-rendered.

Query helpers: `listDuetsOfWave` (every descendant of a root, flat),
`listDirectDuets` (one tree level), `listProfileDuets` (a creator's own
Duets) — all in `src/lib/db/waves.ts`. For the actual branching shape, see
"Duet chains" below.

## Duet chains (Wave D)

`duet_tree(root_wave_id)` (migration 32, `SECURITY DEFINER`) returns the
whole chain in one call — `id`, `parent_wave_id`, `creator_id`, `depth`,
`creation_type`, `duet_mode`, `cypher_order`, `published_at`, `play_count`,
`duet_count` — via a recursive CTE, `can_view_wave`-filtered **per node**
(not just at the root): a private/blocked branch of an otherwise-public tree
never leaks through. Bounded by `waves_depth_valid` (≤ 6), so the recursion
is never unbounded.

`getDuetTree(db, rootWaveId)` (`src/lib/db/duets.ts`) calls the RPC, then
hydrates every id into a full `Wave`/`Profile` (two batched queries — the
same "flat RPC list, then hydrate by id" shape `listCollaboratorsForWaves`/
`listSavedWaveIds` already use), and hands the result to
`src/lib/duet/chain.ts`'s pure builders:

- **`buildDuetTree(rows, wavesById, creatorsById)`** — nests the flat rowset
  into `DuetTreeNode[]` (`{ wave, creator, children }`, the shape
  `src/types/domain.ts` already declared). A row whose parent isn't present
  in the hydration maps (or isn't in the rowset at all) becomes its own
  root rather than being dropped — defensive against a partially-hydrated
  caller, never against anything `duet_tree` itself would produce.
- **`computeDuetTreeStats(tree)`** — `chainLength` (longest root-to-leaf
  path, in Waves — a lone root is 1), `totalDuets`/`totalWaves`,
  `directDuets` (the root's own children), `leafWaveIds`, and
  `branchCounts` (direct-child count per Wave id — "how many people
  duetted THIS specific Wave").
- **`computeCypherOrder(parent)`** — pure mirror of the
  `waves_derive_duet_lineage` cypher-order derivation (see below), for
  anything that wants to preview/validate a cypher position client-side
  without a round trip; the database trigger remains the authority.

**UI contract:** call `getDuetTree(db, waveId)` for a tree/branch view;
`{ tree, stats }` is everything a chain visualization needs. Unit tested:
`src/lib/duet/chain.test.ts`.

## Open Calls (Wave D)

A creator marks their own Wave "open for anyone to Duet," with an optional
prompt and deadline (`docs/PRODUCT_V2.md` §3-4). Modeled as its own table,
`open_calls` (migration 30) — one row per Wave
(`open_calls_one_per_wave`), not a `waves.open_call` jsonb column: a real
table gets keyset pagination and its own RLS for free, and "close, then
reopen with a new prompt" is a natural row lifecycle (`is_open`/
`closed_at`) rather than something to reverse-engineer out of jsonb.

```
open_calls
  id, wave_id (unique), creator_id (server-derived from the Wave),
  prompt (<=500 chars, optional), deadline_at (optional),
  is_open, created_at, updated_at, closed_at
```

`open_calls_guard()` derives `creator_id` from the Wave server-side
(mirrors `duet_requests_guard` deriving `recipient_id`) — a client cannot
open a call on someone else's Wave even by forging the column. RLS: anyone
who can already see the Wave can read its call; only the creator can
write it.

### Actions (`src/app/(app)/w/[id]/duet/actions.ts`)

- **`setOpenCall(waveId, prompt, deadlineAt)`** — creator-only. Upserts on
  `open_calls_one_per_wave`, so re-calling it (e.g. to change the prompt, or
  reopen a closed call) updates the same row rather than creating a
  duplicate.
- **`closeOpenCall(waveId)`** — creator-only. Sets `is_open = false`,
  `closed_at = now()`.
- **`answerOpenCall(waveId)`** — anyone who could otherwise request a Duet
  on this Wave. Returns `{ ok: true, requestId }`; the caller redirects
  straight to `routes.duetRecord(waveId, requestId)` — there is no accept
  step left to wait on.

### `answer_open_call(wave_id)` — atomic accept, no round trip

```sql
answer_open_call(p_wave_id uuid) returns uuid  -- the new duet_requests.id
```

`SECURITY DEFINER`, checks, in order:

1. The call exists, `is_open`, and (if set) `deadline_at` hasn't passed.
2. `can_request_duet(wave_id)` — the same view/self/blocks/duet-permission
   audience gate an ordinary request goes through. **An open call does not
   bypass any of these** — it only removes the request/accept round trip,
   never the underlying permission rules.
3. Idempotent: an existing `accepted` request from the same caller for the
   same Wave, not yet turned into a published Duet, is returned as-is
   rather than creating a duplicate.

Then, atomically: inserts a `duet_requests` row (which
`duet_requests_guard`, as always, forces to `status = 'pending'`
regardless of caller), then immediately `UPDATE`s that same row to
`accepted` — flagged via `set_config('akinti.system', 'on', true)` (the
same trusted-system-operation escape hatch `complete_audio_job`/
`resolve_report` use) so the guard's ordinary "only the recipient may
accept" check is skipped for this one call, since the function itself
already established the caller is allowed to answer. Both statements run in
the caller's own request transaction — there is no window where the row is
visibly `pending`.

**Notification, not the generic duet_request/duet_accepted pair.** A second,
narrower session flag (`akinti.open_call_answer`) tells
`duet_requests_after_change` (migration 30) that this insert+update came
from `answer_open_call`, so it fires exactly one `open_call_answered`
notification to the creator instead of the ordinary "duet_request" (on
insert) then "duet_accepted" (on the accept update) pair — which would
otherwise read as "someone requested a Duet, then you accepted it" for
something the creator never manually accepted. `open_call_answered` is a new
`notification_type` value (migration 29 — its own migration, since
`ALTER TYPE ... ADD VALUE` can't be used in the same transaction that
references it).

### Explore → Open Calls

`list_open_calls(genre, cursor, limit)` (migration 30, `SECURITY DEFINER`,
keyset-paginated the same way as `list_backing_tracks`): open, not-yet-
expired calls on Waves the viewer can see, optionally filtered by a
`waves.tags` overlap. `listOpenCalls(db, params)`
(`src/lib/db/openCalls.ts`) wraps it.

## Duet modes (Wave D)

`waves.duet_mode` (`layer | atisma | cypher`, migration 31) — server-
defaulted to `'layer'` for any duet Wave that doesn't request one. Layer is
the pre-existing, only-ever mode; atisma and cypher are new.

| Mode | What it is | Render |
|---|---|---|
| `layer` | Simultaneous mix — the contributor sings/plays alongside the original, in time. | `amix` of both stems at their recorded offset (unchanged from v1). |
| `atisma` | Call-and-response: an ordered splice of trimmed turns from BOTH the original and the contribution. | `atrim` each turn from its source, `acrossfade` (default 40ms) between consecutive turns, fold left. |
| `cypher` | Sequential verses, up to 4 participants: each Duet's contribution plays AFTER the parent's full audio. | `concat` the (enhanced) contribution onto the parent's already-fully-rendered audio. |

### `atisma` — segments

`waves.segments` (jsonb, `atisma` only) is an ordered array the CLIENT
produces while editing:

```json
[
  { "source": "original",     "startMs": 0,    "endMs": 4200 },
  { "source": "contribution", "startMs": 0,    "endMs": 3800 },
  { "source": "original",     "startMs": 4200, "endMs": 9000 },
  { "source": "contribution", "startMs": 3800, "endMs": 7600 }
]
```

Each segment's `startMs`/`endMs` are on ITS OWN source's timeline (the
original Wave's audio, or the contributor's raw take) — not on the
timeline of the finished edit. The array's ORDER is the rendered order.

**Validated, not trusted** — three rules, checked by BOTH
`validate_duet_segments()` (SQL, migration 31, authoritative for what the
database will actually accept) and `validateDuetSegments()`
(`src/lib/duet/ffmpegChain.ts`, the same "mirrored SQL + TS, checked to
agree by tests" pattern `permissions.ts` documents for `can_request_duet`):

1. **Non-empty, at most 40 turns.**
2. **Each segment:** `startMs >= 0`, `endMs > startMs`.
3. **Monotonic and non-overlapping — PER SOURCE, not across the array.**
   Segments alternate between the original and the contribution by
   construction, so the array's `startMs` values are never globally
   increasing; what matters is that neither track's own timeline is
   replayed or reused out of order. Tracked as "last end time used, per
   source" while walking the array.
4. **Total rendered duration <= 1,800,000ms** (30 minutes, mirrors
   `MAX_AUDIO_DURATION_MS`).

`publishDuetWaveSchema`'s Zod `.superRefine` is the primary, user-facing
enforcement (a specific, readable issue on the `segments` field);
`waves_derive_duet_lineage` re-validates independently at the database
level via `validate_duet_segments()` — a request that would be rejected by
one is rejected by the other.

**Rendering** (`buildAtismaMixFilterComplex`, `src/lib/duet/ffmpegChain.ts`):
reference is ffmpeg input `0`, contribution is input `1` (same convention as
`layer`). Each segment becomes `[<0 or 1>:a]atrim=start=..:end=..,asetpts=PTS-STARTPTS[segN]`
— `contribution`-sourced segments additionally get the enhancement
preset/EQ chained on (the "enhance the new part only" rule `layer` already
follows; `original` segments are left exactly as they came from the
creator's own Wave). Consecutive segments are then combined pairwise,
folding left: `[seg0][seg1]acrossfade=d=<seconds>:c1=tri:c2=tri[xf1]`,
`[xf1][seg2]acrossfade=...[xf2]`, … A single-segment edit skips the
crossfade entirely (`anull`). The per-pair crossfade duration is clamped
down (floor 5ms) to the shorter of the two adjacent segments' own durations,
so a very short turn never makes `acrossfade` error out.

### `cypher` — sequential verses, capped at 4

`waves.cypher_order` (smallint, `cypher` only, migration 31) — the
participant's 1-based position. **The root Wave is always participant 1**
(it carries no `cypher_order` itself — it isn't a duet Wave); the first
`cypher`-mode Duet off it (or off any non-cypher parent) is participant 2;
a `cypher` Duet of a `cypher` Duet is `parent.cypher_order + 1`.
`waves_derive_duet_lineage` derives this — a client only chooses
`duet_mode = 'cypher'`, never the order — and raises once a 5th participant
would be added (`waves_cypher_order_range` also CHECKs `1..4` at the column
level). `src/lib/duet/chain.ts#computeCypherOrder` mirrors the same rule in
pure TS, unit tested.

```
Root (implicit participant 1)
  └── Verse 2 (duet_mode=cypher, cypher_order=2, parent=Root)
        └── Verse 3 (duet_mode=cypher, cypher_order=3, parent=Verse 2)
              └── Verse 4 (duet_mode=cypher, cypher_order=4, parent=Verse 3)
                    └── a 5th cypher Duet here is REJECTED (cypher_order would be 5)
```

**Rendering** (`buildCypherMixFilterComplex`): reference (input `0`) is the
PARENT's own already-rendered mix — for verse 3, that's verse 2's audio,
which already contains verse 2 concatenated onto the root; nothing upstream
is ever re-rendered. The contribution (input `1`) gets the enhancement
preset/EQ applied (same "enhance the new part only" rule as `layer`), then
`[0:a][contrib]concat=n=2:v=0:a=1[mixed]` appends it — no crossfade, unlike
`atisma`: a cypher verse starts clean.

**Live-verified** (2026-09-05, against the real project — see "Worker" test
matrix below for the actual run): a root Wave (3.0s), duetted with a 2.5s
`cypher` verse (mixed asset: 5.5s = 3.0 + 2.5, exact), then duetted again
with a second 2.5s `cypher` verse (mixed asset: 8.0s = 5.5 + 2.5, exact).
`duet_tree` on the root correctly reported `duet_depth 0/1/2` and
`cypher_order null/2/3` for the three Waves.

### `layer` — unchanged

Everything in v1's "Recording & synchronization" section below still
describes `layer` exactly. `mode` defaults to `layer` on any payload/request
that predates Wave D, so nothing already shipped changes behavior.

## Extended `mix_duet` payload (Wave D)

```json
{
  "preset": "studio",
  "reference_asset_id": "<uuid>",
  "offset_ms": 1240,
  "advanced_eq": null,
  "mode": "layer",
  "segments": null
}
```

- **`mode`** — `"layer" | "atisma" | "cypher"`, default `"layer"` when
  absent (every pre-Wave-D payload). `parseMixDuetJobPayload`
  (`src/lib/duet/ffmpegChain.ts`) reads it defensively; a malformed value
  falls back to `"layer"` rather than failing the parse.
- **`segments`** — only meaningful (and only ever non-null) when
  `mode === "atisma"`; forced to `null` for every other mode regardless of
  what the raw payload carried, so a stray field can never leak into a
  render path that doesn't expect it.
- **`offset_ms`** — as in v1, `layer` only; ignored (but still sent as
  `0` by `enqueueDuetMixJob`) for `atisma`/`cypher`, which have no single
  "start offset" concept.
- Every other field (`preset`, `reference_asset_id`, `advanced_eq`,
  `reference_gain_db` for a backing-track mix) is unchanged from v1.

`enqueueDuetMixJob` (`src/lib/db/duets.ts`) builds this payload;
`publishDuetWave` (`src/app/(app)/create/duetActions.ts`) passes
`mode`/`segments` straight through from `publishDuetWaveSchema`'s already-
validated input to both `createDuetWave` (the Wave's own `duet_mode`/
`segments` columns) and `enqueueDuetMixJob` (the render job).

## Backing-track Duet lineage (Wave D)

Publishing a Wave with `backingTrackId` (Wave B, `publishWave` in
`src/app/(app)/create/actions.ts`, a file this stage does not own) sets
`waves.backing_track_id`; `parent_wave_id` stays null (it is not a Duet of
another WAVE). Wave D adds the lineage that publish alone didn't produce:

- **`waves_after_insert_backing_track_credit()`** (migration 33, `AFTER
  INSERT` on `waves`): when `new.backing_track_id` is set and the track has
  an uploader (curated tracks don't — `is_curated = (uploader_id is null)`
  guarantees that), the uploader is credited as an **already-accepted**
  `wave_collaborators` row (`role: 'backing track'`, `invited_by` = the
  vocalist) — same "already consented, don't re-ask" reasoning
  `publishDuetWave` uses for crediting a Duet's original creator — plus a
  direct `collaborator_accepted` notification (the ordinary invite/accept
  notifications never fire for a row inserted already-`accepted`). Done
  entirely as a database trigger specifically so it happens unconditionally
  for every backing-track publish, present and future, without editing
  `create/actions.ts` (owned by another agent this stage).
- **`list_waves_on_track(track_id, cursor, limit)`** (migration 33,
  `SECURITY DEFINER`, `can_view_wave`-filtered per row, keyset-paginated) —
  the track page's "Waves on this track." `listWavesOnTrack(db, trackId,
  params)` lives in `src/lib/db/waves.ts` (it returns `Wave`s, not
  `BackingTrack`s, so it doesn't need to touch `backingTracks.ts`, owned by
  another agent).

**Live-verified** (2026-09-05): a curated track (no uploader) produced no
collaborator row, as expected; an uploaded track produced exactly one
already-`accepted` `wave_collaborators` row crediting its uploader, and
`list_waves_on_track` returned the new vocal Wave.

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
  (`answer_open_call` is the one caller that immediately transitions a
  freshly-inserted row past `PENDING` — see "Open Calls" above; it does so
  by flagging the transaction as trusted, not by asking the guard for an
  exception.)
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
`answer_open_call` reuses this exact predicate (see "Open Calls" above) —
an open call changes how a Duet is authorized (skip the round trip), never
who is authorized.

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

**Open call additions:** answering requires the same `can_request_duet`
result as above, PLUS the call itself must exist, be `is_open`, and (if set)
not past its `deadline_at` — checked by `answer_open_call` before it ever
touches `duet_requests`.

## Recording & synchronization (spec §15)

### The full UI flow (`DuetRecorder.tsx`, `/w/[id]/duet/record`)

```
accepted request → /duets "Record your Duet" → /w/[id]/duet/record?request=<id>
  → original loads (signed playback URL) → press "Record your contribution"
  → original plays locally + MediaRecorder captures the mic, together
  → press "Stop" → preview both tracks together, nudge the offset, pick a preset
  → Publish Duet → upload the take → publishDuetWave() → redirect to the new Wave
```

An open-call answer enters this same flow at the second step — `answer_open_call`
already produced the accepted request, so the UI can jump straight to
`/w/[id]/duet/record?request=<id>` with no accept screen in between.

`DuetRecorder` does **not** use the app-wide global playback store
(`usePlaybackStore`) for the original — that store enforces "only one Wave
plays at a time" everywhere else in the app (spec §12), which is the wrong
model for a recorder that needs the original playing *while* the mic is
live. It owns a local `<audio>` element directly instead, calling
`store.pause()` once before recording/previewing starts so the rest of the
app still only ever has one thing playing.

**Offset math** (`src/lib/duet/sync.ts`, unit tested in `sync.test.ts`) —
`layer` mode only; `atisma`/`cypher` have no single offset, only segment
boundaries / a sequential append:

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
(`src/lib/db/duets.ts`), which queues a `mix_duet` job carrying the extended
payload shape documented above. The worker (`runMixDuetJob`,
`scripts/worker.ts`) downloads both stems, then branches on `payload.mode`
to build the `-filter_complex` graph via `buildDuetMixFilterComplex` /
`buildAtismaMixFilterComplex` / `buildCypherMixFilterComplex`
(`src/lib/duet/ffmpegChain.ts`) — see "Duet modes" above for each mode's
exact filter graph. For `layer`:

- `contributionDelayMs = max(0, offsetMs)`, `referenceDelayMs = max(0, -offsetMs)`
  — exactly one of the two is non-zero (or both zero, for a simultaneous
  start). `adelay` itself only ever accepts a non-negative delay, so a
  negative offset is resolved by delaying the **reference** instead of
  passing a negative value to `adelay` — never the other way around.
- The chosen enhancement preset (and, if present, the 5-band advanced EQ —
  `buildAdvancedEqFilter`) is applied to the **contribution stem only**,
  before mixing — running it over the already-mixed pair a second time
  would double-process the original, which already carries its own
  creator-chosen processing. `atisma` and `cypher` follow the same rule,
  scoped to whichever segments/stem are actually the new part — see "Duet
  modes" above.
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
`duet_request_id` — plus, since Wave D, `duet_mode`/`segments` (`cypher_order`
is never accepted as application input; the database derives it, exactly
like `duet_depth`). `waves_guard_insert` independently re-verifies the
request is `ACCEPTED`, belongs to the caller, and that `parent_wave_id`
matches the request's `wave_id` — the application code does not re-implement
that check, only shapes the insert. `publishDuetWave` then credits the
original creator as an **already-`accepted`** collaborator directly (not
another pending invite — see Collaborators below) and enqueues the
`mix_duet` job described above.

## Collaborators (spec §16)

`wave_collaborators`: `pending → accepted | declined`. A collaborator credit
(e.g. the Duet partner, or — Wave D — a backing track's uploader) is
**always an invitation the other person must accept, UNLESS the platform is
crediting someone for a collaboration they already consented to by a
separate action** (accepting a Duet Request; uploading a track marked "open
for vocals") — in which case the row is inserted already `accepted`, and the
ordinary invite/accept notification pair is skipped in favor of a single,
direct notification. Nothing auto-adds someone as a collaborator who hasn't
consented to the underlying collaboration some other way. Invited-by
tracking (`invited_by`) and a per-Wave `role` string (e.g. "vocals",
"backing track") are supported. Query/write helpers: `inviteCollaborator`,
`respondToCollaboratorInvite`, `listWaveCollaboratorProfiles`
(`src/lib/db/waves.ts`).

## Notifications (spec §15, §23 — no spam)

Fired exactly on: request received (`duet_request`), accepted
(`duet_accepted`), declined (`duet_declined`), a Duet published against your
Wave (`duet_published`), an open call answered (`open_call_answered` — Wave
D, replaces the `duet_request`/`duet_accepted` pair for that one path),
collaborator invited/accepted (`collaborator_invite`/`collaborator_accepted`).
Deliberately **no** "someone viewed your request" notification —
`CANCELLED`/`EXPIRED` transitions notify nobody. All notifications are
grouped by `group_key` (e.g. `duet_request:<request_id>`,
`open_call_answered:<request_id>`) through the shared `push_notification()`
path — see `DATABASE.md`.

## Security test scenarios to keep passing (spec §46)

```
User A disables Duets → User B's request → REQUEST DENIED
User A blocks User B → User B's request on any of A's Waves → REQUEST DENIED
User B sends a duplicate/concurrent request on the same Wave → second one REJECTED
User A's private Wave → User B (not a follower) requests a Duet → DENIED
An accepted request is re-submitted/replayed → REJECTED (terminal state is immutable)
A revoked/expired request is used to publish a Duet Wave → REJECTED
A 5th cypher participant is attempted → REJECTED (cypher_order would exceed 4)
A 7th-level Duet chain is attempted → REJECTED (duet_depth would exceed 6)
An atisma Duet is published with overlapping/out-of-order segments → REJECTED
An open call is answered after its deadline, or while closed → REJECTED
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
| `publishDuetWave` rejects (request no longer `accepted`, race with another publish attempt, asset ownership mismatch, `resulting_wave_id` already set, invalid/overlapping `segments`) | same sequence; `publishDuetWave` itself re-verifies request state and asset ownership independent of the client | same — and `waves_guard_insert`/`waves_derive_duet_lineage` are a third, independent check at the database level even if every application-level check somehow passed |
| `mix_duet` fails to enqueue after a successful publish | `publishDuetWave` returns `{ ok: true, mixQueued: false }` (the Wave still published — collaborators aren't blocked on a mix job) and falls back to enqueuing `process_audio` so the stem isn't left unprocessed forever | Never surfaced as a publish failure (it isn't one); logged server-side, not silently swallowed |
| Peaks extraction produces no signal at all (empty or all-zero, non-trivial duration) | `isDegeneratePeaks()` (`scripts/worker.ts`) after either the sidecar or the local ffmpeg peaks pass | The job throws instead of calling `complete_audio_job` — retried with backoff, then a real `processing_status = 'failed'`, never a silently blank waveform. Found live: two pre-Wave-D assets were `ready` with all-zero peaks; re-running them under the current pipeline traces the cause to genuinely silent source audio (ffmpeg's `loudnorm` measures `-inf` LUFS) and now fails them honestly instead. |
| `answer_open_call` on a closed/expired/nonexistent call, or where `can_request_duet` would deny | Raises `42501` inside the RPC | Server Action maps it to a specific "can't answer this open call" message, never a raw Postgres error |

## Test matrix

| Layer | File | Covers |
|---|---|---|
| Unit | `src/lib/duet/permissions.test.ts` | Every branch of the permissions matrix above, plus the spec §46 security scenarios expressed as pure-function inputs |
| Unit | `src/lib/duet/sync.test.ts` | `computeBaseOffsetMs`, `resolveOffsetMs` (including going negative and clamping), `computePreviewSchedule` mirroring the mix filter graph's delay assignment |
| Unit | `src/lib/duet/ffmpegChain.test.ts` | `buildDuetMixFilterComplex` (positive/negative/zero offset, `adelay` never receives a negative value, preset+EQ applied to the contribution only, never the reference or the mixed output), `buildAdvancedEqFilter`, `parseMixDuetJobPayload` (all payload shapes, old and new), `validateDuetSegments`/`buildAtismaMixFilterComplex` (empty segments, overlap, > max duration, single-segment no-crossfade, crossfade clamping, contribution-only enhancement), `buildCypherMixFilterComplex` (contribution-only enhancement, never touching the parent's already-rendered audio) |
| Unit | `src/lib/duet/chain.test.ts` | `buildDuetTree` (nesting, missing-hydration skip, orphan-as-root), `computeDuetTreeStats` (chain length, direct/total duets, leaves, branch counts, empty forest), `computeCypherOrder` (first participant, continuation, the 4-participant cap, a mode switch resetting the count) |
| E2E (`E2E_SUPABASE=1`) | `e2e/duet.spec.ts` | Happy path: request → accept → record (fake mic device) → publish → the original links to the new Duet. Denial: a Wave with `duet_permission = 'nobody'`. Denial: a blocked requester. |
| Manual / needs a real Supabase project | — | The full `duet_requests_guard` state machine under real concurrent writes (`23505`/`23514` races), `expire_duet_requests()` sweeping actually-lapsed rows |
| **Live, run 2026-09-05 against the real project** | — | See "Worker" below — a real `layer` render, a real 4-segment `atisma` render, a real two-verse `cypher` chain, and real backing-track collaborator crediting, all via `scripts/worker.ts` against actual ffmpeg and the live database. |

## Worker — live verification (Wave D)

Run against the live Supabase project (not a fixture), using two existing
ready Waves ("QA test wave", "QA audit wave", both 3.0s) as reference
material plus freshly-uploaded synthetic tones as contributions, then
`npm run worker:once` for real (ffmpeg 9, local machine; the sidecar was
intermittently reachable during this run and both the sidecar and local
fallback paths were exercised across the three jobs — see each asset's
`enhancement_report.clean/master.method`).

| Job | Mode | Reference | Contribution | Result duration | Master LUFS (before → after) | Mixed asset id |
|---|---|---|---|---|---|---|
| 76 | `layer` | 3.0s ("QA test wave") | 3.0s tone, offset +400ms | **3.4s** (3.0s + 400ms delayed tail — exact) | -22.17 → -14.66 | `ed1d15b6-cf07-438e-870c-dac4ab8ea897` |
| 77 | `atisma`, 4 segments | 3.0s ("QA audit wave"), 2 segments (0-1000ms, 1500-2500ms) | 3.0s tone, 2 segments (0-1200ms, 1500-2700ms) | **4.28s** (1000+1200+1000+1200ms minus 3×40ms crossfades = 4280ms — exact) | -11.13 → -10.20 | `63d88755-6ec8-4e3d-ae21-33ea8859fa82` |
| 78 | `cypher`, verse 2 | 3.0s ("QA test wave") | 2.5s tone | **5.5s** (3.0 + 2.5 — exact) | -13.84 → -12.57 | `cd4ca3b7-471b-42f1-bdcf-baab423827cc` |
| 79 | `cypher`, verse 3 | 5.5s (verse 2's own mixed output, job 78) | 2.5s tone | **8.0s** (5.5 + 2.5 — exact, confirming the parent's full history carries forward) | not sidecar-mastered this run (local fallback) | `f694a871-cc4c-48d5-b501-200ec6e86ceb` |

`duet_tree` on the `layer`/`cypher` root afterward correctly returned all
four Waves with `duet_depth 0/1/1/2` and `cypher_order null/null/2/3` — the
`layer` child and the `cypher` verse-2 child both direct children of the
root (branching, not a single line), verse 3 one level deeper under verse 2.

**Backing-track lineage**, same session: a curated track (no uploader)
produced zero `wave_collaborators` rows when duetted-over, as designed; a
freshly-inserted non-curated track (uploader = an existing profile)
produced exactly one already-`accepted` `wave_collaborators` row the moment
a Wave published with `backing_track_id` set, and `list_waves_on_track`
returned that Wave.

**Also found and fixed in this session** (not a Wave D feature, a real bug
surfaced while exercising the worker): two pre-existing live assets were
`processing_status = 'ready'` with **all-zero peaks** despite several
seconds of duration. Root cause, confirmed live: their source audio is
genuinely silent — ffmpeg's `loudnorm` measures `-inf` integrated LUFS — and
the pre-sidecar worker version that originally processed them had no
completion-quality check, so a degenerate (but not erroring) peak
extraction was marked `ready` anyway. `scripts/worker.ts` now (a) throws a
specific `"source audio is silent"` error the moment a two-pass loudnorm
measurement comes back `-inf` rather than letting ffmpeg's second pass fail
with an opaque `"Result too large"`, and (b) added `isDegeneratePeaks()` as
a second, independent guard after `runPeaksStage` (either sidecar or local)
in both `runProcessAudioJob` and `runMixDuetJob` — an all-zero result on
anything longer than 500ms now fails the job loudly instead of ever being
written to `audio_assets.peaks`. Re-running both assets under the fixed
worker reproduced the honest failure (`processing_status = 'failed'`,
`processing_error = 'source audio is silent (measured loudness -inf LUFS) —
cannot normalize a silent recording'`) instead of the old silent
zero-waveform "success."
