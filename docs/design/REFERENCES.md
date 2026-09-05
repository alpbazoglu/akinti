# AKINTI - Design References

What the visual language in `DESIGN.md` borrows from, what it deliberately refuses, and the
component sources checked during the pass. Research window September 2026; sources are
2024-2026 unless noted.

Local screenshots referenced below live in `docs/design/refs/` and were captured with
`scripts/capture-design-refs.mjs` (an isolated Playwright script, not the shared MCP browser).

---

## 1. Audio and creator products

### Teenage Engineering
`https://teenage.engineering/` · `docs/design/refs/ref-02-teenage-engineering.png`
`https://teenage.engineering/products/tp-7` · `ref-03-teenage-engineering-op1.png`

The closest reference in the set, and the one AKINTI is most in lineage with.

- **Borrow** the ground: their site is a near-white paper (`#E5E5E5` canvas, `#F0F0EF`
  surface) with black ink and a single accent, not a dark theme. Most people copying TE copy
  the orange-on-black hardware; the site itself is mostly greyscale, and that is the
  underrated move.
- **Borrow** the record-lamp convention. The TP-7 has no red button. It has a neutral memo
  button and a **"bright red record lamp"**. Status is a light; the control is neutral. This
  is the direct source of AKINTI's record key (ink field, Signal dot) and of the inversion on
  recording.
- **Borrow** technical labelling as texture: product codes and version numbers set in mono
  alongside display type, carrying real information (`EP-133  2.5`).
- **Borrow** the lowercase, left-hung wordmark and the refusal to centre anything.
- **Avoid** the orange-on-black knock-off aesthetic, which has been done to death since about
  2022. AKINTI's Signal sits on paper, not on black.
- **Avoid** their `border-radius: 0` absolutism. AKINTI needs corners to read as touchable.

### Endel
`https://endel.io/` · `docs/design/refs/ref-01-endel.png`
`https://blog.readymag.com/tune-in-drop-out-how-endel-helps-get-into-the-flow-via-immersive-soundscapes-5ab08d932687/`
`https://ixd.prattsi.org/2026/02/design-critique-endel-ios-app/`

- **Borrow** the idea that an audio product does not need a literal waveform to read as
  audio. Endel builds "semi-generative animated visualization, symbolically representing the
  theme of the soundscape", drawing on avant-garde graphic music notation. AKINTI keeps the
  waveform as the *scrub instrument* but takes from this the confidence to let one abstract
  mark carry brand.
- **Borrow** the discipline of a strictly monochrome palette where the only variance is
  lightness.
- **Avoid** the failure their own published critique names: on the soundscape screen the
  primary controls are "significantly smaller and less visually prominent" than the ambience,
  and there is no visible close affordance. This is the exact trap a quiet aesthetic invites,
  and it is why `DESIGN.md` §12 rule 10 exists.
- **Correction to the brief:** no "2024-2026 Endel brand refresh" exists. The identity has
  been consistent and is authored by CDO and artist Protey Temen. Palette is pure `#000000`
  with `#FFFFFF` and `#6F6F6F`, type is Roboto at 400.

### Ableton Note and Ableton Move
`https://www.ableton.com/en/note/` · `docs/design/refs/ref-04-ableton-note.png`
`https://www.ableton.com/en/move/manual/` · `https://www.soundonsound.com/reviews/ableton-note`

- **Borrow, and this is the best density trick in the whole survey:** Note only shows MIDI
  lanes that actually have notes on them. Empty is *absent*, not greyed. AKINTI applies this
  to counts (print only non-zero metrics) and to the Duet lineage strip (present only when
  there is lineage).
- **Borrow** Move's LED state grammar, which expresses four states with zero iconography:
  coloured means has content, **pulsing means currently selected**, unlit means empty, white
  means empty-and-selected. This is the source of AKINTI's armed / recording distinction and
  of the outline-versus-fill icon rule.
- **Borrow** the stated method: decide what people will really do with spare time on a phone,
  then design only those interactions well.
- **Avoid** the grey industrial Push-derivative chrome. It is hardware styling on a screen.

