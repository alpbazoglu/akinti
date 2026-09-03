# AKINTI — Testing

Stack: **Vitest** for unit tests, **Playwright** for end-to-end tests (spec
§30). Don't stop at "the page renders" — test actual behavior, especially
authorization (spec §46). This document is the test matrix and how it maps
to the two agents working on this codebase; `src/test/**` (setup, fixtures)
is owned by the UI/audio agent, this layer owns migrations and `src/lib/db`
correctness.

## Running tests

```
npm test           # vitest run — unit tests, once
npm run test:watch # vitest, watch mode
npm run e2e         # playwright test
npm run typecheck   # tsc --noEmit — must pass before either
npm run lint        # eslint — must pass before either
```

## Auth (`src/lib/auth/**`, `src/app/(auth)/**`, `src/proxy.ts`)

Unit tests: `src/lib/validation/auth.test.ts` (every Zod schema — valid input,
boundary lengths, invalid enums/formats) and `src/lib/auth/errors.test.ts`
(`mapAuthError` — every mapped Supabase code resolves to English, an
unmapped code/message falls back to a generic message, a raw Postgres/Supabase
error string is never echoed back to the client).

**`e2e/auth.spec.ts`** covers the full signup → onboarding → logout → login
loop (spec §46) plus the route protection matrix (anonymous browsing
`/explore`, Home redirecting an anonymous visitor to `/login?next=`, a
signed-in visitor bouncing off `/login` back to Home). It needs a real
Supabase project it can actually create accounts against — there is no
`.env.local` in most development environments here (`NEXT_PUBLIC_SUPABASE_URL`
etc. are unset by design; see `AGENTS.md`), so this spec is **excluded from
the Playwright run entirely** via `testIgnore` in `playwright.config.ts`
unless `E2E_SUPABASE=1` is set — never via `test.skip`, which would report as
a passing, exercised test. To actually run it: point `.env.local` at a
throwaway Supabase project with `enable_confirmations = false` (see
`supabase/config.toml`) and run:

```
E2E_SUPABASE=1 npm run e2e
```

## What this layer is responsible for verifying

**Migrations — validated by manual review, not by running Supabase
locally.** Docker is not reachable in this environment, so
`supabase start`/`db reset` could not be exercised end-to-end here. Every
migration in `supabase/migrations/` has been read column-by-column against
the spec and cross-checked against its RLS policy, its guard trigger, and
`src/types/database.ts`. **Before shipping, run the migrations against a
real (even free-tier) Supabase project and re-verify the scenarios below —
manual review is not a substitute for executing the SQL.**

**`src/lib/db/**` and `src/lib/validation/**`** are plain TypeScript
functions taking a Supabase client as their first argument specifically so
they're testable without a running database: stub `Db` with a fake
`.from()`/`.rpc()` per test, or point real tests at a seeded local Supabase
instance once Docker is available. Zod schemas in `src/lib/validation/**`
are pure and should get direct unit tests (valid input passes, boundary
values at min/max length, invalid enums rejected) independent of any
database.

## The critical end-to-end scenario (spec §46)

```
User A registers → creates profile → records Wave → publishes Wave
   → User B discovers Wave → plays it → replays it → comments → saves → shares
   → User B requests Duet → User A notified → User A accepts
   → User B records contribution → Duet synchronized → Duet published
   → Original Wave links to Duet → Duet appears on profiles/discovery
```

Maps to these `src/lib/db` call sequences (useful as a Playwright/integration
test skeleton once a seeded Supabase project is available):

```
createWave → getWaveById
recordPlayEvent (>= qualifying threshold) → recordPlayEvent again (>=60s later, qualifying)
createComment → saveWave → shareWave
createDuetRequest → (notification row exists for User A)
respondToDuetRequest({decision: "accepted"})
enqueueDuetMix → (worker claims + completes the mix_duet job)
createDuetWave → getDuetRequestById (resulting_wave_id now set)
listDuetsOfWave(original.id) → contains the new Duet
```

