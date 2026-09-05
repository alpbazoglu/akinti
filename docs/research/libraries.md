# AKINTI — Library Evaluation (Sept 2026)

Evidence-based build-vs-buy for the audio-first web app. Stars/dates pulled live from the GitHub API on 2026-09-05. Current hand-rolled code: `src/lib/audio/recorder.ts` (MediaRecorder capture), `src/components/audio/Waveform.tsx` + `WavePlayer.tsx` (canvas waveform + `<audio>`), `src/lib/duet/ffmpegChain.ts` (ffmpeg presets), `src/components/audio/EnhancementPicker.tsx`.

## 1. Capture

| Option | Repo/stars | Last activity | License | Notes |
|---|---|---|---|---|
| Native `MediaRecorder` (current) | — | — | — | iOS Safari now emits `audio/mp4;codecs=alac\|pcm` in newer WebKit; still inconsistent across OS versions — biggest source of decode bugs |
| `extendable-media-recorder` + `-wav-encoder` | chrisguttandin, 354★ | pushed 2026-09-02 | MIT | Drop-in `MediaRecorder` polyfill that always emits WAV via a Worker/AudioWorklet encoder — sidesteps iOS mp4/opus variance entirely |
| `opus-recorder` | chris-rudmin | **unmaintained**, last tag 5 yrs ago | MIT | Author states WebCodecs replaces the need for it — do not adopt |
| `opus-media-recorder` | kbumsik | stale | MIT | Same category, less active than extendable-media-recorder |
| `recordrtc` | muaz-khan | maintenance-mode, large/legacy API | MIT | Bigger surface than needed; skip |
| `mic-check` | — | small utility | MIT | Thin `getUserMedia` permission wrapper — not worth a dependency, keep a 20-line hook |

**Recommendation:** keep native `MediaRecorder` as the fast path (Chrome/Android/desktop Safari), add `extendable-media-recorder` + `extendable-media-recorder-wav-encoder` as the **iOS fallback** so every client always uploads a decodable WAV/PCM container, removing today's ad-hoc mp4-sniffing in `recorder.ts`. Do not add `opus-recorder`/`opus-media-recorder` (unmaintained) or `recordrtc` (bloated). Skip `mic-check`.

## 2. Waveform & Player

| Option | Repo/stars | Last activity | License | Notes |
|---|---|---|---|---|
| **wavesurfer.js v7** | katspaugh, 10.4k★ | pushed 2026-09-03 | BSD-3 | TypeScript rewrite; official plugins: Regions, Record, Minimap, Spectrogram, Hover; ~40KB min |
| peaks.js (BBC) | bbc, 3.4k★ | pushed 2025-11 | Apache-2.0 | Built for scrubbing/editing precomputed `audiowaveform` peak files; heavier setup, aimed at editorial tools, not a social feed |
| audiomotion-analyzer | hvianna | active | MIT | Spectrum visualizer, not a scrub-able waveform player — complementary, not a replacement |
| react-audio-visualize | — | small, sparse commits | MIT | Thin wrapper, fewer features than wavesurfer |

