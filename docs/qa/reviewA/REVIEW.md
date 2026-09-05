# Wave A review — design system v2

Scope: commits `9c7d38b`..`8af1a9a` (type/palette, icons, kit rebuild, layout, motion, waterline
player, rail-hung Wave, screen adoption, kit gallery, deps). Judged against `DESIGN.md`,
`mobile-guidelines.md`, and taste against `docs/research/teardown/TEARDOWN.md` and
`docs/design/refs/*`. Screenshots and a Playwright interaction log are in this folder
(`report.json`); the app ran on `localhost:3777` via an isolated `chromium.launch()`, never
the shared MCP browser.

## a) Spec violations

1. **The stream Wave's trace is not full-bleed — contradicts §8.3.** `src/components/wave/WaveCard.tsx:170-182` sets `fullBleed={detail}` and wraps the inline `WavePlayer` in `className="akinti-page"` (20px inline padding) whenever `variant !== "detail"`. §8.3 diagrams "full-bleed waveform... the largest, highest-contrast element in every item," and §1 lists "bleeds past both page edges" as a stream-item property, not only the detail page. Confirmed by measurement: on `/explore` at 390px the canvas box is `left:16 right:374` (`explore-mobile.png`) — inset like everything else, not edge-to-edge. Only `detail` (the Wave's own page) actually bleeds. Fix: drop `akinti-page` on the inline trace and pad the rest of the row instead, as `WaveSeparator` already does.

2. **Bottom-sheet focus is not trapped, and Escape dismissal is unreliable as a result.** Opening `Sheet` (vaul `Drawer.Root`, `src/components/ui/Sheet.tsx`) leaves `document.activeElement` on `<body>`; one `Tab` moves focus to a control in the page *behind* the scrim, not to the sheet's close button or first focusable child. Reproduced twice in `report.json`: `sheet-focus-on-open` and `sheet-focus-after-one-tab` both show `inDrawer:false`. Once focus has drifted outside the drawer this way, `Escape` sometimes fails to close it (`sheet-escape-count-after:1`) because the keydown never reaches the scope vaul/Radix listens on; when focus is left untouched right after opening, `Escape` does work. This is a real, user-reachable keyboard trap on every sheet in the product (share, filters, menus) — worth a P0.

3. **`RecordKey`/`BottomNav` hardcode radius pixel values instead of the design tokens.** `RecordKey.tsx:25-29` and `BottomNav.tsx:68` use `rounded-[11px]/[13px]/[21px]/[26px]/[28px]` matching §5.2's curvature ladder by literal value, while `globals.css` already publishes `--akinti-radius-key-36/44/72/88/96`. Correct today, but nothing ties them together, so a future token edit silently desyncs the record key.

4. **`<html lang="tr">` while the product copy is English.** `src/config/terminology.ts:215` sets `htmlLang: "tr"` per §3.2, but every string in the running app (`/explore`, `/kit`) is English, and `AGENTS.md` says "UI language: English now, Turkish first-class next." DESIGN.md wins on this per `AGENTS.md`'s own conflict rule, so the code is technically compliant — but it makes the Turkish regression string in the kit meaningless until real copy is Turkish. Worth a call-out, not a fix.

## b) Taste problems

1. **Next.js's own dev-mode indicator sits directly on top of a live control, twice.** On `/kit` (`docs/qa/reviewA/kit-desktop-light.png`, `kit-mobile-dark.png`) the black "N" badge overlaps the theme-toggle button in the top-right corner, and on `/explore` (`docs/qa/reviewA/explore-mobile.png`) it overlaps the "Sign up" button. A prior commit (`3c6feb2`, "move the Next.js dev-tools indicator off the bottom nav/share sheet") fixed the bottom-nav collision but this top-right corner was missed. Dev-only, won't ship to prod, but it blocked real clicks in this review (`toggle.click()` timed out until I forced/dispatched it) and will do the same to anyone else testing in dev mode. Fix: set `devIndicators: { position: "bottom-left" }` (or disable) in `next.config.ts`.

2. **Two calls to action that mean the same thing, on the desktop shell.** `docs/qa/reviewA/explore-desktop.png`: "Sign up" appears in the top bar and again at the foot of the left rail; "Log in" likewise appears twice. §12.40 bans exactly this ("No two calls to action on one screen that mean the same thing"). Likely because `TopBar` and `SideNav` were adapted independently in `c54dacc` without checking for this overlap on the ≥1024px breakpoint.

3. **The one visible Wave in the seed content renders as a dot row, not a waveform**, which reads correctly per §6.1's silence rule but makes the very first screenshot anyone takes of the product look empty/broken rather than "an instrument." This is a seed-data problem, not an implementation bug — the geometry, mirroring and silence-dot logic in `waterline.ts` are exactly right — but it does mean the kit's own regression content should include at least one seeded Wave with real amplitude so `/explore` doesn't demo the weakest-looking state by default.

## c) Accessibility, keyboard and touch findings

