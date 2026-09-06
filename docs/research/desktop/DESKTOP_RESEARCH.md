# AKINTI desktop — research and two directions

Commissioned after the founder's review: "no loading feedback between pages, clicks feel
dead, the colours are dull, icons are missing, nobody would want to enter this." This
document is research and a spec, not implementation. It does not touch application code.

Evidence: `docs/research/desktop/refs/*.png` (16 public products, captured by this pass, own
isolated Playwright `chromium.launch()`, 1440x900, no login, no purchase — `shot.mjs` is the
capture script and is reproducible); `docs/qa/colour/desktop-*.png` and `docs/qa/flow/desktop-*.png`
(the current build, captured by an earlier QA pass, referenced as the baseline throughout);
`docs/design/DESIGN.md`, `COLOR_V2.md`, `REFERENCES.md`, `SCREENS.md` (the existing system);
component code and catalog in `docs/research/desktop/components/`.

**Constraint check.** Everything below stays inside the four hard constraints the brief set:
no Likes, audio-first, Signal (`#DE3C11`/`#FF5C33`) exclusive to live audio, no purple/violet/
indigo or AI-gradient look, no emoji-as-icon. Every other current rule (no cards, one accent
total, no shadows, 600px-fixed content column) is treated as negotiable, because those are
exactly the rules producing the founder's complaint on desktop specifically — they were tuned
for a 390px mobile frame and do not fill a 1440px one.

---

## 1. What the current desktop build actually does

`src/components/layout/AppShell.tsx` renders a 200px labelled rail, then caps content at
`lg:max-w-[1160px]` inside a 600px content column plus a 300px contextual column. On a
1440px viewport that is roughly **280px of dead paper on the right of every screen** —
visible directly in `docs/qa/colour/desktop-light-home.png` and `desktop-dark-home.png`,
both captured at 2560x1600 (rendered at 1280 logical), where the entire right two-thirds of
the frame is empty ground. The persistent player
(`src/components/layout/PersistentPlayer.tsx`) is explicit in its own doc comment that it is
"not a Spotify-style bottom bar" and instead sticks inside the 300px right column — so on
desktop there frequently is **no visible now-playing bar at all**, confirmed by
`docs/qa/colour/desktop-light-persistent-player.png` rendering identically to the Explore
screen next to it (no player content is showing). There is no `loading.tsx` anywhere under
`src/app` (`find src/app -iname loading.tsx` returns nothing) — zero route-level loading
feedback, which is the founder's first complaint verified directly against the code. Record,
play and follow controls are flat single-colour shapes with no hover elevation, no depth, and
one accent colour (`--akinti-current` teal) used identically for every affordance on the
page, which is the "dull" and "dead" the founder is naming.

---

## 2. Comparison table

