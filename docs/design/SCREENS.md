# AKINTI — Screen Specifications

Mobile-first. Every wireframe below is drawn at **390 x 844** (iPhone 14/15/16 logical size).
Read this together with `DESIGN.md` (the visual language) and `DESIGN_DNA.json` (the tokens).

**Token names used in the annotations.** Where an annotation says `Display 40/40` or
`13/600`, read it against the scale in `DESIGN.md` §3.3: `display-xl` 40, `display` 32,
`title` 28, `heading` 19, `subhead` 15/600, `body` 16, `body-sm` 14, `caption` 13/500 with a
600 variant for section labels, `micro` 11, and the Martian Mono readout sizes
`mono-display` 44, `mono-lg` 22, `mono` 15, `mono-sm` 12. `DESIGN.md` is authoritative on
every value; where this file disagreed with it, this file has been corrected.

## Global rules that apply to every screen

**The frame.** Content lives in a single column with `padding-inline: 20px`. There is no
card container. Items in a stream sit directly on the paper and are separated by the
`waterline` rule (see `DESIGN.md` §5). Nothing in the product is a white box on a grey box.

**The rail.** Every stream item is left-hung against a **44px rail**. The rail carries the
avatar, the state glyph, or the timecode. The text column starts at `x = 64px` and runs to
`x = 370px`. This one alignment is what makes the feed read as a logbook rather than a
social template. It is never broken, on any screen, at any breakpoint.

**Two bars, never three.** A screen has at most a **context bar** at the top (48px, appears
on scroll) and the **keyboard** at the bottom (64px + safe area). There is no simultaneous
page-title header, subtitle, tab strip and filter row. If a screen needs filters, they
replace the title on scroll.

**One accent per screen.** `Signal` (`#DE3C11` light / `#FF5C33` dark, see `DESIGN.md` §4)
appears only on audio state. If you can see
vermilion on a screen and it is not the record key, a playing waveform, a live level, or an
unread mark, the screen is wrong.

**Every screen ships five states.** `loading` (shaped skeleton) / `empty` (an invitation)
/ `error` (what happened + one repair action) / `partial` (some data, a retry inline) /
`ready`. Screens below list only what differs from the norm.

Legend for the wireframes:

```
▓▓▓   ink-filled surface / pressed state
░░░   paper-tint surface (surface-sunk)
▁▂▃▅▂▁ the waterline (waveform)
( )   circular control            [ ]   squircle control (a "key")
────  hairline rule               ····  dotted / unplayed waterline
◆     signal-coloured mark (audio only)
```

---

## 1. Onboarding — 3 steps

Route `/onboarding`. Full-bleed, no nav chrome, no skip on step 1 (the sound *is* the
pitch). Each step is one screen, swipeable, with a 3-segment progress waterline at the top
rather than dots.

### 1.1 Step one — "Hear it"

The one job: within two seconds of first open, the user should have heard a human voice.
An actual short Wave autoplays muted-safe (a tap-to-hear affordance if autoplay is blocked).

```
┌──────────────────────────────────────┐
│ ▁▂▃  ····  ····      (progress: 1/3) │  16px, waterline segments
│                                      │
│                                      │
│  Someone is                          │  Display 40/40, -2.5% tracking
│  talking right                       │  3 lines, left-hung at 20px
│  now.                                │
│                                      │
│                                      │
│   ▁▂▅█▇▅▂▁▃▅▇█▅▃▂▁▂▄▆█▆▄▂▁▂▃▅▂▁      │  live waveform, 96px tall,
│   ◆◆◆◆◆◆◆◆◆◆◆░░░░░░░░░░░░░░░░░░      │  full-bleed, signal fill
│                                      │
│   Mert Bilen · Kadıköy, 3:12am       │  body-sm, ink-muted
│                                      │
│                                      │
│                                      │
│ [        Keep listening        ]     │  ink key, 52px, full width
│           I'll look around           │  text link, ink-muted
└──────────────────────────────────────┘
```

- **Hierarchy** headline → live waveform → attribution → action.
- **Primary action** "Keep listening" (advances). Secondary is a text link, not a ghost button.
- **Motion** the waveform is genuinely playing; bars rise on the audio. Nothing else moves.
- **Reduced motion** the waveform renders its static peak trace with the progress fill
  advancing linearly. No bar animation.
- **States** if autoplay is blocked, the waveform renders in `dormant` (ink hairline) with a
  centred `( ▶ )` and the headline changes to "Tap to hear someone."

### 1.2 Step two — "Say it"

Live microphone permission is requested here, in context, with the mic already framed. The
permission prompt is preceded by one sentence explaining what it is for.

```
┌──────────────────────────────────────┐
│ ▓▓▓  ▁▂▃  ····       (progress: 2/3) │
│                                      │
│  Your turn.                          │  Display 40/40
│  Nothing is                          │
│  posted yet.                         │
│                                      │
│                                      │
│         ┌────────────────┐           │
│         │                │           │  the record key, 96 x 96,
│         │      ◆         │           │  radius 28, ink field,
│         │                │           │  signal dot centred
│         └────────────────┘           │
│                                      │
│   Hold to try it. We keep nothing    │  body-sm, ink-muted, 2 lines
│   until you choose to publish.       │
│                                      │
│                                      │
│ [           Continue           ]     │
│           Set up my mic later        │
└──────────────────────────────────────┘
```

- **Primary action** press-and-hold the record key (a real 3-second trial recording that is
  discarded). If the user records, the button label becomes "That sounded good. Continue."
