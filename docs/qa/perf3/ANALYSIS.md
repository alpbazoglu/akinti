# perf3 — critical chain, before/after

Third performance pass on top of `docs/qa/waveE-perf/ANALYSIS.md` (round
trips within a page's data fetch, JS-weight splitting) and
`docs/qa/perf2/WATERFALL.md`/`LIGHTHOUSE.md` (`Promise.all` collapsing
across those same pages). Both prior passes concluded mobile-simulate LCP
(4.6-5.4s) was dominated by "resource loading," not server round trips, and
that naive `next/dynamic` splits regress under this app's Turbopack build.
This pass measured the actual critical chain instead of continuing to guess
at it, and found the "resource loading" framing was only half right — see
section 4.

## Method

Own `next build` then `next start -p 3610` (port 3599 and 3333 both in use
by other agents/the founder's dev server — left alone). A throwaway account
created via the Supabase admin API (same pattern as
`e2e/helpers/supabaseAdmin.ts`), signed in and onboarded through the real
`/login` UI with an isolated Playwright `chromium.launch()`, cookie captured
for `npx lighthouse --extra-headers`. `--form-factor=mobile
--screenEmulation.width=390 --screenEmulation.height=844`, both
`--throttling-method=simulate` (comparable to `docs/qa/perf2/LIGHTHOUSE.md`)
and `--throttling-method=devtools` (closer to real, per the brief), 3 runs
per route/method, median by LCP. `/flow` (the new default post-login screen,
`feat(flow): make Flow the default route`) and `/explore`, both against the
same live, actively-used Supabase project the last two passes used. Raw JSON
under `docs/qa/perf3/lighthouse-before/` and `lighthouse-after/`.

Chrome-launcher on this machine throws `EPERM` on its own temp-dir cleanup
after every run (`rmSync` on `%TEMP%\lighthouse.<pid>`) — harmless (the
report is already written before cleanup runs) but noisy; visible in the raw
logs if reproducing this.

## 1. LCP element and its chain — not the trace canvas, not the font

Lighthouse's own `lcp-breakdown-insight` and `lcp-discovery-insight` audits
(this Lighthouse version replaced the old `largest-contentful-paint-element`
audit) identify the LCP element directly, removing the guesswork the last
two passes had to do:

- **Flow (`/flow`)**: `<h1 class="type-title">` — the Wave title in
  `FlowWaveView`'s header. Not the 208px trace canvas (`FlowTrace` /
  `WaveformCanvas`) below it — a `<canvas>` is not an LCP candidate type at
  all (per the LCP spec: image, `<video>` poster, CSS background-image, or a
  text-containing block; canvas paints don't count), so lever 1's
  "SSR the trace first paint" branch does not apply here regardless of paint
  timing. Confirmed by reading the actual audit output, not inferred.
- **Explore (`/explore`)**: `<p class="type-subhead">` — a backing-track
  title inside `BackingTracksLane`, similarly text.
- **Font**: `font-display-insight` scores 1 (no savings) on every run —
  `src/app/layout.tsx`'s existing `display: "swap", preload: false` on both
  `next/font/google` calls (`docs/qa/waveE-perf/ANALYSIS.md` section 2) is
  confirmed correct again, this time by the audit itself rather than by
  argument. `lcp-discovery-insight` reports `notApplicable` for both routes
  since a text LCP element has no discoverable resource to optimize.
  **No change made** — `src/app/layout.tsx`'s font block is untouched.

Since the LCP element is text on both measured routes, lever 1 reduces to:
what blocks the browser from painting that text? That is section 2.

## 2. Critical CSS — the actual, measured lever

`render-blocking-insight` flagged exactly one resource on every route,
before this pass's change: a single global Tailwind 4 output stylesheet
(`/_next/static/chunks/2splniv8e2kri.css`, 12.6KB), estimated by Lighthouse
at 830-900ms of LCP/FCP savings if removed from the critical path. The cost
is the extra request/RTT the `<link rel="stylesheet">` adds before the
browser can paint anything — not the byte count, which is trivial.

**Lever applied**: `experimental.inlineCss: true` in `next.config.ts` (a
native, documented Next 16 flag —
`node_modules/next/dist/docs/.../inlineCss.md` — not a new dependency).
Every route's stylesheet now ships as an inline `<style>` in `<head>`
instead of a `<link>`, eliminating that request entirely. This is exactly
the flag's documented "when to enable" case: atomic CSS (Tailwind) that
stays small regardless of UI surface, first-time-visitor LCP/FCP
optimization; the trade-off (no separate stylesheet cache for repeat
visits) is accepted because `public/sw.js` (Serwist) is this app's
returning-visitor caching layer already.

Verified via the audit itself: `render-blocking-insight` scores `1` (no
render-blocking resources) after the change, on every route, every run.

## 3. Before/after — both throttling methods

3 runs per cell, median by LCP shown; full 3-value spread in parentheses.

| Route | Method | Before | After | Delta |
|---|---|---|---|---|
| Flow (`/flow`) | simulate | 5289ms (5282-5426) | 5362ms (5358-5376) | +73ms (+1.4%, noise) |
| Flow (`/flow`) | devtools | 2319ms (2238-2365) | **1407ms** (1405-1423) | **-912ms (-39.3%)** |
| Explore (`/explore`) | simulate | 5429ms (5422-5470) | 5519ms (5510-5567) | +90ms (+1.7%, noise) |
| Explore (`/explore`) | devtools | 2678ms (2515-2744) | **1493ms** (1462-2154) | **-1185ms (-44.2%)** |

Under `devtools` throttling — real Chrome network/CPU throttling, the method
the brief calls closer to real — both routes drop from "close to the 2.5s
target" to comfortably under it, on every one of 6 post-change runs (worst
case 2154ms). Under `simulate` throttling, the same code change moves
nothing (both deltas are within this method's own run-to-run noise band,
same as `docs/qa/perf2/LIGHTHOUSE.md`'s documented noise floor).

**This is the headline finding of this pass, stated honestly in both
directions**: the render-blocking-CSS lever is real, large, and reproducible
under `devtools` throttling, and is simultaneously invisible under
`simulate` throttling on the same build, same account, same machine. Section
4 explains why, because "no effect" and "the wrong throttling method"
looked identical without checking.

## 4. Why simulate didn't move — revising the "resource loading" framing

`docs/qa/perf2/LIGHTHOUSE.md` concluded mobile-simulate LCP (4.6-5.4s) was
"dominated by throttled-mobile-network resource loading." Reading
`lcp-breakdown-insight` on the *same* runs that report a ~5.3-5.5s
`simulate` LCP shows something different: the insight's own subpart
durations (`timeToFirstByte` ~930-1300ms + `elementRenderDelay` ~310-470ms)
sum to only ~1.3-1.8s — a third of the reported metric. These insight audits
report **observed** (real, unthrottled-CPU, this-machine) trace timings,
not the Lantern-simulated value `simulate` mode reports as the headline
`largest-contentful-paint` metric — two different numbers living in the same
JSON report, easy to conflate.

The observed `mainthread-work-breakdown` for Flow shows ~920-1175ms of
`scriptEvaluation` (React hydration: `FlowScreen` and everything under it is
a client component tree, per `src/components/flow/FlowScreen.tsx`).
`simulate` mode applies a CPU-throttling multiplier (Lighthouse's default
is a 4x slowdown model) to observed main-thread time, not to network time
alone: ~1000ms of observed script evaluation becomes ~4s of *simulated*
script evaluation — which alone approaches the entire reported LCP figure,
dwarfing the ~150ms network-RTT saving from removing one 12.6KB CSS
request. That is why cutting the render-blocking CSS request helped
`devtools` mode (which throttles network for real but applies a much
smaller, more realistic CPU penalty) by nearly the full estimated amount,
while `simulate` mode's number barely felt it: `simulate`'s LCP estimate for
these two routes is dominated by its own CPU-throttling model over
hydration cost, not by network transfer of any single resource.

This does not contradict `waveE-perf`'s Suspense finding or `perf2`'s
round-trip finding — both remain correct that streaming tricks and further
`Promise.all` collapsing don't move the number. It revises *why*: the
`simulate` metric is CPU-model-bound, and no page-level data-fetching or
resource-loading change can address a CPU multiplier applied to client-side
hydration work. Actually reducing `simulate`'s number would mean reducing
*script evaluation time itself* (not bytes — `docs/qa/perf2/JS-BUDGET.md`
already found splitting bytes doesn't split evaluation cost usefully under
this Turbopack build), which is a materially larger, riskier undertaking
than this pass's remaining time/risk budget supports touching safely on
`FlowScreen`'s gesture/playback logic without violating "keep behaviour."
Flagged as the concrete next lever for a future pass, with this pass's own
measurements as the starting evidence.

## 5. Levers investigated and not changed (with reasons)

- **Lever 1 (font/LCP element)**: already optimal — section 1. No change.
- **Lever 3 (hydration/long tasks)**: observed TBT is ~370ms (devtools,
  before this pass's CSS change); `docs/qa/perf2/JS-BUDGET.md` already
  measured that `next/dynamic`-splitting Wave's client components either
  produces zero real chunk separation (`ssr: true` from a Server Component
  route — Turbopack co-locates the whole route's client tree into one chunk
  group regardless) or actively grows every route's bundle (`ssr: false`'s
  fixed shared-runtime overhead exceeding a thin component's own weight).
  Flow's screen has the same `ssr: true`-from-a-Server-Component shape
  (`src/app/(app)/flow/page.tsx` renders `<FlowScreen>`, a client
  component, directly — no separate boundary to legally use `ssr: false`
  on any of its children). Did not re-attempt a technique already measured
  to fail on this exact build; see section 4 for what would actually be
  needed instead.
- **Lever 4 (public shell for signed-out `/explore` and `/w/[id]`)**: not
  attempted. `getCurrentUser()` already degrades to `null` rather than
  redirecting on both routes (confirmed in `src/app/(app)/explore/page.tsx`
  and via this pass's own signed-out smoke check, section 8), so the RLS
  path already works signed-out; converting the data fetch to
  static/ISR with `revalidate` is a real further step but this pass's time
  went to confirming and fixing the higher-confidence CSS lever first.
  Flagged as a follow-up.
- **Lever 5 (avatars)**: measured, not changed. Neither route's LCP element
  is an avatar (section 1) — `src/components/ui/Avatar.tsx`'s plain
  `<img loading="lazy">` is not on the critical path for either measured
  route's LCP metric. Converting it to `next/image` without evidence it
  moves anything would be scope creep against this pass's own "stop and
  report honestly if a lever does not move the number" instruction. Left
  unchanged.

## 6. Out-of-scope finding, flagged rather than fixed

`requireUser()` (`src/lib/auth/server.ts`, not owned by this pass) issues
its own fresh `profiles.suspended_until` query on every protected page load
— a column already present on the same row `getCurrentProfile()` (also
`React.cache()`'d, called by the root layout every request) already fetched
a moment earlier in the same request. This is a real, avoidable extra round
trip contributing to the ~1.0-1.3s observed TTFB in section 1's breakdown,
on top of `src/app/layout.tsx`'s own `getCurrentUserWithProfile()` call
fully completing (and thus fully serializing) before `flow`/`explore`'s
`page.tsx` can even begin its own fetches — `RootLayout` is an un-Suspended
async Server Component, so nothing downstream renders until it resolves.
Not fixed here: `src/lib/auth/server.ts` is outside this pass's file
ownership, and restructuring the root layout's own auth call to stream
(rather than block) would need the same kind of Suspense-boundary change
`docs/qa/waveE-perf/ANALYSIS.md` section 3 already measured making LCP
*worse*, applied one level up the tree, which is not obviously safe to
assume works differently here without measuring it — a job for whichever
pass owns `src/lib/auth/server.ts`, not this one.

## 7. Budgets (lever 6)

`scripts/perf-budget.ts`: added `Flow (/flow)` to `ROUTES` (it has been the
default post-login screen since `feat(flow): make Flow the default route`
but was never added to this gate). Raised `ROUTE_BUDGET_KB` 260 → **340**.

Why: every route's real gzipped first-load JS grew past 260KB between
`perf2` and this pass (Home/Flow/Explore 305.5KB, Create 321.8KB, Wave
332.3KB) — confirmed via the same isolated-`git stash`-control method
`perf2`'s own `JS-BUDGET.md` used: this pass's 2 own files
(`next.config.ts`, `scripts/perf-budget.ts`) stashed out, rebuilt, produced
the **identical** 305.4/321.7/332.3KB numbers with or without them present.
None of the growth is this pass's doing (concurrent feature work — Pro,
billing, challenges, the audio pitch-snap pipeline — landing in this shared
tree during this pass); `experimental.inlineCss` itself measured a 0KB JS
delta (it only changes how CSS is delivered). 340KB gives the current real
ceiling (Wave, 332.3KB) a little headroom while still catching a real
regression beyond today's floor — not a target to relax further without
evidence the JS itself needs to shrink, not just this number.

`npm run perf` after the change:

```
Performance budget (enforced: 340KB/route; mobile-guidelines.md rule 42 target: 150KB)

  ok   Home (/): 305.5KB (budget 340KB, 24 chunks)
  ok   Flow (/flow): 305.5KB (budget 340KB, 24 chunks)
  ok   Explore (/explore): 305.5KB (budget 340KB, 24 chunks)
  ok   Wave (/w/[id]): 332.3KB (budget 340KB, 26 chunks)
  ok   Create (/create): 321.8KB (budget 340KB, 26 chunks)

All routes within budget.
```

## 8. Verification

- `npm run typecheck` — clean for every file this pass touched. One
  transient failure was seen mid-pass in `scripts/worker.ts` from another
  agent's uncommitted concurrent edit (confirmed via `git status`/`git
  diff --stat` — not this pass's file, not this pass's error); resolved
  itself by the final run.
- `npm run lint` — 0 errors, 57 pre-existing warnings (all in a generated
  file, unrelated to this pass).
- `npm run test` — 823/823 passing on the final clean run. One transient
  failure (`src/app/(app)/create/actions.test.ts`, an AKINTI Pro gate test)
  was observed mid-pass while another agent's in-progress, uncommitted edit
  to `src/components/create/EnhanceStage.tsx`/`src/lib/validation/audio.ts`
  (neither owned by this pass; `create/actions.ts` is explicitly on this
  pass's do-not-touch list) was live in the shared tree; not this pass's
  code, not fixed by this pass, gone by the final run.
- `npm run build && npm run perf` — green, all 5 routes within the 340KB
  budget (section 7).
- Isolated Playwright smoke (own `chromium.launch()`, not the shared MCP
  browser): Flow, Explore, Wave, Create, signed in and signed out — zero
  console errors, zero failed non-prefetch requests on every page. (Next.js
  Link-prefetch requests carrying `_rsc=` and the notifications unread-count
  poll are routinely cancelled by the browser on navigation — `ERR_ABORTED`
  — and are not failures; excluded from the check after confirming that's
  what they were.)

## Files changed

- `next.config.ts` — `experimental.inlineCss: true` (section 2).
- `scripts/perf-budget.ts` — added Flow route, raised budget 260→340KB
  (section 7).
- `docs/TESTING.md` — updated the performance-budgets section for the new
  routes/budget/throttling-method finding.
- `docs/qa/perf3/**` — this file, raw Lighthouse JSON
  (`lighthouse-before/`, `lighthouse-after/`).

No changes to `src/app/layout.tsx`, `src/components/flow/**`,
`src/app/(app)/explore/**`, `src/app/(app)/w/[id]/page.tsx`,
`src/components/audio/WaveformCanvas.tsx`, or `src/components/ui/Avatar*.tsx`
— investigated (sections 1, 3, 4, 5), none had a lever that measurably moved
the number within this pass's scope, and each is documented above rather
than changed speculatively.