| Product | Shell (rail / content / right rail / now-playing) | Surface | Density | Hover / press | Loading | Icons | Colour-to-click |
|---|---|---|---|---|---|---|---|
| **Spotify web** (`spotify-open.png`) | 72px icon rail always visible, library panel, full-width content, **full-width 90px bottom bar** | Near-black `#121212`, flat, one 8px radius on cards | Medium-dense grid, large art | Card lifts + shows a green play button on hover (opacity 0→1, scale) | Skeleton shimmer per card | Custom filled glyphs | Green circular play button appears *only* on hover — colour is the affordance, not decoration |
| **SoundCloud** (`soundcloud-discover.png`) | Persistent top bar, no left rail on web, orange accent | Near-black `#0e0e0e`, flat cards, cookie-banner aside | Dense horizontal carousels | Waveform hover shows orange scrub cursor | None observed above the fold | Custom line icons | Orange only on the waveform and the upload CTA |
| **Apple Music web** (`apple-music-browse.png`) | 220px icon+label rail, full-bleed hero cards, floating glass mini-player mid-page on scroll | White, large editorial imagery, soft shadow under the floating player | Very sparse, hero-led | Mini player is a frosted glass pill anchored center-bottom while scrolling | Standard browser paint, no custom skeleton visible | SF Symbols-style outline icons | Colour comes entirely from cover art, not chrome |
| **YouTube Music** (`youtube-music.png`) | 72px icon rail (unauth), red accent | Near-black `#0f0f0f`, flat rounded chips for moods | Dense carousels, thumbnail-led | Standard YouTube card hover (thumbnail scale) | — | Filled red glyphs | Red is reserved for the logo and one CTA |
| **Deezer** (`deezer-home.png`) | Marketing shell (unauth) | Near-black with a bold violet/purple CTA gradient | — | — | — | — | **Negative reference**: violet gradient is exactly the AI-slop tell AKINTI must avoid |
| **Bandcamp** (`bandcamp-discover.png`) | Top filter-chip bar, no persistent player until you press play | White, teal accent, dense masonry of album art | Dense grid | Chip row `all genres / electronic / rock…` as pill filters (their one pill use) | — | Line icons | Colour is the genre-tag pill, one per card |
| **TikTok desktop** (`tiktok-home.png`) | Left icon+label rail, center single-column vertical player, right action rail | Black video-first canvas | Single-item focus | Right-rail icons are large, high-contrast, always labelled with a count | — | Filled glyphs, large touch targets even on desktop | The like/share column is the loudest thing on screen — deliberately |
| **Instagram web** (`instagram-home.png`) | 244px icon+label rail (collapses to icon-only at narrower widths), centred single feed column, suggestions rail | White, hairline cards | Medium | Heart/comment icons animate on click (fill + scale burst) | Skeleton rows for stories | Custom line/fill icon pairs | The double-tap heart burst is the single most copied "feels alive" micro-interaction in social software |
| **Threads** (`threads-home.png`) | Same shell as Instagram, narrower content column, centred | White | Sparse | Minimal — mostly text | — | Line icons | Almost no colour; relies on whitespace and type |
| **X (twitter)** (`x-home.png`) | 275px icon+label rail, centred 600px column, 350px right rail (trends) | Pure black/white toggle | Dense, real-time | Retweet/like icons animate colour-fill on click | Skeleton lines while streaming in | Line-to-fill icon pairs on interaction | Colour appears only at the moment of action (blue retweet, red like, green reply count) |
| **Linear marketing** (`linear-marketing.png`) | 200px icon+label rail (product screenshot embedded in marketing page) | Near-black `#08090a`, 2/4/6/8/12/22px radius ladder | Dense, data-table-like | 200ms ease-out on everything, per their own published post | Toast + underline progress noted in their design writing | Line icons, one weight | Yellow/purple status dots only, reserved for priority |
| **Vercel dashboard** (`vercel-marketing.png`) | Marketing site; dashboard screenshots show 240px rail + card grid | White/black split, generous radius on deploy cards | Medium | Card hover = border colour shift + subtle shadow | Real-time deploy status dot animates | Line icons | Colour is exclusively status (building/ready/error), never brand |
| **Smule** (`smule-home.png`) | Marketing/app-store funnel page (desktop web is a funnel, not the product) | Warm gradient hero, mobile screenshots framed in phone mockups | — | — | — | — | Confirms Smule's real product is mobile-only; desktop web is not a usable surface, a useful negative data point |
| **BandLab** (`bandlab-home.png`) | Marketing/studio-launch page | Dark, DAW-style preview imagery | — | — | — | — | Negative reference already logged in `REFERENCES.md`; desktop web funnels to "Open Studio" rather than being the product |
| **Suno** (`suno-home.png`) | Marketing/generate page, no persistent player visible pre-generation | Warm off-white `#f7f4ef`, square-art grid | Dense card grid | Card hover reveals play + like counts | — | Line icons | Confirms light theme works for an audio product at any density |
| **Udio** (`udio-home.png`) | Marketing/generate page | Near-black, square-art grid | Dense | Similar to Suno | — | Line/fill mixed | — |
| **Discord** | Not captured — `discord.com` refused the connection during this pass (`ERR_CONNECTION_RESET`); noted as a gap rather than fabricated | — | — | — | — | — | — |

---

## 3. What makes people want to click — with evidence

1. **The affordance is invisible until you mean it.** Spotify's play button on a card is
   `opacity: 0` at rest and fades to `opacity: 1` with a slight scale on card hover
   (`spotify-open.png`, trending grid). The colour is not decorating the card, it is
   *arriving* in response to attention. AKINTI's current cards show every control at full
   opacity all the time, all in the one teal, so nothing signals "this is about to happen."
