# WAVE — MASTER PRODUCT & DEVELOPMENT SPECIFICATION

> **Document status:** Master specification (v2 — reviewed and extended by Claude)
> **Working product name:** Wave
> **Final brand name:** Not decided yet
> **Product category:** Audio-first social network
> **Primary development agent:** Claude (any Claude agent picking up this file — Claude Code, Claude in the app, etc.)
> **Objective:** Build a production-quality, modern, scalable audio-first social networking platform from this specification.

---

## 0. Revision notes (read this first)

This is a revised version of the original spec. It keeps the original's structure and intent almost entirely intact — it was already unusually clear and well organized — and makes the following changes:

1. **Resolved a contradiction.** The founder's original one-line pitch mentioned "likes" as something accessible from the profile, but the detailed spec bans Likes outright as a deliberate differentiator (Section 3.4). This revision keeps **no Likes** — it's a real, coherent product decision (Plays/Replays/Saves/Comments/Shares/Duets as signals is a stronger, more original idea than another Like button) — but flags it here explicitly so the founder can override before this reaches a build agent. If you want a Like-equivalent back in, say so and it's a one-line change.
2. **Added concrete technical choices** in the places the original left deliberately open (audio pipeline tooling, Duet synchronization approach, waveform library, background job handling, testing stack) so a build agent has fewer ambiguous forks to guess at.
3. **Added an accessibility item specific to audio:** optional transcripts/captions, which also double as a moderation and search signal.
4. **Added a short onboarding section** and a **success-metrics section**, both implied but not stated in the original.
5. Tightened a few sections for redundancy; nothing substantive was removed.

Everything below is written as a directive specification for a build agent, not as marketing copy — that's intentional, keep it that way when editing.

---

## 1. Role and ownership

You are the primary senior product engineer, software architect, product designer, UX engineer, database architect, security engineer, and QA engineer responsible for building this product.

Treat this document as the product's source of truth.

You are expected to:

- inspect the existing repository before making changes
- understand the existing architecture before modifying it
- make sound technical decisions independently
- implement features end-to-end
- write production-quality code
- test your work
- identify and fix bugs
- identify architectural problems
- avoid unnecessary complexity
- preserve working functionality
- keep the codebase maintainable
- proactively improve implementation quality when justified
- verify assumptions against current project state
- never pretend a feature works when it is only mocked

Do not ask for confirmation for routine implementation decisions.

When multiple reasonable technical choices exist, choose the most appropriate one based on, in order: simplicity, reliability, maintainability, security, scalability, user experience, cost.

Only ask the owner when a decision would materially change the product direction or contradict this specification.

---

## 2. Product vision

Wave is a new type of social network centered on **voice, audio, music, and collaboration**.

Users do not primarily share photographs or videos. They share: their voice, songs, original compositions, vocal performances, covers where legally appropriate, spoken audio, poetry, freestyle, musical ideas, and other forms of expressive audio.

The platform lets people discover voices, listen to creators, interact with audio, and — most importantly — create together.

> **A social network where voices become connections.**

The long-term product should evolve from an audio-sharing network into a **social collaboration network for creators**.

---

## 3. Non-negotiable product principles

These rules must not be violated unless the product owner explicitly changes this specification.

### 3.1 Audio-first
Audio is the primary content format.

### 3.2 No image posts
Images are not a social content format. Profile pictures are allowed. Images may exist for system/UI purposes where necessary, but users do not publish image-based social posts.

### 3.3 No video posts
Video is not a social content format.

### 3.4 No Likes
This is a deliberate product decision. There must be no Like button, no Like count, no Like database entity, no Like API, no Like notification, and no Like terminology anywhere in the product.

The primary social signals instead are: Plays, Replays, Comments, Saves, Shares, Duets.

### 3.5 Wave is the primary social object
Every public audio publication is a **Wave**. Do not call it a generic "post" in user-facing terminology. Internal technical naming may use appropriate conventions, but user-facing language should consistently use Wave.

### 3.6 Duet is a first-class feature
Duet is not a secondary remix feature. It is one of the core reasons the platform exists.

---

## 4. Core terminology

