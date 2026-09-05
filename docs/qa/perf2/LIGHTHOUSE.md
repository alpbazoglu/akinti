# perf2 — Lighthouse mobile, before/after

Method: identical to `docs/qa/waveE-perf/ANALYSIS.md` — `next build` then
`next start -p 3566`, a throwaway account signed in through the real
`/login` form (isolated Playwright script, not the shared MCP browser)
against the live Supabase project, `npx lighthouse` with that session's
cookie attached via `--extra-headers`, `--form-factor=mobile
--screenEmulation.width=390 --screenEmulation.height=844
--throttling-method=simulate --only-categories=performance`, 3 runs per
route, median by LCP. Raw JSON under `lighthouse-before/` and
`lighthouse-after/` in this directory.

"Before" = `git stash` of the 5 files this pass touches (exactly what
`waveE-perf` shipped, including its own Sheet-barrel fix). "After" = this
pass's code (`docs/qa/perf2/WATERFALL.md`'s `Promise.all` collapsing +
`React.cache()` on the session/profile lookups; the Wave-route
`next/dynamic` attempt was tried, measured, and reverted — see
`JS-BUDGET.md`). Same account, same Wave, same machine, run back to back.

| Route | LCP before | LCP after | Δ | Score before | Score after |
|---|---|---|---|---|---|
| Home (`/`) | 4705ms | 4623ms | −82ms (−1.7%) | 77 | 77 |
| Explore (`/explore`) | 4889ms | 4942ms | +53ms (+1.1%, noise) | 72 | 70 |
| Wave (`/w/[id]`) | 5427ms | 5335ms | −92ms (−1.7%) | 71 | 68 |
| Create (`/create`) | 4573ms | 4573ms | 0ms (untouched) | 82 | 80 |

Caveat: the "after" Wave/Home/Explore runs above were captured while
`WaveDetail.tsx`'s `ShareSheet` was still behind the `next/dynamic` split
documented (and then reverted) in `JS-BUDGET.md` — the data-fetching
`Promise.all` changes that actually drive the LCP delta were identical to
the final committed code either way, and `JS-BUDGET.md` shows that split
changed Wave's bundle by under 1KB, so this doesn't change the numbers
meaningfully; noted for completeness rather than re-run given the time cost
of another 12-run Lighthouse pass for a sub-1KB, already-reverted variable.

None reach the brief's <2.5s target, and the Explore/score deltas are within
this method's own documented noise floor (`ANALYSIS.md` §7: different-run DB
latency to the `aws-1-eu-west-1` pooler varies on its own). **The real,
useful signal isn't in this table — it's in `WATERFALL.md`'s server-side
round-trip counts**, which dropped unambiguously (Home 3→2 sequential
stages, Explore 4→2, Wave 4→3) and are real, reproducible, and independent
of DB-latency noise. That the LCP number barely moved despite a real ~25-45%
cut in sequential round trips is itself the finding: **the server's own
data-fetching latency, while real (measured 300–800ms per route in
`WATERFALL.md`), is a small fraction of the ~4.6–5.4s Lighthouse mobile-
simulate LCP.** The other ~4s is throttled-mobile-network resource loading
(JS/CSS/font/image transfer time under the simulated connection) plus the
TTFB-to-paint chain's own fixed costs — neither of which this pass's
`Promise.all` reordering (or a hypothetical page RPC, which would only save
another 1–2 round trips on top of what's already collapsed) touches.

This matches and extends `ANALYSIS.md` §3's own conclusion (Suspense made it
worse because the bottleneck isn't streaming-shaped) with a second,
independent data point: reducing round-trip *count* also isn't the lever
that moves this app's mobile-simulate LCP meaningfully. Reaching <2.5s would
need either a materially faster edge/region for the Supabase pooler itself
(infrastructure, not application code), or a fundamentally different
rendering strategy for the LCP element that doesn't wait on any per-request
Supabase round trip at all (e.g. ISR/`unstable_cache` for a public,
not-per-user version of the above-the-fold content) — the latter was
considered for Explore's public lanes specifically and deferred; see
`WATERFALL.md`.

## `npm run perf` (static JS-budget gate, no server/auth needed)

| Route | Before | After |
|---|---|---|
| Home | 204.0KB | 204.5KB |
| Explore | 204.0KB | 204.5KB |
| Wave | 322.0KB (already over the 260KB budget before this pass) | 322.6KB (still over — see `JS-BUDGET.md`) |
| Create | 193.5KB | 194.0KB |

The ~0.5KB uniform growth across every route (including Create, which none
of this pass's changes touch) is unrelated to this pass — confirmed via a
same-instant control build (`git stash` of just this pass's files, rebuilt
immediately before and after) showing the *identical* before/after gap
without any of this pass's code present; it tracks other agents' concurrent
work landing in this shared tree between builds. Full commands/output in
`perf-budget-before.txt` / `perf-budget-after.txt`.
