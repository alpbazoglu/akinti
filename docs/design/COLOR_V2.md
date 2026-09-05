# AKINTI colour v2 — "the current" (founder decision, 6 Sept 2026)

The founder reviewed the v2 screens and said they are too black and white. Decision: open the palette in the direction of **water**. This document amends DESIGN.md §4 (colour) and DESIGN_DNA.json; where they conflict, this file wins. Everything else in DESIGN.md (waterline primitive, type, radius ladder, §12 never-do list) still applies.

## Principles
1. Colour is **current, not decoration**. It lives in the things that move: traces, progress, the record key, mode marks, the persistent player. Surfaces stay quiet but are no longer grey; they are tinted water.
2. **Signal stays exclusive to live audio** (`#DE3C11` light / `#FF5C33` dark): played trace, record lamp, live level, unheard mark, open-for-Duet mark. Nothing else may use it.
3. **No purple, no violet, no indigo, no gradients** (except the existing 24px edge fade), no neon, no glassmorphism. No colour-per-card tiles, no pastel chips.
4. Both themes get equal care; every colour is a token; contrast ≥ 4.5:1 for text, ≥ 3:1 for traces and UI lines.

## Tokens (light / dark)
- `--akinti-paper`: `#E9EFEC` / `#0F1614` — tinted paper, sea-glass; the ground.
- `--akinti-paper-2` (rails, sheets, inputs): `#DEE7E3` / `#16201D`.
- `--akinti-ink`: `#0F1A18` / `#E6EFEC`.
- `--akinti-ink-2`: `#33443F` / `#B8C8C2`.
- `--akinti-ink-subtle`: keep ≥ 4.5:1 on paper (recompute; approx `#4E625C` / `#8FA39C`).
- `--akinti-line`: `#C3D1CB` / `#243330`.
- `--akinti-current` (the brand hue, "akıntı"): `#0E6B6B` / `#3FB5B0` — deep teal. Used for: idle/unplayed trace, primary buttons and keys, links, focus ring, active tab underline, the persistent player trace, progress in non-audio contexts, selection.
- `--akinti-current-2` (pressed/hover, and the "depth" of a trace): `#0A4F50` / `#2B8D89`.
- `--akinti-foam` (highlights on water: unplayed trace on dark, subtle fills): `#B9DED8` / `#1F4B48`.
- `--akinti-signal`: unchanged, live audio only.
- `--akinti-sand` (warm counterpoint, used sparingly: backing-track marks, Cypher order numerals, saved marks): `#B8862B` / `#E0B25A`.
- Semantic: success = current, warning = sand, danger = `#9A2E1E` / `#F07A62` (text and hairline only, never fills).

## Colour by mode and genre (the "current changes colour")
Traces carry a hue from their content; keep saturation moderate so Signal (played part) still reads as the hottest thing on screen.
- Layer Duet: current teal.
- Atışma: `#2F6F3E` / `#6DBF7E` (reed green) for the reply segments; original segments stay teal.
- Cypher: each verse gets one of four fixed hues in order: teal, reed green, sand, `#3D5A99` / `#8AA6E6` (deep water blue; this is blue, not violet — verify hue < 225°).
- Genre tints for the idle trace (optional, subtle, only on Explore lanes and profile signature): pop teal, rap/trap deep water blue, arabesk sand, türkü/halk reed green, rock ink.
- Profile signature trace: the creator's dominant genre tint.

## Where colour goes (screen checklist)
- Record key: current teal at rest, Signal lamp when armed/recording (unchanged).
- Waveform: unplayed = current (light) / foam (dark); played = Signal; hover/seek cursor = ink.
- Buttons: primary = current fill with paper text; secondary = hairline in line colour, ink text; destructive = danger text only.
- Tabs and nav: active underline current; icons ink; unread mark Signal.
- Explore lanes: lane header rule in current; creator tile signature trace in genre tint.
- Persistent player strip: trace current, progress Signal.
- Challenges: the live challenge mark in current; backing-track mark in sand.
- Empty states and skeletons: paper-2 blocks, no colour.
- Sheets: paper-2 ground, current handle.

## Do not
- Do not paint whole sections or cards in colour. Do not add coloured left borders. Do not use colour for hierarchy that type and spacing already carry. Do not tint text randomly. Do not introduce a fifth hue.
