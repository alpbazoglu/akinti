# perf2 — Wave route JS: `next/dynamic` attempted and reverted

`docs/qa/waveE-perf/ANALYSIS.md` §6 flagged `ShareSheet`, `WaveOwnerMenu`,
the comment `Composer` and the report sheet as the next step to bring
`/w/[id]` under the 260KB gzip budget, "the same technique used for `Sheet`
in section 4" (a `next/dynamic` barrel export). This pass tried exactly
that, measured it with `npm run perf`, and reverted all of it — it made the
enforced budget *worse*, not better, under this app's Turbopack build.

## What was tried

1. `src/app/(app)/w/[id]/page.tsx`: `WaveOwnerMenu` and `CommentsSection`
   (which pulls in the comment `Composer`, `ReportCommentSheet` and their Zod
   schemas) behind `next/dynamic`, `ssr: true` (the only option — `page.tsx`
   is a Server Component, and Next 16 rejects `ssr: false` there, same
   constraint the original Sheet-barrel fix documents).
2. `src/app/(app)/w/[id]/WaveDetail.tsx` (already a Client Component):
   `ShareSheet` behind `next/dynamic`, `ssr: false` — the one place on this
   route where `ssr: false` was actually legal.

## What was measured

A same-instant control (`git stash` of only these files, rebuilt
immediately before and after each variant) isolated each change from the
concurrent-agent noise that also affects this shared tree's chunk hashes:

| Variant | Home | Explore | Wave | Create |
|---|---|---|---|---|
| Control (neither change) | 204.0KB / 22 chunks | 204.0KB / 22 | 322.0KB / 25 | 193.5KB / 21 |
| + `WaveOwnerMenu`/`CommentsSection` dynamic, + `ShareSheet` dynamic | 204.9KB / 25 | 204.9KB / 25 | 322.7KB / 27 | 194.1KB / 23 |
| + `ShareSheet` dynamic only (`WaveOwnerMenu`/`CommentsSection` reverted) | 204.9KB / 25 | 204.9KB / 25 | 322.7KB / 27 | 194.1KB / 23 |
| Neither (final, reverted) | 204.0KB / 22 | 204.0KB / 22 | 322.0KB / 25 | 193.5KB / 21 |

Two findings, both against this app's specific Turbopack build (Next 16):

**`WaveOwnerMenu`/`CommentsSection` (`ssr: true`, from a Server Component)
produced zero measurable split.** Grepping the built
`page_client-reference-manifest.js` for `/w/[id]` showed `WaveOwnerMenu.tsx`,
`CommentsSection.tsx`, `ReportCommentSheet.tsx` and `WaveDetail.tsx`
resolving to the *exact same* 17-chunk list — Turbopack co-locates every
module a Server Component route's tree always renders into one per-route
chunk group regardless of `dynamic()`. The original Sheet-barrel fix
(`src/components/ui/index.ts`) worked for a different reason: it removed
`vaul` from routes (`/login`, `/signup`) that never render a `Sheet` at all,
not from a route that still renders the dynamically-imported component
itself.

**`ShareSheet` (`ssr: false`, from a Client Component) is real —
`ShareSheet.tsx` doesn't appear as a `clientModules` entry in the RSC
manifest at all once split — but it made the *measured budget number worse
everywhere*, including on Home/Explore/Create, which never render
`WaveDetail`/`ShareSheet`.** Every route's total grew by the same ~0.9KB
(and 3 more chunks) the moment this one `next/dynamic()` call existed
anywhere in the app — the framework's shared root/polyfill chunk set
(`readRootChunks()` in `scripts/perf-budget.ts`, unioned into every route's
total) grew slightly, and that fixed cost exceeded `ShareSheet`'s own thin
weight (it has no heavy dependency of its own; `vaul`/`Sheet` was already
split out by the previous pass).

## Conclusion

None of the three components can be usefully split out of `/w/[id]`'s
first-load JS with a component-level `next/dynamic` boundary under this
specific Turbopack build — the two available mechanisms either don't create
a real split for a Server-Component-reached module reused on the same
route (`ssr: true`), or cost more in shared-runtime overhead than they save
for a component this thin (`ssr: false`). Reverted all three; `/w/[id]`
remains at ~322KB gzip, over the 260KB budget, same as the previous pass
left it (the ~2KB drift documented in `LIGHTHOUSE.md` is concurrent-agent
noise, not this pass's doing).

Genuinely shrinking this route would need moving `WaveOwnerMenu` and
`CommentsSection` themselves to only ever be reached through a Client
Component boundary (so `ssr: false` becomes legal for them too) — a
restructuring of files this pass does not own (`CommentsSection.tsx` is
`src/components/comments/**`) and judged out of scope to attempt as a
side effect of a perf pass. Flagged as a follow-up.