- **States** `permission-pending` (key is ink-hairline, dot dormant) → `granted` (dot fills
  signal, key gains a 1px signal ring) → `denied` (key goes flat, copy replaced by
  "AKINTI needs the microphone to record. You can still upload audio you already have."
  plus a "How to allow it" disclosure).

### 1.3 Step three — "Be found"

Handle + display name + a one-tap voice bio prompt. This is the only form in onboarding.

```
┌──────────────────────────────────────┐
│ ▓▓▓  ▓▓▓  ▁▂▃        (progress: 3/3) │
│                                      │
│  Pick a handle.                      │  Display 40/40
│                                      │
│  Handle                              │  label, caption size
│  @ ┌────────────────────────────┐    │  input, 48px, radius 10,
│    │ akinti                     │◆   │  1px ink-line, signal tick
│    └────────────────────────────┘    │  when available
│    akinti.app/u/akinti               │  caption, ink-subtle
│                                      │
│  Name (optional)                     │
│    ┌────────────────────────────┐    │
│    │                            │    │
│    └────────────────────────────┘    │
│                                      │
│  ──────────────────────────────      │  hairline
│                                      │
│  Record a 10-second intro?           │  body
│  ( ◆ )  Record intro                 │  secondary key, inline
│                                      │
│ [        Start listening       ]     │
└──────────────────────────────────────┘
```

- **Validation** inline, below the field, on blur — never a toast. Availability check is a
  small signal tick inside the field, not a green banner.
- **Primary action** "Start listening" → `/` (Home).

---

## 2. Home

Route `/`. The feed of Waves from people the user follows. This is the screen where the
"kill the card" decision is most visible.

```
┌──────────────────────────────────────┐
│ AKINTI       ( ⌕ )  ( ♪ )  ( ◆ )    │  top bar 56px; wordmark only,
│                                      │  no glyph. ◆ on the avatar =
│                                      │  unread activity
│                                      │
│  Home                                │  display 32, scrolls away
│  ────────────────────────────────    │  hairline, full-bleed
│                                      │
│ ┌──┐                                 │
│ │AK│ Ayşe Kaya  @aysek         2h    │  rail 44px | name 15/600
│ └──┘ ┌───────┐                       │  meta 13, ink-subtle
│      │recorded│                      │  badge: hairline tag, not pill
│      └───────┘                       │
│                                      │
│  Sabah provası                       │  title 19/600, -1.5% tracking
│                                      │  starts at rail edge, x=64
│                                      │
│  ▁▂▃▅█▇▅▃▂▁▂▄▆█▇▆▄▂▁▃▅▇█▆▄▂▃▅▂▁      │  waveform 56px tall,
│  ◆◆◆◆◆◆◆◆◆◆░░░░░░░░░░░░░░░░░░░░      │  full-bleed to page edges
│  0:14                        2:07    │  mono 12, tabular
│                                      │
│  ( ▶ )   ( ⌸ )  ( ⌂ )  ( ⇄ )         │  4 controls, 40px, ink-line
│                                      │  play / comment / save / share
│  312 plays · 41 replays · 6 duets    │  caption 12, one line, ink-subtle
│                                      │
│  ══════════════════════════════      │  the waterline separator:
│                                      │  a 2px amplitude trace, not a rule
│ ┌──┐                                 │
│ │DY│ Deniz Yurtsever  @dyurt   5h    │
│ ...                                  │
│                                      │
├──────────────────────────────────────┤
│  ⌂      ⌕     [ ◆ ]     ♪      ◑     │  keyboard 64px + safe area
│ Home  Explore        Msgs  You       │
└──────────────────────────────────────┘
```

- **Hierarchy** waveform → title → creator → controls → counts. The waveform is the
  largest, highest-contrast element in every item. The title reads second.
- **Primary action** tap anywhere on the waveform to play from that point. The `( ▶ )` key
  is a redundant, explicit control for accessibility and for reaching play without
  scrubbing.
- **Counts** are one comma-free line, ink-subtle, and only non-zero metrics are printed.
  Six zero counts is a debug dump, not a design. Plays and replays always show once > 0;
  comments/saves/shares/duets only appear when non-zero.
- **Badges** `recorded` / `uploaded` / `duet` are hairline tags with a 2px radius and
  uppercase-off, sentence-case text. They are ink-only. Never coloured, never a filled pill,
  never full-bleed.
- **"Request a Duet"** is NOT in the feed item. It lives on the Wave detail screen and in
  the long-press menu. Putting a filled primary button on every feed row is what makes the
  current build read as a template.
- **States**
  - `empty` — "No one you follow has posted yet." + a live strip of three currently-playing
    Waves from Explore rendered as bare waveforms with names, plus "Find people to follow"
    (ink key). The empty state is a working feed, not an icon in a circle.
  - `loading` — 3 shaped skeletons: rail circle, 2 text bars at 45% and 70%, and a
    **flat waterline at 6px** where the waveform will be. The skeleton never shows a fake
    waveform.
  - `error` — inline strip at the top of the list: "Couldn't reach the stream." + "Try again".
    Already-loaded items stay on screen.
- **Motion** new Waves arriving while the user is at the top do not shift the list. A
  1-line ink strip pins under the top bar: "4 new Waves" — tap to insert.

---

## 3. Explore

Route `/explore`. Discovery. The one screen allowed a horizontal element.

