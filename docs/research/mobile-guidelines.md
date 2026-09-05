# Mobile Guidelines for AKINTI (2025–2026 Ground Truth)

Audio-first, mobile-first PWA on Next.js 16 + Supabase. No likes. Record/upload voice & songs, collaborative Duets. This doc is the standing reference for UX, platform, performance, and taste decisions.

## 1. How Great Mobile Apps Are Built (2025–2026)

**Onboarding.** Apple's HIG explicitly favors teaching through doing over screens: "If onboarding is necessary, design a flow that's fast, fun, and optional," and prefers contextual tips over a single flow ([Apple HIG, Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding), accessed 2026). NN/g goes further — their research on "deck-of-cards" tutorials found they don't improve task performance, and recommends avoiding onboarding flows in favor of making the UI self-evident, reserving onboarding-like structure mainly for content personalization ([NN/g, Mobile-App Onboarding](https://www.nngroup.com/articles/mobile-app-onboarding/), 2025). **Rule: 3 screens max, skippable from screen 1, no screen without a real action.**

**Permission priming.** Both Apple and Google converge: never request mic/camera/location at launch. Ask in-context, right when the feature is used, so users understand the "why" ([Apple HIG](https://developer.apple.com/design/human-interface-guidelines/onboarding); [Dogtown Media, Mobile Permission Requests](https://www.dogtownmedia.com/the-ask-when-and-how-to-request-mobile-app-permissions-camera-location-contacts/), 2025). For AKINTI: request mic access only when the user taps Record, with a one-line pre-prompt ("We need your mic to record — nothing is uploaded until you save") shown before the native browser dialog fires.

**Navigation.** Bottom tabs have won: Airbnb's own testing showed 40% faster task completion with a 5-item bottom bar vs. a hamburger menu; 49% of users navigate one-thumb ([UXPin / Mobbin research summarized in Design Studio UI/UX](https://www.designstudiouiux.com/blog/mobile-navigation-ux/), 2025). Keep 3–5 destinations, labels always visible, no more than 5 items ([Mobbin, Tab Bar glossary](https://mobbin.com/glossary/tab-bar), 2025).

**Thumb zones.** The bottom two-thirds of the screen is the "easy" zone; top corners are "hard." On screens >6.5", critical actions must live in the lower two-thirds ([Timothy Graf, Designing for the Thumb Zone](https://timgraf.com/ux-design/designing-for-the-thumb-zone-a-modern-guide-to-mobile-ux-that-respects-human-anatomy/), 2025–2026). AKINTI's record button, Duet-join CTA, and playback scrubber must all sit in this zone — never top app-bar buttons for primary actions.

**Gestures.** Match platform norms exactly: iOS edge-swipe = back, Android system back-gesture. Don't hijack edge-swipe for anything else — conflicting gestures are the #1 cause of confusion ([Sidekick Interactive, Gesture Navigation in Mobile Apps](https://www.sidekickinteractive.com/designing-your-app/gesture-navigation-in-mobile-apps-best-practices/), 2025).

**Haptics.** Use OS default haptics for standard success/error/selection events; reserve custom patterns for a few high-value brand moments (e.g., successful Duet merge). Less is more — over-vibrating trains users to disable haptics entirely ([Saropa, 2025 Guide to Haptics](https://saropa.com/articles/2025-guide-to-haptics-enhancing-mobile-ux-with-tactile-feedback); [Android Developers, Haptics design principles](https://developer.android.com/develop/ui/views/haptics/haptics-principles), 2025).

**Loading states.** Skeletons beat spinners for perceived speed: users rate skeleton-loaded pages ~30% faster than identical spinner-loaded pages, and skeletons cut bounce by 9–20% ([LogRocket, Skeleton loading screen design](https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/), 2025). Use spinners only for short, bounded actions (saving a title, submitting a comment); use skeletons for feeds, profile grids, and Duet lists.

**Optimistic UI.** Apply it to low-risk, reversible actions (posting a comment, following someone) — update the UI instantly, reconcile on server response, and roll back with a visible toast on failure ([LogRocket, Understanding optimistic UI](https://blog.logrocket.com/understanding-optimistic-ui-react-useoptimistic-hook/), 2025). Never apply it to the record→upload pipeline itself; audio upload needs a real progress state because failure there is costly to the user (lost performance).

**Empty states.** Never say "No data" — give first-time-use states a clear next action, illustration, and one CTA (e.g., empty Duets tab: "No duets yet — record the first verse and invite someone to finish it") ([Mobbin, Empty State glossary](https://mobbin.com/glossary/empty-state); [Toptal, Empty States](https://www.toptal.com/designers/ux/empty-state-ux-design), 2025).

**Error copy.** Two-second comprehension rule: state what happened, why (if useful), and the fix, in one short sentence; avoid technical codes in user-facing copy ([Built In, 16 Rules of Effective UX Writing](https://builtin.com/articles/effective-ux-writing), 2025).

## 2. Audio-Specific Mobile UX

**Recording UI patterns.** Voice Memos centers the interface on one giant red record button and a live waveform that becomes scrubbable/editable after stopping ([Gadget Hacks / Apple Voice Memos coverage](https://ios.gadgethacks.com/how-to/apple-just-made-voice-memos-better-with-layered-recording-heres-works-iphone-16-pro-0385661/), 2025). TikTok's record flow uses a large numeric countdown (3s/10s presets) before auto-starting capture, so performers can get in position — a pattern directly reusable for AKINTI's vocal takes ([TikTok Timer guide, 2026](https://topqlearn.com/how-to-use-tiktok-timer)). Smule's flow is: pick song/duet partner → countdown → record while following scrolling lyrics with headphones recommended → review the take → retake or save ([Smule app store listings](https://apps.apple.com/us/app/smule-sing-duet-record/id509993510), 2025). **Rule: always show a 3-second countdown before recording starts; always offer "Retake" before "Save," never auto-save a first take.**

**Headphones & monitoring.** Android's own guidance: if the app monitors live input, show a "Best with headphones" prompt on first use to avoid feedback loops ([Android Developers, Audio latency](https://developer.android.com/ndk/guides/audio/audio-latency), 2025). Real-time monitoring latency above ~10ms is perceptible and distracting to singers — for AKINTI, do not attempt live monitored playthrough over speakers; nudge headphone use before any Duet recording session.

**Waveform interaction.** Scrubbing (dragging a playhead across a waveform) is the standard navigation gesture in every audio app studied, from Voice Memos to DAWs ([Wikipedia, Scrubbing (audio)](https://en.wikipedia.org/wiki/Scrubbing_(audio)), 2025). Implement tap-to-seek and drag-to-scrub on all waveforms, with a visible playhead and buffered/loaded region distinct from unloaded region.

**Background playback & lock screen.** Use the Media Session API to expose title, artist, artwork, and play/pause/seek to the OS lock screen and notification shade — supported by Chrome and Safari on mobile ([web.dev, Media Session](https://web.dev/articles/media-session), 2025; [W3C Media Session Working Draft, March 2026](https://www.w3.org/TR/2026/WD-mediasession-20260316/)). Caveat: iOS PWAs face real constraints — installed-to-homescreen PWAs have historically failed to continue playback when locked or backgrounded, with playback resuming only on refocus ([DEV Community, PWAs and audio playback](https://dev.to/prototyp/what-we-learned-about-pwas-and-audio-playback-50eh), 2025). **Set expectations accordingly: promise lock-screen metadata/controls, but do not promise gapless background playback reliability on iOS PWA until validated on target iOS versions.**

**Autoplay.** No audio may play without a user gesture on any mobile browser; always gate `AudioContext`/`<audio>.play()` behind a tap, and resume a suspended `AudioContext` inside the same click handler ([MDN, Autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay), 2025; [Matt Montag, Unlock Web Audio in Safari](https://www.mattmontag.com/web/unlock-web-audio-in-safari-for-ios-and-macos), 2025).

**Collaborative Duets.** Smule's model is fully asynchronous: one person records a part, it's posted, anyone can "join" and add their voice against the existing track, with no simultaneous session required ([Smule Zendesk, Collabs](https://smule.zendesk.com/hc/en-us/articles/360001428286-All-information-on-collabs), 2025). This is the right pattern for AKINTI over a WebSocket-free MVP — build async duet joining before attempting real-time synchronized recording, which requires far harder latency engineering.

## 3. Web Platform Realities

**MediaRecorder on iOS Safari.** From iOS 14.5–18.3, Safari only wrote `audio/mp4` (AAC). **iOS 18.4 (March 2025)** added WebM/Opus, Ogg, fragmented MP4, and lossless ALAC/PCM support ([testmuai, MediaRecorder Browser Support](https://www.testmuai.com/learning-hub/mediarecorder-browser-support/), 2025). **Rule: feature-detect with `MediaRecorder.isTypeSupported()` and always fall back to `audio/mp4` for any iOS Safari below 18.4** — do not hardcode `audio/webm`.

**getUserMedia constraints for singing.** For music/vocal capture, explicitly disable processing that mangles musical signal: `{ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }`. Note Chrome quirk: `autoGainControl` alone may not fully disable AGC — `echoCancellation:false` is required too ([Chromium issue 327472528](https://issues.chromium.org/issues/327472528), 2025; [blog.addpipe, getUserMedia Audio Constraints](https://blog.addpipe.com/getusermedia-audio-constraints/), 2025). Offer an in-app "singing mode" toggle that applies these constraints, vs. default voice-mode constraints (all enabled) for spoken-word/voice notes.

**AudioWorklet & latency on iOS.** AudioWorklet works on iOS Safari but with real instability: reports through 2025 describe distortion and glitching at the mandated low (128-sample) buffer size on mobile, and Safari is "the only option on iOS" but a step behind Chromium engines on buffer-size flexibility ([StageAlly, Best Browser for Web Audio 2026](https://stageally.com/articles/best-browser-for-web-audio); [GitHub, AudioWorklet real world disaster](https://github.com/WebAudio/web-audio-api/issues/2632), 2025). **Rule: do not build real-time DSP/pitch-correction requiring sub-20ms round-trip on iOS Safari for MVP; keep processing (waveform generation, normalization) post-capture, off the live audio thread.**

**Web Audio unlock.** Create/resume `AudioContext` only inside a user-gesture handler (tap on Record or Play); if created outside a gesture it starts `suspended` and needs `.resume()` inside a later gesture ([MDN, Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices), 2025).

**PWA on iOS 17–26.** No native install prompt exists — users must use Share → Add to Home Screen; design an explicit in-app instruction card since iOS still lacks `beforeinstallprompt` ([MobiLoud, PWAs on iOS 2026](https://www.mobiloud.com/blog/progressive-web-apps-ios/), 2026). Push notifications work only for home-screen-installed PWAs, since iOS 16.4, with Declarative Web Push simplifying setup since Safari 18.4 ([MagicBell, PWA iOS Limitations 2026](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)). Storage: Safari 17 raised quotas to up to 60% of disk per origin, 80% overall, but **Cache Storage is capped near 50MB per origin** — audio caching strategy must account for this ceiling. iOS 26 changed default behavior: **every home-screen link now opens as a standalone web app by default**, a meaningful behavior shift for install flows.

**Android PWA/TWA.** More permissive: full service-worker background sync, install banners work natively, and TWA wrapping is viable for a later Play Store presence without a rewrite ([WireFuture, PWA Best Practices 2026](https://wirefuture.com/post/progressive-web-apps-pwa-best-practices-for-2026)).

**Serwist for offline shell.** Serwist (successor to next-pwa, spiritual successor to Workbox) is the recommended integration for Next.js App Router in 2025–2026, handling precache manifest injection and `sw.js` generation cleanly with the App Router ([LogRocket, Next.js 16 PWA offline support](https://blog.logrocket.com/nextjs-16-pwa-offline-support/), 2026). Cache the app shell + last-viewed feed; do not attempt full offline audio playback of uncached tracks — show a clear "offline, some content unavailable" state instead.

**navigator.share with files.** Supported in Chrome 128+, Edge 93+, Safari 12.1+ (mobile); always guard with `navigator.canShare({ files })` before calling `share()` — Firefox lacks support ([web-platform-dx, share feature](https://web-platform-dx.github.io/web-features-explorer/features/share/), 2025).

**Wake Lock.** `navigator.wakeLock` is supported iOS 16.4+ and all major mobile browsers as of 2025 (>94% global support) — use it during active recording sessions so the screen doesn't sleep mid-take ([web.dev, Screen Wake Lock supported everywhere](https://web.dev/blog/screen-wake-lock-supported-in-all-browsers), 2025).

**Safe areas & viewport.** Use `100dvh` (dynamic viewport height), not `100vh`, for full-bleed record/player screens — `100vh` overshoots on iOS Safari because it ignores the collapsing browser chrome. Pair `viewport-fit=cover` with `env(safe-area-inset-*)` on every edge-pinned control (record button, bottom nav, mini-player) to clear the home indicator and notch ([ScreenMetricLab, Safe Area Insets](https://screenmetriclab.com/guides/safe-area-insets-mobile-layouts), 2025).

**Keyboard avoidance.** iOS Safari does not resize the layout viewport when the keyboard opens, so bottom-fixed elements (mini-player, send button) get hidden behind the keyboard. Use the `visualViewport` API to detect keyboard height and reposition fixed UI, and set inputs to ≥16px font-size to prevent iOS's forced zoom-on-focus ([Mobiscroll, iOS Safari input issues](https://blog.mobiscroll.com/annoying-ios-safari-input-issues-with-workarounds/), 2025).

## 4. Performance Budgets

Mobile 2026 Core Web Vitals thresholds (75th percentile of real users): **LCP < 2.5s, INP < 200ms, CLS < 0.1** — INP is now the metric most sites fail (43% miss it) ([corewebvitals.io](https://www.corewebvitals.io/core-web-vitals), 2026). Recommended mobile budgets: **JS < 150KB gzipped, fonts < 80KB, total initial load < 540KB** ([Alphonso Labs / Snappy-Fix performance guides](https://www.snappy-fix.com/blog/building-high-performance-websites), 2026).

**Next.js 16 specifics.** Server Components can cut client JS by up to 70% by keeping non-interactive UI off the bundle entirely; stream slow sections (feed items, waveform data) behind `<Suspense>` rather than blocking the whole route ([Digital Applied, Next.js 16 Performance](https://www.digitalapplied.com/blog/nextjs-16-performance-server-components-guide), 2026). Next.js 16's **incremental prefetching** dramatically cut mobile data cost of hover/viewport prefetch — one case study went from 2.4MB to 180KB prefetched per page ([Mikul Gohil, Incremental Prefetching in Next.js 16](https://www.mikul.me/blog/nextjs-16-incremental-prefetching-route-loading), 2026); still, disable prefetch (`prefetch={false}`) on low-value links (settings, legal pages) to protect mobile data plans. Use `next/dynamic` to defer the waveform renderer, audio-effects panel, and any DAW-like editing UI until the user actually opens Record — none of that belongs in the initial bundle for the feed/profile routes.

**Fonts.** Self-host, subset, `font-display: swap`, and do not preload custom fonts on mobile — let the fallback render first so fonts don't compete with the LCP element for bandwidth ([corewebvitals.io, Responsive Font Loading](https://www.corewebvitals.io/pagespeed/responsive-font-loading-strategy), 2026).

## 5. What Makes an App Feel Cheap vs. Premium (2025–2026 Discourse)

"AI slop" was Merriam-Webster's 2025 Word of the Year, and a specific visual fingerprint is now widely recognized across X, Reddit, and Hacker News ([Developers Digest, AI Design Slop: 16 Patterns](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it), 2025). In August 2025, Tailwind's creator Adam Wathan publicly apologized on X for `bg-indigo-500` becoming Tailwind UI's default, which he blames for the indigo/purple gradient now saturating every AI-generated interface — a tweet that drew over a million views and kicked off a wider conversation about training-data feedback loops ([Adam Wathan on X](https://x.com/adamwathan/status/1953510802159219096), Aug 2025; [Communeify, Global Design Convergence](https://www.communeify.com/en/blog/why-ai-loves-purple-global-design-convergence/), 2025).

**The recognized "cheap/AI" tells** (SmoothUI, 2025; Developers Digest, 2025; adriankrebs.ch Show HN scoring, 2025):
- Indigo/violet-to-purple gradients, especially as background "orbs" or blobs
- Glassmorphism applied indiscriminately
- A thick colored left border on a card — "nearly as reliable a tell as em-dashes in text"
- Inter typeface used everywhere with no pairing or hierarchy contrast
- Uniform rounded corners (all 16px) on every card, with a gray box/border around each
- Three feature cards in a row with generic line icons and lorem-adjacent copy
- Centered-everything layouts with no asymmetry, no density variation
- Sparkle/star icons used as a generic "AI" or "magic" affordance
- Emoji standing in for real iconography

**The opposite — what reads as premium and human** (Medium/UX Collective design-system writeups, 2025–2026; adriankrebs.ch, 2025):
- Separate content with whitespace first, then a 3–5% background-lightness shift, then soft elevation — borders last, not first
- Spacing on a strict 8px scale (4px half-step), with proximity semantics: space-in-component < space-between-components < space-between-sections
- Varied section weight — hero, body, and CTA should not all carry identical padding/rhythm
- A distinctive type pairing and a considered accent color tied to brand, not a defaulted framework color
- Asymmetric, content-led layouts instead of everything centered
- Micro-interactions and haptics that confirm state rather than decorate it
- Calm, single-purpose screens that "reduce effort" rather than add visual noise ([letsgroto, Top App Designs 2026](https://www.letsgroto.com/blog/top-10-best-app-designs-in-2025-ux-ideas-from-ai-driven-products), 2026)

For AKINTI: avoid indigo/purple as the primary accent (oversaturated), avoid uniform 16px-everything cards, use whitespace/elevation before borders, and give the record screen and feed screen genuinely different density and rhythm rather than one template stamped twice.

---

## Checklist (54 Rules)

### Onboarding
1. Onboarding is 3 screens or fewer, skippable from screen 1.
2. Never gate core functionality behind a completed onboarding flow.
3. Request mic permission only when the user taps Record, never at launch.
4. Show a one-line custom pre-prompt before the native mic permission dialog.
5. Prefer contextual tooltips over a persistent tutorial overlay.
6. First empty state must include one clear action, not just an illustration.
7. Never show "No data" or "Empty" as empty-state copy.

### Navigation
8. Bottom tab bar has 3–5 items max, always labeled.
9. Primary actions (Record, Play, Duet-join) live in the bottom two-thirds of the screen.
10. Never place a primary CTA in the top corners of the screen.
11. Match platform gesture conventions exactly — iOS edge-swipe back, Android system back.
12. Never repurpose edge-swipe gestures for in-app custom behavior.
13. Touch targets are at least 44×44pt (iOS) / 48×48dp (Android); never below 24×24 CSS px.
14. Disable route prefetch on low-value links to protect mobile data.

### Recording
15. Always show a 3-second countdown before recording begins.
16. Always offer "Retake" before allowing "Save."
17. Never auto-save the first take without user confirmation.
18. Prompt "Best with headphones" before any monitored or Duet recording session.
19. Never attempt live-monitored playback through speakers during recording.
20. Apply "singing mode" constraints (echoCancellation, noiseSuppression, autoGainControl all false) as an explicit toggle, not default-on.
21. Default voice-note recording keeps standard constraints (all processing enabled).
22. Feature-detect supported MIME types with `MediaRecorder.isTypeSupported()`; never hardcode `audio/webm`.
23. Fall back to `audio/mp4` for iOS Safari versions below 18.4.
24. Create/resume `AudioContext` only inside a user-gesture handler.
25. Do not build real-time pitch-correction/DSP requiring <20ms round-trip on iOS Safari for MVP.
26. Hold a Wake Lock during active recording so the screen never sleeps mid-take.
27. Async Duet joining (record against an existing track) ships before any real-time synchronized recording.

### Playback
28. All waveforms support tap-to-seek and drag-to-scrub.
29. Waveforms visually distinguish loaded vs. unloaded audio regions.
30. Expose title/artist/artwork and play/pause/seek via the Media Session API.
31. Never assume reliable background playback on iOS home-screen PWA — validate per target iOS version.
32. No audio auto-plays without a preceding user gesture, anywhere in the app.
33. Use `<audio preload="metadata">` by default; only `preload="auto"` for the currently active track.
34. Cache Storage budget assumes a ~50MB-per-origin ceiling on iOS Safari.

### Feedback & Errors
35. Use OS-default haptics for standard success/error/selection; reserve custom haptics for rare brand moments.
36. Skeleton screens for feeds/lists; spinners only for short bounded actions (<2s expected).
37. Optimistic UI only for reversible, low-risk actions (comment, follow) — never for audio upload state.
38. Error copy states what happened and the fix in one sentence; no raw error codes shown to users.
39. Show a persistent "offline" banner when connectivity drops; queue actions and auto-retry on reconnect.
40. Roll back optimistic UI visibly (toast) on any server rejection.

### Performance
41. LCP < 2.5s, INP < 200ms, CLS < 0.1 at the 75th percentile on mobile.
42. Initial JS payload stays under 150KB gzipped; total initial load under 540KB.
43. Fonts self-hosted, subsetted, `font-display: swap`, never preloaded on mobile.
44. Waveform renderer, effects panel, and any DAW-like UI load via `next/dynamic`, not in the initial bundle.
45. Stream feed and waveform data behind `<Suspense>` rather than blocking full-route render.
46. Server Components used by default; Client Components only where interactivity is required.

### PWA
47. Provide an explicit in-app "Add to Home Screen" instruction card — iOS has no native install prompt.
48. Push notifications only promised for users who installed to the home screen (iOS requires this).
49. Use Serwist to precache the app shell; do not promise offline playback of uncached audio.
50. Use `100dvh`, never `100vh`, for full-bleed record/player screens.
51. Pair `viewport-fit=cover` with `env(safe-area-inset-*)` on every edge-pinned control.
52. Reposition bottom-fixed UI using the `visualViewport` API when the keyboard opens.
53. Set all text inputs to ≥16px font-size to prevent iOS zoom-on-focus.
54. Guard `navigator.share({ files })` calls with `navigator.canShare()` first; provide a fallback download/copy-link path.

### Accessibility & Visual Taste
55. All interactive targets meet WCAG 2.5.8 minimum (24×24 CSS px or 24px spacing).
56. Avoid indigo/violet gradients as the primary accent color.
57. Separate content with whitespace and lightness shifts before adding borders.
58. Use an 8px spacing scale; never apply identical padding/rhythm to every section.
59. Give distinct screens (feed vs. record vs. profile) genuinely different density, not one template reused.
60. No sparkle icons, no emoji-as-icon, no lorem-ipsum-adjacent placeholder copy in shipped UI.