### Koala Sampler
`https://www.koalasampler.com/` · `docs/design/refs/ref-05-koala-sampler.png`
`https://www.synthtalk.net/articles/marek-bereza-creator-of-the-koala-sampler`

The single most useful principle in this document comes from here.

- **Borrow the principle, not the look: pick a rendering rule, not a palette.** Marek Bereza
  deliberately built Koala on an orthographic projection "so it didn't look like other apps or
  a website". A drawing system cannot be reproduced from a prompt; a colour scheme can. For
  AKINTI the rendering rule is the waterline and its size-dependent geometry.
- **Borrow** his willingness to accept a cost: "the aesthetic is not everyone's cup of tea
  and I don't really even like it either. I just wanted to make something that is not this or
  not that." Differentiation was valued above likeability.
- **Avoid** Koala's actual palette (dark slate-green ground, hot pink) and its density; the
  2026 read is that its minimal UI is hitting a depth wall.

### SoundCloud
`https://soundcloud.com/discover` · `docs/design/refs/ref-10-soundcloud.png`
`https://rudigermeyer.com/words/waveforms` · `https://developers.soundcloud.com/blog/ios-waveform-rendering/`

SoundCloud invented the modern web waveform, in the November 2011 HTML5 player. Everything
about the bar-waveform convention traces back to it.

- **Borrow** the two craft details that separate a designed mirrored waveform from a
  CSS-default one: **mirror at the exact midpoint**, and **shade the bottom half less**.
  AKINTI renders the lower half at 70% alpha.
- **Borrow** the rendering technique: the played/unplayed split is a **clipped two-layer
  alpha mask, not per-bar recolouring**. SoundCloud went from 17 FPS to 60 FPS at under 20%
  GPU with this. On mobile web it is the difference between smooth scrubbing and jank.
- **Borrow** the framing that on the web a waveform "serves more as an overview, as a form of
  navigation" rather than as an editing instrument. Design it for scrubbing.
- **Avoid** the orange. SoundCloud orange has been their whole visual equity since 2010, and
  a warm accent on an audio app risks reading as an imitation. AKINTI's Signal is a redder,
  darker vermilion applied under a much narrower rule.
- **Correction to the brief:** no official 2025 SoundCloud rebrand or app redesign exists.
  Real 2025 changes were a revamped homepage, the "SoundCloud for Artists" renaming, and
  custom app icons. Everything else surfaced was student or portfolio work.

### Apple Voice Memos and Apple Music
`https://support.apple.com/en-mo/guide/voice-memos/vma2c8c0a040/3.0/mac/15.0`
`https://techwiser.com/apple-voice-memo-icons-and-symbols-meaning-complete-guide/`
`https://en.wikipedia.org/wiki/Liquid_Glass`

- **Borrow** silence as a distinct mark: Voice Memos draws flat lines or a series of **dots**
  where audio is absent, rather than short bars. A two-hour detail that reads instantly as
  considered. Adopted in `DESIGN.md` §6.1.
- **Borrow** the two-density model, an overview trace plus a detail trace, coexisting on one
  screen. AKINTI's mini strip plus detail player is the same idea.
- **Avoid** Liquid Glass over audio content. Apple shipped translucency at OS scale and had
  to walk it back: readability suffered in high-contrast conditions, and they responded by
  increasing opacity in navigation bars and adding a user transparency slider. Glass over a
  live waveform is the worst legibility combination available.
- **Avoid** Apple Music's album-art-derived dynamic gradients. AKINTI has no album art and
  should not invent any.

### Airchat
`https://alexdebecker.substack.com/p/product-teardown-airchat` · `https://techcrunch.com/2024/04/13/airchat-launch/`

The closest product analogue, and it makes one surprising choice.

- **Borrow** the nerve to be **light, not dark**. Airchat is "very white" with animated
  colour around profile pictures. An audio app is not obliged to be a black void.
- **Borrow** haptics doing the work animation usually does: the app "lightly vibrat[es] as
  you move from message to message". Motion competes with listening; haptics do not. This is
  the source of `DESIGN.md` §7.2's haptics rule.
- **Borrow** the small craft touch of replacing a generic reply icon with the recipient's
  avatar, so you can see who you are addressing.
