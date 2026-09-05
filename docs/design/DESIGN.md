# AKINTI - Visual Design

The visual language for AKINTI: an audio-first social app for voice, songs and compositions,
with collaborative Duets and no likes. Mobile-first web app, Next.js 16 + Tailwind 4.

Read with `DESIGN_DNA.json` (the machine-readable tokens), `SCREENS.md` (per-screen layout)
and `REFERENCES.md` (what this borrows from and what it refuses).

**Status of the previous build.** The current app is a competent, generic product UI. Its
tells, visible in `docs/research/ux-audit/`: a deep-teal accent applied to everything from
the tab bar to badges to a raised circular Create button, every piece of content wrapped in
a white rounded card with a grey border, one 16px radius on all of it, pill-shaped buttons
and pill-shaped badges everywhere, an icon inside a grey circle above centred text on every
empty screen, a title-plus-subtitle header stamped on every screen, six zero-value counts
printed under a Wave that has never been played, Lucide icons at a uniform 2px stroke, and a
waveform so small and pale it loses to the play button next to it. None of these are
mistakes. All of them are defaults. That is the problem.

---

## 1. The concept

**One drawing does everything. The rest is ink on paper.**

AKINTI has exactly one graphic idea, called the **waterline**: a line of amplitude, drawn
from real audio. It is not a decoration that sits near the content, it *is* the content, and
it does every job in the product. The waterline is the audio. It is the separator between
one Wave and the next. It is the progress bar. It is the analytics chart. It is a person's
cover art, generated from their last twelve Waves. It is the onboarding progress indicator,
the bottom-sheet grabber, and the loading skeleton. Around it there is nothing but ink,
paper, one 44px rail and a single hot accent that appears only when audio is live.

The product reads as **an instrument, not a feed**. The screen is the panel; the stream is
the tape log. This is the whole idea, and everything below is a consequence of it.

Three sentences, for the record:

> AKINTI is built around one drawing primitive, the waterline, which renders audio,
> separation, progress, history and identity so that the product never needs a second visual
> idea. Everything else is ink on warm paper, left-hung on a single 44px rail, with no cards,
> no shadows and no second colour. One accent, Signal vermilion, appears only where sound is
> actually happening, which makes a screen with sound on it look categorically different from
> a screen without.

---

## 2. Brand personality

**Attentive. Precise. Warm. Unhurried. Plainspoken.**

- **Attentive** - the product is listening before you are. A Wave in a feed is already
  drawn, already timed, already ready to play from the point you touch.
- **Precise** - timecodes are tabular, latency is stated in milliseconds, the playhead is
  linear. AKINTI never rounds a number to look friendly.
- **Warm** - the ground is a warm neutral with grain in it, not a clinical white and not a
  black void. Avatars are squircles, not circles. Corners exist.
- **Unhurried** - no streaks, no badges counting down, no confetti, no infinite feed
  autoplay. The only thing that pulses is the record lamp.
- **Plainspoken** - the button says Publish and the toast says Published.

Where those five conflict, **Precise wins over Warm** and **Attentive wins over Unhurried**.

### What AKINTI is not

Not a DAW (no faux knobs, no meters with skeuomorphic bezels). Not a podcast player (no
album-art squares, no rounded-cap equalizer graphics). Not a chat app (audio is not a bubble).
Not a wellness product (no gradients, no orbs, no breathing circles). Not a terminal (no
all-caps mono labels as decoration).

---

## 3. Typography

### 3.1 The families

| Role | Family | Axes used | Why |
|---|---|---|---|
| Display, UI, body | **Archivo Variable** | `wght 100-900`, `wdth 62-125` | Héctor Gatti / Omnibus-Type, 2016. A squared grotesque on 19th-century American gothic bones, drawn for highlights and headlines. Flat-sided bowls, tall x-height, panel-label authority at 11px and poster authority at 40px. |
| Numerals, technical values | **Martian Mono Variable** | `wght 100-800`, `wdth 75-112.5` | Evil Martians, derived from Martian Grotesk. The most instrument-panel mono available: squared, 60% x-height, slashed zero by default. |

Both are free, self-hosted through `next/font/google`, `font-display: swap`, never preloaded
on mobile (`mobile-guidelines.md` rule 43).

**The width axis is the pairing.** Display type runs expanded (`wdth 112` at 40px, `108` at
32px), UI and body run normal (`wdth 100`). One family speaks in two voices from one variable
file and one network request, which is exactly what an instrument does: expanded silkscreen
legend on the case, normal text in the manual. There is no second sans, and there is no serif.
Reaching for a serif display face to signal "creative" is the most-tested AI tell there is.

**Rejected, and why**

| Family | Why not |
|---|---|
| **Inter** | The default for product UI. The tell is not quality, it is that Inter unchosen signals that nobody made a typography decision. |
| **Geist** (the current face) | Named on the 2026 "slop fonts" list alongside Space Grotesk, Instrument Serif, Syne and Fraunces. Its personality lives in stylistic sets ss01-ss11, all of which Google's subsetter strips, so the shipped Geist is the plainest possible Geist. |
| **Space Grotesk, Poppins, Montserrat, Outfit** | Template-worn. Space Grotesk additionally reads crypto-startup. |
| **Instrument Serif, Fraunces** | The two LLM-favourite display serifs. Instrument Serif has one static weight and no tabular figures at all; Fraunces has no working `tnum` whatsoever, which alone disqualifies it from a product whose primary UI object is `0:14`. |
| **DM Sans, Wix Madefor, Big Shoulders, Darker Grotesque** | No usable tabular figures. |
| **Golos Text** | `tnum` lookups exist but do not equalise digit widths. Broken in practice. |
| **Host Grotesk** | The serious alternative, and a close call. It is uniwidth (a string measures identically at weight 300 and 800, so state changes cause zero layout shift), its digits are permanently tabular, and it was drawn by Doğukan Karapınar at Element Type in İstanbul, which is a genuinely better Turkish provenance than anything else on the list. It loses on two counts: its geometry is Poppins-derived, which pulls toward friendly-geometric and away from the squared signage register this brand needs, and it has no width axis, so it cannot carry the two-register idea in §3.1. Its uniwidth advantage also buys AKINTI little, because this system expresses state with fill and ink level, never by animating weight. Keep it as the fallback if Archivo Expanded tests badly with Turkish display strings. |

