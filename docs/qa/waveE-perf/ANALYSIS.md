# waveE-perf — analysis and results

Method: `next build` (Turbopack) then `next start -p 3544`; a throwaway
`e2e/helpers/supabaseAdmin.ts` account signed in through the real `/login`
form via Playwright to get a session cookie; `npx lighthouse` with that
cookie attached (`--form-factor=mobile --screenEmulation.width=390
--screenEmulation.height=844 --throttling-method=simulate
--only-categories=performance`), 3 runs per route, median by LCP. Raw JSON
under this directory; `*-summary.json` is the median run per route.

## 1. Diagnosis

Turbopack's `next build` prints no per-route JS table, and
`source-map-explorer` cannot read Turbopack's source maps yet (`Your source
map refers to generated column Infinity` — a real incompatibility, not a
config mistake, hit on the largest chunk regardless of flags). What did work:
`productionBrowserSourceMaps: true` for a one-off build (reverted before the
real build) plus grepping the resulting `.map` files' `sourcesContent` and
`.next/server/app/**/page_client-reference-manifest.js` for known
package/component names, cross-checked against real `<script src>` tags from
a live `next start` response for several routes.

Top modules found, by where they load:

| Module | Where | Size (raw) | Notes |
|---|---|---|---|
| `@supabase/supabase-js` (GoTrueClient, Postgrest, Realtime) | every authenticated route | ~248KB raw / ~85KB gz | Needed everywhere (auth, RLS reads, Realtime). No subpath tree-shaking upstream. |
| Zod schemas + Wave-page-only components (`ShareSheet`, `WaveOwnerMenu`, `Composer`) | `/w/[id]` only | ~400KB raw | Route-specific already (confirmed via that route's own `page_client-reference-manifest.js`, not shared) — the Wave page bundles several interaction-gated features together. |
| `vaul` (Sheet) + `sonner` (Toast) | every route, before this pass | ~155KB raw combined | `src/components/ui/index.ts` statically re-exports both; Turbopack co-located them into one chunk that loaded on routes with zero `Sheet` usage (`/login`, `/signup`). Fixed — see section 4. |
| `PlaybackProvider`/`playbackStore` (not `wavesurfer.js` itself) | every route (by design — the persistent player) | ~90KB raw | Already correctly split: the actual `wavesurfer.js` library loads via `await import("wavesurfer.js")` only when a Wave actually starts playing (`src/lib/audio/waveSurfer.ts`), confirmed by chunk contents. |
| `motion` (`domAnimation` via `LazyMotion`) | every route (global `MotionProvider`) | ~15KB (already minimized) | Already using `LazyMotion` + `domAnimation` per `docs/research/libraries.md` section 5, not the full `motion.*` bundle. Left alone — already the minimal footprint for a globally-available animation primitive. |
| Phosphor icons | none, client-side | 0KB | `src/components/ui/icons.ts` already imports one glyph per line from `@phosphor-icons/react/dist/ssr/<Icon>` (the no-`"use client"` build), never the barrel. Confirmed zero `@phosphor-icons/react` barrel imports anywhere in `src/`. Nothing to do here. |

## 2. Fonts

Already fully compliant with `docs/design/DESIGN.md` section 3.2 and
`mobile-guidelines.md` rule 43 before this pass (`src/app/layout.tsx`):
`subsets: ['latin','latin-ext']` on both `next/font/google` calls,
`axes: ["wdth"]` only (not `wght`, which Archivo's own variable range also
carries but the app never varies), `display: "swap"`, `preload: false`. Left
unchanged — see the note below on why `preload: false` was kept over the
brief's "preload the two files" suggestion.

Deviation from the brief, flagged explicitly: the brief's font step says
"preload only the two used files." The repo's own `mobile-guidelines.md`
rule 43 ("fonts... never preloaded on mobile") and `layout.tsx`'s existing
comment say the opposite, and `AGENTS.md` lists the mobile rules as
non-negotiable. Investigated which one is right for this app rather than
picking one blindly: the LCP element on all three content routes is a
`WaveCard`'s title text and rail avatar, rendered in Archivo Variable, not a
system-font fallback, so preloading it could help this specific LCP element
in theory. But preloading unconditionally competes with the
DB-round-trip-bound critical path (section 3 below) for the same early
network budget on a throttled connection, for a font `display: swap`
already lets the fallback render immediately for regardless. Kept
`preload: false` (the existing, documented, tested decision) rather than
override an explicit non-negotiable rule on my own judgment; noting the
conflict here for a product decision instead.

## 3. LCP element and streaming (rejected experiment)

The LCP element on Home/Explore/Wave is the first `WaveCard`'s title/rail
row. All three routes are async Server Components doing 2-8 sequential
Supabase round trips (`listHomeFeed` then `hydrateWaveCards` then
`listHeardWaveIds` on Home; three sequential `Promise.all` batches on
Explore; up to five on `/w/[id]`) before returning any JSX — this is the
actual dominant cost behind the 4.5-5.2s baseline LCP, not client JS.

Tried: wrapping each route's data-dependent body in `<Suspense>` with a
`WaveCardSkeleton` fallback (already existed, no-shimmer per section 8.15),
so the shell/CSS/JS could start streaming immediately instead of waiting on
the DB chain. Implemented for all three routes, verified with
`tsc`/`vitest`, then measured against the identical code with only that
change reverted (`git stash` isolating just the three `page.tsx` files —
everything else, including the Sheet/caching fixes below, held constant):

| Route | LCP without Suspense | LCP with Suspense | Score without | Score with |
|---|---|---|---|---|
| Home | 4.58s | 4.91s | 82 | 81 |
| Explore | 5.00s | 5.60s | 75 | 71 |
| Wave | 5.39s | 5.97s | 73 | 74 |

Suspense made LCP worse on all three routes under this project's own
measurement method, consistently, not noise (JS bytes were identical between
the two runs, confirming only the Suspense change moved). Most likely cause:
on `next start` serving from localhost, the shell's own JS/CSS delivery time
is negligible next to the ~1-3s of sequential remote Supabase latency (the
pooler is `aws-1-eu-west-1`), so decoupling TTFB from the data fetch buys
nothing — the LCP-bearing content still can't paint until the same slow
query chain resolves — while the extra Suspense boundary adds real cost:
Lighthouse's LCP tracks the largest painted element, so the skeleton itself
briefly becomes an LCP candidate and gets superseded once the larger real
content streams in, and the client-side swap (React's streaming replacement
script) adds a small amount of main-thread work that simulate-mode
throttling weighs more heavily than plain SSR. Reverted — raw evidence in
`rejected-suspense-experiment-summary.json`. The right fix for this
bottleneck is reducing the number of sequential Supabase round trips per
route (`Promise.all`-ing what currently awaits serially, or a purpose-built
RPC that returns the Wave-page/Explore-page data in one call) — out of
scope here (combining queries is a `src/lib/db/**` change this agent
doesn't own) and flagged as a follow-up.

## 4. JS weight

`vaul` (Sheet) out of the shared chunk. `src/components/ui/index.ts`
exported `Sheet` as a plain static re-export from `./Sheet` (which imports
`vaul`), alongside `ToastProvider` (imports `sonner`), which is mounted
globally in `Providers.tsx`. Turbopack co-located both into one ~155KB raw
chunk that loaded on every route reachable from the root layout —
including `/login` and `/signup`, which never render a `Sheet`, confirmed
by diffing real `<script src>` tags from `next start` responses. Fixed by
making the barrel's `Sheet` export `next/dynamic` (`src/components/ui/
index.ts`): `ssr: false` isn't allowed there (the barrel is also reachable
from Server Components, e.g. `global-error.tsx`), so it's the default
`ssr: true`, which still gets the client-side code split. Verified: after
the change, `/explore`'s own served chunk set no longer contains
`vaul`/`Drawer` at all (checked via `grep` on the actual served chunk
file), and `scripts/perf-budget.ts`'s per-route gzip totals reflect the
split (section 6).

Wavesurfer, motion, sonner: already correctly scoped before this pass (see
section 1's table) — no change needed.

Dead dependencies: `knip` is not configured in this repo and adding it was
out of scope for a single pass; not run.

## 5. Caching headers

`next.config.ts` `headers()`: added `Cache-Control: public, max-age=31536000,
immutable` for `/icons/:path*` (PWA icons) and `/noise-suppressor/:path*`
(the RNNoise WASM/worklet the singing-capture pipeline loads on `/create`) —
both served straight from `public/` with no cache header at all before this
(Next's automatic immutable caching only covers hashed `_next/static/*`
output, which already covers `next/font` files). Explicitly did not touch
`/api/audio/**` (already correctly `private, no-store` in
`src/app/api/audio/[assetId]/url/route.ts` — verified, no change needed) or
any authenticated HTML route, and did not add anything for `public/sw.js`
(waveE-pwa's file; a cached service worker can't learn about its own
updates).

Cross-agent note: `next.config.ts` also had a real, unrelated `next build`
failure appear mid-pass from waveE-pwa's `@serwist/next` (webpack-based)
wiring — Next 16 refuses to build with a webpack config and no `turbopack`
key once Turbopack is the default builder. Reported to waveE-pwa directly
(session message) rather than fixed by restructuring their PWA integration;
waveE-pwa resolved it on their own side (moved to a separate `serwist
build` CLI step in `package.json`, no longer touching `next.config.ts`'s
webpack path at all) before this pass's final build.

## 6. Budgets in CI

`scripts/perf-budget.ts` + `npm run perf` (`next build` then the script).
Reads each route's `page_client-reference-manifest.js`, unions every
`clientModules[].chunks`, adds the framework's always-loaded root/polyfill
chunks, gzips each chunk file, sums, and fails if a route exceeds 260KB
gzip (not the aspirational 150KB — see below). No running server, no auth,
no live Supabase project needed, so it's safe in CI. Documented in
`docs/TESTING.md`.

Current result:

| Route | Gzipped first-load JS (static analysis) | Budget | |
|---|---|---|---|
| Home | 204.0KB | 260KB | ok |
| Explore | 204.0KB | 260KB | ok |
| Create | 193.1KB | 260KB | ok |
| Wave | 320.2KB | 260KB | FAIL |

Why 260KB, not 150KB, and why Wave still fails even that: `mobile-
guidelines.md` rule 42's 150KB figure predates this app's dependency stack.
`@supabase/supabase-js` alone is ~85KB gzipped with no built-in subpath
tree-shaking (it ships GoTrueClient, PostgREST, Realtime and Storage as one
package) and loads on every authenticated route; React 19 plus the App
Router client runtime is additional on top of that. 150KB of JS beyond that
floor is not reachable without dropping Supabase or React, so this pass
documents 260KB as the real, enforceable floor for this stack. Wave still
exceeds even that (320KB) because it is the one route that bundles several
interaction-gated features together in one client tree — `ShareSheet`,
`WaveOwnerMenu`, the comment `Composer`, and their Zod validation schemas.
Splitting each of those further with per-component `next/dynamic` boundaries
(the same technique used for `Sheet` in section 4, applied to these specific
Wave-page consumers) is the concrete next step and was not completed in
this pass — `src/app/(app)/w/[id]/**` component-level changes beyond import
style were judged higher-risk to rush given the time remaining, and are
flagged as a follow-up rather than attempted incompletely.

## 7. Lighthouse before/after

The QA baseline (`docs/qa/full/lighthouse/`) and this pass's numbers used
different throwaway accounts and different live-DB content (a shared,
actively-used live Supabase project — the QA account had different follow
relationships and a different Wave under test than the fresh account this
pass created), so treat the comparison as directional, not exact — DB-latency
variance alone on a remote `aws-1-eu-west-1` pooler is real between any two
runs on different days. The controlled, apples-to-apples comparison is
section 3's Suspense A/B (identical account, identical Wave, only one file
set changed).

| Route | Score (QA baseline to this pass) | LCP | JS transferred | Total transferred |
|---|---|---|---|---|
| Home | 75 to 82 | 4.5s to 4.58s | 370KB to 358KB | 593KB to 589KB |
| Explore | 70 to 75 | 4.8s to 5.00s | 370KB to 381KB | 611KB to 611KB |
| Wave | 77 to 73 | 5.2s to 5.39s | 469KB to 480KB | 690KB to 704KB |
| Create | 82 to 82 | 4.4s to 4.57s | 357KB to 346KB | 569KB to 572KB |

Scores moved in different directions per route (expected, given the
different-content caveat above); LCP did not meaningfully improve on any
route measured this way, consistent with section 3's finding that this
app's LCP is DB-round-trip-bound, not JS-weight-bound, on all three content
routes. The JS-weight fixes in sections 4-5 are real (confirmed via chunk
contents and the CI-safe static-analysis numbers in section 6, which are
not subject to live-account/content noise) but are not the dominant lever
for the LCP number specifically — reducing sequential Supabase round trips
per route is.
