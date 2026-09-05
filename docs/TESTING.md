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
a passing, exercised test.

### Running the live-backend specs (`E2E_SUPABASE=1`)

`e2e/auth.spec.ts`, `e2e/duet.spec.ts` and `e2e/critical-journey.spec.ts` all
need a real, migrated Supabase project. Point `.env.local` at one
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`), run `npm run db:migrate`, then:

```
E2E_SUPABASE=1 npm run e2e
```

In PowerShell, set the env var first (`$env:E2E_SUPABASE=1; npm run e2e`) or
prefix inline the same way bash does above — either works, `cross-env` is not
needed since this is a one-off local/CI invocation, not a cross-platform npm
script.

**A hosted Supabase project defaults to "Confirm email" ON**
(`mailer_autoconfirm: false` — check with
`GET {url}/auth/v1/settings` using the service-role key), which blocks the
real `/signup` UI form from getting a session immediately, the same way a
real unconfirmed user would be blocked. Rather than changing that project
setting (out of scope, and it would make the live project's actual signup
flow untested), every spec that needs a *signed-in* account creates it
directly through the Supabase admin API — `createConfirmedUser` in
`e2e/helpers/supabaseAdmin.ts`, `POST /auth/v1/admin/users` with
`email_confirm: true` — and then signs in through the real `/login` form.
This exercises everything downstream of authentication (session cookies, the
onboarding redirect, RLS-backed queries) exactly like a real login; only the
"fill out `/signup` and wait for a confirmation email" step itself is
bypassed. `e2e/auth.spec.ts` still has one test that submits the real
`/signup` form directly (with an account it does NOT expect to sign in),
asserting the honest "check your email" response — this is a real signup
attempt against Supabase's own email-sending pipeline, and can intermittently
fail with "Too many emails requested" if the project's own send-rate quota is
already exhausted (e.g. by other tests/tools that ran many signups in a short
window); that is an infrastructure rate limit, not an app or test bug — retry
later if you hit it.

Every account these specs create uses an email of the form
`e2e+<tag>-<timestamp>@akinti.test` (or `@akinti.example` for the one test
that goes through the real `/signup` endpoint, which validates the address
itself and rejects the reserved `.test` TLD outright — `.example` is also
RFC 2606-reserved and passes). Each spec deletes the accounts it created in a
`try/finally`; `playwright.config.ts` additionally wires up
`e2e/helpers/globalTeardown.ts` (only when `E2E_SUPABASE=1`) to sweep any
`e2e+*@akinti.(test|example)` accounts left over from a failed run, so a
crashed test never leaks a throwaway account into the project indefinitely.

**`e2e/fixtures/tone.wav`** is a real, ffmpeg-generated 3-second 440Hz tone
(mono, 44.1kHz PCM WAV) used for every Upload-path publish in these specs —
regenerate it with:

```
ffmpeg -f lavfi -i "sine=frequency=440:duration=3" -ac 1 -ar 44100 e2e/fixtures/tone.wav
```

**Run only one `E2E_SUPABASE=1` Playwright invocation at a time.** Each
invocation's `globalTeardown` sweeps *every* matching `e2e+*` account on the
project, not just the ones its own run created — two invocations running
concurrently can have one's teardown delete an account the other is still
mid-test with, surfacing as a spurious "invalid credentials" or "wave not
found" failure that has nothing to do with the app. This was reproduced
directly while building this stage's suite; it is a testing-methodology
hazard, not something the harness needs to guard against for a single
`npm run e2e` run.

**The dev server.** `playwright.config.ts`'s `webServer` always points at
`http://localhost:3333` and never spawns its own — Next 16 refuses to start
a second `next dev` for the same project directory at all ("Another next dev
server is already running"), regardless of port, so there is exactly one dev
server per checkout, not per port. If nothing is listening on 3333 yet,
`npm run dev -- -p 3333` first; the suite reuses whatever is already running
there (do not kill or restart it if someone is browsing it).

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

**`e2e/duet.spec.ts`** exercises the full lifecycle through the real UI:
request → accept → record against the original (in a Chromium instance
launched with `--use-fake-device-for-media-stream`, so `MediaRecorder`
captures a real, synthetic audio stream — no physical microphone needed) →
publish → the new Duet Wave is linked from the original's page, plus the two
named denial scenarios from spec §46 above ("duets disabled on a Wave" and
"blocked user") asserted against the real `/w/[id]/duet` page, not a unit
mock. A blocked pair can't see each other's Waves at all (`can_view_wave`
denies on `is_blocked_between`, independent of the Wave's own visibility), so
the "blocked user" case renders the generic "This wave isn't available"
state rather than the duet-specific denial message — that distinction is
worth remembering when reading the assertions. Same `E2E_SUPABASE=1`-gated,
`testIgnore`-excluded convention as `e2e/auth.spec.ts` above (see
`docs/DUET_SPEC.md` for the full state/permission matrix this spec is
checking):

```
E2E_SUPABASE=1 npm run e2e -- duet.spec.ts
```

**`e2e/critical-journey.spec.ts`** covers what `e2e/duet.spec.ts` doesn't:
the full spec §46 scenario end to end, including two real `scripts/worker.ts
--once` passes (between the original Wave's publish and User B's discovery,
and again between the Duet's publish and the lineage check — see
`runWorkerOnce` in `e2e/helpers/flows.ts`), Explore discovery (the "New"
category, most-recent-first, so a just-published Wave is guaranteed to show
up — "Trending" is not), a real signed-playback-URL round trip
(`GET /api/audio/[assetId]/url`, asserted at the network level), and
comments/saves/shares from the Wave detail page. Two more tests cover the
private-content scenario (an `only_me` Wave is unavailable to another user,
and its audio URL 404s even when requested directly) and the block-then-
message-denied scenario (`/messages/new?to=<blocker>` renders "Can't start
this conversation"). Same gating:

```
E2E_SUPABASE=1 npm run e2e -- critical-journey.spec.ts
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
| Migration schema/RLS/trigger correctness | this layer | reviewed manually AND run against a live Supabase project (Stage 15) — two real RLS/constraint bugs found and fixed there, see migrations 26/27 below |
| `src/lib/db` / `src/lib/validation` unit tests | this layer | not yet written — see skeleton above |
| Private content / Duet security scenarios | this layer (DB) + UI (flows) | schema-level guarantees in place, and exercised live in `e2e/critical-journey.spec.ts` (only_me Wave unavailable + audio 404) and `e2e/duet.spec.ts` (duets-disabled + blocked-user denial) |
| Worker (`scripts/worker.ts`) behavior incl. missing-ffmpeg path | this layer | smoke-tested manually (`--once`) and run for real from `e2e/critical-journey.spec.ts` (`process_audio` and `mix_duet` jobs both claimed and completed against a live queue); no automated *unit* test harness yet |
| Recording/upload UI, playback UI, responsive layout | UI/audio agent | out of scope here |
| Critical end-to-end scenario (full user journey) | both, via Playwright | fully automated end to end in `e2e/critical-journey.spec.ts` (signup→onboarding→upload→publish→worker→discover→play→comment/save/share→duet request→accept→record→publish→worker→lineage), gated on `E2E_SUPABASE`; `e2e/auth.spec.ts` and `e2e/duet.spec.ts` cover the auth and Duet legs in isolation too |
| Duet lifecycle + denial scenarios (UI) | Duet agent | automated in `e2e/duet.spec.ts` (gated on `E2E_SUPABASE`) — happy path, duets-disabled denial, blocked-user denial |

## Performance budgets (waveE-perf)

`npm run perf` (`next build` then `scripts/perf-budget.ts`) checks the real
client JS weight of Home, Explore, Wave and Create straight from the
production build output — no running server, no auth, no live Supabase
project needed, so it is safe to run in CI. It reads each route's
`page_client-reference-manifest.js` under `.next/server/app/` to find every
chunk that route's fresh load needs, gzips them (Next serves `_next/static/*`
compressed in production), and fails the build if any route exceeds the
budget defined in `scripts/perf-budget.ts` (`ROUTE_BUDGET_KB`).

That budget is 260KB gzipped per route, not the 150KB
`docs/research/mobile-guidelines.md` rule 42 names: `@supabase/supabase-js`
alone is roughly 85KB gzipped with no built-in subpath tree-shaking, and it
loads on every authenticated route, on top of React 19 and the App Router
runtime. 150KB of *additional* JS is not reachable on this stack without
dropping Supabase or React — see `docs/qa/waveE-perf/ANALYSIS.md` for the
measured breakdown and the real floor.

Lighthouse itself (LCP, TBT, performance score) needs a real authenticated
session against the live Supabase project and is not part of this automated
gate; `docs/qa/waveE-perf/ANALYSIS.md` documents the manual method
(`next start` on a fixed port, a throwaway `e2e/helpers/supabaseAdmin.ts`
account, Playwright to sign in, `npx lighthouse` with the resulting session
cookie) and the before/after numbers it produced.

## Known gap

No automated *unit* test files exist yet for `src/lib/db/**`,
`src/lib/validation/**`, or `scripts/worker.ts` — the skeletons above are the
intended shape for that pass. What Stage 15 added instead is live *end-to-end*
coverage (`E2E_SUPABASE=1 npm run e2e`) exercising the real database, RLS,
storage and worker against an actual Supabase project — that pass surfaced
and fixed several real bugs no amount of mocked unit testing would have
caught (a broken `RLS`-on-`INSERT...RETURNING` policy, a check constraint
that blocked deleting an account with Duets, a client-side redirect that
could render a page signed-out despite a valid session, and — the most
user-facing one — Wave playback never actually starting anywhere feed cards
render, because the click-interception selector never matched the real
button). See the migrations added in this pass
(`20260904100000_insert_returning_select_policy_fix.sql`,
`20260904110000_waves_duet_shape_allow_orphaned_ancestor.sql`) and the fixes
in `src/app/(auth)/actions.ts`, `src/app/(auth)/onboarding/OnboardingFlow.tsx`,
`src/lib/audio/recorder.ts`, `src/lib/validation/audio.ts`, and
`src/components/wave/WaveCardContainer.tsx` for the detail. Flag remaining
gaps explicitly rather than claiming coverage that doesn't exist.