### 3.2 Non-negotiable font configuration

Four items, all verified against the binaries Google actually serves:

1. **`subsets: ['latin', 'latin-ext']` on every `next/font/google` call.** `ç ö ü Ç Ö Ü` live in
   `latin`; `ı İ ğ Ğ ş Ş` live in `latin-ext`. Requesting only `latin` makes every Turkish word
   containing ı, ğ or ş fall back to a system font **mid-word**. This is the real Turkish
   failure mode, and it is a config bug, not a typeface problem.
2. **`<html lang="tr">`** so the `locl` feature runs. `locl` is retained in Google's subsets.
3. **`tnum` survives subsetting; `ssXX` and `cvXX` do not.** Tailwind's `tabular-nums` works
   through `next/font/google`. If a stylistic set is ever needed, self-host the upstream TTF
   via `next/font/local`.
4. **Never use `text-transform: uppercase` on Turkish.** Turkic casing (`i` to `İ`, `ı` to `I`)
   is language-dependent and browser support varies. This system bans all-caps labels anyway,
   so the rule exists only to stop anyone reintroducing them via CSS.

**Regression test string**, to be checked at 11px, 16px and 40px in both faces:

```
AKINTI · kayıt akışı düğümü · ŞİŞLİ İĞNE · 0:14 / 2:07 · -18.2 dB
```

Two measured constraints to design around:

- **Archivo widens 28.4% from `wght 100` to `wght 900`.** Never animate weight in place.
  Active states change fill and ink level, never weight.
- **Martian Mono's `İ` reaches 105% of em and `Ğ` 103%, both above its own ascender metric,
  so Turkish capitals will clip.** In this system the mono is numerals-only, which makes the
  problem moot, and that restriction is now a rule: **no Turkish uppercase in Martian Mono,
  ever.** If a Latin capital must appear in a readout, line-height goes to 1.45 and the
  container must not clip.

### 3.3 The scale

Mobile base. Root is 16px. Tracking scales with size and reaches exactly `0` at 15px, below
which it goes slightly positive.

| Token | Size | Line height | Weight | Width | Tracking | Used for |
|---|---|---|---|---|---|---|
| `display-xl` | 40px / 2.5rem | 40px / 1.0 | 600 | 112 | -0.025em | Onboarding headlines only |
| `display` | 32px / 2rem | 34px / 1.0625 | 600 | 108 | -0.022em | Page titles (scroll away) |
| `title` | 28px / 1.75rem | 30px / 1.07 | 600 | 100 | -0.02em | Wave detail title |
| `heading` | 19px / 1.1875rem | 24px / 1.263 | 600 | 100 | -0.015em | Wave titles in a stream |
| `subhead` | 15px / 0.9375rem | 20px / 1.33 | 600 | 100 | -0.006em | Names, section heads |
| `body` | 16px / 1rem | 25px / 1.5625 | 400 | 100 | -0.002em | Descriptions, prose |
| `body-sm` | 14px / 0.875rem | 20px / 1.43 | 400 | 100 | 0 | Secondary prose |
| `caption` | 13px / 0.8125rem | 17px / 1.31 | 500 | 100 | +0.004em | Meta, counts, labels |
| `micro` | 11px / 0.6875rem | 14px / 1.27 | 500 | 100 | +0.02em | Tab labels, track labels |
| `mono-display` | 44px / 2.75rem | 44px / 1.0 | 500 | 87.5 | -0.01em | The analytics hero figure, and nothing else |
| `mono-lg` | 22px / 1.375rem | 26px / 1.18 | 500 | 87.5 | 0 | Analytics figure rows |
| `mono` | 15px / 0.9375rem | 18px / 1.2 | 500 | 87.5 | 0 | Record timer, dB |
| `mono-sm` | 12px / 0.75rem | 15px / 1.25 | 500 | 87.5 | +0.01em | Timecodes on traces |

`caption` has one variant: **`caption` at weight 600**, used for in-content section labels
("Comments (24)", "Your Waves", "Trim", "Today"). It is the only 13px weight change in the
system and it exists so that a section label never needs to be larger, coloured or capitalised.

Only three weights ship: **400, 500, 600**. There is no 700 and no 800. Hierarchy is carried
by size, whitespace and the rail, not by weight, and certainly not by colour.

### 3.4 Numerals

Every number in the product is **Martian Mono at `wdth 87.5`, `wght 500`, with
`font-variant-numeric: tabular-nums`**. That includes timecodes (`0:14`, `2:07`), durations,
dB values (`-12 dB`), latency offsets (`-84 ms`), play counts, character counters (`0/280`)
and analytics figures. A timecode that shifts width as it counts is the single fastest way to
make a transport look cheap.

Numbers that are part of a sentence ("4 March", "3 new Waves") stay in Archivo. The rule is
about *readouts*, not about digits.

### 3.5 Setting rules

- Sentence case everywhere. No Title Case headers, no ALL-CAPS labels, no small caps.
- No eyebrow labels. A section headline is enough. If a screen needs three eyebrows to
  explain itself, the screen is wrong.
- Prose is capped at **62 characters**. `text-wrap: pretty` on body, `text-wrap: balance` on
  any headline of two or three lines.
- Never emphasise a single word in a headline with a different colour, weight or family.
- All text inputs are 16px minimum so iOS never zooms on focus.
- Turkish is a first-class script, not a translation target. Test every headline with
  `ığĞİŞşçÇöÖüÜ` at display sizes; the dotted capital İ needs the ascender clearance that
  40px/1.0 leaves it, which is why display line-height is exactly 1.0 and not 0.95.

---

## 4. Colour

### 4.1 The idea

A single warm-neutral grey family with a **green-grey cast, never blue-grey and never cream**,
plus one accent. The greys are the entire interface. The accent is reserved for one meaning.

The signature hue is **Signal**, Turkish working name **Kor** (ember). It is a lacquer
vermilion, and it means exactly one thing:

> **Signal appears only where audio is live.**
> The played portion of a waveform, the record lamp, the live level, the mark on unheard
> audio, and the "open for Duet" mark. Nothing else, ever.

That constraint is what makes it work. A screen with sound happening on it is categorically
different from a screen without, at a glance, from across a room. If you can see Signal on a
screen and it is not audio state, the screen is wrong.

Why not the current teal: it is the calm-product default, it was applied to navigation and
badges and buttons until it meant nothing, and it is the exact colour a generated app reaches
for. Why not indigo, violet or purple: banned outright, for the reason everyone now knows.
Why not warm clay or terracotta: that palette flipped from "human" to "obviously generated"
during 2025. Why not acid green or amber: neither clears 3:1 against a light ground, which
would break the played/unplayed reading of a waveform in daylight.

### 4.2 Light theme, "Gündüz"

| Token | Hex | Contrast on `paper` | Use |
|---|---|---|---|
| `paper` | `#EFEFEC` | ground | The page. Every screen. |
| `paper-raised` | `#F6F6F4` | 1.06:1 | Sheets and menus only. Nothing else is raised. |
| `paper-sunk` | `#E4E4E0` | 1.11:1 | Pressed rows, inset fields, the "already requested" strip. |
| `ink` | `#191A17` | **15.17:1** | Body, headlines, glyphs, playheads, filled keys. |
| `ink-muted` | `#52534C` | **6.75:1** | Secondary prose, meta. |
| `ink-subtle` | `#6A6B63` | **4.68:1** | Captions, counts, timestamps. AA floor. |
| `hairline` | `#D6D6D1` | 1.27:1 | Row dividers, input borders. |
| `hairline-strong` | `#B4B4AD` | 1.81:1 | Outline keys, the dormant tick row. |
| `signal` | `#DE3C11` | **3.83:1** | Graphic only. Clears 3:1 for non-text UI. |
| `signal-deep` | `#A32A08` | **6.30:1** | The AA-safe Signal, for error text only. |
| `signal-wash` | `#FAE3DC` | - | One tinted field in the whole product (pending-request strip). |
| `wave-rest` | `#B4B4AD` | 1.81:1 | The idle tick row on the recorder. |
| `wave-dormant` | `#86877E` | **3.15:1** | The unplayed part of every trace. |
| `overlay` | `rgb(25 26 23 / 0.42)` | - | Scrim behind a sheet. |

### 4.3 Dark theme, "Gece"

Not a near-black. `#0A0A0A` with `rgba(255,255,255,0.1)` borders is the literal, named
signature of generated dark mode. AKINTI's dark ground is a **warm graphite with a green
cast**, and its borders are solid tokens.

| Token | Hex | Contrast on `paper` | Use |
|---|---|---|---|
| `paper` | `#131412` | ground | The page. |
| `paper-raised` | `#1C1D19` | 1.09:1 | Sheets and menus. |
| `paper-sunk` | `#0C0D0B` | 1.15:1 | Pressed rows, inset fields. |
| `ink` | `#EDEDE8` | **15.73:1** | Body, headlines, glyphs, playheads. |
| `ink-muted` | `#A0A199` | **7.09:1** | Secondary prose. |
| `ink-subtle` | `#7E7F77` | **4.57:1** | Captions. AA floor. |
| `hairline` | `#292A26` | 1.28:1 | Row dividers. |
| `hairline-strong` | `#3F403A` | 1.76:1 | Outline keys, idle ticks. |
| `signal` | `#FF5C33` | **6.01:1** | Graphic and, here, safe for small labels. |
| `signal-deep` | `#FF9376` | **8.52:1** | Error text. |
| `signal-wash` | `#2A140E` | - | The pending-request strip. |
| `wave-rest` | `#3F403A` | 1.76:1 | Idle tick row. |
| `wave-dormant` | `#63645D` | **3.09:1** | Unplayed trace. |
| `overlay` | `rgb(6 7 5 / 0.62)` | - | Sheet scrim. |

Default is `prefers-color-scheme` with an explicit override in Settings, exactly as the
current `globals.css` already resolves it. Keep that resolution order; change the values.

### 4.4 Semantic colour

There is no green, no amber and no blue in this product.

| Semantic | Treatment |
|---|---|
| **Success** | Ink. The state change *is* the confirmation. A handle being available is a Signal tick inside the field, not a green banner. A published Wave is a toast that says "Published." in ink. |
| **Warning** | Ink, plus a sentence. If something needs a colour to be noticed, it needs better placement. |
| **Error** | Text in `signal-deep`, plus a 2px Signal underline on the bottom edge of the offending field. Never a filled red field, never a coloured left border on a card, never a red banner across the top. |
| **Info** | `ink-muted`. |
| **Destructive** | Ink, as a text key. "Delete account" is a sentence with a hairline underline, not a red pill. The confirmation dialog spells out what is lost. |

**No text is ever set on a Signal field.** Signal fills carry an ink glyph (3.96:1) and their
label sits outside them. This keeps the one-accent rule from ever colliding with AA.

### 4.5 Order of separation

Whitespace, then a 3% lightness step, then a hairline, then, for sheets only, a tinted
shadow. Borders are the last resort, not the first. No element ever carries both a hairline
and a shadow.

---

## 5. Space, shape and elevation

### 5.1 Spacing

