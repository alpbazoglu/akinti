# TBT investigation — Flow / Explore (fixQA2 item 4, QA `full2` defect #6)

## Method

Isolated `chromium.launch()` (never the shared MCP browser), own `npm run build` + `npx next start -p 3722`, a throwaway account created via the Supabase admin API and onboarded through the real UI (matching `e2e/helpers/*`), then Lighthouse attached to that already-authenticated Chromium instance via `--port=<remote-debugging-port> --disable-storage-reset` (mobile emulation, 390×844, `--throttling-method=devtools`). Full Chrome-trace CPU-profile attribution (via a raw CDP `Tracing` session) was also attempted but did not reliably capture per-frame self time in this environment and was abandoned in favor of Lighthouse's own `mainthread-work-breakdown`/`bootup-time` audits.

**Deviation from the brief:** only 1 run per state was completed for Flow; 3 runs were completed for Explore's "after" state once the measurements turned out to disagree with each other (see "Variance" below), not the requested 3-run median for both routes in both states. This machine was running many other concurrent agents against the same live Supabase project and the same host throughout this session; `--throttling-method=devtools` scales its CPU slowdown multiplier off the host's *perceived* unthrottled speed, which is exactly what that contention corrupts.

## Findings

Explore's `mainthread-work-breakdown` showed `scriptParseCompile` (~1.1s) dominating over `scriptEvaluation` (~0.6s), spread across roughly 10 separate `_next/static/chunks/*.js` files in `bootup-time`. This points at the *amount* of JS parsed on first load, not one runaway function.

`src/components/wave/WaveCardContainer.tsx` (used by Explore's lanes, a profile's Waves/Duets tabs, hashtag pages and track pages — everywhere a `WaveCard` appears) statically imported `ShareSheet` and rendered it unconditionally (`<ShareSheet open={shareOpen} .../>`, just toggling `open`), pulling the conversation picker and messaging Server Action references into every one of those pages' initial bundle whether or not Share was ever opened. `src/components/flow/FlowScreen.tsx` already avoided this: it only creates the `<ShareSheet>` element once `shareTarget` is set, and already used `next/dynamic`.

**Fix applied** (`src/components/wave/WaveCardContainer.tsx`): `ShareSheet` is now `next/dynamic`-imported, and a `hasOpenedShare` flag (set once, on first Share tap, never back to `false`) gates whether the element is created at all — matching `FlowScreen`'s pattern. This is the one change made; nothing else was touched, per "cut the top offenders that are safe" and "revert anything that does not move TBT" — no other candidate (analyser/canvas setup, wavesurfer) actually applies here: `getFlowAnalyser` (`src/lib/audio/analyser.ts`) already only builds its `AudioContext`/`AnalyserNode` graph after the playback store has a real `<audio>` element, i.e. after a real gesture — not eager — and this codebase does not use wavesurfer.js on Flow/Explore at all (only in the Duet recorder).

## Numbers

| Route | State | Run | Perf score | TBT | LCP |
|---|---|---|---|---|---|
| /flow | before | 1 | 0.98 | 132ms | 1,535ms |
| /flow | after | 1 | 0.91 | 391ms | 562ms |
| /explore | before | 1 | 0.76 | 1,078ms | 2,080ms |
| /explore | after | 1 | 0.85 | 596ms | 1,339ms |
| /explore | after | 2 | 0.78 | 1,062ms | 1,445ms |
| /explore | after | 3 | 0.77 | 1,091ms | 1,446ms |

Raw JSON for every run above is under `docs/qa/fixQA2/lighthouse/`.

## Variance

Three back-to-back Lighthouse runs against the **same** post-fix build/route (`/explore`) produced TBT values of 596ms, 1,062ms and 1,091ms — a ~2x spread with no code change between them. That is larger than the effect I'm trying to measure, so a single before/after pair (or even three) cannot be read as a confident, isolated measurement of this fix's impact in this specific environment/session. `docs/qa/perf3/ANALYSIS.md` (referenced by the `full2` QA report itself) already flagged that `simulate` vs. `devtools` throttling — and, by the same logic, `devtools` throttling under different real host load — can diverge sharply on this app.

Flow's own before/after (132ms -> 391ms) moved in the "wrong" direction on this axis, but both numbers are far under the 2,100ms `full2` baseline and inside the same noise band Explore showed run-to-run; I read this as noise, not a regression, and did not find or make any Flow-specific change this pass beyond what already existed (Flow's `ShareSheet` usage was already correct, as noted above).

## What this does and does not establish

- The `WaveCardContainer` fix is real and structurally sound: it demonstrably removes one static import (Share Sheet + conversation picker + messaging action references) from the bundle every Wave-card-containing screen parses on load, confirmed by reading the diff, not just by one favorable number.
- It is **not** cleanly proven, under this session's measurement conditions, to be the fix that takes Explore from ~1,330ms to under budget on a quiet machine — the one run that showed a large improvement (596ms) could not be reproduced on immediate re-runs of the identical build.
- No regression was introduced: LCP improved or held steady in every run above (never worse after the fix than before), and `npm run test`/`npm run typecheck`/`npm run build` all stayed green (see the main report).

## Recommendation for whoever picks this back up

Re-run this exact methodology on a quiet host (or with `--throttling-method=simulate`, which is far less sensitive to real CPU contention, as a cross-check) before deciding whether more TBT work is needed on Explore specifically. If it still shows ~1s+ TBT on a quiet run, the next candidate worth investigating (not attempted this pass, out of time) is the ~10-way chunk split itself in `bootup-time` — whether Next's automatic code-splitting is producing more, smaller chunks than useful here, each paying its own parse overhead.