2. **Colour appears at the moment of the action, not before it.** X's retweet/like icons are
   outline and grey until pressed, then fill with colour in the same frame
   (`x-home.png` and general X behaviour, well documented). Instagram's double-tap heart burst
   is the single most-copied "feels alive" gesture in social software for the same reason.
   AKINTI has zero click-triggered colour change anywhere on desktop today.
3. **A full-width bottom transport bar reads as "this app is playing something," even when
   idle.** Spotify and YouTube Music both commit real chrome (72-90px, full page width) to a
   persistent player that is visible on every screen. AKINTI's desktop player is optional,
   column-scoped, and frequently absent (`docs/qa/colour/desktop-light-persistent-player.png`
   proves it renders nothing distinguishable from a page with no player). An audio-first
   product without a visible transport reads as not-audio.
4. **Real depth communicates "premium," flatness communicates "template."** Vercel's deploy
   cards and Linear's issue rows both use a one-step surface lift (border colour or a soft
   shadow) on hover; TikTok's action rail is large, high-contrast and always legible against
   video. AKINTI's zero-shadow, zero-card mobile rule, carried onto a 1440px canvas unchanged,
   is read by the founder as empty rather than disciplined — the rule was tuned for a
   390px phone screen where restraint reads as calm; at desktop scale the same restraint reads
   as unfinished.
5. **Dense, real content beats generous whitespace once a screen is wide enough to need
   filling.** Bandcamp, YouTube Music and Suno all run dense grids at desktop width; only
   Threads and Apple Music stay sparse, and both compensate with large, high-quality imagery
   AKINTI does not have (no album art, by design). AKINTI's 600px-capped content column on a
   1440px frame is closer to Threads' sparseness without Threads' imagery to justify it.
6. **A visible progress signal between actions removes the "is this broken" moment.** X and
   Instagram both show skeleton rows while content streams in; Linear's own published
   redesign post cites "~200ms ease-out" as their standard interaction duration specifically
   to avoid dead time. AKINTI has no `loading.tsx` under any route and no client-visible
   progress indicator anywhere — every navigation is a hard cut from old content to new.

---

## 4. Frontend-design skill checklist (applied)

Loaded via the `frontend-design` skill. Cross-checked against both directions below before
writing code:

- Not reaching for the "warm cream + serif + terracotta" default: neither direction uses a
  serif, and Direction B's colour blocks are saturated teal/sand fields, not a cream ground.
- Not reaching for the "near-black + one acid accent" default either: Direction A pairs two
  hues (cool current + warm sand) rather than one, and neither is acid-saturated singular.
- No SaaS-card kit: Direction A's cards use one radius (18px) applied consistently *within
  that direction* for a reason (this is now a card system, unlike mobile's card-free system),
  not templated identical cards with a generic grey shadow — the shadow is tinted ink, per
  the existing `--akinti-shadow-*` convention, not `rgba(0,0,0,.1)`.
- No tracked-out ALL-CAPS eyebrows, no middle-dot chains beyond one per line, no arrow-appended
  button labels (Direction B's "Send the request" carries an elbow-arrow icon *inside* the
  action itself because it visually answers the block above it, not as a decorative suffix).
- Structural devices encode information: Direction A's left rail accent bar and glow both
  encode "this is the active destination", the same job the existing mobile rail already does;
  Direction B's ink/current/sand colour blocks encode section identity (live audio / trending
  / Duet request), not decoration.
- One page-load moment of orchestrated motion (the top route-progress line + card entrance),
  not staggered fade-ins on every element.

---

## 5. Two directions

Both keep Archivo Variable + Martian Mono (already the correct, deliberately-chosen type
system per `DESIGN.md` §3 — the desktop problem is depth, colour and feedback, not type) and
Phosphor icons, one weight, outline-vs-fill for state. Both keep Signal exclusive to live
audio. Both are rendered as static mockups of the Flow/Home screen:
`docs/research/desktop/mock-A.html` / `mock-A.png` and `mock-B.html` / `mock-B.png`, real
Turkish/English copy, Phosphor via CDN, screenshotted at 1440x900 by this pass's own
Playwright script (`shot-mocks.mjs`).

### Direction A — "Akış" (the current), dark-first, Spotify/SoundCloud-grade