Base unit **4px**. Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 72 · 96`.

Proximity is semantic and the three tiers never overlap:

- **8 or 12px** inside a component
- **16 or 20px** between components
- **32 or 40px** between sections

Page inline padding is **20px** at every breakpoint. Vertical padding is optically weighted,
never symmetric: a stream item takes 20px above and 24px below, so the waterline separator
sits closer to the item it ends than to the item it starts.

**Density is deliberately different per screen.** The feed is dense (a Wave is roughly 260px
tall). The record screen is sparse (one control per vertical third). Settings runs a 56px row
rhythm. Analytics runs a 22px mono figure against a 12px caption. Reusing one template's
rhythm across every screen is the single most reliable way to look generated.

### 5.2 Radius

Radius encodes role, not taste. Uniform radius across buttons, cards, inputs, avatars and
modals is the most-cited generated-UI tell there is.

| Radius | Means | Applied to |
|---|---|---|
| `0` | a line | Hairlines, separators, waveform bars below 40px |
| `2px` | a label | Badges (Recorded / Uploaded / Duet), bar caps at 40px and above |
| `6px` | a tag | Chips, filter tags |
| `10px` | you can type in it | Inputs, textareas, select rows, switch travel |
| `14px` | you can press it | Keys, that is, buttons |
| `16px` | a bounded object | The Explore creator tile, and the outbound message field (with a 4px corner on the rail side) |
| `24px` | it slid up from the bottom | Sheet top corners |
| `0.295 x side` | a physical key | Record keys: 72px key gets 21px, 88px gets 26px, 96px gets 28px |

That last rule is the one to get right. Every record key shares one corner *curvature*, not
one corner radius, so a 72px stop key and a 96px onboarding key look like the same object at
two sizes rather than two objects.

**No pills.** Fully rounded rectangles are banned product-wide. The previous build used pills
for Follow, Request a Duet, Post, segmented controls, badges and the Create button; killing
the pill is a large part of the difference. Circles are permitted only for round transport
controls (play, skip, pause) at 36-56px, where the circle is the hardware convention.

### 5.3 Elevation

Three levels. Level 0 covers roughly 95% of the interface.

| Level | Shadow | Where |
|---|---|---|
| 0 | none | Streams, rows, badges, inputs, keys, the creator tile. Everything. |
| 1 | `0 -1px 0 0 #D6D6D1, 0 24px 48px -12px rgb(25 26 23 / 0.18)` | Bottom sheets, menus, the desktop persistent player. |
| 2 | `0 8px 24px -8px rgb(25 26 23 / 0.22)` | Only while an element is under the finger. Never persists. |

Dark theme swaps the level-1 shadow to `0 -1px 0 0 #292A26, 0 24px 48px -12px rgb(0 0 0 / 0.55)`.

Shadows carry the ink hue. There is no pure-black shadow anywhere. There is no inner
highlight, no bezel, no double-bezel nesting, no glass.

### 5.4 The rail

Every stream item, comment, message and notification is left-hung against a **44px rail**
carrying the avatar, the state glyph or the timecode. The text column starts at `x = 64` and
runs to `x = 370` on a 390px frame. This alignment is never broken, at any breakpoint, on any
screen. It is what makes the feed read as a logbook rather than a social template, and it is
the thing a reader will recognise without being able to name.

### 5.5 Texture

One fixed, `pointer-events: none` grain layer over the whole viewport:

```
SVG feTurbulence, baseFrequency 0.82, numOctaves 3, stitchTiles stitch
opacity 0.03 light / 0.045 dark
mix-blend-mode: multiply light / screen dark
position: fixed, painted once, never on a scrolling container
```

It makes the paper read as a surface rather than as a browser default, and it is the one
thing generated interfaces never have (their imagery has "zero film grain" as a documented
tell). It is dropped entirely under `prefers-reduced-transparency` or on devices reporting
`navigator.deviceMemory < 4`.

**No gradients anywhere**, with exactly one exception: a 24px linear fade at the left and
right ends of a full-bleed waveform, from paper to transparent, so the trace does not hard-cut
at the page edge. That is a mask, not decoration.

---

## 6. The waterline

This is the identity. Get this right and everything else can be quiet.

### 6.1 Geometry

Size-dependent, by rule:

| Trace height | Bars | Gap | Pitch | Caps | Mirrored |
|---|---|---|---|---|---|
| 16-28px (inline, comments, message rows) | 2px | 1px | 3px | square | no, sits on a baseline |
| 32-38px (mini player, sheet source clip) | 2px | 2px | 4px | square | no |
| 40-96px (feed at 56px, review at 96px) | 3px | 2px | 5px | 1px | yes |
| 128-144px (Wave detail) | 3px | 2px | 5px | 1px | yes |

- **Minimum bar height is 2px.** Silence has a floor, never a hole. This is what makes the
  dormant tick row read as the same object as a loud passage.
- **True silence is drawn as dots, not as short bars.** A passage below the noise floor
  renders as a row of 2px square dots on the centre line. Apple Voice Memos does this; almost
  nobody else does, and it reads instantly as considered.
- **Mirror at the exact midpoint, and shade the bottom half less.** The lower half of a
  mirrored trace renders at **70% alpha**. This one detail is the difference between a
  designed mirrored waveform and a CSS-default one.
- **Never fully rounded caps.** Rounded caps are the podcast-app default and they lie about
  the signal. 1px at large sizes is the maximum.
- Bar x-positions are rounded to whole device pixels (`Math.round`) so edges stay crisp at
  any DPR.
- 24px edge fade at both ends of a full-bleed trace.

### 6.2 States

| State | Drawing |
|---|---|
| **dormant** | A row of evenly spaced 1px ticks in `wave-rest` at the rest position. Not zeros, not a flat line, not a fake waveform. This is the recorder before you press anything, and the skeleton before audio loads. |
| **loaded, unplayed** | Bars in `wave-dormant`. |
| **playing** | Everything left of the playhead in `signal`; everything right of it in `wave-dormant`. |
| **playhead** | A 2px `ink` vertical line spanning the full trace height, with a 2px square ink cap at the top: the write-head. The playhead, not the colour, is the accessible cue for the played/unplayed boundary. |
| **unloaded region** | `wave-dormant` at 40% alpha, so a partially buffered track shows what it has (`mobile-guidelines.md` rule 29). |
| **armed** | The dormant tick row, plus a 1px `signal` ring on the record key. Armed is not recording. |
| **recording** | The whole trace in `signal`, scrolling right to left in a 10-second sliding window, drawn from **RMS** amplitude rather than peak so it moves smoothly. The write-head is a 2px `ink` line at the right edge. |
| **duet, theirs** | `ink`, drawn **downward** from the centre line. |
| **duet, yours** | `signal`, drawn **upward** from the centre line. One playhead spans both. |
| **skeleton** | A flat 6px waterline in `wave-rest`. Never a fake waveform, never a shimmer. |