```
┌──────────────────────────────────────┐
│ ( ← )   Explore            ( ⌕ )    │  context bar
│                                      │
│  Trending   New   Rising   Open      │  filter row, 40px, scrollable
│  ▔▔▔▔▔▔▔▔                            │  active = 2px ink underbar,
│                                      │  NOT a coloured pill
│  ────────────────────────────────    │
│                                      │
│  Voices worth following              │  caption/600, ink-muted
│                                      │
│  ┌────────┐ ┌────────┐ ┌────────┐    │  horizontal snap rail, 128px
│  │  ▁▃▅▂  │ │  ▂▅▃▁  │ │  ▃▁▂▅  │    │  each tile: the creator's
│  │        │ │        │ │        │    │  signature waveform as the
│  │ ┌──┐   │ │ ┌──┐   │ │ ┌──┐   │    │  artwork, avatar overlapping
│  │ │EY│   │ │ │MB│   │ │ │SA│   │    │  the bottom-left corner
│  │ └──┘   │ │ └──┘   │ │ └──┘   │    │
│  │ Elif   │ │ Mert   │ │ Sena   │    │  15/600
│  │ +Follow│ │ +Follow│ │Following│   │  ink-line key, 32px
│  └────────┘ └────────┘ └────────┘    │
│                                      │
│  ══════════════════════════════      │
│                                      │
│  [ stream of Waves, as on Home ]     │
│                                      │
├──────────────────────────────────────┤
│  ⌂      ⌕     [ ◆ ]     ♪      ◑     │
└──────────────────────────────────────┘
```

- **The creator tile is the one place a card exists** in the product, because a horizontal
  rail genuinely needs a bounded object. It is a `radius-16` ink-hairline tile with **no
  shadow and no fill** — the boundary is the line, not elevation.
- **Filter row** replaces the page title on scroll and sticks. Exactly one row.
- **"Open for Duet"** filter shows a signal-coloured `◆` before its label — this is the one
  place a non-playing element carries the accent, because it denotes audio availability.