| Concept | Product term |
|---|---|
| Audio social post | **Wave** |
| Audio play | **Play** |
| Meaningful repeat listening | **Replay** |
| Comment | **Comment** |
| Bookmark | **Save** |
| Share | **Share** |
| Collaborative audio response | **Duet** |
| Request to collaborate | **Duet Request** |
| Person creating content | **Creator** |
| People credited on one Wave | **Collaborators** |
| Audio recorded inside the app | **Recorded** |
| Existing audio file uploaded | **Uploaded** |

The final brand name may change later. Centralize this terminology (e.g. a single constants/i18n module) so the brand can be renamed without restructuring the application.

---

## 5. Target users

**Primary:** singers, vocalists, musicians, songwriters, composers, rappers, producers, amateur musicians, aspiring artists, people who enjoy singing, people who want to share their voice, people searching for creative collaborators.

**Secondary:** people who don't consider themselves professional creators but enjoy singing, storytelling, poetry, spoken audio, freestyle, or experimenting with sound.

The product must not feel exclusive to professional musicians. It should be easy enough for a casual user while still feeling professional enough for serious creators.

---

## 6. Core value proposition & growth loop

Wave lets users: express themselves through audio, discover other voices, build an audience, receive meaningful engagement, find creative collaborators, and create collaborative audio through Duets.

> **Users don't just consume audio. They can turn someone else's Wave into a collaboration.**

Growth loop:

```
User discovers Wave → Listens → Replays / Saves / Comments / Shares
   → Requests Duet → Creates new Wave → Original creator receives activity
   → New Wave enters discovery → New users discover it → New collaborations
```

Optimize for meaningful creation and collaboration, not superficial engagement.

---

## 7. Information architecture

Primary navigation: **Home, Explore, Create, Notifications, Messages, Profile**. Create should have prominent visual priority (a distinct, elevated action, not a plain nav icon).

Recommended mobile bottom navigation:

```
Home   Explore   Create   Notifications   Profile
```

Messages should remain highly accessible even though it isn't in the 5-slot bottom bar — either a dedicated tab (swap for Notifications on some layouts) or a persistent, clearly visible entry point (e.g. a header icon with unread badge).

Desktop should use a sidebar/navigation rail rather than mobile bottom navigation, with room for Messages as its own item.

---

## 8. Onboarding (new — implied but unstated in v1)

First-run flow, kept short:

1. Sign up (email/password or OAuth) → verify email if applicable.
2. Choose username + optional display name.
3. Optional: pick 3–5 interests/genres (singing, rap, spoken word, production, etc.) to seed Explore ranking — skippable.
4. Prompt to follow a handful of suggested/featured creators — skippable.
5. Prompt to record or upload a first Wave — skippable, but the recording UI should be one tap away from the empty Home state so the "aha moment" (hearing your own Wave live) happens fast.

Do not gate core browsing behind onboarding completion; every step is skippable.

---

## 9. Home

Home is the user's personalized social feed: Waves from people the user follows.

Supports: personalized feed, followed creators, pagination, infinite scroll where appropriate, efficient audio loading, waveform previews, playback, Plays, Replays, Comments, Saves, Shares, Duet action.

The feed must not behave like a music streaming service. The context is **people → voices → social interaction → collaboration**, not **albums → playlists → songs**.

Empty state (new user with no follows) should route into Explore rather than showing a blank feed.

---

## 10. Explore

Explore is the discovery engine. Helps users find: trending Waves, new Waves, rising creators, popular creators, original compositions, vocal performances, interesting audio, Waves open to Duets, creators relevant to the user.

Suggested categories: Trending, New, Rising, Original, Voices, Compositions, Open for Duet.

Do not over-engineer machine learning in v1. Start with a **deterministic, explainable ranking system** using: Plays, Replays, Saves, Comments, Shares, Duets, listening duration, completion rate, freshness (e.g. a time-decayed weighted score computed periodically, not real-time ML). Design the architecture (ranking as a separate, swappable scoring function/service) so a real recommendation system can be introduced later without a rewrite.

---

## 11. Wave (content object)

A Wave contains: audio asset, waveform data, title, description/caption, creator, creation timestamp, creation type, visibility, comment permission, Duet permission, collaborators, social metrics, optional metadata/categories.

**Creation types:**
- **Recorded** — audio recorded directly inside the application.
- **Uploaded** — an existing audio file uploaded by the user.
- **Duet** — an audio creation resulting from a Duet.

The interface must clearly communicate which type a Wave is, e.g.:

> 🎙 Recorded  ·  ↑ Uploaded  ·  🤝 Duet

### Wave UI structure

```
Creator · Username · Timestamp · Creation type

Title

Waveform
Play/Pause · Progress · Duration

Description

Collaborators

Plays · Replays · Comments · Saves · Shares · Duets

Request a Duet
```

The waveform is the visual anchor of the card — a Wave must never read as an empty card wrapping a generic `<audio>` player.

---

## 12. Audio player

Must support: play, pause, seek, progress, duration, buffering state, loading state, error state.

**Global playback rule:** only one Wave plays at a time (unless a deliberate, future synchronized multi-track feature is added). Implement this with a single global playback store/context (not per-card local state) so starting one Wave stops any other, and so Play/Replay counting logic has one source of truth — this also avoids duplicate play events and excessive network requests from independent card instances.

**Recommended library:** [wavesurfer.js](https://wavesurfer.xyz/) (or an equivalent waveform-aware player) driven by a single global `AudioContext`/playback manager, not one player instance per card.

---

## 13. Play and Replay metrics

No Likes. Instead:

**Play** — a meaningful playback event. Do not count a Play merely because a Wave entered the viewport. Do not increment Plays on React/UI rerenders. Suggested rule: fire `wave_play_started` once per (user/session, wave) after ≥3 seconds of continuous playback or ≥30% of duration for very short clips, debounced server-side against rapid repeats from the same session.

**Replay** — a meaningful *repeated* listening event. Not every pause/resume. Suggested rule: a second completed (or near-complete) listen of the same Wave by the same user/session after the first Play, with a minimum gap to avoid double-counting a single continuous listen interrupted by scrubbing.

Document the exact thresholds chosen in `AUDIO_ARCHITECTURE.md` once implemented, and keep the logic server-authoritative (client reports raw playback events; the server decides what counts).

---

## 14. Save, Comments, Shares

**Save:** Save / Unsave / view saved Waves, accessible from Profile → Saved.

**Comments:** comment, reply where supported, delete own comments, report comments. Creators may have comment controls (who can comment: everyone / followers / nobody). Must support moderation, blocking, reporting, pagination, and basic abuse prevention (rate limits, no comments from blocked users). Keep v1 comments flat or shallow-threaded — avoid deep nested threading complexity.

**Shares:** internal messages, copy/share link, platform-native share sheet where available. **A private or restricted Wave must never become publicly accessible merely because a user shares it** — the share link must still enforce the original Wave's visibility and authorization rules server-side.

---

## 15. Duet system

Duet is one of the most important features in the product: a user invites another user to create a collaborative audio performance based on a Wave.

### Duet flow

```
Original Wave → Request Duet → Duet Request → Recipient accepts
   → Record contribution → Audio synchronization → Preview
   → Processing → Publish → New Duet Wave
```

### Duet data relationship

Each Duet has a clear parent/child relationship to the original Wave (not just textual attribution):

```
Original Wave
  ├── Duet A
  │     └── Duet A2
  ├── Duet B
  └── Duet C
```

Recommended schema shape: every Wave row has a nullable `original_wave_id` (root of the chain, for fast "all duets of X" queries) and `parent_wave_id` (immediate parent, for the actual tree), plus a `duet_request_id` linking back to the request that spawned it. Avoid duplicating the original audio data — a Duet references the parent's audio asset(s), it doesn't copy them.

### Duet permissions

Users control who may request a Duet: **Everyone / Followers / People I follow / Nobody**. Enforced server-side, not just hidden in the UI.

### Duet requests

Lifecycle: `PENDING → ACCEPTED | DECLINED | CANCELLED | EXPIRED`.

Notify on: request received, request accepted, request declined (where appropriate), collaborator relationship created. Avoid notification spam (e.g. don't also spam "someone viewed your request").

### Duet recording & synchronization

The recorder should let the user: hear the original audio, record their contribution against it, preview both, control timing/offset, retake, discard, publish.

**Recommended technical approach:** client-side, use the Web Audio API to play the original track through the recording session (so the contributor hears it while recording) and capture the new take as a separate audio stream with a stored start-offset relative to the original. On publish, do **not** rely on perfect client-side mixing — send both stems (original reference + new take + offset) to a server-side/background mixing job (e.g. ffmpeg with a calculated delay filter) to render the final combined Duet audio and waveform. This is more reliable than trusting client-side mixdown across devices/browsers, and keeps the stems available if a future feature wants per-track remixing.

Prioritize reliable synchronization over rich editing controls. This is not a DAW.

---

## 16. Collaborators

A Wave may have multiple collaborators, e.g. `@akin × @maria × @alex`, all credited. Collaborator invitations must have proper permissions and acceptance behavior — never auto-add someone as a collaborator without their consent.

---

## 17. Audio recording

In-app recording requires: microphone permission, start, stop, pause/resume where supported, preview, delete, re-record, publish.

**Recommended implementation:** browser `MediaRecorder` API capturing to Opus/WebM (or AAC/MP4 on Safari, since Safari's MediaRecorder support differs), with a client-side fallback/format check. Keep the recording UI simple — the goal is a professional *result* with minimal friction, not a full editing suite.

---

## 18. Audio upload

Requirements: supported-format validation, file-size validation, secure upload, preview, waveform generation, audio metadata extraction, error handling, processing status.

**Security:** never trust client-provided MIME types alone. Validate by inspecting actual file headers/magic bytes server-side (or in a trusted upload-processing step) before accepting a file as audio. Reject executable files disguised as audio. Enforce a max duration and file size appropriate to the plan/tier.

---

## 19. Audio processing

After recording/upload, offer accessible, non-technical enhancement modes: **Natural, Studio, Clear Voice, Warm, Deep, Atmospheric** — each a preset bundle of underlying DSP operations (noise reduction, normalization, EQ curve, light reverb), not exposed as raw knobs to casual users. Power users may get an optional "advanced" EQ toggle at share time (matches the founder's original "voice equalizer mode" idea), but it stays opt-in and secondary to the presets.

**Recommended implementation:** run processing as an asynchronous background job (not inline in the request/response cycle) using ffmpeg (or a managed audio-processing service) — e.g. a queue such as a Postgres-backed job table processed by a worker, or a managed queue (Inngest, Trigger.dev, or a Supabase Edge Function triggered by a storage event) if the team wants to avoid running its own worker process. Track job status (`pending / processing / done / failed`) so the UI can show real processing state, never a fake instant "done."

---

## 20. Waveform

Waveforms are Wave's major visual identity — used on cards, Wave detail, recording, playback, Duet recording, previews.

Do not regenerate/re-decode the full audio file on every client request. Generate waveform peak data once (server-side or in the same background job as audio processing, e.g. via `audiowaveform` or ffmpeg + a peaks-extraction step) and store it as compact JSON/binary alongside the processed audio asset, served from cache/CDN like any other static asset.

---

## 21. Profile

Contains: profile picture, username, display name, bio, followers, following, Wave count.

Primary tabs: **Waves, Duets**.

Actions: Follow, Unfollow, Message, Share profile, Block/Report where appropriate.

### Privacy
**Public** — anyone can view the profile and publicly available Waves.
**Private** — only authorized followers/users may access restricted content.
Enforced at the backend/API/database level, never only in the frontend.

### Wave-level privacy
Each Wave independently sets visibility: **Everyone / Followers / Only Me**. Enforced server-side. A private Wave must never be reachable via guessed URLs, direct storage URLs, API manipulation, search, feed APIs, share links, or cached responses.

### Profile customization
Supported: background color, gradient, subtle pattern, accent color, within a controlled visual theme system (a curated set of presets/tokens, not an open CSS field). Do not allow customization that breaks readability, accessibility, or layout, or creates visual noise — this is not a MySpace-style free-for-all; the design language stays coherent.

---

## 22. Messaging

Users can: send text messages, send audio messages, share Waves, send Duet Requests, receive Duet-related communication.

Audio messages are private communications — **they are not Waves** and never appear in feeds/Explore.

Supports: conversations, unread state, timestamps, pagination, blocking, reporting, real-time updates where appropriate (e.g. Supabase Realtime). Blocked users must not be able to contact one another in either direction.

---

## 23. Notifications

Types: new follower, comment, comment reply, save, share, Duet Request, Duet accepted, Duet declined, collaborator invitation, message, relevant system/discovery notifications.

**No Like notifications.**

Each notification carries: actor, action, target, timestamp, read/unread state. Clicking navigates to the correct context. Batch/group similar rapid notifications (e.g. "3 people saved your Wave") rather than sending one per event, to avoid spam.

---

## 24. Search

Should eventually cover users, creators, Waves, relevant categories. v1 can be simple and deterministic (e.g. trigram/full-text search on username, display name, Wave title/description). Architect it so a dedicated search index (e.g. Postgres full-text, or an external index later) can be swapped in without touching calling code.

---

## 25. Settings (under Profile)

- **Account** — edit profile, username, email, password/security, account deletion.
- **Privacy** — public/private profile, who can message me, who can send Duet Requests, default Wave visibility, comment permissions, share permissions.
- **Notifications** — message, Duet, comment, follower notifications.
- **Content** — Saved Waves, commented Waves, my Waves, my Duets.
- **Audio** — playback preferences, autoplay, audio quality where appropriate.
- **Safety** — blocked users, reports, security.

---

## 26. Moderation, blocking, copyright

**Reporting:** users can report Waves, comments, users, messages. Reasons: spam, harassment, impersonation, copyright concern, inappropriate content, abusive behavior, other. Build a moderation foundation (report queue, states, audit trail) supporting future human and automated review. Do not auto-delete content on a single report.

**Blocking** affects: profile visibility, messaging, interactions, Duet requests, discovery where appropriate. A blocked user must not bypass restrictions through direct URLs or API calls — this must be enforced at the API/authorization layer, not the UI.

**Copyright/audio rights:** distinguish original content, user-uploaded content, Duets, and covers. Do not assume all uploaded audio is legally usable. Build reporting/moderation pathways for copyright concerns; do not build a large-scale commercial licensing system unless explicitly requested. For MVP, prioritize original/user-created audio and design the architecture so copyright enforcement can evolve (e.g. a `content_origin` field and a copyright-report reason are enough for v1).

**Accessibility/moderation crossover (new):** consider an optional, creator-controlled auto-transcript for each Wave (speech-to-text). This is not required for MVP but is worth flagging early because it serves three purposes at once — accessibility for deaf/hard-of-hearing users, better search relevance, and an input signal for automated moderation of spoken content. If included, transcripts should be opt-in/off by default per creator and clearly labeled as auto-generated.

---

## 27. Creator analytics

Creators should eventually see: total Plays, unique listeners, Replays, Saves, Shares, Comments, Duets, average listening duration, completion rate, follower growth, Wave performance. No Likes. Distinguish raw events from meaningful/deduplicated metrics, and prevent obvious fraudulent engagement (bot plays, self-replay farming) from distorting analytics where reasonably possible (e.g. rate limits + basic anomaly flags, not a full fraud ML system for v1).

---

## 28. Success metrics (new)

Track these as product health signals, separate from creator-facing analytics:

- **Activation:** % of new users who publish a first Wave within 7 days.
- **Retention:** week-1 / week-4 returning listener and returning creator rates.
- **Collaboration depth:** Duet requests sent per active user, Duet acceptance rate, Duets published per week.
- **Discovery health:** % of Plays on Waves from creators the listener didn't already follow (a proxy for Explore working).
- **Content velocity:** Waves published per active creator per week.

These inform whether the product is behaving like a collaboration network rather than a passive feed — the core differentiation goal in Section 44.

---

## 29. Accessibility

Support: keyboard navigation, visible focus states, readable typography, sufficient contrast, semantic HTML, accessible labels, screen-reader-friendly custom controls (the waveform/player is almost certainly a custom component — it needs proper ARIA roles and states, not just visual affordances), reduced motion where appropriate, and optional Wave transcripts (Section 26). Do not sacrifice accessibility for visual styling.

---

## 30. Technical stack

**Frontend:** Next.js, TypeScript, modern React, Tailwind CSS (or an equivalent controlled styling system), reusable component architecture.

**Backend:** Supabase preferred for the initial architecture — PostgreSQL, Supabase Auth, Supabase Storage, Supabase Realtime where appropriate.

**Audio tooling (new — filling in the original's open questions):**
- Waveform rendering/playback: wavesurfer.js (or equivalent).
- Server-side/background audio processing: ffmpeg, invoked from a background worker/job rather than inline in a request.
- Background jobs: a simple Postgres-backed job table + worker to start; a managed queue (Inngest/Trigger.dev) or Supabase Edge Functions triggered by storage events are reasonable alternatives — pick one and document the choice in `AUDIO_ARCHITECTURE.md` rather than leaving it ambiguous at build time, since Vercel's serverless functions have execution-time limits unsuitable for longer audio processing.

**Deployment:** Vercel for the web application.

**Source control:** GitHub.

**Design:** Figma.

**Testing (new):** Vitest or Jest for unit tests, Playwright for end-to-end tests (a headless Chromium instance is fine for the critical audio flows — recording can be mocked via a fake `MediaRecorder`/`getUserMedia` in test environments).

Do not introduce unnecessary microservices. Use a modular monolith / well-structured application architecture initially.

---

## 31. Database principles

Design around clear domain entities. Likely entities: users, profiles, follows, waves, wave_collaborators, wave_visibility, comments, comment_replies (if needed), saves, shares, play_events, replay-related analytics, duet_requests, conversations, conversation_members, messages, notifications, reports, blocks, audio_assets, audio_processing_jobs, creator analytics/event structures.

Do not implement this list blindly — inspect the actual architecture and normalize appropriately. Avoid unnecessary duplication. Use foreign keys, indexes, and constraints appropriately (in particular: index `waves.creator_id`, `waves.original_wave_id`/`parent_wave_id`, `follows(follower_id, followee_id)`, and time-ordered feed queries).

---

## 32. Authorization

Security is designed around authorization, not just authentication. A logged-in user must not automatically have access to another user's private profile, private Wave, private audio asset, messages, moderation data, or account information. Use server-side authorization and appropriate database policies (e.g. Postgres Row-Level Security if using Supabase). Never trust the client.

---

## 33. Storage security

Audio storage is sensitive. Private audio must not be exposed through predictable public URLs. Use private buckets, signed URLs with expiration, and access policies enforced per-request. Do not expose raw storage paths unnecessarily.

---

## 34. Audio pipeline

```
Record / Upload → Validate → Temporary/Original Storage → Processing
   → Normalization / Enhancement → Waveform Generation
   → Processed Audio Storage → CDN / Efficient Delivery → Playback
```

Do not block the application while expensive audio processing runs synchronously. Use background processing (Section 19/30).

---

## 35. Performance

Pay particular attention to: audio loading, waveform loading, feed pagination, database queries, notification queries, messaging, profile loading, avatar loading, CDN delivery, caching. Do not load all audio assets on a page at once — lazy-load and preload only what's about to be needed (e.g. the next few cards in a feed).

---

## 36. Mobile-first design

Design mobile-first — most recording and consumption will happen on mobile. Ensure touch-friendly controls, microphone permissions handled gracefully, responsive layouts, bottom sheets where appropriate, accessible controls, stable playback, and good performance on slower devices. Desktop still gets a polished, non-afterthought experience.

---

## 37. Design direction

Visual language: minimalist, professional, premium, creative, modern, calm, approachable, audio-centric.

Do not clone Instagram, TikTok, Spotify, SoundCloud, or Twitter/X. Familiar interaction patterns are fine where they aid usability, but the visual identity should be original. Waveforms are the major visual motif.

Avoid: excessive glassmorphism, excessive gradients, excessive animation, visual clutter, unnecessary decorative UI, overly complicated audio controls.

---

## 38. Error states

Every major async operation needs: loading, success, error, retry (where appropriate), and empty states. Cover at minimum: recording failure, microphone denied, upload failure, processing failure, playback failure, network interruption, expired session, deleted Wave, unavailable private Wave, failed Duet, failed message. No silent failures.

---

## 39. Abuse prevention

Rate-limit: comments, follows, messaging, Duet Requests, share events, play events, replay events, uploads. Do not allow obvious event inflation (e.g. scripted repeat plays). Choose and document exact thresholds based on real usage once there's data — start conservative.

---

## 40. Analytics event design

```
wave_play_started        wave_play_completed
wave_replayed            wave_saved / wave_unsaved
wave_shared              comment_created / comment_deleted
follow_created / follow_removed
duet_requested / duet_accepted / duet_declined / duet_created
message_sent              profile_viewed
```

Don't create unnecessary events. Ensure events can't accidentally fire multiple times due to frontend rerenders (fire from a single effect/handler guarded against re-invocation, not from render logic).

---

## 41. MVP scope

- **Authentication:** registration, login, logout, account/session management.
- **Profiles:** profile, avatar, username, bio, followers, following, public/private.
- **Audio:** record, upload, preview, waveform, basic processing.
- **Waves:** create, publish, edit, delete, visibility, playback.
- **Social:** follow, Plays, Replays, Comments, Saves, Shares.
- **Discovery:** Home, Explore, search/basic discovery.
- **Duets:** request, accept/decline, record, synchronize, publish, attribution.
- **Communication:** messaging, notifications.
- **Safety:** blocking, reporting, basic moderation.

---

## 42. Features to defer unless necessary

Live streaming, video, stories, a complex editing suite, an advanced DAW, a music licensing marketplace, cryptocurrency, NFTs, complicated AI music generation, livestream gifting, excessive gamification, complicated recommendation ML, a large-scale creator marketplace, overly complex profile customization. Future opportunities, not MVP requirements.

---

## 43. Implementation order

**Stage 0 — Repository audit:** inspect existing code, package manager, framework, environment, database, dependencies, configuration, existing UI, architecture. Do not overwrite existing functionality blindly.

**Stage 1 — Foundation:** application shell, routing, layout, navigation, design tokens, reusable components, error/loading/empty states.

**Stage 2 — Authentication:** registration, login, logout, session, protected routes, user initialization.

**Stage 3 — Profiles:** profile, edit profile, avatar, bio, privacy, customization, follow system.

**Stage 4 — Audio infrastructure:** recording, upload, validation, storage, waveform, playback, audio processing.

**Stage 5 — Waves:** creation, publishing, Wave detail, WaveCard, visibility, Recorded/Uploaded metadata, social metrics.

**Stage 6 — Home:** following feed, pagination, playback, interactions.

**Stage 7 — Explore:** discovery, trending, new, creator discovery, search, open-for-Duet discovery.

**Stage 8 — Social interactions:** comments, saves, shares, Plays, Replays. **No Likes.**

**Stage 9 — Duets:** the entire Duet lifecycle — critical milestone.

**Stage 10 — Messaging:** conversations, text messages, audio messages, Wave sharing, Duet communication.

**Stage 11 — Notifications:** generation and UI.

**Stage 12 — Settings/privacy/safety:** settings, privacy, blocking, reporting, notification preferences.

**Stage 13 — Creator analytics.**

**Stage 14 — Security/performance audit.**

**Stage 15 — QA:** end-to-end testing.

**Stage 16 — Production readiness:** build, test, optimize, prepare deployment.

---

## 44. Development rules

1. Inspect before modifying.
2. Do not rewrite working code without reason.
3. Do not create duplicate components.
4. Prefer reusable components.
5. Keep domain logic separate from presentation logic.
6. Use strong typing.
7. Validate inputs.
8. Enforce authorization server-side.
9. Never fake functionality — if a feature isn't implemented, don't pretend it is.
10. No hardcoded fake production data where real database data is required; seed data is fine for dev/test but clearly separated.
11. Do not add Likes.
12. Do not turn the product into a video/image social network.
13. Do not over-engineer MVP.
14. Do not introduce unnecessary dependencies.
15. After substantial implementation: run tests, type checks, lint, build, and fix discovered issues.
16. Keep migrations safe and reversible where practical.
17. Document important architectural decisions.
18. Do not expose secrets.
19. Do not commit environment secrets.
20. Preserve a clean Git history.

---

## 45. Git workflow

Meaningful, logically-scoped commits, e.g.:

```
feat: implement authentication
feat: add profile system
feat: implement audio recording
feat: add Wave publishing
feat: implement Duet requests
fix: prevent duplicate play events
fix: enforce private Wave authorization
refactor: improve audio player state management
```

Create checkpoints after major milestones. Avoid enormous unreviewable commits when smaller ones are practical.

---

## 46. Testing philosophy

Don't stop at "the page renders" — test actual behavior.

**Critical end-to-end scenario:**

```
User A registers → creates profile → records Wave → publishes Wave
   → User B discovers Wave → plays it → replays it → comments → saves → shares
   → User B requests Duet → User A notified → User A accepts
   → User B records contribution → Duet synchronized → Duet published
   → Original Wave links to Duet → Duet appears on profiles/discovery
```

**Private content test:**
```
User A creates private Wave → User B tries direct API access → ACCESS DENIED
```
Also test: direct storage URL, share URL, search, Explore, Home, Wave detail, API manipulation.

**Duet security test:**
```
User A disables Duets → User B attempts API request → REQUEST DENIED
```
Also test: blocked user, private profile, private Wave, deleted original Wave, revoked permissions, duplicate requests, concurrent requests.

**Audio testing:** microphone permission granted/denied, recording, pause, resume, stop, re-record, upload, invalid file, oversized file, corrupted file, processing, playback, seeking, waveform, mobile browser, desktop browser, slow network, interrupted upload.

**Responsive testing:** mobile, tablet, desktop — prioritize mobile; audio controls must stay usable on small screens.

---

## 47. Final product quality bar

**Product:** Does it feel like a new social network? Does audio feel native? Does Duet feel central? Is the lack of Likes intentional and coherent?

**UX:** Can a new user understand the product immediately? Publish a Wave quickly? Discover a creator quickly? Start a Duet without confusion?

**Visual:** Polished, minimalist, professional, original? Is the waveform visually meaningful?

**Engineering:** Maintainable architecture? Correct authorization? Efficient audio delivery? Efficient queries? Race conditions handled?

**Security:** Can private Waves leak? Can blocked users bypass restrictions? Can users manipulate metrics easily? Are uploads secure?

**Performance:** Does Home load efficiently? Does Explore stay fast? Does audio start quickly? Does it behave well on mobile?

---

## 48. Product differentiation

Do not accidentally build "Instagram, but with audio." Build **a social network whose native social object is audio**:

- the Wave replaces the post
- the waveform replaces the image preview
- Plays replace views
- Replays represent repeated listening
- Saves replace passive appreciation
- Shares distribute audio
- Duets create collaboration
- creator identity is strongly connected to voice
- social relationships can become creative relationships

For every product decision, ask: **does this make the experience more audio-native and socially collaborative?** If not, question whether it belongs.

---

## 49. Long-term direction

```
Audio Social Network → Creator Network → Collaboration Network
   → Voice / Music Creation Ecosystem
```

Potential future features (not now, unless required): advanced collaborative creation, creator discovery by skill ("looking for vocalist / guitarist / producer"), collaboration rooms, multi-person audio sessions, creator portfolios, professional creator profiles, collaboration history, advanced audio tools, creator monetization.

---

## 50. The core behavior this product is built around

> I hear someone. I like their voice. But there is no Like button.
> Instead: I listen. I replay. I save. I comment. I share. I ask to Duet.

That is the product.

---

## 51. Execution instructions for the build agent

**Step 1** — Inspect the repository completely enough to understand its current state.
**Step 2** — Identify what already exists.
**Step 3** — Compare the existing project with this specification.
**Step 4** — Create or update internal documentation where useful: `AGENTS.md`, `PRODUCT.md`, `ARCHITECTURE.md`, `DATABASE.md`, `AUDIO_ARCHITECTURE.md`, `DUET_SPEC.md`, `SECURITY.md`, `TESTING.md`. Don't create redundant docs if equivalents already exist.
**Step 5** — Create an implementation plan based on the current repository.
**Step 6** — Implement in dependency-aware stages (Section 43).
**Step 7** — After each major stage: test, type-check, lint, build, inspect for regressions, fix issues.
**Step 8** — Don't stop merely because code has been written — verify the feature actually works.
**Step 9** — If a better technical implementation than the initial assumption is discovered, use it when it doesn't violate product requirements. Document important deviations.
**Step 10** — At the end of each major stage, report:

```
Implemented:
...
Changed:
...
Tests:
...
Known issues:
...
Next:
...
```

Keep reports concise.

---

## 52. Final instruction

Take ownership of this project as the primary engineering agent. Treat this document as the specification for a real startup product, not a simple coding prompt. Build incrementally. Make reasonable decisions independently. Don't ask unnecessary questions. Don't implement fake functionality. Don't add Likes. Don't add image/video social posts. Keep Wave and Duet at the center of the product.

Priorities:

**quality > speed · clarity > complexity · real functionality > visual pretending · security > convenience · maintainability > cleverness · audio-native UX > copying existing social networks**

The final result should be a polished, production-oriented, modern audio-first social network that feels like its own category rather than an imitation of an existing platform.

Start by inspecting the repository and current environment. Then produce a concise implementation plan and begin execution.