**Palette** (dark, layered — not a flat `#0F1614`):
`--paper-0 #0A100E` (chrome floor) · `--paper-1 #0F1815` (content ground) ·
`--paper-2 #152020` (card) · `--paper-3 #1C2926` (card hover) ·
`--ink #EEF5F1` · `--ink-muted #A9BDB5` · `--ink-subtle #748882` ·
`--hairline #243430` / `--hairline-strong #324640` ·
`--current #2FE0C9` (vivid cool, up from the existing `#3FB5B0`) with `--current-deep #12A893` ·
`--sand #F0A63F` (vivid warm counterpart, up from the existing `#E0B25A`) with
`--sand-deep #C07F1E` · Signal unchanged, `#FF5C33`.

**Type**: Archivo, `wdth 108-112` on the 30px page title, `wdth 100` everywhere else. Martian
Mono for every timecode and count, unchanged from the existing system.

**Shell**: 76px icon rail, always visible, never collapsing further (this is the desktop
floor, not a breakpoint of the mobile keyboard) · main column, fluid, no 600px cap — cards
reflow 2-4 across depending on viewport · 300px right rail (queue + Duet callout) at ≥1280px,
folds away below that · **now-playing bar is a full-width 88px strip pinned to the viewport
bottom**, not column-scoped — this is the single largest structural change from the current
system and directly answers "nobody would want to enter this."

**Surfaces and depth**: real elevation levels return for desktop only —
`paper-1 → paper-2 → paper-3` is a three-step lift, cards get an 18px radius (`--radius-card`)
and a tinted-ink shadow on hover (`translateY(-3px)` + `var(--shadow-card)`), never a flat
`rgba(0,0,0,.1)` grey shadow. This is a deliberate reversal of the mobile no-card rule for the
desktop surface specifically, because the founder's brief marks it negotiable and the evidence
in §3 supports it.

