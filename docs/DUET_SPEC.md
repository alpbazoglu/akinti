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

## Recording & synchronization (spec §15)

Client-side (owned by the UI/audio agent, not this layer): use the Web Audio
API to play the original track during the recording session so the
contributor hears it live, and capture the new take as a **separate**
audio stream with a stored **start-offset** (milliseconds) relative to the
original. Prioritize reliable sync over rich editing — this is not a DAW.

Server-side (this layer): **never trust client-side mixdown.** On publish,
the client uploads the new take as its own `audio_assets` row, then calls
`enqueueDuetMix()` (`src/lib/db/audioAssets.ts`), which queues a `mix_duet`
job carrying:

```json
{ "preset": "studio", "reference_asset_id": "<original's audio_asset_id>", "offset_ms": 1240 }
```

The worker downloads both stems, applies `adelay=<offset_ms>:all=1` to the
new take, `amix`es it against the reference, runs the chosen enhancement
preset, and writes the result back as the **new take's own**
`processed_path`. That rendered file is what `createDuetWave()`'s
`audio_asset_id` ends up pointing at — full mechanics in
`AUDIO_ARCHITECTURE.md`. Both original stems remain available in storage
even after mixing, in case a future feature wants per-track remixing.

## Publishing the Duet Wave

`createDuetWave()` (`src/lib/db/waves.ts`) inserts a Wave with
`creation_type = 'duet'`, the mixed `audio_asset_id`, `parent_wave_id`, and
`duet_request_id`. `waves_guard_insert` independently re-verifies the
request is `ACCEPTED`, belongs to the caller, and that `parent_wave_id`
matches the request's `wave_id` — the application code does not re-implement
that check, only shapes the insert. An optional `collaborator_id` invites
the other party as a credited collaborator on the new Wave (never
auto-added — see Collaborators below).

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