**The mirrored Duet pair is the brand image.** Theirs above the line in ink, yours below the
line in Signal, sharing one playhead. It appears nowhere else in the product and it is what
should go in the app store listing.

### 6.3 Motion of the trace

- Scrub, progress and playhead are **linear, with no easing, at 0ms**. A playhead that eases
  is lying about time. This is the strictest rule in the motion system.
- The trace **never animates on mount**. A waveform that draws itself in is decoration.
- The A/B toggle on the Enhance step redraws the trace with a 180ms morph, because there the
  change *is* the content.
- Live bars appear at the write-head at the frame rate of the input, with no interpolation.

### 6.4 Implementation notes

- One Canvas 2D primitive, via `wavesurfer.js` v7 (`libraries.md` §2), fed by peak JSON
  exported at upload time. Identical drawing on the server preview, in the feed, in the
  player, in analytics and on a profile.
- Render the played/unplayed split as a **clipped two-layer alpha mask, not per-bar
  recolouring**. SoundCloud went from 17 FPS to 60 FPS at under 20% GPU with this technique;
  on mobile web it is the difference between smooth scrubbing and jank.
- `requestAnimationFrame` runs only while audio is actually playing or recording; the loop is
  torn down on pause, on unmount, and under `prefers-reduced-motion`.
- The renderer loads via `next/dynamic` and never enters the initial bundle
  (`mobile-guidelines.md` rule 44).
- **A waveform is a display, never an icon.** BandLab's "Open Studio" button uses an abstract
  vertical-bars glyph and users cannot tell what it does. The record control is a filled
  circle. The create control is a plus. Vertical bars mean "here is audio", nothing else.

---

## 7. Motion

### 7.1 Tokens

```
--dur-micro    90ms    press, key inversion, toggle
--dur-quick   140ms    exit, dismissal
--dur-normal  200ms    enter, tab change, badge swap
--dur-morph   180ms    A/B trace redraw
--dur-macro   380ms    bottom sheet, route transition

--ease-enter  cubic-bezier(0.2, 0, 0, 1)
--ease-exit   cubic-bezier(0.4, 0, 1, 1)
--ease-press  cubic-bezier(0.3, 0, 0.2, 1)
--ease-time   linear                        /* anything bound to the transport */

sheet spring (Motion): stiffness 380, damping 34, mass 0.9
```

### 7.2 Rules

- **Enter:** opacity 0 to 1 with `translateY(6px)` over 200ms on `--ease-enter`. Six pixels,
  not twenty-four. Lists do not stagger.
- **Exit:** opacity only, 140ms. Nothing slides away, scales down or blurs out.
- **Press:** `scale(0.975)` over 90ms, no translate. Keys additionally gain a 1px inset
  hairline so they read as depressed rather than dimmed.
- **Scrub:** linear, zero duration, tracks the finger exactly.
- **Record lamp:** the Signal dot breathes between 100% and 55% opacity over 1400ms,
  `ease-in-out`, infinite. **This is the only infinite animation in the entire product.**
- **State inversion:** idle key (ink field, Signal dot) to recording key (Signal field, ink
  square) is a 120ms crossfade, not a colour animation.
- **Morph, do not fade.** The five states of the record screen (idle, recording, review,
  enhance, details) are one screen whose header, key and trace transform in place. A new
  screen for each state would be five fades where one morph explains what happened.
- **New items never shift the list.** A one-line ink strip pins under the top bar: "4 new
  Waves". Tapping it inserts them.
- **Haptics do the work animation usually does.** OS-default haptics for success, error and
  selection. Exactly one custom haptic ships: a single short tick at the moment recording
  actually starts, because that is the moment a user needs to trust. Motion competes with
  listening; haptics do not.

### 7.3 Reduced motion

Under `prefers-reduced-motion: reduce`:

- The record lamp becomes a **static filled Signal dot**. It does not stop being visible.
- Live traces render their static peak trace; only the playhead advances.
- Sheets appear without sliding; the scrim still fades at 90ms.
- All entrances collapse to instant opacity.
- The onboarding stroke draw becomes an instant fill.
- Nothing that communicates state is removed, only the movement that carried it.

---

## 8. Components

### 8.1 The keyboard (bottom navigation)

64px plus safe area. Five keys: **Home · Explore · Record · Messages · You**. Labels always
visible at `micro` (11px). Icons 24px Phosphor.

- Active is expressed as a **filled** Phosphor glyph plus full `ink`. Not a colour change,
  not a pill behind it, not an underline, not a glow.
- The **Record key is a 44px ink squircle (radius 13px) carrying a 14px Signal dot**. It is a
  key on the bar, not a raised circular floating action button, and it never overlaps the
  bar's top edge. The previous build's raised teal FAB is the loudest generic signal in the
  app.
- A `hairline` on the bar's top edge. No shadow, no blur, no translucency.
- At 768px this becomes a 72px left icon rail; at 1024px a 200px labelled rail.

### 8.2 Top bar and context bar

A screen has **at most two bars, never three**: a 56px top bar carrying the wordmark and up
to three 24px icon controls, and, on scroll, a 48px context bar that replaces the page title.

**The wordmark is the word.** `AKINTI` set in Archivo at `wdth 118`, `wght 500`, 15px, with
+8% tracking, in ink. There is no accompanying vertical-bars glyph. The previous build's
waveform lockup is the exact pattern BandLab's own published critique flags: an abstract
vertical-bars mark reads as "some audio thing", not as a specific identity, and it collides
with the rule that a waveform is a display and never an icon.

The page title is a `display` (32px) heading that lives in the content and scrolls away. It
is never duplicated in the bar while it is visible. There is no title-plus-subtitle block on
every screen; the previous build's "Explore / Trending, new and rising waves, plus creators
open for duet." is the pattern being deleted.

### 8.3 Wave (the stream item)

No card. The Wave sits on the paper, hung on the 44px rail.