**Recommendation:** adopt **wavesurfer.js v7**, replacing the hand-rolled canvas in `src/components/audio/Waveform.tsx` and native `<audio>` in `WavePlayer.tsx`. It gives peak caching, regions (trim UI), a Record plugin (could replace parts of `recorder.ts`'s visual layer), and Media Session integration for lock-screen controls for free. Keep server-side peak precomputation cheap by exporting wavesurfer's own JSON peaks format at upload time rather than adopting BBC's `audiowaveform` binary format — one less server binary to maintain since Section 4 already runs a Python sidecar that can emit peaks alongside DSP.

## 3. In-Browser DSP (instant "wow" preview)

| Option | Repo/stars | Notes |
|---|---|---|
| **pitchy** | ianprime0509, small, MIT | McLeod pitch method, pure JS, no WASM — good enough for a live tuning meter/countdown UI |
| CREPE/ml5 in-browser | — | TF.js model download (~MBs) for marginal accuracy gain over pitchy at capture time — not worth it for a live meter |
| **@sapphi-red/web-noise-suppressor** | sapphi-red, 88★ | pushed 2026-09-05 (today), MIT | RNNoise via WASM in an AudioWorklet, ~13ms latency, real repo activity — best client-side denoise-preview option |
| rnnoise-wasm (raw) | shiguredo | lower-level, less packaging | use only if sapphi-red's wrapper is insufficient |
| soundtouchjs (pitch/time-stretch) | cutterbl, actively rewritten (TS, MPL-2.0) | Real pitch-shift/formant-preserving stretch, but true "autotune" (key-aware snap) needs a pitch tracker + PSOLA on top — too much client CPU/complexity for a preview; the market-research doc already assigns real autotune to the server (§5 item 1) |
| tuna.js / native Web Audio nodes | — | `ConvolverNode` + `DynamicsCompressorNode` + `BiquadFilterNode` already ship in every browser | no library needed for a reverb/compressor "polish" preset |

**Recommendation:** ship a **default polish preview** using **native Web Audio nodes only** (convolver IR + compressor + EQ) — zero dependency, matches the market-research finding that a default-applied polish is the #1 retention driver. Add **pitchy** for a lightweight live pitch/tuning meter and recording countdown. Add **@sapphi-red/web-noise-suppressor** for an optional "reduce background noise" live preview toggle. Do **not** ship client-side autotune or a WASM loudness meter (`ebur128-wasm`/`needles`) yet — loudness normalization is cheap and more accurate server-side (Section 4); revisit only if users need a pre-upload level meter.

## 4. Server DSP (Node worker + Python sidecar)

| Tool | Repo/stars | Last activity | License | CPU note |
|---|---|---|---|---|
| **DeepFilterNet3** | Rikorose, 4.7k★ | pushed 2024-10 (library stable; LADSPA path active) | MIT/Apache-2 dual | RTF ~0.19 on a single i5-8250U core → ~35s to clean a 3-min clip; clearly beats RNNoise on PESQ/STOI for non-stationary noise |
| ffmpeg `arnndn` (RNNoise) | built into ffmpeg | — | GPL/BSD | Zero extra infra (already have ffmpeg in the worker), lower quality than DeepFilterNet3 but no Python sidecar needed — good fallback/cheap tier |
| **Matchering** | sergree, 2.6k★ | pushed 2026-07 | GPL-3.0 | One-tap reference-based mastering; GPL means it must run as an isolated process/service, not statically linked into proprietary code — fine as a sidecar call |
| Demucs (stems) | **facebookresearch/demucs is archived** (last push 2024-04); **adefossez/demucs fork is active** (pushed 2026-08-31), 3.2k★ | MIT | CPU-only: ~1.5× realtime → **~4.5 min to separate a 3-min clip on CPU**. Too slow/costly for a default path at 10k+ recordings/month; gate behind a premium "stems" feature or a GPU-backed queue, not the main pipeline |
| torchcrepe / librosa `pyin` | active | MIT (torchcrepe), ISC (librosa) | torchcrepe (CREPE-quality) is more accurate than pYIN but pYIN is pure-CPU/no-ML and much cheaper; use pYIN first for the "vocal coach" pitch score, fall back to torchcrepe only where pYIN confidence is low |
| audiowaveform (BBC) | bbc, 2.2k★ | pushed 2025-08; **dev moved to Codeberg** | GPL-3.0 | Not needed if wavesurfer's own peak export is adopted (see §2) — skip unless a non-JS consumer needs peaks |
| ffmpeg-normalize | active, v1.31 (2025) | MIT | Thin wrapper over ffmpeg's own `loudnorm`; **skip the pip package, call ffmpeg's EBU R128 filter directly** — one less Python dependency |

**Shape:** a small **FastAPI sidecar** next to the existing Node/ffmpeg worker, called over local HTTP/gRPC for DeepFilterNet3 cleanup, pYIN/torchcrepe scoring, and Matchering; ffmpeg (already present) keeps doing `arnndn` cheap-denoise and `loudnorm`. Keep Demucs opt-in/queued, not in the default pipeline, given the CPU cost above.

## 5. Frontend UI Infra

| Area | Pick | Repo/stars | Verdict |
|---|---|---|---|
| Motion | **motion (Framer Motion v12)**, 33.5k★, pushed 2026-09-02 | vs react-spring (29.1k★, smaller bundle ~19.5KB but no layout/gesture/exit-animation system) | Motion + `LazyMotion`/`domAnimation` gets bundle down to ~15KB while keeping layout animations and gestures — worth it for a "premium feel" mandate |
| Bottom sheet | **vaul**, 8.6k★ (last push 2025-10, slower cadence but stable/complete) | de facto standard, built on Radix Dialog | adopt for the recorder sheet / duet picker |
| Headless primitives | **keep Radix UI** (19.2k★) as default | Base UI (MUI, 10.8k★, daily commits) is the rising alternative since WorkOS slowed Radix cadence | not worth migrating yet; re-evaluate Base UI in 6 months if Radix stalls further |
| Command palette / toasts | **cmdk** (12.9k★) + **sonner** (12.9k★), both active | both are the shadcn-ecosystem standard | adopt |
| Carousel / virtualization | **embla-carousel** (8.4k★) + **@tanstack/react-virtual** (7.1k★), both pushed this week | needed once feeds/duet-chains get long | adopt for feed and duet-chain views |
| Forms | keep **react-hook-form + zod 4** (already a dependency) | — | no change |
| Icons | keep **lucide-react** (already installed, shadcn default) | Phosphor gives more personality via weights but a mid-build icon swap is pure churn | only swap if a redesign pass explicitly wants a distinct icon identity |

## 6. PWA & Mobile

| Option | Status | Verdict |
|---|---|---|
| **@serwist/next** | active (Workbox fork), 1.5k★ | next-pwa **and** its successor `@ducanh2912/next-pwa` both point users to Serwist — adopt Serwist directly, don't start on a package its own docs call deprecated |
| **idb-keyval** | 3.2k★, pushed 2026-07, tiny (~600B) | good enough for caching offline draft recordings (simple get/set) |
| Dexie.js | 14.5k★, very active | overkill unless offline sync needs queries/indexes across tables — revisit if an offline-first duet queue is built |
| Capacitor | active, growing among web teams | right "later native wrapper" for this Next.js app: wraps the existing PWA instead of a rewrite; **native audio-recording plugin maturity is the open risk** — no strong evidence found either way, budget a spike before committing |
| Expo/React Native Web | active, Meta-backed | Better path only if a from-scratch native app (not a wrapped PWA) is later approved — don't plan for it now |

**Recommendation:** PWA via Serwist + web-push for notifications; `idb-keyval` for offline drafts now, Dexie only if sync complexity grows; Capacitor is the pragmatic "wrap it" native path, gated on a short audio-plugin latency spike.

## 7. Payments (Turkish company)

| Option | Turkey fit | Notes |
|---|---|---|
| **Stripe** | **Not in Stripe's supported-country list** (46 countries, Turkey absent) | Direct TR incorporation cannot use Stripe; the "form a US entity" workaround adds real legal/tax overhead — not a real fix for a TR company |
| **iyzico** | TR-native, PCI-DSS L1, **iyzico Subscription product live since 2018** (recurring + dunning + MIT) | Best first-party fit for local cards + TRY pricing tiers called for in the market research (§3) |
| Shopier | TR-native, e-commerce-oriented | No strong evidence of first-class recurring billing; better for one-off sales than a subscription SaaS |
| **Paddle / Lemon Squeezy (MoR)** | Both handle VAT/e-invoice automatically as merchant of record | Useful as a **secondary rail for non-TR cards/international payers**, offloading VAT-registration pain; Lemon Squeezy simpler to integrate, Paddle stronger subscription/dunning tooling at scale |
| RevenueCat Web Billing | **Still in beta** as of mid-2026 | Not mature enough to be the primary web rail today; keep on the roadmap for cross-platform entitlement sync if/when a native app ships |

**Recommendation:** **iyzico as primary** (TRY pricing, local cards, subscriptions, KVKK-friendly local presence) + **Paddle or Lemon Squeezy as a secondary MoR rail** for international cards, deferring Stripe entirely and RevenueCat Web Billing until it exits beta. Confirm MESAM/MÜYORBİR licensing (already flagged in the market doc) is independent of the payment rail choice.

## 8. Quality Tooling

| Area | Pick | Notes |
|---|---|---|
| E2E + media | **Playwright** (already a dependency) with `--use-fake-device-for-media-stream` + `--use-file-for-fake-audio-capture` launch args | no new dependency — just add the fixture flags to unlock automated recorder/duet flow testing |
| Accessibility | `@axe-core/playwright` | thin, well-maintained (dequelabs, 721★, active) — add as a devDependency, run in CI |
| Component workshop | **skip full Storybook** (91k★ but heavy: ~8s cold start, real infra overhead) for a **project `/kit` page** | current team size doesn't justify Storybook's addon ecosystem yet; revisit if a design-system team forms |
| Visual regression | **Argos CI** (open source, self-hostable, free to 5,000 screenshots/mo) over Chromatic ($179/mo) | budget-appropriate at this stage; runs against the existing Playwright suite instead of requiring Storybook |
| Error tracking | **@sentry/nextjs**, active | Next 16 + Turbopack: source-map upload works for `next build` but **Turbopack production builds have known source-map upload caveats** — verify sourcemaps land correctly in a staging deploy before relying on them |
| Product analytics | **PostHog (EU-hosted region)** over Plausible | app needs event-level analytics/feature flags/session-level product data (not just pageviews); EU hosting reduces cross-border transfer complexity relevant to KVKK, though it doesn't by itself guarantee compliance — pair with a KVKK-compliant aydınlatma metni |

---

## Proposed `package.json` delta

```jsonc
// dependencies — add
"extendable-media-recorder": "^9.5.0",
"extendable-media-recorder-wav-encoder": "^7.0.140",
"wavesurfer.js": "^7.7.8",
"pitchy": "^4.1.0",
"@sapphi-red/web-noise-suppressor": "^0.4.4",
"motion": "^12.x",
"vaul": "^1.1.2",
"cmdk": "^1.1.1",
"sonner": "^2.x",
"embla-carousel-react": "^8.5.2",
"@tanstack/react-virtual": "^3.10.9",
"idb-keyval": "^6.2.1",
"@serwist/next": "^9.x",
"posthog-js": "^1.x",
"@sentry/nextjs": "^9.x",

// devDependencies — add
"serwist": "^9.x",
"@axe-core/playwright": "^4.10.1",
"argos-cli": "^3.x"

// remove — none today (all hand-rolled); once migrated, delete the custom
// canvas waveform logic in src/components/audio/Waveform.tsx and the
// mp4-sniffing branch in src/lib/audio/recorder.ts (keep the recorder's
// permission/error-handling code, it isn't replaced by any library above)
```

## Proposed sidecar `requirements.txt`

```
fastapi>=0.115
uvicorn[standard]>=0.32
deepfilternet>=0.5.6      # DeepFilterNet3 cleanup
matchering>=2.0.6         # one-tap mastering (GPL-3.0 — isolate as its own service)
librosa>=0.10             # pYIN pitch scoring
torchcrepe>=0.0.23        # fallback pitch tracker where pYIN confidence is low
torch>=2.4                # torchcrepe dependency (CPU build)
demucs @ git+https://github.com/adefossez/demucs   # opt-in stems only; archived facebookresearch fork must NOT be used
pyworld>=0.3.4            # PSOLA-based pitch snap (per market-research §5 item 1)
```

---
*Sources: live GitHub API queries (stars/pushed_at/archived flags, 2026-09-05) plus WebSearch results from npm, GitHub, and vendor docs cited inline above.*