- **Real bug (P0):** sheet focus-trap failure, detailed in (a)2 above.
- **Pass:** icon-only controls (`IconButton.tsx:100`) use a `VisuallyHidden` text node rather than `aria-label` — a valid, WCAG-compliant naming technique. My first automated pass flagged `aria-label` as absent on every `/explore` button, which reads as a bug at a glance; it isn't — confirmed via `getByRole("button", { name: /^Play/ })` resolving correctly.
- **Pass:** keyboard Tab order on `/explore` reaches the skip link first, then top-bar controls, then the feed in visual order, with a visible 2px ink focus ring on every stop (`keyboard-focus-explore.png`) — matches §8.9's "one focus treatment on every focusable thing."
- **Pass, needs a comment:** the waveform is `role="slider"` with `aria-valuemin/max/now/valuetext`; arrow/Home/End keys work once a Wave is the active (playing) one. Before playback starts, `seek()`/`seekToRatio()` in `playbackStore.ts` are no-ops for a Wave that isn't `store.getState().waveId`, so keyboard/drag scrubbing on an *unplayed* trace silently does nothing until Play is pressed. This matches a physical transport (can't scrub unloaded tape) and there's an explicit Play control, so not a defect — but it's worth a one-line comment in `Waveform.tsx` so it isn't mistaken for one later (I initially did).
- **Pass:** drag-to-scrub works once a trusted gesture has started playback (`aria-valuenow` moved `"0"` → `"60"` after a mouse-drag across 60% of the trace).
- **Pass:** reduced-motion — `globals.css`'s blanket `animation-duration: 0.01ms !important` plus the `.akinti-lamp` override (static, `opacity:1`) covers the one infinite animation unconditionally, regardless of which element carries the class.
- No console errors and no failed requests were observed across any captured route/theme/viewport (`report.json`).

## d) What is excellent

- **`waterline.ts` / `WaveformCanvas.tsx`** implement §6.1's geometry table, the silence-dot rule, the 2px minimum bar, the 70%-alpha mirrored lower half, whole-device-pixel rounding, and the clipped two-layer played/unplayed mask exactly as specified — this is the hardest part of the brief and it is done right, including the Duet "theirs down in ink / yours up in Signal" split.
- **Colour and radius tokens** (`globals.css`) match §4.2/§4.3 hex-for-hex and §5.2's ladder exactly, including the dark theme's warm-graphite ground (verified live: `#131412`, not `#0A0A0A`) and the `--akinti-radius-key-*` curvature values.
- **Motion tokens** (`src/lib/motion/tokens.ts`) mirror §7.1's five durations and four eases 1:1, `MotionProvider` is wired at the root with `LazyMotion`+`domAnimation`+`strict`, and `useReducedMotion` correctly scopes to what CSS can't reach (tearing down rAF loops).
- **No cards, no pills, no shadows outside sheet level** anywhere in the Wave A file set — verified by grep across the whole touched surface (`rounded-full` appears only on legitimate round transport controls, the record lamp dot, and the spinner).
- **Badges, chips, tabs, avatars** in the live `/explore` and `/kit` screenshots read exactly as the doc describes: hairline tags, 2px ink underbar for the active tab, squircle avatars — this genuinely does not look like a generic template any more.

## e) Prioritized fix list

- **P0** — Fix the sheet focus trap (`Sheet.tsx`): auto-focus the dialog/close button on open and confirm Tab cannot reach background content; re-verify Escape/scrim-tap dismissal once focus stays inside.
- **P0** — Make the stream Wave's trace actually full-bleed per §8.3 (`WaveCard.tsx`); currently only the `detail` variant bleeds.
- **P1** — Remove the duplicate Sign up/Log in CTA on the desktop shell (`TopBar.tsx` + `SideNav.tsx`), §12.40.
- **P1** — Move or disable the Next.js dev indicator (`next.config.ts` → `devIndicators.position`) so it stops sitting on top of the theme toggle and the Sign-up button.
- **P2** — Wire `RecordKey`/`BottomNav` radius classes to the actual `--akinti-radius-key-*` custom properties instead of restating the pixel values.
- **P2** — Seed `/explore`'s demo content with at least one Wave with real amplitude so the default screenshot isn't a silence-dot row.
- **Not a bug, needs a comment**: pre-playback keyboard/drag seek is a no-op by design (`playbackStore.ts`); add a short comment in `Waveform.tsx` explaining this so it isn't "fixed" into something worse later.

## f) Score: 8/10

The hard part — the single waterline primitive, correctly geometrised, mirrored, silence-aware,
theme-aware and reused as the separator, the grabber and the transport — is genuinely well
built and is the part most redesigns get wrong. Type, colour and radius tokens are implemented
to the letter. What holds this back from a 9 or 10: one real, user-facing accessibility defect
(sheet focus trap) that will surface on the very first VoiceOver/keyboard pass a reviewer runs,
one clear spec contradiction with a visual screenshot to prove it (the stream trace isn't
full-bleed, despite that being one of §8.3's two named properties), and a couple of
first-screen taste slips (duplicate CTAs, dev-badge overlap) that undercut the "sellable,
premium, error-free" bar `CLAUDE.md`/`AGENTS.md` set for this pass. None of these require
architectural rework; all four P0/P1 items are small, localized diffs.