```
rail 44px  |  text column x=64 -> x=370
avatar     |  Ayşe Kaya  @aysek                        2h
           |  [recorded]                                        2px hairline badge
           |
           |  Sabah provası                                     heading 19/600
           |
  full-bleed waveform, 56px, mirrored, bottom half at 70%
  0:14                                                   2:07   mono-sm
           |
           |  ( play )  ( comment )  ( save )  ( share )        36px, ink-line
           |  312 plays · 41 replays · 6 duets                  caption, ink-subtle
═══════════ waterline separator, 2px, drawn from this Wave's own peaks at 24% ink
```

- **Hierarchy:** waveform, then title, then creator, then controls, then counts. The waveform
  is the largest, highest-contrast element in every item.
- **Primary action:** tap anywhere on the trace to play from that point. The explicit play
  control is redundant, and exists for accessibility and for reaching play without scrubbing.
- **Counts print only non-zero metrics**, on one line. Six zeroes is a debug dump.
- **"Request a Duet" is not in the feed item.** It lives on the Wave detail and in the
  long-press menu. A filled primary button on every row is what made the previous build read
  as a template.

### 8.4 Player

Three sizes, one drawing.

- **Inline (in a stream):** the 56px trace plus four 40px round controls. Scrubbing is on
  the trace, not on a separate slider. There is never a slider with a filled track.
- **Detail:** 144px trace bleeding past both page edges, `( back 15 ) ( play ) ( forward 15 )`
  at 44/56/44px, plus a `1.0x` speed control in `mono`.
- **Mini strip (mobile, 32px above the keyboard):** trace, playhead, title. Tap to expand.
- **Desktop persistent player:** a 72px strip pinned to the bottom of the right column at
  1024px and above. Not a full-width bottom bar.

Media Session API is wired for lock-screen controls (`mobile-guidelines.md` rule 30).

### 8.5 Record key

The most important object in the product, and the one that carries the most reference weight.

```
idle       ink field, 20px Signal dot centred, 1px inset hairline on press
armed      ink field, Signal dot + 1px Signal ring on the key
recording  Signal field, 20px ink square centred          (120ms crossfade)
paused     Signal field, ink square, write-head blinking at 1.2s
```

**The lamp is the dot, not the key.** This is the hardware convention: on a TP-7 or a Nagra
the record control is neutral and the *lamp* is red. Filling the whole key red at rest is
what a consumer app does; lighting a dot is what an instrument does. The inversion on
recording is then a genuine event rather than a hover state.

Sizes: 96px (onboarding, radius 28), 88px (record idle, radius 26), 72px (stop, radius 21),
44px (nav, radius 13), 36px (inline audio reply, radius 11).

Press and hold to record; tap to arm. A 3-second countdown precedes recording
(`mobile-guidelines.md` rule 15), drawn as three shrinking ink ticks, not as bouncing
numerals.

### 8.6 Bottom sheet

24px top corners, `paper-raised` fill, level-1 elevation, 42% ink scrim, 380ms spring.

The grabber is a **24px waterline**, not a grey capsule. Dismissible by drag, by scrim tap
and by Escape. Uses `vaul` (`libraries.md` §5). A centred dialog is used only to confirm
something irreversible.

### 8.7 Keys (buttons)

Three variants and no more.

| Variant | Look | For |
|---|---|---|
| **Ink key** | Ink field, paper label, 14px radius, 52px tall (44 secondary, 40 inline, 32 compact) | The single most important action on a screen |
| **Line key** | 1px `hairline-strong`, no fill, ink label | Secondary actions |
| **Text key** | Ink label with a 1px hairline underline offset 3px | Tertiary and destructive |

Press is `scale(0.975)` over 90ms. Labels are three words maximum for primary, and never
wrap. No pills, no gradients, no icon-in-a-circle trailing affordance, no arrow appended to a
label, and never two keys on one screen that mean the same thing.

### 8.8 Chips and filters

A filter row is one row, 40px, horizontally scrollable, replacing the page title on scroll.
The active item is marked by a **2px ink underbar**. Never a filled coloured pill. Chips
elsewhere are 6px-radius hairline tags.

### 8.9 Inputs

48px tall, 10px radius, 1px hairline, transparent fill, 16px text.

- The **label sits above the field** at `caption` size. There is no placeholder-as-label,
  ever.
- Focus is a 2px ink outline offset 2px, identical on every focusable thing in the product.
- Validation is inline beneath the field on blur, never a toast.
- An availability confirmation is a small Signal tick inside the field.
- Errors: message in `signal-deep`, plus a 2px Signal underline on the field's bottom edge.
- Character counters are `mono-sm`, right-aligned, and appear only above 80% of the limit.
- Textareas are 96px minimum and grow.

### 8.10 Avatars

**Squircles, not circles.** 12px radius at 32px, 16px at 48px, 20px at 64px. The person is a
label on the rail, not a bubble.

Fallback initials are set in Archivo 500 at 40% of the avatar size, `ink-muted` on
`paper-sunk`. Never the same generated placeholder for two different people, and never a
generic user glyph.

### 8.11 Badges

`Recorded` / `Uploaded` / `Duet` are **2px-radius hairline tags**, ink only, sentence case,
11px, with 6px horizontal padding and a 20px height. They are never filled, never tinted,
never a pill, and never full-bleed across a row. The previous build's full-width tinted teal
"Recorded" pill is a good example of a badge that had become a banner.

### 8.12 Messages

Audio is never a bubble and inbound text is never a bubble either.

- **Inbound text** sits as plain ink on the paper, on the rail, with the timestamp beneath in
  `caption` / `ink-subtle`. No field, no fill, no border.
- **Outbound text** sits in an ink field with paper text, 16px radius, with a 4px corner on
  the rail side so the shape points at its author.
- **Audio messages have no field at all.** The waterline *is* the message: a 40px round play
  control, a 28px single-sided trace, a timecode in `mono-sm`, sitting on a hairline.

That asymmetry does more work than two coloured bubbles: you can tell who said what from the
presence or absence of a field, which survives greyscale, low vision and a glance.

### 8.13 Toasts

A single 44px ink strip pinned above the keyboard. One line of text, at most one action, no
icon, no progress bar, no celebration. Auto-dismiss at 4s, or persist if it carries an action.
Uses `sonner` (`libraries.md` §5), restyled.