- **States** `empty` per filter with a filter-specific line ("Nothing is rising this hour.
  Rising resets every 60 minutes." + "Show Trending instead").

---

## 4. Record

Route `/create`. Five states in one screen, not five screens. The transitions are the whole
experience — the header, the key, and the waveform morph in place.

### 4.1 Idle

```
┌──────────────────────────────────────┐
│ ( × )                     ( ⇪ )     │  close / upload a file instead
│                                      │
│                                      │
│                                      │
│                                      │
│  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─       │  dormant waterline: a row of
│                                      │  ink hairline ticks, 1px, at
│                                      │  the rest position. Not zeros.
│                                      │
│           0:00 / 5:00                │  mono 15, tabular, ink-subtle
│                                      │
│                                      │
│         ┌────────────────┐           │
│         │                │           │  record key 88 x 88, radius 26
│         │       ◆        │           │  ink field, signal dot 20px
│         └────────────────┘           │
│                                      │
│      Hold to record · Tap to arm     │  caption, ink-subtle
│                                      │
│  ──────────────────────────────      │
│  Input: iPhone Microphone     ›      │  a settings row, 44px
└──────────────────────────────────────┘
```

### 4.2 Recording

```
┌──────────────────────────────────────┐
│ ( × )                     0:23  ◆    │  live timer, mono; ◆ pulses
│                                      │
│                                      │
│  ▁▂▃▅█▇▅▃▂▁▂▄▆█▇▆▄▂▁▃▅▇█▆▄▂▃▅▂       │  live trace scrolls right→left
│  ◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆▏      │  entirely signal-filled; the
│                                      │  write-head is a 2px ink line
│           ▁▂▃ -12 dB                 │  level, mono, turns signal
│                                      │  above -3 dB (clipping warning)
│                                      │
│      ( ‖ )      ┌──────────┐         │  pause 48px | stop key 72x72
│      pause      │    ▪     │         │  radius 21, signal FIELD with
│                 └──────────┘         │  ink square = "stop"
│                                      │
│                                      │
│  ──────────────────────────────      │
│  Recording. Nothing is saved yet.    │
└──────────────────────────────────────┘
```

- **The colour inversion is the state change**: idle = ink key with a signal dot;
  recording = signal key with an ink glyph. No colour-fade animation, a 120ms crossfade.
- **Level meter** is a number in mono plus 3 ticks — not a filled progress bar with a track.
- **Paused** — the trace freezes, the write-head blinks at 1.2s, the timer stops, the stop
  key stays, pause becomes `( ▶ )` resume.

### 4.3 Review

```
┌──────────────────────────────────────┐
│ ( ← )   Review              ( ⌫ )   │  discard
│                                      │
│  ▁▂▃▅█▇▅▃▂▁▂▄▆█▇▆▄▂▁▃▅▇█▆▄▂▃▅▂▁      │  the finished trace, mirrored,
│  ◆◆◆◆◆◆░░░░░░░░░░░░░░░░░░░░░░░░      │  96px tall, full-bleed
│  0:09  ┃                       0:41  │  ┃ = playhead, draggable
│                                      │
│    ( ↺15 )   ( ▶ )   ( ↻15 )         │  three keys, 44/56/44
│                                      │
│  ──────────────────────────────      │
│                                      │
│  Trim                                │  13/600, ink-muted
│  ├──────╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌──────┤      │  two handles on the trace,
│  0:02                        0:38    │  trimmed regions render at 20%
│                                      │
│  ──────────────────────────────      │
│                                      │
│ [ Continue ]        Re-record        │
└──────────────────────────────────────┘
```

### 4.4 Enhance

```
┌──────────────────────────────────────┐
│ ( ← )   Sound               Skip     │
│                                      │
│  ▁▂▃▅█▇▅▃▂▁▂▄▆█▇▆▄▂▁▃▅▇█▆▄▂▃▅▂▁      │  56px; A/B toggling redraws
│  ◆◆◆◆◆◆◆◆◆◆◆◆░░░░░░░░░░░░░░░░░      │  the trace with a 180ms morph
│                                      │
│  ┌────────────┐  ┌────────────┐      │  A/B keys, 40px, ink-line;
│  │  Original  │  │▓ Enhanced ▓│      │  active = ink-filled
│  └────────────┘  └────────────┘      │
│                                      │
│  ──────────────────────────────      │
│                                      │
│  ○ Natural       No processing       │  radio rows, 56px each,
│  ● Studio        Fuller, wider       │  hairline between,
│  ○ Clear voice   Speech forward      │  selected = filled ink dot +
│  ○ Warm          Softer highs        │  ink-tint row background
│                                      │
│  ▸ Advanced (5-band)                 │  disclosure, closed by default
│                                      │
│ [           Continue           ]     │
└──────────────────────────────────────┘
```

- **A/B is the primary interaction here**, not the preset list. It sits above the list and
  keeps playing across the switch (no restart) — that continuity is the whole point.

### 4.5 Details

```
┌──────────────────────────────────────┐
│ ( ← )   Details                      │
│                                      │
│  ▁▂▃▅█▇▅▃▂▁▂▄▆█  ( ▶ )   0:39        │  the trace shrinks to a 32px
│                                      │  strip and pins under the bar
│  ──────────────────────────────      │
│                                      │
│  Title                               │
│  ┌──────────────────────────────┐    │  48px, radius 10
│  │ Sabah provası                │    │
│  └──────────────────────────────┘    │
│                                      │
│  What is this?                       │
│  ┌──────────────────────────────┐    │  textarea, 96px min
│  │                              │    │
│  └──────────────────────────────┘    │
│  0/280                               │  caption, right-aligned, mono
│                                      │
│  ──────────────────────────────      │
│                                      │
│  Open for Duet              [ ◉──]   │  switch row, 56px
│  Anyone can ask to record with this. │  caption, ink-subtle
│                                      │
│  Who can hear it          Everyone › │  select row
│                                      │
│ [           Publish            ]     │  ink key, 52px, sticky bottom
└──────────────────────────────────────┘
```

- **Copy** the button says "Publish" and the toast says "Published." Same word, both ends.
- **Error** upload failure keeps the recording locally and shows an inline retry strip; the
  screen is never dismissed with the audio lost.

---

## 5. Wave detail

Route `/w/[id]`. The one screen where the waveform is allowed to be enormous.

```
┌──────────────────────────────────────┐
│ ( ← )                        ( ⋯ )  │
│                                      │
│  ▁▂▃▅█▇▅▃▂▁▂▄▆█▇▆▄▂▁▃▅▇█▆▄▂▃▅▂▁      │  144px tall, mirrored,
│  ◆◆◆◆◆◆◆◆◆◆◆◆◆◆░░░░░░░░░░░░░░░      │  bleeds past both page edges
│  1:07 ┃                       2:41   │
│                                      │
│    ( ↺15 )   ( ▶ )   ( ↻15 )  1.0×   │
│                                      │
│  Sabah provası                       │  Display 28/30, -2% tracking
│                                      │
│ ┌──┐                                 │
│ │AK│ Ayşe Kaya  @aysek               │  rail
│ └──┘ 4 March, 08:12 · recorded       │
│                                      │
│  İlk kayıt. Tek mikrofon, tek alım.  │  body 16/1.55, max 62ch
│                                      │
│  With  @dyurt  ×  @selin             │  collaborators, only if a Duet
│                                      │
│  ──────────────────────────────      │
│  312 plays · 41 replays · 6 duets    │
│  ──────────────────────────────      │
│                                      │
│  ( ⌸ ) Comment  ( ⌂ ) Save  ( ⇄ )   │  36px keys, labelled
│                                      │
│ [       Request a Duet         ]     │  ink key, full width — the
│                                      │  ONLY place this is a big button
│  ──────────────────────────────      │
│  Comments  (24)                      │  13/600
│                                      │
│ ┌──┐ Deniz  ·  2h                    │  each comment on the rail;
│ │DY│ Bu geçiş çok iyi olmuş.         │  audio comments render as a
│ └──┘ ( ▶ ) ▁▂▃▅▂▁  0:11              │  16px inline waterline
│                                      │
│  ┌──────────────────────────┐ ( ◆ ) │  composer pinned above nav;
│  │ Add a comment            │        │  the ◆ key records an audio
│  └──────────────────────────┘        │  reply
└──────────────────────────────────────┘
```

- **Duet lineage** if this Wave is a Duet, a lineage strip sits directly under the title:
  two 20px waterlines stacked with a `×` between them and both handles, tappable to the
  parent Wave.
- **States** `deleted` (waveform renders as a flat ink dash + "This Wave was removed by its
  creator." + "Back to Home"), `blocked`, `private`.

---

## 6. Duet request

Route `/w/[id]/duet`. A sheet, not a page, when arrived at from a Wave; a page on deep link.

```
┌──────────────────────────────────────┐
│              ▁▂▃                     │  grabber = a 24px waterline
│                                      │
│  Ask to record with this             │  Display 24/26
│                                      │
│  ┌──┐                                │
│  │AK│ Ayşe Kaya · Sabah provası      │
│  └──┘ ▁▂▃▅█▇▅▃▂▁  ( ▶ )  2:41        │  the source Wave, 28px trace
│                                      │
│  ──────────────────────────────      │
│                                      │
│  What do you want to add?            │  13/600
│  ┌──────────────────────────────┐    │
│  │ Bass line under the second   │    │  textarea, 96px
│  │ verse.                       │    │
│  └──────────────────────────────┘    │
│                                      │
│  Attach a demo?         ( ◆ ) 0:00   │  optional 30s voice note
│                                      │
│  ──────────────────────────────      │
│  Ayşe replies to most requests       │  a real signal, only shown when
│  within a day.                       │  the data supports it
│                                      │
│ [        Send the request      ]     │
│              Cancel                  │
└──────────────────────────────────────┘
```

- **States** `already-requested` (the key is replaced by an ink-tint strip: "You asked on
  3 March. Waiting for Ayşe." + "Withdraw request"), `closed` (creator not open for Duets —
  the entry point should never have been shown; if reached, explain and offer "Follow Ayşe"),
  `sent` (sheet collapses to a 1-line confirmation strip, then dismisses after 1.2s).

---

## 7. Duet record

Route `/w/[id]/duet/record`. The single most identity-defining screen: **two traces, one
timeline.**

```
┌──────────────────────────────────────┐
│ ( × )   Duet with Ayşe      0:23  ◆  │
│                                      │
│  Theirs                              │  micro 11, ink-subtle; sentence
│  ▁▂▃▅█▇▅▃▂▁▂▄▆█▇▆▄▂▁▃▅▇█▆▄▂▃▅▂▁      │  ink trace, 48px, drawn DOWN
│  ▔▔▔▔▔▔▔▔▔▔▔▔┃▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔      │  case, never caps. Shared
│                                      │  playhead spans both
│  ◆◆◆◆◆◆◆◆◆◆◆◆▁▂▃▅█▇▅▃▂▁              │  Yours: signal trace, drawn UP,
│  Yours                               │  growing live
│                                      │
│  ┌──────────────┐  ┌──────────────┐  │  monitoring controls
│  │ ♪ Hear them  │  │ ◑ Hear me    │  │  ink-line keys, 40px, toggle
│  └──────────────┘  └──────────────┘  │
│                                      │
│         ┌────────────────┐           │
│         │       ▪        │           │  stop key, signal field
│         └────────────────┘           │
│                                      │
│  ──────────────────────────────      │
│  Latency offset          -84 ms  ›   │  mono; a real control, adjustable
│                                      │  in review
└──────────────────────────────────────┘
```

- **The mirrored pair is the brand.** Theirs above the line in ink, yours below the line in
  signal, sharing one playhead. This composition appears nowhere else in the product and
  should be the image used in the app store listing.
- **Review state** adds a per-track gain slider (2 rows, mono values) and a latency nudge in
  ±10ms steps with live re-render of the alignment.
- **States** `countdown` (3-2-1 rendered as three shrinking ink ticks, no numerals bouncing),
  `their-audio-failed` (record continues solo, an ink strip explains, offer "Retry loading").

---

## 8. Profile

Route `/u/[username]`.

### 8.1 Another person's profile

```
┌──────────────────────────────────────┐
│ ( ← )                        ( ⋯ )  │
│                                      │
│  ▁▂▃▅█▇▅▃▂▁▂▄▆█▇▆▄▂▁▃▅▇█▆▄▂▃▅▂▁      │  the SIGNATURE: a 72px trace
│                                      │  generated from this person's
│  ┌────┐                              │  last 12 Waves. Unique per user,
│  │ AK │  Ayşe Kaya                   │  deterministic, and it IS the
│  └────┘  @aysek                      │  cover art. No stock banner.
│                                      │  avatar 64px, squircle r-20,
│  Prova kayıtları. Genelde sabah.     │  overlapping the trace
│                                      │
│  ( ▶ ) Intro  ▁▂▃▅▂▁  0:14           │  the voice bio, if recorded
│                                      │
│  1.2k followers · 340 following      │  caption; tappable
│                                      │
│ [   Follow   ]  ( ✉ )  ( ◆ Duet )   │  ink key | message | duet key
│                                      │  ◆ shown only when open for Duet
│  ──────────────────────────────      │
│  Waves   Duets   Collaborators       │  underbar tabs
│  ▔▔▔▔▔                               │
│                                      │
│  [ stream of Waves, as on Home ]     │
└──────────────────────────────────────┘
```

### 8.2 Own profile

Identical, with these differences: `Follow` → `Edit profile` (ink-line, not ink-filled),
a fourth tab `Saved`, an `Analytics ›` row above the tabs showing this week's plays as a
sparkline waterline, and the signature trace carries a caption "Your signature, from your
last 12 Waves."

- **States** `no-waves-yet` (own) — the signature area renders as a dormant tick row with
  "Your signature appears once you publish." `private` (other) — trace renders at 20%
  opacity, "Ayşe's Waves are private." + "Request to follow".

---

## 9. Messages

### 9.1 List — route `/messages`

```
┌──────────────────────────────────────┐
│ ( ← )   Messages           ( ✎ )    │
│                                      │
│ ┌──┐ Deniz Yurtsever          2h  ◆  │  ◆ = unread (the one non-audio
│ │DY│ ▁▂▃▅▂▁ Voice · 0:23             │  use of signal; it means "there
│ └──┘                                 │  is unheard audio here")
│  ──────────────────────────────      │
│ ┌──┐ Selin Arda                4h    │
│ │SA│ Sending the stems tonight       │
│ └──┘                                 │
│  ──────────────────────────────      │
│ ┌──┐ Mert Bilen             3 Mar    │
│ │MB│ ⇄ Shared a Wave                 │
│ └──┘                                 │
│  ──────────────────────────────      │
├──────────────────────────────────────┤
│  ⌂      ⌕     [ ◆ ]     ♪      ◑     │
└──────────────────────────────────────┘
```

- Rows are 72px, separated by a hairline inset to the rail edge (x=64), never boxed.
- Voice messages preview their waterline in the row. That preview is the reason to open it.

### 9.2 Thread — route `/messages/[id]`

```
┌──────────────────────────────────────┐
│ ( ← ) ┌──┐ Deniz Yurtsever   ( ⋯ )  │
│       │DY│ @dyurt                    │
│       └──┘                           │
│                                      │
│           4 March                    │  day separator: centred caption
│  ─────────────  ─────────────        │  between two hairlines
│                                      │
│ ┌──┐ Bu geçiş çok iyi olmuş          │  inbound: plain ink on the
│ │DY│                                  │  paper. No field, no fill,
│ └──┘ 08:12                            │  no border.
│                                      │
│      ┌──────────────────────────┐    │  outbound: ink FIELD, paper
│      │ Yarın stüdyoda mıyız?    │    │  text, radius 16 with a 4px
│      └──────────────────────────┘    │  corner on the rail side.
│                              08:14 ✓ │
│                                      │
│ ┌──┐ ( ▶ ) ▁▂▃▅█▇▅▃▂▁▂▄▆  0:23       │  audio message: no field at
│ │DY│ ─────────────────────────       │  all. The waterline IS the
│ └──┘ 08:20                           │  message, on a hairline.
│                                      │
│  ┌──────────────────────────┐ ( ◆ ) │  composer 56px + record key
│  │ Message                  │        │
│  └──────────────────────────┘        │
└──────────────────────────────────────┘
```

- **Who said what is carried by the presence of a field, not by colour.** Inbound is bare ink
  on the paper; outbound is an ink field; audio has no field at all. That asymmetry survives
  greyscale, low vision and a one-second glance, which two tinted bubbles do not.
- **Duet request cards** in a thread render as an inline ink-hairline block with the source
  waterline, the ask, and two keys (`Record a Duet` ink-filled / `Decline` text).
- **States** `blocked` (composer replaced by an ink strip explaining, with "Unblock"),
  `request-pending` (message requests inbox is a separate list reached from the `( ⋯ )`).

---

## 10. Notifications

Route `/notifications`. Grouped by day, never boxed, and always with the audio attached.

```
┌──────────────────────────────────────┐
│ ( ← )   Activity        Mark read    │
│                                      │
│  Today                               │  13/600, ink-muted
│  ──────────────────────────────      │
│                                      │
│ ┌──┐ Elif replayed Sabah provası  ◆  │  rail carries the avatar for
│ │EY│ 3 times · 2h                    │  people-events, and an ink
│ └──┘                                 │  glyph for system events
│  ──────────────────────────────      │
│ ┌──┐ Mert asked to Duet             │
│ │MB│ "Bass line under the second..." │  the ask is quoted, 2 lines max
│ └──┘ ( ▶ ) ▁▂▃▅▂▁  0:18   [Answer]  │  demo audio + inline ink key
│  ──────────────────────────────      │
│ ┌──┐ Selin commented                 │
│ │SA│ ( ▶ ) ▁▂▃▅█▂▁  0:09  · 5h       │  audio comments play in place —
│ └──┘                                 │  no navigation needed
│  ──────────────────────────────      │
│                                      │
│  Earlier this week                   │
│  ...                                 │
├──────────────────────────────────────┤
│  ⌂      ⌕     [ ◆ ]     ♪      ◑     │
└──────────────────────────────────────┘
```

- **Design rule** any notification that references audio plays that audio inline. A
  notification you have to navigate away from to understand is a failed notification.
- **States** `empty` — "Nothing yet. Activity from your Waves lands here." with a muted
  waterline dash; no icon-in-a-circle.

---

## 11. Settings hub

Route `/settings`. A list of destinations. This is the one screen allowed to be plain.

```
┌──────────────────────────────────────┐
│ ( ← )   Settings                     │
│                                      │
│ ┌────┐ Ayşe Kaya                  ›  │  72px account row
│ │ AK │ @aysek                        │
│ └────┘                               │
│  ──────────────────────────────      │
│                                      │
│  Account                          ›  │  56px rows, hairline between,
│  Privacy                          ›  │  section gaps of 28px with no
│  Safety                           ›  │  ALL-CAPS section labels
│  Follow requests            3     ›  │  counts in mono, ink-subtle
│                                      │
│  ──────────────────────────────      │
│                                      │
│  Audio & recording                ›  │
│  Notifications                    ›  │
│  Appearance             System    ›  │  current value shown inline
│                                      │
│  ──────────────────────────────      │
│                                      │
│  Your content                     ›  │
│  Analytics                        ›  │
│                                      │
│  ──────────────────────────────      │
│                                      │
│  Log out                             │  ink text key
│  Delete account                      │  ink text key, no button, no red
│                                      │
│  AKINTI · 2026                       │  caption, ink-subtle
└──────────────────────────────────────┘
```

- **No chevron-in-a-circle, no icon column.** A settings list with 12 coloured icon tiles is
  an iOS-clone tell. Rows are text + value + a 12px chevron.

---

## 12. Analytics

Route `/analytics`. Numbers are the content, so the type does the work.

```
┌──────────────────────────────────────┐
│ ( ← )   Analytics                    │
│                                      │
│  7 days   30 days   90 days          │  underbar tabs
│  ▔▔▔▔▔▔                              │
│                                      │
│  3,412                               │  mono-display 44, tabular.
│  plays                               │  The number is the
│  ▲ 12% vs previous 7 days            │  hero. caption below.
│                                      │
│  ▁▂▃▅█▇▅▃▂▁▂▄▆█▇▆▄▂▁▃▅▇█▆▄▂▃▅▂       │  the timeseries is drawn AS A
│  Mon                          Sun    │  WAVEFORM, 88px, ink bars.
│                                      │  Not a line chart, not an area
│  ──────────────────────────────      │  chart with a gradient fill.
│                                      │
│  412      88        14        6      │  4 figures in a row, mono 22
│  replays  saves   shares   duets     │  caption 12 under each
│                                      │
│  ──────────────────────────────      │
│                                      │
│  Your Waves                          │  13/600
│                                      │
│  Sabah provası          312  ▁▂▃▅▂   │  per-Wave rows, 56px, with a
│  ──────────────────────────────      │  16px sparkline waterline
│  Gece kaydı             184  ▁▃▂▁▂   │
│  ──────────────────────────────      │
│                                      │
│  Where they listened                 │
│  Turkey                        62%   │  plain figure rows, no bars
│  Germany                       11%   │  with grey tracks
└──────────────────────────────────────┘
```

- **The timeseries is a waveform.** This is the payoff of the identity: the same drawing
  primitive renders audio, activity, and history. One motif, three jobs.
- **States** `no-data` — "You haven't published a Wave yet." + "Record your first Wave";
  `too-early` — "Analytics start 24 hours after your first Wave."

---

## Desktop adaptation

The product is mobile-first and the desktop build is a **widened mobile**, not a different
information architecture. The current build's failure — a 640px column pinned left of 800px
of empty page — is fixed by these rules.

**Breakpoints** `sm 640` · `md 768` · `lg 1024` · `xl 1280`.

### < 768px
As drawn above. Bottom keyboard, no side rail.

### 768–1023px
- The bottom keyboard becomes a **left icon rail, 72px**, icons only, labels on hover as a
  tooltip to the right. The record key stays a key (squircle, ink) and sits at the rail's
  bottom, above the avatar.
- Content column widens to **560px** and is **centred in the remaining space**, not left-hung
  against the rail.
- Waveforms keep their full-bleed behaviour *within the column*.

### 1024–1279px
- Left rail expands to **200px** with labels.
- Content column **600px**.
- A **right column, 300px**, appears with a 32px gutter. It carries, in order: the persistent
  player (see below), then context — on Home, "Currently recording" (live Waves); on a Wave
  detail, "More from this creator"; on Explore, "Open for Duet right now". It never carries
  a search box, a trending-topics list, or a "who to follow" card stack. If there is nothing
  contextual to show, the column stays empty. Empty space is better than filler.

### ≥ 1280px
- Total content frame maxes at **1160px** and centres. The page never goes wider.
- The page background outside the frame is the same paper. There is no second surface
  colour, no card, no shadow marking the frame. The frame is defined by a single hairline on
  the left of the content column only.

### The persistent player (desktop only, ≥ 1024px)
A 72px strip pinned to the bottom of the right column — not the full page width, and not a
Spotify-style bottom bar.

```
┌────────────────────────────┐
│ ┌──┐ Sabah provası         │
│ │AK│ Ayşe Kaya             │
│ └──┘                       │
│ ▁▂▃▅█▇▅▃▂▁▂▄▆█▇▆▄▂▁        │
│ ◆◆◆◆◆░░░░░░░░░░░░░░        │
│ 1:07   ( ▶ )   2:41        │
└────────────────────────────┘
```

On mobile the equivalent is a **32px mini-strip** above the bottom keyboard, showing only
the trace, the playhead, and the title — tap to expand to the full Wave detail.

### What does NOT change on desktop
- The 44px rail alignment.
- Type sizes for body and captions. Only Display steps up one stop (32 → 40 for page titles
  that survive to desktop).
- The single-accent rule.
- Hover states are additions, never the only affordance. Every hover-revealed control is
  also reachable by focus and is visible on touch.

---

## Desktop v3 (Direction A, "Akış")

The section above predates the founder's 6 Sept 2026 desktop rejection ("ugly, nobody
would want to enter, dead clicks, no icons") and the resulting `DESIGN_V3_DESKTOP.md`,
which now governs everything at `>= 1024px` and wins over both `DESIGN.md` and this
file's own desktop notes where they conflict. What follows is what actually shipped,
screen by screen, so this file stays the map of what exists rather than what was once
proposed. Mobile (`< 1024px`) is unchanged by every item below unless stated otherwise.

A discovery worth recording: `globals.css`'s desktop elevation block makes `>= 1024px`
dark by default regardless of the reader's light/dark preference (`--akinti-paper`
re-aliases to the dark `elevation-1` floor there, with an explicit light choice getting
its own coherent light mapping of the same four-step ladder) — so most existing
`bg-paper`/`text-ink`/`border-hairline` call sites picked up the "Akış" dark palette for
free at desktop width, with no `lg:` class needed. Screens below only add `lg:` classes
where the *layout*, not the palette, needed to change.

### Flow (`/flow`)
Full-screen swipe carousel below `1024px`, unchanged. At `>= 1024px`, `FlowScreen` picks
a second render path (`useIsDesktopViewport`, one tree mounted, not two) inside the real
shell (`AppShell` now renders its sidebar/top bar/now-playing bar for `/flow` at that
width — previously it bypassed all chrome unconditionally, fixed alongside this pass):
a centred stage (creator row, title, a 220px trace, transport, a horizontal action bar
with keyboard hints) capped at 720px, plus a 320px right rail — "Up next" (three mini-
trace rows, click to jump), a Duet callout (built from data Flow already hydrates, not a
fetched chain tree — see `FlowDuetCallout`'s own comment), and a two-comment preview
opening the same `FlowCommentSheet` the mobile Comment key does.

### Explore (`/explore`, and Home's stream, since `WaveFeedList` is shared)
The stream becomes a 2-5 column card grid (`ExploreWaveCard`, new) at `>= 768px+`, hover-
lift with a play button that reveals on hover/focus, genre-tinted trace (`WaveCard`
gained an optional `tags` field for this). Rising Creators, Open Calls and Backing
Tracks gain prev/next arrow overlays (`HorizontalScroller`, `src/components/ui/desktop/`)
and horizontal card lanes at `lg`, with a Phosphor icon per section heading and a sand
mark on Open Calls/Backing Tracks.

### Wave (`/w/[id]`)
Two columns at `>= 1024px`: trace/transport/title/description/actions left (capped at
800px, unchanged markup), a 320px right rail with a new `WaveCreatorCard` (creator info
plus a Follow key the mobile inline row never had room for), `OwnerInsights`, and the
Duet chain — each of those three is genuinely mounted once per breakpoint (not duplicated
client-side state), since all three are pure server-rendered data already fetched by
`page.tsx`. The comment composer is sticky under the desktop top bar at that width.

### Profile (`/u/[username]`)
Waves/Duets tabs render the same card grid Explore uses, picked by the same
`useIsDesktopViewport` hook. The stats row gains a Phosphor icon per metric at `lg`; the
signature banner needed no palette change (see the elevation note above).

### Call sites (item 7)
`FollowButton`, `WaveCardContainer`'s Save, `CommentComposer`, the Duet request form and
inbox, and `CreateFlow`'s publish step all adopt `useActionToast`. Follow is genuinely
optimistic (`useOptimistic`); Save already was (a hand-rolled reducer, left as-is — it
already had rollback, this pass only added a double-submit guard and routed its error
through the shared toast helper without losing the server's specific message).

### Challenges (`/challenges`, `/challenges/[slug]`, `/hashtag/[tag]`)
Live challenges render as hero cards at `lg` (`ChallengeHeroCard`, new — a 2/3-column grid
above the plain list, itself kept for upcoming/ended challenges): the backing-track play
widget (`ChallengeBackingTrack`, reused unmodified — its play mark stays sand per
`COLOR_V2.md`, the live-status dot is the current), a real deadline ("Ends in N days"),
and a real entry count that is simply omitted rather than printed as zero when a challenge
has no entries yet (never a fabricated total past its own fetch page, rendered "50+" when
capped). The detail page becomes two columns at `lg` (brief, backing track, Top 5 left;
entries right) via CSS grid column placement, not DOM reordering, so mobile's DOM is
untouched. Entries are hydrated to full `WaveCardContainerWave`s (`hydrateWaveCards`) and
render as a card grid with hover play at `lg` (`ChallengeEntriesGrid`, new) while mobile
keeps its original title-only rows exactly as they were. The hashtag page gets the same
grid treatment via `ChallengeWaveGrid` (new, shared with any future desktop grid of
already-hydrated Waves) — mobile there was already full `WaveCardContainer` rows, so it
is genuinely unchanged.

### Analytics (`/analytics`)
A `lg`-only KPI tile row (icons, only non-zero figures) sits above the same chart and
Wave-performance table mobile already had (which stay `lg:hidden` unchanged below the
tiles). The chart (`AnalyticsTimeseriesChart`) moved off its old `fill-accent`/`text-fg-*`
v1 token aliases onto the same `tide`/`ink`/`elevation` names the rest of the desktop pass
uses, gained a card surface at `lg`, and now emphasises its endpoint (today's bar full
`tide`, the rest a muted `tide/45`) per the dataviz pass's "no chart junk, one scale,
emphasised endpoint" rule. `RangeSwitcher` keeps its mobile underbar and gains a filled
segmented-control treatment at `lg` (`bg-elevation-3` on the active segment, still no
coloured pill). The per-Wave sparkline column called for in the original brief is still
omitted — `creator_wave_performance` returns no peaks data to draw one from, and this pass
did not add a new query for it (see `WavePerformanceTable`'s own comment).

### Tracks (`/tracks`)
Desktop picks a second render path (`TracksView`, `useIsDesktopViewport`, one tree
mounted): a filterable card grid (`TracksLibraryGrid`) instead of `BackingTracksLane`'s
teaser-lane shape, which mobile keeps unchanged. Genre, tempo-bucket ("under 90 bpm",
"90–119", ...) and key chip rows are derived from the tracks actually loaded — a chip only
appears when at least one track has that value, never a fixed list of options that could
all be empty. Each `TrackCard` carries the same hover-reveal play button and genre tint as
`ExploreWaveCard`, and a "Sing over this" primary key linking straight to `/create?track=`.

### Not yet built
Duets, Search, Notifications, Messages and Settings have not had a desktop-specific pass —
they render whatever their existing mobile-first layout produces at desktop width (correct,
but not redesigned to Direction A's card/rail language). `loading.tsx` skeletons for
Flow/Explore/Wave/Profile have not been reshaped to the new desktop layouts; they still
describe the pre-existing mobile shape.