- **Note, before treating it as a waveform reference:** Airchat has no waveform and no
  visualiser at all. Its audio-state visual is the animated avatar halo.
- **Avoid** the Stories-style vertical bubble feed. It is generic, they knew it, and they
  used it as a familiar frame to buy permission for the weird part.

### Suno
`https://suno.com/` (capture timed out; `ref-09-suno.png` is a partial) · `https://www.designmd.co/d/suno-com`

- **Borrow** the contrarian choice of a **light theme for an audio/AI product**, on a warm
  off-white surface (`#f7f4ef`) rather than a pure grey.
- **Borrow** the **2px spacing increment** instead of the default 8pt grid. Perfect 8pt
  adherence with no intentional deviation is itself a documented generated-UI tell. AKINTI
  uses a 4px base with deliberately asymmetric vertical padding for the same reason.
- **Avoid** the card grid of square artwork, which is indistinguishable from every other AI
  media tool.
- Values are scraped from live CSS by a third party, so treat as directional.

### BandLab and Voloco
`https://www.bandlab.com/` · `docs/design/refs/ref-11-bandlab.png`
`https://ixd.prattsi.org/2025/09/design-critique-bandlab-music-making-studio-mobile/`

Primarily a negative reference: this is what mass-market audio-creation apps look like, and
looking unlike them is most of the premium signal.

- **Avoid, specifically:** BandLab's "Open Studio" icon is "a series of vertical lines that
  serves as a poor attempt at skeuomorphic design, making it difficult to tell what the image
  means". This is the exact trap AKINTI faces. Hence the rule: **a waveform is a display,
  never an icon.** Record is a filled circle. Create is a plus.
- **Avoid** a core action that floats and collapses on scroll.
- **Borrow** one thing from BandLab: a two-colour semantic system where red means create and
  yellow means locked. AKINTI reduces this to one colour with one meaning, but the discipline
  of *a colour means exactly one thing* is the same.

### Spotify 2025
`https://www.creativebloq.com/web-design/ux-ui/spotifys-latest-ui-design-change-is-driving-people-crazy`
`https://www.phonearena.com/news/spotify-repeat-button-now-playing-screen-app-update_id114354`

- **Avoid** promoting a Create entry point above the thing people open the app to do.
  Spotify's Create button displaced library access and drew what Creative Bloq called possibly
  "one of the most unpopular UI design changes of the year"; parts were later reversed. Given
  AKINTI's record-first premise, the Record affordance must be *available* without becoming
  the navigational centre of gravity. It is a peer key on the bar, not a raised FAB.
- **Avoid** dark-first as a differentiator. Spotify claims dark-mode heritage "long before
  dark mode became popular", which is exactly why dark is not distinguishing.
- **Borrow** their stated principle verbatim: lean away from chasing trends while staying
  culturally fluent.

---

## 2. Premium consumer products

### Linear
`https://linear.app/` · `docs/design/refs/ref-06-linear.png`
`https://linear.app/now/how-we-redesigned-the-linear-ui`

- **Borrow** the radius discipline, which is the single most transferable idea here: Linear
  runs **2 / 4 / 6 / 8 / 12 / 22 / 9999px**, differentiated by element size and function. A
  uniform 12px or 16px across buttons, cards, inputs, avatars and modals is the most-cited
  generated-UI signature. AKINTI's `0 / 2 / 6 / 10 / 14 / 16 / 24` ladder is this idea applied
  to a different brief.
- **Borrow** the token reduction: they collapsed 98 theme variables to three (base, accent,
  contrast) and got high-contrast accessibility themes for free. AKINTI's rule that a new
  colour token requires deleting one comes from here.
- **Borrow** LCH thinking about perceptual uniformity when tuning the grey ladder.
- **Borrow** ~200ms ease-out as the standard interaction duration.
- **Avoid** the indigo and violet accents (`#5e6ad2`, `#7170ff`), the near-black `#08090a`
  ground, and Inter as the face. All three are precisely what AKINTI is avoiding.

### Cosmos
`https://www.cosmos.so/` · `docs/design/refs/ref-07-cosmos.png`
`https://styles.refero.design/style/eb804e3a-1b75-446c-8374-114bbabaf0cd`

The closest reference for a social product with no likes.

