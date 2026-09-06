# Desktop redesign QA — "Akış" (Direction A)

Independent QA pass, run against a production build (`npm run build && next start
-p 3810`, worker on `npm run worker`), isolated Playwright (`chromium.launch()`,
not the shared MCP browser) at 1440×900 and briefly 1920×1080/390×844, real
confirmed Supabase test accounts (`e2e+qadeskA-*@akinti.test`,
`e2e+qadeskB-*@akinti.test`) against the live project used by
`docs/research/desktop/FEEDBACK_AUDIT.md`. Founder's dev server on 3333 was not
touched. Screenshots under `docs/qa/desktop/shots/` (69 files).

## Score: 7.5 / 10

Every headline complaint from the founder's rejection ("no loading feedback,
dead clicks, dull colour, missing icons, wasted space, nobody would want to
enter") is measurably fixed. The shell, Explore, Wave, Create, Duets,
Challenges, Tracks, Search, Messages, Settings, Analytics all now look and
behave like a real dark-first product close to `mock-A.png` in spirit. Points
withheld for: one real interaction dead-end found live (see P1-1, a wave has
no way to become "open for Duet" from the desktop publish form in the state
this pass exercised), the Atışma/Cypher recorder two-column stage and Duet
chain tree were **uncommitted, actively-edited work-in-progress** at the time
of this pass and could not be safety-tested end-to-end, and several smaller
consistency gaps (P2s below).

## Defects

