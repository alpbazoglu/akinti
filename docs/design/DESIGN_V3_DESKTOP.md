# Design v3 — desktop "Akış" (founder decision, 6 Sept 2026)

The founder reviewed the desktop build and rejected it: no loading feedback, dead clicks, dull colour, missing icons, wasted space. After research (`docs/research/desktop/DESKTOP_RESEARCH.md`, `FEEDBACK_AUDIT.md`), the founder chose **Direction A, "Akış"**: dark-first, layered, Spotify/SoundCloud-grade. This file wins over DESIGN.md and COLOR_V2.md wherever they conflict **for viewports ≥ 1024px**. Mobile keeps its current structure; its dark theme adopts the same palette so the product feels like one thing.

## What changes (rules relaxed on purpose)
- Surfaces and depth are allowed and expected on desktop: elevation ladder `#0A100E → #10171A → #16211F → #1C2926`, 1px inner hairline `rgba(255,255,255,.06)`, soft shadow on hover-lift (`0 8px 24px rgba(0,0,0,.35)`), no glass blur, no purple, no multi-stop gradients (a single vertical tint on the now-playing bar is fine).
- Cards are allowed on desktop grids (Explore, Challenges, Tracks, Profile grid). Rows stay rows in feeds and lists.
- Two accents: **current** teal `#2FE0C9` (primary actions, active nav, played trace, links, focus) and **sand** amber `#F0A63F` (secondary highlights, backing-track and Cypher marks, Pro). **Signal** `#FF5C33` stays exclusive to live recording state and the record lamp.
- Ink on dark: text `#EAF2EF`, muted `#9FB3AD`, subtle `#6C7F79` (all ≥ 4.5:1 on their surfaces).
- Type unchanged (Archivo Variable + Martian Mono), but desktop scale is denser: 14px UI, 13px meta, 32/24/18 headings; line length ≤ 80ch.

## Shell (≥ 1024px)
- Left sidebar 240px (collapsible to 72px icon rail): logo, primary nav with Phosphor icons + labels, "New Wave" primary button, library section (Saved, Duets, Drafts), profile at bottom.
- Main column fluid, max 1280px, 32px gutters; optional right rail 320px on Flow/Wave (up next, comments, chain).
- **Now-playing bar** 88px, full width, fixed bottom: trace with played teal, title · creator, transport (largest control), volume, queue, Duet button; never hidden while audio exists.
- Top bar 56px: back/forward, search (⌘K opens command palette), notifications, avatar.

## Feedback (the founder's main complaint)
- Route change: 2px top progress line in current teal within 50ms (`useLinkStatus` / router events), every route has `loading.tsx` with a shape-true skeleton, clicked nav item goes to pressed + pending state immediately.
- Press physics on every clickable: `:active` scale .97 + brightness, hover lift or background step within 80ms, focus-visible ring current teal, cursor pointer.
- Async actions: pending within 100ms, optimistic for follow/save/replay, toast on success and error (sonner), double-submit disabled.
- Motion: linear for audio time, spring (`motion`) for lift and presses, 120–180ms; `prefers-reduced-motion` respected.

## Icons
Phosphor, duotone for nav when active, regular otherwise; every nav item, action, empty state and metadata line has an icon; sizes 20 (nav), 16 (meta), 24 (transport), 32 (primary play).

## Do not
No purple/violet, no AI gradients, no emoji, no Likes, no confetti, no autoplay without gesture, no fake counts.