- **Borrow** the product stance: no like counts, no public comments, no aggressive
  notification pings, as an explicit response to attention-economy fatigue. AKINTI's no-likes
  rule is the same argument, and the design should look like it means it.
- **Borrow** letter-spacing that scales with size and reaches exactly `0` at 14 and 15px
  (-0.05em at 74px, -0.04em at 38px, -0.02em at 24px, -0.011em at 18px, 0 at 14px). AKINTI's
  tracking ladder in §3.3 follows this shape.
- **Borrow** the section-gap discipline: 4px base unit, but an **80px section gap** that
  breaks the default cadence.
- **Borrow** hero copy set at **weight 350**, "editorial softness rather than marketing
  aggression". AKINTI's equivalent is capping the family at 600 and refusing 700.
- **Avoid** the warm linen ground (`#f7f5f3`). It is beautiful and it is one step from the
  cream-plus-serif palette that flipped from "human" to "obviously generated" during 2025.
  AKINTI's paper is greener and greyer for exactly this reason.

### Family
`https://family.co/` · `docs/design/refs/ref-12-family.png`
`https://60fps.design/apps/family` · `https://benji.org/family-values`

- **Borrow** the motion philosophy: **morph, do not fade.** Their catalogued interactions are
  almost entirely morphs (button to sheet, sheet to sheet, label transformations), where
  motion *explains* the state change. This is the source of AKINTI's rule that the five record
  states are one screen that transforms in place.
- **Borrow** "every tiny motion earns its place" and the dynamic-tray approach to progressive
  disclosure.
- **Avoid** the pill-shaped everything and the colourful object illustrations. Charming for a
  wallet, wrong for an instrument.

### Arc
`https://arc.net/` · `https://blakecrosley.com/guides/design/arc`

- **Borrow** the idea that a user-chosen colour can be identity, constrained to a set that
  cannot look bad. AKINTI's equivalent is the generated profile signature: personal, unique,
  and impossible to make ugly because it is derived from real data rather than picked.
- **Avoid** the frosted glass, the saturated gradient blooms, and the warm cream ground
  (`#fdf3ec`).

### Are.na
`https://www.are.na/` · `docs/design/refs/ref-08-arena.png`
`https://www.setproduct.com/blog/retro-brutalist-ui-design-2026`

- **Borrow** the credibility of being "proudly unpolished", dense and utilitarian, "handmade
  in a way algorithmic feeds stopped feeling years ago". AKINTI's hairlines, rail and refusal
  of cards come from the same instinct.
- **Avoid** the brutalist end of it. AKINTI is precise, not raw; it wants warmth and grain,
  not `border-radius: 0` and 2px hard borders.

---

## 3. On what makes an app look generated

`https://medium.com/design-bootcamp/why-every-ai-generated-app-looks-same-51a9459055ae`
`https://www.explainx.ai/blog/ai-aesthetic-design-patterns-jim-nielsen-2026`
`https://buildthedamnthing.com/resources/articles/design-tips-to-make-your-vibe-coded-app`
`https://www.925studios.co/blog/ai-slop-design-tells`
`https://news.ycombinator.com/item?id=47865795`
`https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it`

The named tells, all of which `DESIGN.md` §12 answers directly:

| Tell | AKINTI's answer |
|---|---|
| One radius (12px or 16px) on every element | Radius encodes role: `0 / 2 / 6 / 10 / 14 / 16 / 24`, plus `0.295 x side` for keys |
| `#0A0A0A` ground with `rgba(255,255,255,0.1)` borders | Warm graphite `#131412` with solid hairline tokens |
| Indigo to violet gradients, traceable to Tailwind's `indigo-500` default | No gradients at all except a 24px edge fade on a trace |
| Cream and orange with a serif display face | Green-grey paper, no serif, Signal restricted to audio state |
| The sparkle icon as an AI or magic signifier | No sparkle, no emoji-as-icon |
| Perfect 8pt-grid adherence with no intentional deviation | 4px base with deliberately asymmetric vertical padding (20 above, 24 below) |
| Inter everywhere, unchosen | Archivo, with the rejection reasoning written down in §3.1 |
| Rounded corners **and** drop shadows together | Level 0 has radius and no shadow; only sheets have both |
| Glassmorphism panels | None, anywhere |
| Centred-everything with no asymmetry | Everything is left-hung on a 44px rail |
| Identical gradients repeated across layouts | No gradients |
| Zero film grain in imagery | A 3% fixed grain layer |
| Three identical feature cards in a row | No cards, and no three-across metric grid |