**Motion and feedback** (the core of the fix):
- A 2px top route-progress line in `linear-gradient(current, sand)` on every navigation,
  answering "no loading feedback between pages" directly (pattern: `next-nprogress-bar` /
  `useLinkStatus`, catalog #10).
- Every interactive control gets real press physics: `scale(.92)` at 90ms on the transport
  buttons (already the brand's `--dur-micro` value, just finally visible because now there is
  elevation to press *into*), and hover states are spring-eased (stiffness ~600-800,
  damping ~30-40, matching catalog #2's measured values, which happen to already match
  AKINTI's own sheet-spring family).
- A live pill with a breathing Signal lamp on any card whose subject is currently recording —
  the one place `--dur: 1400ms` infinite animation is allowed, unchanged rule.
- A `cmd+K` command-palette hint surfaced in the corner (catalog #14) as the answer to
  "clicks feel dead": desktop users expect a keyboard-driven jump-to-anything, and AKINTI
  currently has none.

**Icon rules**: Phosphor regular 20-24px in the rail, `ph-fill` variants for active/engaged
states (outline-means-available, fill-means-engaged, unchanged). The floating record key
keeps its ink-field-plus-Signal-dot identity from the existing system, just bigger (52px) to
match the elevated desktop control scale.

### Direction B — "Yüzey" (the surface), light, editorial, high-contrast, colour-blocked

**Palette**: `--paper #F2F4F1` · `--paper-raised #FFFFFF` · `--ink #0E1512` (also doubles as
the hairline colour — editorial rules are ink, not grey) · `--hairline-soft #C9D2CB` ·
`--current #0E6B6B` used as a **solid block colour** (`--current-block #123F3D` for the "live
now" band, ink text drops to `--current-ink #EAFBF7` on that block) · `--sand #C07F1E` used
the same way (`--sand-block #3A2C12`, `--sand-tint #F6E6CD` for smaller tags) · Signal
unchanged, `#DE3C11`.

**Type**: Archivo at `wdth 112-118`, page title pushed to 46px (up from 30-32px) because a
light, high-contrast editorial layout needs a genuinely large headline to avoid reading as
just "a form on a white page." Martian Mono unchanged.

**Shell**: 240px ink-block sidebar (colour-blocked, not paper — this is the loudest single
change from the current all-neutral desktop) · main column, no fixed width cap, full-bleed
colour bands break out of the content column's own padding (`margin: 0 -40px`) the way an
editorial magazine layout bleeds a pull-quote · 320px white right rail bordered by a 2px ink
rule · **now-playing bar is a full-width bold ink strip**, same structural fix as Direction A,
executed in high-contrast rather than glow.

**Surfaces and depth**: hard corners everywhere (`--radius-card: 0`), 2px ink borders instead
of shadows — depth is communicated by colour value and contrast, not elevation. Trending items
are rows, not cards (a deliberate editorial-table register, closer to a track listing than a
social feed), with a hover state that promotes the row onto the white `paper-raised` surface
and pads it out slightly, which is the one "lift" motion in the whole direction.

**Motion and feedback**:
- Same top route-progress line concept, executed as a 3px flat ink-current bar rather than a
  gradient glow, matching the harder-edged register.
- Play buttons are 2px-outlined ink circles that invert to solid ink-fill on row hover — a
  colour-inversion press pattern instead of a glow, in keeping with the high-contrast premise.
- The "open for Duet" moment is a full-bleed sand colour block with a large statement sentence
  and one text-link-style CTA carrying an elbow-arrow icon that visually points at what it
  answers — colour is used once, at the one moment the product most wants a click (a Duet
  request), rather than being spread thin across every row.
- No breathing/pulsing motion except the live lamp dot, unchanged rule.

**Icon rules**: identical Phosphor system to Direction A. In this direction the sidebar's
active state is a 3px ink-to-current left border plus a full-white icon, which is the same
mechanism Direction A uses, just recoloured for a light block instead of a dark one — the two
directions share every *mechanism* in this document and differ only in surface, palette and
scale, which is what makes them both legitimately AKINTI rather than two unrelated products.

**Mockups**: `docs/research/desktop/mock-A.png`, `docs/research/desktop/mock-B.png` — both
render the Flow/Home screen end to end: rail, top bar with search and a live route-progress
line, a "live this hour" module, a trending list with real hover/press states, a right rail,
and a full-width now-playing bar. Both are static (no build step, no app dependency) so they
can be opened directly in a browser to check hover/press states beyond the screenshot.

---

## 6. GitHub repos worth borrowing from

Searched via `gh search repos`; findings and what to take from each (nothing here is a
dependency recommendation — `docs/research/libraries.md` still governs that):

| Repo | Stars | What to take |
|---|---|---|
| `leerob/next-music-player` | 833 | Next.js, "information dense" media player by a Vercel engineer — closest architecture reference for a desktop-first, keyboard-navigable, information-dense player shell built the same stack AKINTI uses. Worth reading its route structure and player-state management even though it is a single-track player, not a social feed. |
| `burakorkmez/realtime-spotify-clone` | 355 | React+Tailwind+Socket.io Spotify clone with a real admin dashboard — reference for real-time "who's listening now" presence, relevant to Direction A's "live this hour" strip. |
| `francoborrelli/spotify-react-web-client` | 300 | Full TypeScript Spotify Web API + Playback SDK client — reference for now-playing bar state management patterns (queue, seek, volume) independent of any backend AKINTI would actually use. |
| `Kiranism/next-shadcn-dashboard-starter` | 6,951 | Next.js 16 + shadcn/ui + Tailwind, actively maintained (updated within the week) — the most relevant "how does a modern Next 16 app structure its dashboard shell" reference, useful for App Router layout patterns (parallel routes, route groups) regardless of its visual style, which is generic shadcn and not to be copied. |
| `tayfunerbilen/react-tailwind-spotify-clone` | 327 | Smaller, simpler Spotify clone — useful as a fast read of "the minimum viable now-playing bar" component tree. |
| `Mpompili/vibesky` / `phoenixeliot/soundpile` | 44 / 23 | Small SoundCloud clones — low-star but worth a skim for waveform-in-feed layout since that is AKINTI's actual content unit, unlike the Spotify clones which are all album-art-led. |

---

## 7. Prioritised gap list — current desktop

Ordered by the founder's own complaint order, each with the concrete file to change.

1. **No loading feedback between pages.** `find src/app -iname loading.tsx` returns nothing —
   zero route-level skeletons anywhere. Add `loading.tsx` per top-level route
   (`src/app/(app)/home/loading.tsx`, `.../explore/loading.tsx`, etc., matching whatever the
   actual route-group structure is) shaped to each screen per `DESIGN.md` §8.15, plus a
   top route-progress line wired through `next/navigation` router events or `useLinkStatus`
   (catalog #10 / #9), rendered once in `src/components/layout/AppShell.tsx`.
2. **Clicks feel dead — no press or hover physics on desktop.** `src/components/ui/` button,
   key and card primitives currently only carry the mobile `akinti-press` scale utility with
   no hover-elevation counterpart for pointer input. Add a `:hover` lift (translateY + shadow)
   gated behind a `(hover: hover)` media query so touch is unaffected, and give the record key
   in `src/components/create/RecordStage.tsx` a larger, springier press response at desktop
   sizes.
3. **No visible now-playing bar most of the time.** `src/components/layout/PersistentPlayer.tsx`
   ships `DesktopPlayerStrip` scoped to the 300px right column and explicitly documents itself
   as "not a Spotify-style bottom bar." Per this brief's negotiable-rules clause, replace it
   with a full-width bottom strip rendered once in `AppShell.tsx`, above `BottomNav`'s desktop
   equivalent, matching either direction's now-playing bar spec above.
4. **Colours are dull — one accent, used identically everywhere, no hover/press colour
   response.** `src/app/globals.css` §"desktop" tokens need a distinct desktop palette layer
   (Direction A's `--paper-0/1/2/3` elevation ladder, or Direction B's colour-block tokens) —
   not a wholesale replacement of the mobile tokens in `COLOR_V2.md`, which stay correct for a
   390px frame, but an addition scoped to `@media (min-width: 1024px)` or a `data-density`
   attribute.
5. **Icons are missing.** Spot-check needed against `src/components/ui/icons.ts` /
   `@phosphor-icons/react` imports — likely several controls in `src/components/layout/TopBar.tsx`
   and `src/components/layout/SideNav.tsx` are rendering as bare buttons with no glyph at
   certain breakpoints, or a recently added action (search, command palette, queue) has no
   assigned icon yet. Audit every interactive control on the five desktop screens in
   `docs/qa/colour/desktop-light-*.png` against the Phosphor set and fill gaps.
6. **Dead space instead of density.** `src/components/layout/AppShell.tsx` caps content at
   `lg:max-w-[1160px]` inside a fixed 600px column (`lg:max-w-content`), leaving roughly 280px
   of empty paper on a 1440px viewport — visible directly in
   `docs/qa/colour/desktop-light-home.png`. Either let the content column reflow to a
   multi-column card grid above 1280px (Direction A) or let colour-blocked bands bleed to the
   viewport edge (Direction B); a fixed pixel cap is the wrong tool at this width regardless of
   which direction is chosen.
7. **No card depth or surface hierarchy on desktop.** The mobile no-card, no-shadow rule
   (`DESIGN.md` §12.1/§4.5) is currently applied unchanged to desktop, per the flat
   `WaveCard`-equivalent rendering in `docs/qa/flow/desktop-*.png`. This rule is explicitly
   negotiable per the brief; both directions above reintroduce a desktop-scoped elevation
   system without touching the mobile rule.
8. **No command surface / no keyboard-driven navigation.** Desktop users expect `cmd+K`;
   AKINTI has nothing. Lowest priority of the eight (it is additive, not a regression fix),
   but cheap to add once the palette component is chosen from catalog #14 and worth doing in
   the same pass as the loading-feedback fix, since both touch the same navigation layer.

---

## 8. Files in this deliverable

- `docs/research/desktop/DESKTOP_RESEARCH.md` — this file.
- `docs/research/desktop/refs/*.png` — 16 reference product screenshots (Discord failed to
  connect; recorded as a gap, not fabricated).
- `docs/research/desktop/shot.mjs` — the isolated Playwright script that captured them
  (reproducible; own `chromium.launch()`, not the shared MCP browser).
- `docs/research/desktop/components/sidebar-light.tsx`,
  `docs/research/desktop/components/animated-sidebar.tsx` — full source of the two 21st.dev
  components the free-tier daily quota (2/day) allowed fetching in full.
- `docs/research/desktop/components/CATALOG.md` — all 15 selected components with source URL,
  licence note and what to borrow; the 13 not fetched carry their install command so the real
  code can be pulled the moment quota resets.
- `docs/research/desktop/mock-A.html` / `mock-A.png` — Direction A rendered.
- `docs/research/desktop/mock-B.html` / `mock-B.png` — Direction B rendered.
- `docs/research/desktop/shot-mocks.mjs` — the script that screenshotted both mockups.