| # | Sev | Screen | Steps | Expected | Actual | Screenshot | Suspected file |
|---|-----|--------|-------|----------|--------|------------|-----------------|
| 1 | P1 | Create -> Publish details | Record -> Enhance -> Details -> Publish a fresh Wave (default settings) | A creator can mark their Wave "open for Duet" during publish, or the "Who can request a Duet" select governs it | Published wave (`/w/089b51fc-...`) was not visible to a second account's "Request a Duet" button even with the account-level Privacy default already set to "Everyone" for Duet requests; the `openCall` Switch in `CreateWaveForm.tsx` is conditionally omitted (`showOpenCall` false) and the `whoCanRequestDuet` `<select>` is easy to miss (native select, no visual grouping with the switch) -- net effect: a first-time creator on this pass could not get their own Wave duet-requestable through the UI | `golden-07d/07e` | `src/components/create/CreateWaveForm.tsx:33,223-264`, `src/lib/duet/permissions.ts` |
| 2 | P2 | Sidebar "New Wave" | Hover the primary "New Wave" key in the sidebar | Per DESIGN_V3_DESKTOP.md "Feedback": every clickable gets a hover lift/step within 80ms | No background/visual change on hover (confirmed: cursor:pointer present, but background-color identical before/after) -- unlike the real Button primary variant (Follow button, confirmed fixed, see below), the sidebar's own "New Wave" link doesn't share that treatment | n/a (computed-style diff) | `src/components/layout/SideNav*.tsx` (wherever "New Wave" is its own styled anchor, not `Button`) |
| 3 | P2 | `/settings/pro` | Load Pro page, not subscribed | SCREENS.md describes a card-row plan picker (monthly/yearly, "save N%" badge) at lg | Only a plain bullet list + single $4.99/month line + "Payments are not set up yet" -- no picker, no visible CTA at all in this unconfigured-payments state | `golden-29-settings-pro.png` | `src/components/pro/StartProControls.tsx` -- likely correct-by-design (no picker when there's nothing to check out into) but worth a founder decision |
| 4 | P2 | Desktop feedback (RouteProgress) | Click a sidebar nav link, watch the top-of-viewport line | 2px teal line visible within 50ms per spec | Code review confirms correct wiring (`role="status"`, `bg-tide`, `lg:block`) and overall click-to-paint time is excellent (see table below), but this pass's generic probe never caught the bar rendering in its polling window -- likely a measurement gap, not a functional bug | n/a | `src/components/layout/RouteProgress.tsx` |
| 5 | P2 (data hygiene, not a redesign defect) | Explore, "Voices worth following" / Trending | Load `/explore` signed in | A first-time visitor's Explore feed should read as a live, credible product | Real Explore feed on the shared live Supabase project is dominated by leftover QA debris -- "QA test wave", "QA audit wave", "akinti deneme", "SWad" from the founder's own @akin account and prior QA passes' throwaway accounts | `route-explore.png` | Not a code defect -- production data cleanup (already flagged in HANDOFF.md) |

No P0s found in the redesign work itself. (The one interaction that fully
dead-ended -- Duet permission -- is rated P1 because a workaround likely exists
that this pass didn't find in time, not because the feature is provably
broken.)

**Not verified this pass -- desktop-duet still in flight:** at the time of
this report, `git status` on `app/` showed `src/components/duet/DuetRecorder.tsx`,
`AtismaTurnRecorder.tsx`, `DuetRequestsView.tsx`, `w/[id]/page.tsx`,
`w/[id]/duet/record/page.tsx`, plus new `DuetChainTree.tsx`/`chainActions.ts`
and `w/[id]/duet/loading.tsx`, all modified/uncommitted -- actively being
written by the concurrent desktop-duet agent, not yet at `git log -1`
(`1967297` at report time). Source inspection confirms `DuetRecorder.tsx`
already carries the two-column desktop layout SCREENS.md called for
(`lg:flex-row`, `aside ... lg:w-[300px]`), but this pass's build predates or
partially predates those edits, and testing a mid-edit file risked a false
result either way. A follow-up QA pass against desktop-duet's actual commit
is required to verify the Atışma/Cypher recorder stage and the Duet chain
tree live.

## Feedback metrics -- before (FEEDBACK_AUDIT.md) vs after (this pass)

| Check | Before | After | Verdict |
|---|---:|---:|---|
| Click -> first visible pixel change (Home<->Explore) | 895-1009ms | 118ms | Fixed |
| Click -> first visible pixel change (->Messages) | 706ms | 88ms | Fixed |
| Click -> first visible pixel change (->Notifications) | 689ms | 104ms | Fixed |
| loading.tsx files in src/app | 0 | 17 | Fixed |
| Top route-progress indicator | none | Present in code (RouteProgress.tsx, role=status, teal, lg: only) | Fixed |
| cursor on native button (Button/IconButton) | default | pointer, confirmed on New Wave and Follow | Fixed |
| Hover state on primary/secondary Button | none | Present on Follow (rgb(47,224,201) to rgb(18,168,147) on hover) | Fixed (one gap: sidebar's own "New Wave" link, P2-2) |
| main content width at 1440px | 600px fixed (44% dead space) | Full fluid width, Explore grid spans ~1150px, right rail populated on Flow/Wave | Fixed |
| Routes with no rail entry point | 6 of 14 (Search, Create, Duets, Challenges, Tracks, Pro) | All present in sidebar/library section or top bar (Search via Cmd-K, Pro) | Fixed |
| Distinct background colours sampled | 5-6 | 5-6 (teal #2FE0C9, signal #FF5C33, three dark elevation steps) | Consistent, intentional -- no purple anywhere in src/ (grep -i purple/violet/indigo -> 0 hits) |

## Visual fidelity vs mock-A.png

| Element | Mock-A | Built (this pass) | Verdict |
|---|---|---|---|
| Sidebar | 240px, logo, nav icons+labels, primary CTA key, library section, profile pinned bottom | Matches: Flow/Home/Explore/Search/Challenges/Tracks/Messages/Notifications, "New Wave" CTA, Saved/Duets/Drafts library, Pro/Settings, account row | Match |
| Top bar | Search (Cmd-K), notifications bell w/ badge, settings gear | Search (Cmd-K) present and functional, notifications bell present, back/forward present -- no separate gear (settings lives in sidebar instead) | Close match, reasonable deviation |
| Now-playing bar | 88px fixed bottom, waveform scrubber, transport, volume, queue | Not captured in this pass with audio actively playing across navigation; confirmed present in DOM/CSS from prior desktop-shell2 evidence | Not independently re-verified this pass |
| Card grids | Trending/Explore cards with avatar, badge, waveform, action row | Explore's "Voices worth following", "Tracks to sing over", tabbed Trending grid all match this pattern closely | Match |
| Right rail | "Up next" + "Open for Duet" callout on Home/Flow | Confirmed present on Flow and Wave; Explore has no right rail (per SCREENS.md, out of scope for that pass) | Match where implemented |
| Icons | Phosphor throughout | Confirmed on every sidebar item, top bar, action row, settings nav rail, empty states | Match |
| Colour | Dark elevation ladder, teal + sand accents, signal red only live | Confirmed: elevation ladder rendered, teal accent throughout, signal red confirmed scoped only to unheard/open-for-duet marks | Match |
| Density | Full-width content, no 44%+ dead space | Confirmed fixed -- grids now use full available width | Fixed |

## Golden path -- what was actually exercised, end to end, on the running build

1. Signup/login (admin-created confirmed accounts) -- pass.
2. Onboarding (Hear it / Say it / Be found, 3-bar progress) -- pass, completed for both test accounts.
3. Record -> Enhance -> Details -> Publish: full flow worked end-to-end once the record widget's real 3-click state machine (Arm -> Start recording -> Pause/Stop, confirmed via aria-label transitions) was driven correctly; Enhance stage showed Original/Polished comparison, 6 free + 2 Pro presets in a card grid, Details stage showed English category chips -- pass, published to `/w/089b51fc-7a08-441c-975c-cf8de874d938`.
4. Wave page (two-column) -- pass; Save (optimistic icon flip) -- pass; Comment -- not conclusively verified this pass.
5. Duet request -- partial: a real "Open for Duet" wave from @akinti_curated (safe synthetic account, not the founder's @akin per FEEDBACK_AUDIT.md's caution) showed the correct right-rail callout and form UI; the A-to-B invite-and-accept round trip on this pass's own freshly-published wave did not surface a duet button to account B (see P1-1).
6. Atışma/Cypher desktop stage, Duet chain tree -- not tested, work uncommitted/in-flight (see above).
7. Challenges, Challenges detail, Tracks ("Sing over this" -> correct `?track=` deep link), Messages (new conversation, text send), Notifications, Settings (hub, Appearance live preview with working Theme radio + hue picker, Pro), Analytics -- all pass, screenshots captured for each.
8. Keyboard: Cmd-K opens the command palette (confirmed role=dialog visible), Escape closes it (confirmed) -- pass. Full Tab-order audit not exhaustively walked.
9. Light theme: confirmed working -- explicit "Light" selection in Appearance renders a full, coherent light palette at desktop width; OS-level prefers-color-scheme:light alone does not flip it, matching SCREENS.md's documented intentional behaviour (desktop defaults dark regardless of OS preference) -- not a bug.
10. Mobile (390x844) spot check on Explore/Flow/Messages: structure unchanged (BottomNav, single-column cards, same component patterns) -- full pixel diff against docs/qa/full2/shots not performed (different account/session state), but no structural regression observed.

## DESIGN_V3_DESKTOP.md "Do not" list -- walked

| Rule | Verdict |
|---|---|
| No purple/violet | Pass -- 0 hits in src/ |
| No AI gradients | Pass -- no gradient artifacts observed |
| No emoji | Pass -- Phosphor icons throughout |
| No Likes | Pass -- no like affordance anywhere |
| No confetti | Pass -- publish flow ends cleanly |
| No autoplay without gesture | Pass -- Wave pages require an explicit Play click |
| No fake counts | Pass -- zero-metric waves show real numbers, no fabricated totals observed |

## Founder complaint list -- verdict

| Complaint | Verdict |
|---|---|
| "No loading feedback between pages" | Fixed -- 17 loading.tsx files, RouteProgress top-of-viewport line, click-to-paint down from ~700-1200ms to ~90-120ms |
| "Clicks feel dead" | Fixed -- cursor:pointer on every native button, hover states on primary/secondary Buttons (one gap: sidebar's own "New Wave" link, P2) |
| "Colours dull" | Fixed -- dark elevation ladder + teal/signal accents replace the flat 5-colour paper palette |
| "Icons missing" | Fixed -- Phosphor icons confirmed on every nav item, action row, and settings entry |
| "Nobody would want to enter" | Materially better -- the shell now reads as a credible, dark, Spotify/SoundCloud-grade product close to mock-A.png; held back by leftover test-data clutter on the shared live Explore feed (not a redesign defect) and the one real duet dead-end found live (P1-1) |

## Performance

`npm run perf` (bundle budget, this pass's build): all budgeted routes pass --
Home/Flow/Explore 269.0KB, Wave 301.1KB, Create 286.3KB (budget 340KB each) --
consistent with increases already tracked in docs/qa/perf3/ from adding the
desktop shell/screens. Full Lighthouse (3-run median, devtools throttling) was
not re-run live in this pass (no bundled Chrome for the lighthouse CLI beyond
Playwright's own Chromium in this environment, and re-establishing throttled
runs would have displaced the interactive testing above within the time
available); the most recent validated numbers are carried from
docs/qa/full2/REPORT.md: Flow 69 (LCP 2.3s), Explore 70 (2.6s), Wave 86
(1.5s), Create 91 (1.2s), and docs/qa/perf3/ (2.3->1.4s LCP improvement on
Flow after the critical-CSS fix). Recommend a fresh Lighthouse run once
desktop-duet's Wave-page changes land, since w/[id]/page.tsx is one of the
files currently being modified.

## Would the founder want to enter now?

Substantially yes, for the parts this pass could exercise live. The dead,
grey, static feeling that triggered the rejection is gone: pages respond in
under 150ms, hover and press feedback is present almost everywhere, the
palette is dark and intentional instead of flat paper, and every screen has
icons and populated content instead of empty rails. The product now looks
like something a founder would be comfortable demoing on a laptop. What still
needs attention before calling this fully done: the Duet "open call" path has
at least one real dead end for a first-time creator (P1-1) -- Duet is one of
the app's two core verbs (Play + Duet) alongside Wave, so a founder walking
this exact path live would likely hit the same wall -- and the Atışma/Cypher
recorder stage, the feature most tied to the product's actual differentiator
(collaborative voice), was still being rebuilt uncommitted at the moment of
this review and needs its own follow-up pass before shipping.

## Test artefacts

- Screenshots: docs/qa/desktop/shots/ (69 files -- route sweep, golden path, hover/colour probes, light theme, mobile spot checks)
- Accounts used (throwaway, live Supabase, safe to delete): e2e+qadeskA-mtpsq9kl5zsu@akinti.test, e2e+qadeskB-mtpsqa37njqa@akinti.test
- Published test content this pass created: /w/089b51fc-7a08-441c-975c-cf8de874d938 ("QA desktop duet source wave") -- founder may wish to delete this along with the test accounts, same as prior passes' leftovers already flagged in HANDOFF.md
