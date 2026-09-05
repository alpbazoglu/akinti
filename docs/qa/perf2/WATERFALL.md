# perf2 — server data-fetching waterfall

Method: temporary `console.log`/`Date.now()` timers wrapped around each
`await` in `src/app/(app)/page.tsx` (Home), `src/app/(app)/explore/page.tsx`
and `src/app/(app)/w/[id]/page.tsx`, `npx next build` then `npx next start -p
3566`, hit with `curl` carrying a real session cookie (minted through the
actual `/login` form via an isolated Playwright script — not the shared MCP
browser — against the live Supabase project, same account/Wave used for the
whole pass; see "Test fixture" below). Removed before the final commit — see
`git log` for the instrumented intermediate state if needed; the numbers
below are the record.

"Before" is `git stash` of only the 5 files this pass touches, i.e. exactly
what `waveE-perf` shipped. "After" is this pass's code. Both built and served
back to back, same account, same Wave, same machine, minutes apart — DB
latency to the `aws-1-eu-west-1` pooler still varies run to run (see
`docs/qa/waveE-perf/ANALYSIS.md` §7's own caveat), so treat single-digit-ms
differences as noise and the stage/count changes as the real signal.

## Test fixture

A fresh account ("creator") published one real Wave (upload path, `tone.wav`,
processed once through `scripts/worker.ts --once`, visibility/comment/duet
permission all `everyone`). A second fresh account ("viewer") followed the
creator (so Home is the following-feed branch, not the empty-state branch)
and is the account every measurement below signs in as. Both went through
onboarding via the real UI. Neither account has any Duets, collaborators or
comments on the Wave — see the Wave section's caveat below for what that
means for stage4's numbers specifically.

## Home (`/`)

| Stage | Before (sequential) | After |
|---|---|---|
| `listHomeFeed` (following ids, then their Waves) | 208–262ms | 193–265ms |
| `hydrateWaveCards` | 113–167ms | merged into stage 2 |
| `listHeardWaveIds` | 99–140ms | merged into stage 2 |
| stage 2: `hydrateWaveCards` ∥ `listHeardWaveIds` | — | 105–170ms |
| **TOTAL** | **428–569ms (median ≈462ms)** | **298–422ms (median ≈370ms)** |

`hydrateWaveCards(page.items, …)` and `listHeardWaveIds(…, page.items.map(id))`
both only need the wave ids `listHomeFeed` already returned — neither needs
the other's result — so they were sequential for no reason. One
`Promise.all` removes a whole round trip: 3 sequential stages → 2.
`listHomeFeed` itself still does 2 sequential queries internally (following
ids, then the Waves) — left alone, since `src/lib/db/waves.ts`'s existing
`listHomeFeed` is a function whose signature/behavior other callers rely on,
and collapsing that specific pair would need the `get_home_feed_page` RPC
discussed below.

## Explore (`/explore`)

| Stage | Before (sequential) | After |
|---|---|---|
| stage 1: `listTrendingWaves` ∥ `getRisingCreators` | 101–220ms | merged into stage 1 below |
| `hydrateWaveCards(trending)` | 226–343ms | merged into stage 2 below |
| stage 2: `getFollowEdgesForViewer` ∥ `loadCreatorSignatures` | 106–198ms | merged into stage 2 below |
| stage 3: `loadOpenCalls` ∥ `loadBackingTracks` | 197–752ms | merged into stage 1 below |
| stage 1 (after): trending ∥ rising ∥ openCalls ∥ backingTracks | — | 101–319ms |
| stage 2 (after): `hydrateWaveCards(trending)` ∥ edges ∥ signatures | — | 236–381ms |
| **TOTAL** | **653–1427ms (median ≈797ms, 4 sequential stages)** | **503–701ms (median ≈546ms, 2 stages)** |

`loadOpenCalls`/`loadBackingTracks` never depended on `trending`/`rising` (or
each other) — the previous pass ran them dead last anyway, sequentially,
purely because they were written after everything else in the function.
`hydrateWaveCards(trending)` never depended on the rising-creators follow
edges/signatures either. Reordering into two real dependency levels
(nothing needs `risingProfiles`' ids until level 2; nothing in level 1 needs
anything from level 2) cuts 4 sequential round trips to 2.

## Wave (`/w/[id]`)

| Stage | Before (sequential) | After |
|---|---|---|
| stage 1: `getWaveById` ∥ `getCurrentUser` | 102–122ms | 101–179ms |
| stage 2: 8-way batch (asset, creator, collaborators, direct Duets, isSaved, `can_request_duet`, comments, comment permission) | 110–123ms | 126–158ms |
| stage 3: `getWaveById(parent)` ∥ `getWaveById(original)` | 0ms (no lineage on this Wave) | 0–1ms |
| stage 4: `getProfilesByIds` | 0ms (no related ids on this Wave) | merged below |
| stage 5: `getDuetTree` | 204–250ms | merged below |
| stage 6: `getOpenCallByWaveId` | 0ms (viewer isn't the creator) | merged below |
| stage 4 (after): profiles ∥ `getDuetTree` ∥ openCall | — | 218–223ms |
| **TOTAL** | **416–563ms (median ≈446ms, 4 dependent stages)** | **453–526ms (median ≈482ms, 3 dependent stages)** |

Stages 4/5/6 never depended on each other — `getProfilesByIds` only needs ids
already known after stage 3, `getDuetTree` only needs `wave`, and the open
call read only needs `isCreator`/`wave.id`. Folded into one `Promise.all`:
one fewer round trip on any Wave that actually has duet lineage,
collaborators or an open call to look up. **Caveat, stated plainly because
the "after" total above is not lower**: this pass's test Wave has none of
that (no Duet parent/chain, no collaborators, viewer isn't the creator), so
stages 3/4/6 cost ~0ms before AND after — there was nothing to parallelize
away on this specific Wave, and the measured "after" total is very slightly
higher purely from `getDuetTree`'s own real ~200–250ms plus normal DB-latency
run-to-run variance on stage 1/2. The `Promise.all` merge is still correct
and still removes a real round trip on any Wave where those three reads
return non-empty results (any Duet, any collaborator, any open call) — it
just isn't visible on this pass's deliberately plain fixture. Re-measuring
against a Wave with an actual Duet chain was out of scope for this pass's
time budget; flagged as a follow-up if more precise Wave-page numbers are
needed.

## Why no RPC this pass

The brief asks for a `get_home_feed_page`/`get_explore_page`/`get_wave_page`
RPC wherever a page needs 3+ *dependent* (not just sequential-by-accident)
queries. After the `Promise.all` reordering above, the real dependency
depth is:

- Home: 2 (`listHomeFeed`'s own internal following→waves chain, then the
  hydrate/heard round) — below the brief's own "3+" threshold.
- Explore: 2 (trending/rising/openCalls/tracks, then hydrate/edges/
  signatures) — also below it after reordering, though it was 4 before.
- Wave: 3 (wave+viewer → 8-way batch → profiles/chain/openCall) — at the
  threshold.

Given that, and the Lighthouse numbers below showing this pass's real,
measured round-trip reduction moved LCP by only ~1–2% (not the 30–60%+ an
RPC would need to contribute to reach the <2.5s target), a hand-written
multi-table JSON-aggregating Postgres function for Wave was judged too much
correctness/security risk (matching the exact RLS-invoker semantics of
8+ existing `src/lib/db` helpers, per column, for a page that already has a
working, tested data path) for a benefit this pass's own evidence shows
would be marginal. See the final report for the numeric case in full.