The verb matches the action exactly: Publish produces "Published.", Save produces "Saved.",
Follow produces "Following Ayşe."

### 8.14 Empty states

Left-aligned on the rail. Never centred, never an icon inside a grey circle, never an
illustration.

The rule: **an empty state should contain the thing it is describing, if that is possible.**

- Home, empty: "No one you follow has posted yet." then a live strip of three
  currently-playing Waves from Explore, rendered as bare traces with names, then a line key
  "Find people to follow". The empty state is a working feed.
- Notifications, empty: "Nothing yet. Activity from your Waves lands here." plus a single
  dormant tick row.
- Comments, empty: the composer, and nothing else. An empty comment list does not need to
  announce itself.

### 8.15 Skeletons

Shaped to the final layout: a rail circle, two text bars at 45% and 70% width, and a **flat
6px waterline** where the trace will be. Three items maximum. No shimmer, no pulse, no
generic spinner in a feed. Spinners appear only for bounded actions expected to take under two
seconds.

---

## 9. Iconography

**Phosphor Icons** (`@phosphor-icons/react`), `regular` weight, 1.5px stroke on a 16px grid,
at 16 / 20 / 24px.

This is a deliberate swap away from `lucide-react`. `libraries.md` §5 kept Lucide "unless a
redesign pass explicitly wants a distinct icon identity". This pass does: Lucide is the
shadcn default and reads as such, and its uniform 2px stroke fights the hairline system.

One rule carries all icon state:

> **Outline means available. Fill means engaged.**

Saved is a filled bookmark. The active tab is a filled glyph. Playing is a filled pause. There
is no colour-coded icon state anywhere.

Never: mixing icon families, `bold` or `thin` or `duotone` variants, hand-rolled SVG glyphs,
a sparkle icon, an emoji standing in for an icon, a coloured icon tile in a settings list, or
an icon inside a circle as an empty-state illustration.

AKINTI's own marks are drawn geometry, not icons: the waterline, the write-head, the record
dot, the Duet mark.

---

## 10. Imagery and illustration

**AKINTI does not illustrate.** There is no mascot, no spot illustration, no lifestyle
photography, no stock imagery, no hero image and no 3D render anywhere in the product.

Where another product would place an illustration, AKINTI places real audio or a real trace.

The one generated image in the system is **the signature**: a 72px trace deterministically
derived from a person's last twelve Waves, unique per user, changing as they publish. It is
the profile cover art. There is no stock banner, no gradient header, and no user-selectable
profile theme colour. A person's cover art is made of the sound they have made.

Photography appears only as an avatar: uncropped, unfiltered, no duotone, no gradient scrim.

---

## 11. Copy

### 11.1 Voice

Plainspoken, attentive, a little dry. It sounds like a person who records things for a living
and does not oversell. Sentence case. Second person. Active voice. Turkish and English ship
with the same register, and neither is a translation of a marketing voice.

**Banned in any user-visible string:** the em dash character, exclamation marks, "Oops",
"Elevate", "Seamless", "Unleash", "Discover", "Get started", "Next-gen", an arrow appended to
a label, raw error codes, and Title Case.

### 11.2 Microcopy

| Situation | Copy |
|---|---|
| Onboarding, step 1 headline | Someone is talking right now. |
| Onboarding, step 1 primary | Keep listening |
| Onboarding, step 1 secondary | I'll look around |
| Mic permission pre-prompt | We need your mic to record. Nothing is uploaded until you publish. |
| Mic permission denied | AKINTI needs the microphone to record. You can still upload audio you already have. |
| Record, idle hint | Hold to record. Tap to arm. |
| Recording, footer | Recording. Nothing is saved yet. |
| Review, primary | Continue |
| Review, secondary | Re-record |
| Details, primary | Publish |
| Publish success toast | Published. |
| Upload failure | Upload didn't finish. Your recording is still here. |
| Upload failure action | Try again |
| Home, empty | No one you follow has posted yet. |
| Home, empty action | Find people to follow |
| Home, new items | 4 new Waves |
| Feed error strip | Couldn't reach the stream. |
| Feed error action | Try again |
| Explore, Rising empty | Nothing is rising this hour. Rising resets every 60 minutes. |
| Explore, Rising empty action | Show Trending instead |
| Duet request, primary | Send the request |
| Duet request, pending | You asked on 3 March. Waiting for Ayşe. |
| Duet request, pending action | Withdraw request |
| Duet, source audio failed | We couldn't load Ayşe's track. Your recording is still running. |
| Duet, source audio action | Retry loading |
| Wave deleted | This Wave was removed by its creator. |
| Profile, private | Ayşe's Waves are private. |
| Profile, private action | Request to follow |
| Profile, no signature yet | Your signature appears once you publish. |
| Notifications, empty | Nothing yet. Activity from your Waves lands here. |
| Analytics, no data | You haven't published a Wave yet. |
| Analytics, too early | Analytics start 24 hours after your first Wave. |
| Offline banner | You're offline. We'll send this when you're back. |
| Handle taken | That handle is taken. |
| Destructive confirm | Deleting your account removes your Waves, your Duets and your messages. This cannot be undone. |
| Destructive confirm action | Delete my account |

### 11.3 Words that are load-bearing

**Wave** (a published recording), **Duet** (a collaborative recording), **replay** (a second
listen by the same person), **signature** (a profile's generated trace), **key** (an
interactive control, in the design system, not in the UI copy). These are capitalised in copy
only where they are product nouns: Wave and Duet are, replay and signature are not.

---

## 12. Never do

The full list. The first ten are the ones that would most quickly return the product to
looking generated.

**The top ten**

1. **Never wrap content in a card.** No white rounded box with a grey border on a grey page.
   A Wave sits on the paper, on the rail, separated by a waterline. One card exists in the
   entire product and it is the Explore creator tile.
2. **Never use one radius for everything.** A uniform 12px or 16px across buttons, cards,
   inputs, avatars and modals is the most-cited generated-UI signature. Radius encodes role.
