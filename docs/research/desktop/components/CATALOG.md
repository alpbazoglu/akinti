# 21st.dev component catalog — desktop feedback patterns

Top 15 components identified via `mcp__21st__search` for the categories in the brief
(sidebar nav, now-playing bar, waveform player, card grids with hover, page transition/
progress bar, skeleton loaders, buttons with press feedback, toast, command palette, tabs,
avatar stacks, trending list rows). The 21st.dev free tier caps full source retrieval
(`mcp__21st__get_component`) at **2 per day**; that quota was spent on the two most
structurally relevant hits (full `.tsx` saved alongside this file). The other 13 are recorded
here with their id, install command and what to borrow — `npx shadcn@latest add <url>` pulls
the real code straight from the registry when needed, same as the two already fetched.

None of these ship as-is: every one carries at least one pattern `DESIGN.md` bans (a filled
pill active state, a shadow-and-hairline combo, glassmorphism, a mixed icon set). They are
references for *mechanism* — spring constants, hover-tracking math, disclosure timing — not
for visual style, exactly as `REFERENCES.md` §7 already treats the previous batch.

| # | Component | id | Source | Fetched | Borrow |
|---|---|---|---|---|---|
| 1 | Sidebar Light (inference-sh) | 19361 | https://21st.dev/@inference-sh/components/sidebar-light | Yes — `sidebar-light.tsx` | Nested-item + active-route pattern, icon+label row collapsing to icon-only. Reject the `bg-muted` pill active state; AKINTI's active state is a left rail accent bar or filled glyph, never a filled background. |
| 2 | Animated Sidebar (unlumen) | 21517 | https://21st.dev/@unlumen/components/sidebar-001 | Yes — `animated-sidebar.tsx` | The mechanism, not the look: `getBoundingClientRect()`-driven hover highlight animated via a shared `motion` layout id, spring stiffness 300-800 / damping 30-40, and a height:auto group-disclosure at stiffness 420 / damping 34 — nearly identical to AKINTI's own sheet spring. Confirms one spring family should carry every disclosure on desktop, not just sheets. Reject the drag-to-resize rail (desktop AKINTI rail is fixed-width) and the filled hover pill. |
| 3 | Dashboard Sidebar (arunjdass) | 14941 | https://21st.dev/@arunjdass/components/dashboard-sidebar | No (quota) | Dual-theme shell with collapsible multi-tier nav and workspace content frames — reference for the icon-rail-to-labelled-rail breakpoint behaviour DESIGN.md §8.1 already specifies (72px to 200px). |
| 4 | WaveformPlayer (ruixen.ui) | 7978 | https://21st.dev/@ruixen.ui/components/waveform-player | No (quota; already logged in `REFERENCES.md` §7 #1) | Click-or-drag-anywhere-to-seek model, light/dark-aware bar recolouring. Reject uniform bar rounding and equal bar heights. |
| 5 | Audio Player (chetanverma16) | 647 | https://21st.dev/@chetanverma16/components/audio-player | No (quota) | Framer-motion transport with real button micro-motion on play/pause state change — useful reference for the now-playing bar's `playpause` press physics. |
| 6 | Music Player Widget (smammar100) | 12709 | https://21st.dev/@smammar100/components/music-player-widget | No (quota) | Audio-reactive visualiser driven by the Web Audio API with zero external animation deps (pure `requestAnimationFrame` + CSS keyframes) — the right performance pattern for a live level meter, though AKINTI's own live trace already specifies this in DESIGN.md §6.4. |
| 7 | card-hover (misbahansar) | 9537 | https://21st.dev/@misbahansar/components/card-hover | No (quota) | Minimal hover-lift card, closest in restraint to what a Wave card's hover elevation should feel like: translateY + shadow, no glow, no border colour flash. |
| 8 | Hover Card (shadcn) | 216 | https://21st.dev/@shadcn/components/hover-card | No (quota) | Accessible preview-on-hover with a real focus-visible fallback — reference for keyboard/touch parity on hover-revealed controls (DESIGN.md §12.36: no hover-only affordance). |
| 9 | Progress Bar (ddoemonn) | 23549 | https://21st.dev/@ddoemonn/components/progress-bar | No (quota) | Accessible linear progress with explicit pending/complete state labels, not just a visual bar — the accessibility half of the route-progress-bar gap below. |
| 10 | Loading progress bar (motiondotdev) | 24964 | https://21st.dev/@motiondotdev/components/motion-loading-progress-bar | No (quota) | Canonical `nprogress`-style top bar built on `motion` (already a dependency, see `package.json`) instead of a new library — the concrete answer to "no loading feedback between pages." |
| 11 | Skeleton (shadcn) | 1588 | https://21st.dev/@shadcn/components/skeleton | No (quota) | Baseline shaped-placeholder primitive. AKINTI's rule (flat 6px waterline, no shimmer, three items max) is already stricter and should stay that way; this is the floor to build the stricter version on top of, not the target. |
| 12 | Card Skeleton (uiable) | 19988 | https://21st.dev/@uiable/components/uiable-skeleton-card | No (quota) | Shaped to a media+text layout close to a Wave card's real geometry (rail circle, two text bars, media block) — confirms DESIGN.md §8.15's shape-to-final-layout rule is the industry-standard approach, not an invented constraint. |
| 13 | Press Depth (ddoemonn) | 23547 | https://21st.dev/@ddoemonn/components/press-depth | No (quota) | A button that tilts toward the pointer and presses with real depth on click — this is "clicks feel dead" solved as a component. AKINTI's press rule (`scale(0.975)`, 90ms, `ease-press`) is simpler by design, but the pointer-tilt idea is worth trying on the record key specifically, where the founder's complaint is sharpest. |
| 14 | Command Palette (ddoemonn) | 23522 | https://21st.dev/@ddoemonn/components/command-palette | No (quota) | Fuzzy search + arrow-key nav + animated overlay, `cmd+k` convention. Desktop AKINTI has no findable command surface today; this is the reference for jump-to-Wave / jump-to-person / start-recording from anywhere, shown as a hint in `mock-A.html`. |
| 15 | Underline Tabs (cnippet.dev) | 24956 | https://21st.dev/@cnippet.dev/components/v-tabs-2 | No (quota) | Animated underline indicator between tab panels — reference for the Explore lane switcher (Trending / New / Rising / Original / Voices / Compositions / Open for Duet), which today changes with no transition at all. |

Also considered and set aside:
- **Toast** (cnippet.dev, id 24297) — stacked toast with status icons and action buttons; AKINTI's own toast rule (single 44px ink strip, one line, no icon) is already more disciplined and should not regress toward this.
- **Avatar Stack** (cnippet.dev, id 23507) — overlapping avatars with hover tooltips; candidate for a "N people replied" or "N duets" affordance on a trending row, currently just a text count.

## Licensing note
21st.dev components are distributed through the shadcn CLI registry (`npx shadcn@latest add
<url>`) with per-component attribution to the listed author. Treat as MIT-style community
code: attribute, read before adopting, and verify licence terms on the linked page before
shipping any of it verbatim. Nothing here was installed into the app; these are research
copies for pattern study only, per the brief.