The root-cause framing worth keeping: "the same optimization pressure that makes an LLM
reliable, converge on the statistically likely, well-tested pattern, actively works against
visual differentiation."

Also folded in from `docs/research/mobile-guidelines.md` §5: Adam Wathan's August 2025 apology
for `bg-indigo-500` becoming Tailwind UI's default and seeding the indigo-purple saturation,
and the 60-rule checklist that constrains onboarding, permissions, recording, playback,
performance and PWA behaviour.

---

## 4. Waveform conventions, consolidated

Sources: `https://rudigermeyer.com/words/waveforms`,
`https://ui.elevenlabs.io/docs/components/waveform`,
`https://developers.soundcloud.com/blog/ios-waveform-rendering/`,
`https://github.com/coder/mux/pull/862`,
`https://www.framer.com/community/marketplace/components/audio-waveform/`

| Convention | Industry practice | AKINTI |
|---|---|---|
| Bar width | wavesurfer default 1px; SoundCloud 2px; ElevenLabs UI ships `barWidth: 4` | 2px below 40px tall, 3px at 40px and above |
| Gap | ElevenLabs `barGap: 2` | 1px small, 2px large |
| Cap radius | ElevenLabs `barRadius: 2`; rounded caps common across iOS dictation, iMessage audio, Megaphone | 0 below 40px, 1px above. Never fully rounded |
| Mirroring | SoundCloud mirrors at the exact midpoint with the bottom half shaded less | Mirrored at 40px and above, bottom half at 70% alpha; single-sided below |
| Edge fade | ElevenLabs `fadeEdges: true`, `fadeWidth: 24` | 24px, both ends, full-bleed traces only |
| Silence | Apple Voice Memos draws dots or a flat line | 2px square dots on the centre line |
| Live recording | 10-second sliding window, new samples on the right, using RMS rather than peak | Same |
| Played / unplayed | SoundCloud uses a clipped two-layer alpha mask | Same |
| Playhead | Apple uses a line with dots at each end | 2px ink line with a square write-head cap at the top |
| Style choice | No UX research establishes mirrored or bar as superior; it is stylistic | Size-dependent rule, so the choice is systematic rather than taste |

---

## 5. Record button lineage

`https://teenage.engineering/products/tp-7` · `https://forum.ableton.com/viewtopic.php?t=7183`
`https://www.quora.com/Why-is-the-record-button-on-any-recording-device-identified-by-the-red-dot`

The red circle is a **safety convention, not an aesthetic one**. Recording was a
non-reversible operation, so it got a different shape (a circle, the one left after the
triangle, square and double bar were taken) and a warning colour.

Two traditions, and AKINTI takes the second:

1. **Consumer:** the control itself is red at rest. Logic turns the whole "R" button red when
   armed; most phone apps fill the button red permanently.
2. **Instrument:** the control is neutral and a **lamp** shows state. The TP-7 has a "bright
   red record lamp" and a neutral memo button. Ableton's transport shows a circle in a square
   whose *fill* signals armed.

AKINTI: ink key, Signal dot. Armed adds a 1px Signal ring. Recording inverts the whole key to
a Signal field with an ink square. Arm state and record state are visually distinct, which the
consumer tradition usually collapses.

---

## 6. Typography sources

`https://fonts.google.com/metadata/fonts` (axes, subsets, popularity, queried 2026-09-05)
`https://ateliertriay.github.io/bricolage/` · `https://fontsinuse.com/typefaces/219916/instrument-sans`
`https://elementtype.co/host-grotesk/` · `https://etceteratype.co/pages/anybody`
`https://developer.mozilla.org/en-US/docs/Web/CSS/text-transform`
`https://www.typewolf.com/google-fonts` · `https://news.ycombinator.com/item?id=47865795`

Findings that changed the decision, verified against the font binaries Google actually serves
rather than against specimen pages:

- **Turkish coverage is not a differentiator.** All 36 families examined cover all twelve
  Turkish characters. The real failure is a config one: omitting `latin-ext` from
  `next/font/google` makes Turkish words containing ı, ğ or ş fall back mid-word.
- **Google's subsetter strips every `ssXX` and `cvXX` feature.** Geist's alternate numerals,
  Inter's disambiguation set, Space Grotesk's ss01-ss05 and Onest's alternates are all
  unreachable through `next/font/google`. `tnum` survives.
- **Fraunces and Instrument Serif have no working tabular figures at all.** For a product
  whose primary UI object is `0:14`, that is disqualifying before taste enters it.
- **Golos Text's `tnum` is broken**: the lookups exist but do not equalise digit widths.
- **Archivo widens 28.4% from weight 100 to 900.** Never animate weight in place.
- **Martian Mono's `İ` reaches 105% of em, above its own ascender.** Turkish capitals clip.
  Harmless here because the mono is numerals-only, and that restriction is now a rule.
- **Host Grotesk is uniwidth**, a string measuring identically at weight 300 and 800, with
  permanently tabular digits, drawn in İstanbul by Doğukan Karapınar at Element Type. It is
  the documented fallback if Archivo Expanded tests badly on Turkish display strings.
- The named 2026 "slop fonts" list is **Space Grotesk, Instrument Serif, Geist, Syne,
  Fraunces**. Geist is the current AKINTI face and Space Grotesk is the obvious upgrade from
  it; both are on the same list. Families with real character and no slop-list presence:
  Archivo, Public Sans, Anybody, Familjen Grotesk, Host Grotesk, Newsreader, Schibsted
  Grotesk, Martian Mono, DM Mono.

---

## 7. Component references (21st.dev)

Checked for structure and interaction patterns, not for visual style. **None of these ship as
written.** Every one carries at least one pattern `DESIGN.md` bans, most often a uniform
radius, a rounded-cap equalizer graphic, a glow, or a centred icon-in-a-circle empty state.