3. **Never let the accent leave audio state.** Signal on a tab bar, a Follow button, a badge,
   a link or a settings row is the single fastest way to destroy the system.
4. **Never ship a pill.** No pill buttons, no pill badges, no pill segmented controls, no
   pill filter chips, no raised circular Create button.
5. **Never put an icon inside a grey circle above centred text.** That is the AI empty state.
   Empty states are left-aligned and contain real content where possible.
6. **Never print a zero.** "0 Plays · 0 Replays · 0 Comments · 0 Saves · 0 Shares · 0 Duets"
   is a debug dump. Print only non-zero metrics.
7. **Never ease anything bound to audio time.** Playheads, progress, scrub and the live trace
   are linear or they are lying.
8. **Never use rounded caps on waveform bars, and never use a rounded-cap equalizer graphic
   as an icon.** A waveform is a display, never a button glyph.
9. **Never stack a title and a subtitle on every screen.** One page title, in the content,
   that scrolls away. Two bars maximum, never three.
10. **Never let minimalism eat the transport.** The play, record and stop controls are always
    the largest touch targets on their screen. Endel's own published critique is that its
    controls became "significantly smaller and less visually prominent" than the ambience
    around them; that is the failure this aesthetic invites.

**The rest**

11. No indigo, violet or purple, in any shade, as an accent or a gradient.
12. No warm cream ground with a clay or brass accent and a serif display face.
13. No `#0A0A0A` dark ground with `rgba(255,255,255,0.1)` borders.
14. No gradients, except the 24px edge fade on a full-bleed trace.
15. No glassmorphism, no `backdrop-filter`, no frosted panels, and above all none of it over
    a live waveform, which is the worst legibility combination available.
16. No glow, no neon, no coloured drop shadow, no pure-black shadow.
17. No element carrying both a hairline and a shadow.
18. No thick coloured left border on anything.
19. No Inter, Geist, Space Grotesk, Poppins, Montserrat, Instrument Serif or Fraunces.
20. No serif display face used to signal "creative".
21. No ALL-CAPS tracked-out eyebrow label above a heading. No eyebrows at all.
22. No Title Case. No exclamation marks. No em dash character in any user-visible string.
23. No middle dot used as a general separator. One per metadata line, maximum.
24. No `01 / 02 / 03` section numbering, no version stamps, no build strings, no locale or
    weather strips.
25. No sparkle icon, no emoji standing in for an icon, no mixed icon families, no hand-rolled
    SVG glyphs.
26. No Lucide, unless a glyph genuinely does not exist in Phosphor, in which case compose it
    from Phosphor primitives.
27. No stock photography, no illustrated mascot, no spot illustration, no hero image.
28. No coloured icon tiles in a settings list, and no chevron inside a circle.
29. No three-across grid of identical metric cards with an identical badge on each. The
    previous build's analytics screen is the reference for what not to do.
30. No progress bar with a filled grey track. Numbers, or a trace.
31. No line chart or gradient-filled area chart. Time series are drawn as waterlines.
32. No shimmer on a skeleton, no fake waveform in a skeleton, no spinner in a feed.
33. No stagger animation on list entry. No fade-and-slide-up on every section.
34. No infinite animation anywhere except the record lamp.
35. No confetti, no celebration, no streaks, no badges, no gamification of any kind.
36. No hover-only affordance. Every hover-revealed control is focusable and visible on touch.
37. No autoplay without a user gesture, anywhere (`mobile-guidelines.md` rule 32).
38. No optimistic UI on audio upload state (`mobile-guidelines.md` rule 37).
39. No placeholder-as-label, ever. No validation delivered as a toast.
40. No two calls to action on one screen that mean the same thing.
41. No generic names, no "Acme", no lorem-adjacent copy, no fake-round numbers. Example
    content is Turkish, specific and plausible.
42. No centred layout. The rail is the layout.
43. No `100vh`. `100dvh`, always (`mobile-guidelines.md` rule 50).
44. No new colour token without deleting one.

---

## 13. Notes on the source skills

This document reconciles four skills that disagree in places. Where they conflict, the
resolution is recorded here so it is not re-litigated:

- `soft-skill` calls for double-bezel nested containers, pill CTAs with a nested circular
  icon, `py-24` to `py-40` section padding and glass panels. Those are marketing-page moves
  for desktop. They are rejected here in favour of `frontend-design` and `taste-skill`, which
  ban pills-by-default, glass-by-default and eyebrow labels, and which match a mobile product
  UI. What is kept from `soft-skill`: custom cubic-bezier easing on everything, physical
  press feedback, no generic 1px grey borders, no harsh black shadows, and the demand that
  the result read as a build rather than a template.
- `redesign-skill` asks for subtle texture and tinted shadows: both adopted. It also
  suggests squircle avatars: adopted.
- `taste-skill` is scoped to landing pages and portfolios, so its section-layout and hero
  rules do not apply. Its AI-tell list, colour discipline, radius discipline, em-dash ban and
  copy self-audit do, and are folded into §12.
- `frontend-design`'s core instruction, that structural devices must encode information
  rather than decorate, is the rule this whole document is built on: the rail encodes
  authorship, the radius encodes role, the waterline encodes sound, and Signal encodes live.

## 14. Order of implementation

Highest visual return, lowest risk, first:

1. Swap the type: Archivo + Martian Mono, the scale in §3.3, and the four config items in §3.2.
2. Swap the palette in `globals.css`: the tokens in §4.2 and §4.3, and the semantic rules in
   §4.4. This alone removes the teal-on-everything reading.
3. Delete the card. `WaveCard.tsx` becomes a rail-hung item with a waterline separator.
4. Rebuild the waveform to §6 (bar geometry, states, mirroring, silence dots, edge fade).
5. Rebuild the keyboard: kill the raised FAB, adopt the ink Record key with a Signal lamp.
6. Radius pass and pill removal across `src/components/ui/*`.
7. Icons: Lucide to Phosphor, one weight.
8. Empty, loading and error states per §8.14 and §8.15.
9. Grain layer, press feedback, motion tokens.
10. Copy pass against §11.2 and §12.
