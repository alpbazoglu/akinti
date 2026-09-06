# Desktop feedback audit — "clicks feel dead, nothing tells me the page is loading"

Scope: measurement only, no app-code changes. Isolated Playwright script
(`chromium.launch()`, 1440×900, real confirmed Supabase test accounts created
via the admin API — see `docs/TESTING.md` / `e2e/helpers/supabaseAdmin.ts`)
against a production build (`npm run build && next start`) on port **3744**,
not the founder's dev server on 3333. Screenshots under
`docs/research/desktop/audit/`; raw measurements in
`docs/research/desktop/audit/results.json` and `sweep-metrics.json`.

**Caveat that matters for anyone re-running this**: `.env.local` points at
the founder's live Supabase project, the same one the 3333 dev server uses —
Explore's "Voices worth following" served the real accounts `@akinti_curated`
and `@akin` (the founder's own account), not synthetic seed data. One probe
in this pass clicked "Follow" on `@akin` from a throwaway test account; the
test account (and, via cascade delete, that follow row) was deleted
immediately after via the Supabase admin API. Future desktop audits should
avoid write actions against `@akin`/`@akinti_curated` specifically, or use a
project-scoped Supabase branch instead of the shared live project.

## Headline

Two mechanisms explain "nothing tells me the page is loading" completely:

1. **Zero `loading.tsx` files exist anywhere in `src/app`** (`find src/app -iname loading.tsx` → no results), and **zero uses of `useLinkStatus`** anywhere in `src/`. Next's two built-in "this is pending" primitives are both unused.
2. A client-side nav click paints nothing different for **~700–1200ms** (measured: screenshot-diff first-change times below), and the *only* in-app loading affordance in the whole product is a `Skeleton` used on `/analytics` — the one route out of 15 audited that shows anything at all while it fetches.

## 1. Navigation feedback (click → visible change)

Measured via a 50ms-interval screenshot-diff timeline for 2s after the click, plus DOM checks for `aria-current`/busy state immediately after click.

| Route | Reached via | Click → first visible pixel change | `aria-current` set immediately on click? | Loading/skeleton shown? |
|---|---|---:|---|---|
| Home (`/`) | SideNav click | 895ms | No | No |
| Flow (`/flow`) | SideNav click | 837ms | No | No |
| Explore (`/explore`) | SideNav click | 1009ms | No | No |
| Messages (`/messages`) | SideNav click | 706ms | No | No |
| Notifications (`/notifications`) | SideNav click | 689ms | No | No |
| Settings (`/settings`) | direct link (not in `<nav>`, see below) | not captured this way | No | No |
| Search (`/search`) | not in SideNav at all | — | n/a | No |
| Create (`/create`) | not in SideNav (rail hides `record` item) | — | n/a | No |
| Duets (`/duets`) | not in SideNav | — | n/a | No |
| Challenges (`/challenges`) | not in SideNav | — | n/a | No |
| Tracks (`/tracks`) | not in SideNav | — | n/a | No |
| Analytics (`/analytics`) | not in SideNav | 289ms | n/a | **Yes** — the only route with one |
| Pro (`/settings/pro`) | not in SideNav | — | n/a | No |
| Profile (`/u/[username]`) | SideNav click | not detected in 2s window | No | No |

Root cause of the `aria-current` finding, confirmed in source, not guessed:
`SideNav.tsx` computes `active = isActiveRoute(pathname, href)` from
`usePathname()`, and `usePathname()` only updates once the RSC navigation
**completes** — so the rail item a person just clicked shows no pressed/active
state at all for the ~700–1200ms it takes the new screen to paint. There is
no `useLinkStatus` anywhere to fill that gap, and no top-of-page progress bar
in `AppShell.tsx` either.

`routeChangeExploreToHomeMs` measured via `performance.now()` around a raw
`link.click()` + `MutationObserver`: **20ms** to the first DOM mutation. So
the click *is* wired up and reacts almost instantly at the DOM level — the
problem is entirely that nothing in that first 20ms is visually
distinguishable from "nothing happened," and the real content doesn't land
for another 700–1200ms after that.

Six of fourteen audited routes (Search, Create, Duets, Challenges, Tracks,
Pro) are **not reachable from `SideNav` at all** — `navItems.ts`'s
`RAIL_ITEMS` only carries Flow/Home/Explore/Messages/Profile, plus
Notifications and Settings hand-added inside `SideNav.tsx`. This isn't a
motion bug but it compounds the "did anything happen" complaint: half the
top-level surface has no rail affordance to press in the first place.

## 2. Press feedback (Button / IconButton)

Source (`src/components/ui/Button.tsx`, `IconButton.tsx`,
`src/app/globals.css:785-793`) plus live computed-style diffs on
`mousedown`/hover/keyboard-Tab:

| Check | Result | Evidence |
|---|---|---|
| `:active` scale + inset hairline (`.akinti-press`) | **Works**, on every Button/IconButton/nav key | live diff: `transform: matrix(0.976,0,0,0.976,0,0)` + `box-shadow: inset 0 0 0 ~1px` on mousedown, confirmed on a settings-page text button, the SideNav record key, and a rail link |
| Hover state on `primary`/`secondary` Button variants | **None** | `Button.tsx` `VARIANTS` map: `primary: "bg-tide text-on-ink"`, `secondary: "border border-hairline-strong text-ink"` — neither has a `hover:` class. Only `ghost`/`danger` (text-key variants) get `hover:decoration-ink` |
| Hover state on `ghost` IconButton | Present | `ghost: "text-ink-muted hover:text-ink"` |
| `cursor` on native `<button>` elements (Button, IconButton, Follow, comment submit, etc.) | **`default`, not `pointer`**, on every sample | live computed style: `cursor: "default"` on the settings-page button sample. Neither `Button.tsx` nor `IconButton.tsx`'s `BASE` class sets `cursor-pointer`; browsers' default UA stylesheet gives `<button>` `cursor: default`, unlike `<a>` (which is why SideNav/RecordKey links measured `cursor: pointer` "for free," not from app CSS) |
| Focus-visible ring | **Works**, but only for real keyboard focus | programmatic `.focus()` shows `outline-style: none` (Chromium doesn't grant `:focus-visible` to scripted focus); a real `Tab` keypress shows `outline-style: solid`, `outline-width: 2px`, ink-coloured, on the first tabbable element |

Net: press-down feedback is correct everywhere it's used, but the mouse
never changes shape or shade before the click on the majority of controls
(every native `<button>`), and `primary`/`secondary` keys give no hover
preview at all — a Follow, Publish or Save key looks identical whether the
pointer is over it or two screens away, until the instant it's pressed.

## 3. Async actions

| Action | Pending feedback within 100ms? | Optimistic? | Toast? | Double-submit guarded? | Source |
|---|---|---|---|---|---|
| Save/unsave a Wave | Yes — synchronous local state flip | **Yes**, with rollback on failure | Error only (silent on success, by design) | Yes (state-driven icon swap blocks re-fire) | `WaveCardContainer.tsx:209-233` |
| Follow | Yes — `Button`'s `loading={isPending}` flips synchronously inside `startTransition` | No (awaits server, then sets state) | Error only | Yes, via `disabled={disabled \|\| loading}` in `Button` | `FollowButton.tsx` |
| Comment submit | Yes — `loading={isPending}` | n/a (server round-trip, then list refresh) | Not checked this pass | Yes — `disabled={!canSubmit}` and `disabled={isPending}` on both buttons | `CommentComposer.tsx:71-181` |
| Publish (Create) | Not verified live this pass (recording needs a real mic stream) | — | — | — | `CreateFlow.tsx` |
| Duet request | Not verified live this pass | — | — | — | `w/[id]/duet/actions.ts` |

One live anomaly worth flagging rather than hiding: clicking Follow on the
real `@akin` profile left the button in an unresolved state for **61.6s**
before the script's own timeout gave up waiting on it (`results.json` →
`async.follow.ms: 61604`, both `aria-busy` and final label reads coming back
null). This may be nothing more than this pass hitting the founder's real
account's follow graph on the shared live project rather than a synthetic
one; it wasn't reproduced against a second synthetic account and needs a
follow-up run against an isolated account pair before anyone treats it as a
defect in `follow()`/`FollowButton`.

## 4. Icons

- Weight usage across `src/` is clean: 24 uses of `weight="fill"` (active/selected state), 3 of `weight="regular"` — no mixing of bold/duotone/light/thin. Phosphor weight consistency: **pass**.
- `EmptyState.tsx` has no `icon` prop at all, so DESIGN.md §12's "never an icon in a grey circle above centred text" can't be violated structurally — confirmed by reading the component, not just spot-checking screens.
- Comment / Save / Share row on `WaveCard.tsx` (`MessageSquare`, `Bookmark`, `Share2`) is unambiguous and consistent across the ten cards seen on Explore.
- No dedicated "Replay" icon exists — replay is just pressing Play again on a Wave already heard, which matches the metric label ("41 replays") rather than a separate control. Not a bug, just worth knowing before someone goes looking for a missing glyph.

## 5. Density and layout, 1440 and 1920 wide

Measured `<main>` bounding box on every audited route (`sweep-metrics.json`):

| Route | `mainLeft` | `mainWidth` | Rail width | Right rail populated? |
|---|---:|---:|---:|---|
| Search, Create, Duets, Challenges, Tracks, Analytics, Pro, Settings, Messages, Notifications, Explore, Profile, Wave detail | 200px | **600px, fixed**, identical at 1440 and 1920 | 200px | No, on every one of these |
| Flow | n/a (full-bleed, no `AppShell` chrome) | narrow single column, screenshot-confirmed | 0 | n/a by design |

At 1440px that's 200 (rail) + 600 (content) = 800px used, **640px (44%) of
flat, empty paper** to the right of content on every one of thirteen routes.
At 1920px it's 200 + 600 = 800 used, **1120px (58%) empty**. See
`docs/research/desktop/audit/route-explore.png` for a direct screenshot: the
Explore feed, "Voices worth following" tiles and trending list all sit in
the left 800px of a 1440px canvas with nothing at all to their right.
`AppShell.tsx`'s own docstring claims this was "what fixes the audit's
'40-50% of a 1280px viewport is dead grey space'" by not centering content —
that's true (content is left-hung, not centered-with-worse-margins), but the
aside column (`{aside || hasPlayer ? <aside>… : null}`) is empty on every
route this pass visited that wasn't actively playing a Wave, so the dead
space the earlier audit flagged is still there, just now against the right
edge instead of split on both sides.

No routes showed 44px "mobile-sized" touch targets misapplied at desktop
scale in this pass — `IconButton`'s `sm`/`md`/`lg` (36/44/56px) sizing
appeared correctly scaled to `sm`/`md` on desktop chrome (comment/save/share
row, rail icons).

## 6. Colour and contrast

Sampling background-colours of the first 400 elements on each route
(`sweep-metrics.json`) found the same **5–6 distinct colours** in play on
every standard route: `--akinti-paper` (`#e9efec`), `--akinti-paper-raised`
(`#dee7e3`), `--akinti-paper-sunk` (`#d3e0d9`), `--akinti-current`/tide
(`#0e6b6b`), `--akinti-signal` (`#de3c11`), occasionally `--akinti-ink`
(`#0f1a18`) where a filled dark surface appears (Analytics, Wave detail).
That's the deliberately restrained COLOR_V2 palette working as designed, not
a defect — but combined with §5's finding, the practical effect on a wide
desktop screen is: five or six colours are all concentrated inside an
800px-wide left column, and the eye has nothing to land on anywhere else on
the screen. The record key (tide fill + Signal dot) and the odd "Follow"
button are the only saturated colour on most screens; the rest is paper.

## Performance (`npm run perf` + build output)

```
Performance budget (enforced: 340KB/route; mobile-guidelines.md target: 150KB)
  ok   Home (/): 227.2KB (budget 340KB, 23 chunks)
  ok   Flow (/flow): 227.2KB (budget 340KB, 23 chunks)
  ok   Explore (/explore): 227.2KB (budget 340KB, 23 chunks)
  ok   Wave (/w/[id]): 254.7KB (budget 340KB, 25 chunks)
  ok   Create (/create): 243.8KB (budget 340KB, 25 chunks)
All routes within budget.
```

Route-change timing: a raw client-side `Link` click begins mutating the DOM
in **~20ms** (`performance.now()` + `MutationObserver`, see §1), but the
screenshot-diff method shows the *visible* content swap lands 700–1200ms
later on every route measured that way. The gap between "DOM starts moving"
and "a human can see it happened" is the real number to close, and it's not
a client-JS-weight problem (all budgets pass) — it's an RSC data-fetch
latency with nothing painted over it.

## Prioritised fix list

1. **Add `loading.tsx` to every top-level route directory that fetches data before paint** — `src/app/(app)/explore/loading.tsx`, `.../flow/loading.tsx` (or its full-bleed equivalent), `.../messages/loading.tsx`, `.../notifications/loading.tsx`, `.../search/loading.tsx`, `.../duets/loading.tsx`, `.../challenges/loading.tsx`, `.../tracks/loading.tsx`, `.../settings/loading.tsx` (and its subpages), `.../analytics/loading.tsx` (promote the existing client `Skeleton` pattern to the route-level file so it shows before any JS runs), `.../u/[username]/loading.tsx`, `.../w/[id]/loading.tsx`. This alone would give 12+ routes their first-ever loading affordance, matching Next's own primitive instead of inventing one.
2. **Wire `useLinkStatus` into `SideNav.tsx`'s rail links** (and `BottomNav.tsx` for parity) so the clicked item shows a pending visual — even a same-instant opacity dip on the icon — instead of waiting for `usePathname()` to catch up 700-1200ms later. This directly answers "the clicked nav item doesn't show pressed/active state immediately."
3. **Add a top-of-viewport progress indicator in `AppShell.tsx`**, driven by the same pending signal `useLinkStatus`/a route-change listener would provide, so the ~700-1200ms gap between click and paint has *something* moving on screen regardless of which route is loading.
4. **Give `Button`'s `primary`/`secondary` variants a hover state** in `src/components/ui/Button.tsx`'s `VARIANTS` map (e.g. a `hover:bg-current-2`-equivalent token for `primary`, a subtle `hover:border-ink`/background wash for `secondary`) — right now the single most important action on a screen (`primary`) gives no preview at all before the click.
5. **Set `cursor: pointer` on the native `<button>` base classes** in `Button.tsx` and `IconButton.tsx` (`BASE` constants) — every button-element control in the product currently keeps the browser's default arrow cursor, while only `<a>`-based nav items get a hand cursor for free. This is a one-line, zero-risk fix with an outsized effect on "does this feel clickable."
6. **Populate the right rail (`aside` prop in `AppShell`) on Explore, Home/Flow-adjacent, and Profile** — the `{aside || hasPlayer ? <aside> : null}` branch is empty on every content route this pass visited without an active player, which is what leaves 44% (1440px) to 58% (1920px) of the viewport flat paper even though `AppShell.tsx`'s own docstring believes the dead-space problem is already solved. Candidates: "Voices worth following" secondary list, an activity/notifications digest, or Duet/Challenge prompts, depending on the route.
7. **Re-run the Follow-button live-anomaly probe against two synthetic accounts on an isolated Supabase project** before deciding whether `FollowButton.tsx`/`follow()` has a real hang — this pass's one data point (61.6s against the founder's own `@akin` account on the shared live project) is not clean evidence either way.
8. **Add rail entries (or another persistent affordance) for Search, Create, Duets, Challenges, Tracks and Pro** in `src/components/layout/navItems.ts` — six of fourteen audited top-level routes currently have no click target in the primary nav at all, which was indistinguishable, from the click-to-paint measurement's point of view, from "there's nothing to press."