## Private content test (spec §46)

```
User A creates a private (only_me / followers-only) Wave
User B (not authorized) tries:
  - direct getWaveById(waveId)                → null (RLS-filtered, not a 403 that leaks existence)
  - direct storage URL for the audio asset     → 403 (no listener storage policy)
  - the share link                             → still resolves through can_view_wave, denied
  - search / Explore / Home feed queries       → the Wave never appears
```

The consistent behavior everywhere: RLS returning nothing is
indistinguishable from the resource not existing. `NotFoundError` is thrown
the same way for "doesn't exist" and "exists but you can't see it"
(`src/lib/db/types.ts#unwrap`) — a private Wave's existence itself is not
information visible to an unauthorized caller. Test both null-row and
not-found-error cases wherever a helper touches a Wave/audio asset/profile.

## Duet security test (spec §46)

```
User A sets duet_permission = 'nobody' → User B's createDuetRequest → REJECTED
User A blocks User B → User B's createDuetRequest on any of A's Waves → REJECTED
User B sends a second request while the first is still PENDING → REJECTED (unique index)
Two concurrent requests race for the same (wave, requester)     → exactly one succeeds
User A's Wave is deleted → outstanding requests on it            → publishing a Duet against it fails
An ACCEPTED request is reused after already producing a Wave     → resulting_wave_id already set, re-publish fails guard check
An EXPIRED/CANCELLED/DECLINED request is used to publish a Duet  → REJECTED by waves_guard_insert
```

## Audio testing (spec §46)

Recording/upload/permission flows (MediaRecorder, `getUserMedia`) are owned
by the UI/audio agent and mocked in `src/test/**`. This layer's surface to
test:

```
createAudioAsset with an invalid mime type / oversized file  → Zod rejection before it reaches the DB
createAudioAsset with a valid claim, worker downloads a mismatched file → clear ffmpeg failure via fail_audio_job, never fake "ready"
enqueueAudioProcessing → job appears in audio_processing_jobs, status 'pending'
worker claims it (claim_audio_jobs) → status 'processing', locked_by set
worker completes it → audio_assets.processing_status = 'ready', peaks populated, processed_path set
worker started with no ffmpeg on PATH → job fails with an explicit "ffmpeg not found" message
mintPlaybackUrl before processing finishes → falls back to the original file
mintPlaybackUrl after processing finishes  → returns the processed file
mintSignedAudioUrl called by an unauthorized viewer → NotFoundError, no URL minted
```

## Responsive testing (spec §46)

Owned by the UI/audio agent — this layer has no viewport-dependent code.
Priority order stays mobile → tablet → desktop per the spec; audio controls
must stay usable on small screens.

## Test matrix summary

| Area | Owner | Status |
|---|---|---|
| Migration schema/RLS/trigger correctness | this layer | reviewed manually; needs a real Supabase run |
| `src/lib/db` / `src/lib/validation` unit tests | this layer | not yet written — see skeleton above |
| Private content / Duet security scenarios | this layer (DB) + UI (flows) | schema-level guarantees in place; needs integration tests once Docker/hosted Supabase is reachable |
| Worker (`scripts/worker.ts`) behavior incl. missing-ffmpeg path | this layer | smoke-tested manually (`--once`); no automated test harness yet |
| Recording/upload UI, playback UI, responsive layout | UI/audio agent | out of scope here |
| Critical end-to-end scenario (full user journey) | both, via Playwright | signup→onboarding→logout→login automated (`e2e/auth.spec.ts`, gated on `E2E_SUPABASE`); the Wave/Duet/messaging legs are not yet automated |

## Known gap

No automated test files exist yet for `src/lib/db/**`, `src/lib/validation/**`,
or `scripts/worker.ts` — this pass focused on getting the schema, typed data
layer, worker, and docs correct and typechecking cleanly. The skeletons above
are the intended shape for the next pass. Flag this explicitly rather than
claiming coverage that doesn't exist.