| # | Component | id | URL | Use |
|---|---|---|---|---|
| 1 | WaveformPlayer (ruixen.ui) | `7978` | https://21st.dev/@ruixen.ui/components/waveform-player | Closest to the AKINTI inline player: click or drag anywhere on the trace to seek, light and dark aware. **Borrow** the seek model. **Avoid** its uniform bar rounding and its equal bar heights. |
| 2 | Live Waveform (ElevenLabs) | `8600` | https://21st.dev/@ElevenLabs-crawled/components/live-waveform | Reference for the recording state and the sliding-window trace. Their published defaults (`barWidth 4`, `barGap 2`, `barRadius 2`, `fadeEdges`, `fadeWidth 24`) are the industry baseline AKINTI deviates from deliberately. |
| 3 | Audio Player (ElevenLabs) | `8598` | https://21st.dev/@ElevenLabs-crawled/components/audio-player | Transport layout and keyboard handling. **Avoid** the card wrapper. |
| 4 | Waveform (thegridcn) | `18483` | https://21st.dev/@thegridcn/components/waveform | Included as a **negative** reference: pulsing bars, glow, scanline overlay and corner brackets. This is precisely the decorated-waveform direction `DESIGN.md` §6 forbids. |
| 5 | Signal Bars Loader (elements-) | `24461` | https://21st.dev/@elements-/components/loader-signal-bars | Considered and rejected for skeletons. AKINTI's audio skeleton is a flat 6px waterline, never an animated equalizer, because a fake waveform in a loading state is a lie about the content. |
| 6 | Magnetic Drawer (animbits) | `19360` | https://21st.dev/@animbits/components/specials-magnetic-drawer | Physics-based bottom drawer with configurable magnetic snap points and spring animation. **Borrow** the snap-point model for the Duet request sheet. Ship on `vaul` (see `libraries.md` §5) rather than this. |
| 7 | Drawer (coss.com) | `11442` | https://21st.dev/@coss.com/components/drawer | Swipe gestures, snap points, nested drawers, four positions. Reference for nested-sheet behaviour on the Duet flow. |
| 8 | Sheet, different directions (shadcnspace) | `25002` | https://21st.dev/@shadcnspace/components/sheet-01 | Header, body, footer-action structure for a sheet with a form in it (the Duet request). |
| 9 | Bottom Nav Bar (arunachalam) | `8343` | https://21st.dev/@arunachalam/components/bottom-nav-bar | Sticky bottom bar with per-tab label transitions. **Avoid** its pill-style active state, which is exactly the treatment AKINTI replaces with a filled glyph. |
| 10 | Animated Tab Bar (abxlfazl__) | `4669` | https://21st.dev/@abxlfazl__/components/animated-tab-bar | Active-indicator mechanics. **Avoid** the moving indicator; AKINTI's active state does not travel. |
| 11 | Empty State with Marquee (shadcnui-blocks) | `19377` | https://21st.dev/@shadcnui-blocks/components/empty-state-04 | The one empty-state reference that gets the principle right: it shows skeleton rows of the thing that will appear, rather than an icon. AKINTI goes further and shows three real playing Waves. |
| 12 | Empty (cnippet.dev) | `19745` | https://21st.dev/@cnippet.dev/components/cnippet-empty | Composable empty-state parts (media, title, description, content). **Avoid** its stacked icon variant, which is the icon-in-a-circle pattern. |
| 13 | Voice Recording (erikvalencia1) | `8472` | https://21st.dev/@erikvalencia1/components/voice-recording | Recording-state layout with a live visualiser and timer. |
| 14 | AI Voice Input (kokonutd) | `1451` | https://21st.dev/@kokonutd/components/ai-voice-input | Recording timer plus visualiser with start and stop callbacks. **Avoid** the name and the framing; AKINTI's recorder is not an AI affordance and must never carry that vocabulary. |
| 15 | Onboarding Steps Carousel (cnippet.dev) | `19097` | https://21st.dev/@cnippet.dev/components/v-carousel-8 | Three-step structure with a progress bar. **Borrow** the progress-bar-over-dots decision. AKINTI draws the bar as a three-segment waterline. |
| 16 | Onboarding Dialog (patrick-xin) | `10480` | https://21st.dev/@patrick-xin/components/onboarding-dialog | Embla plus Motion cross-fading step content. Useful for the swipe mechanics of onboarding. **Avoid** the animated progress dots. |

Infrastructure choices remain as recorded in `docs/research/libraries.md` §5: `wavesurfer.js`
v7 for the trace, `motion` for animation, `vaul` for sheets, `sonner` for toasts, Radix for
primitives, plus the icon swap from `lucide-react` to `@phosphor-icons/react` that this pass
authorises.

---

## 8. Local capture set

| File | Source | Why it is here |
|---|---|---|
| `ref-01-endel.png` | endel.io | Monochrome discipline, non-literal audio mark |
| `ref-02-teenage-engineering.png` | teenage.engineering | Paper ground, single accent, technical labelling |
| `ref-03-teenage-engineering-op1.png` | OP-1 field | Key geometry, corner curvature, lamp-not-button |
| `ref-04-ableton-note.png` | ableton.com/en/note | Single acid accent on black and white, photography as the only image |
| `ref-05-koala-sampler.png` | koalasampler.com | A rendering rule as identity; also a warning about density |
| `ref-06-linear.png` | linear.app | Radius ladder, token discipline, 200ms standard |
| `ref-07-cosmos.png` | cosmos.so | No-likes social surface, tracking that scales with size |
| `ref-08-arena.png` | are.na | Unpolished credibility, information over aesthetics |
| `ref-09-suno.png` | suno.com (partial, capture timed out) | Light theme for an audio product, 2px grid |
| `ref-10-soundcloud.png` | soundcloud.com/discover, mobile viewport | The origin of the bar waveform; the accent to avoid |
| `ref-11-bandlab.png` | bandlab.com, mobile viewport | Negative reference for mass-market audio UI |
| `ref-12-family.png` | family.co, mobile viewport | Morph-not-fade motion; also the pill treatment to avoid |
| `current-explore-mobile.png`, `current-explore-desktop.png`, `current-kit-mobile.png` | The build being replaced | The tells, in situ |

Sixty-two further screenshots of the current build are in `docs/research/ux-audit/`.
