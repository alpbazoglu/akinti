# AKINTI — Product

Source of truth for product decisions: `akın icin md.md` (the master spec). This
document is the short, directive summary an engineer should read before
touching product-facing code. Where this file and the spec disagree, the
founder decisions below win — they are explicit overrides.

## What it is

AKINTI is an audio-first social network. Users share voice, music, spoken
audio and collaborate through **Duets**. Not a photo or video app. Not a
music streaming service. The core loop:

```
Discover a Wave → Listen → Replay / Save / Comment / Share
   → Request a Duet → Creator accepts → New Duet Wave published
   → Original creator notified → Duet enters discovery
```

## Founder decisions (override the spec text where they differ)

- **Brand name: AKINTI.** The social-object vocabulary below is unchanged.
- **No Likes, anywhere.** No Like button, count, table, API, or notification.
  Verified absent from every migration, RLS policy, type and UI surface.
- **UI language: English.**
- **Background audio jobs:** a Postgres-backed job table
  (`audio_processing_jobs`), processed by `scripts/worker.ts`. Not a managed
  queue, not Vercel Edge Functions. See `AUDIO_ARCHITECTURE.md`.

## Non-negotiable principles (spec §3)

1. **Audio-first.** Audio is the only social content format.
2. **No image posts.** Avatars only.
3. **No video posts.**
4. **No Likes.** Signals are Plays, Replays, Comments, Saves, Shares, Duets.
5. **Wave is the primary social object.** User-facing copy always says
   "Wave", never "post".
6. **Duet is first-class**, not a secondary remix feature.

## Terminology (spec §4 — centralize this; do not hardcode strings per-screen)

| Concept | Term |
|---|---|
| Audio social post | **Wave** |
| Audio play | **Play** |
| Meaningful repeat listen | **Replay** |
| Comment | **Comment** |
| Bookmark | **Save** |
| Share | **Share** |
| Collaborative audio response | **Duet** |
| Request to collaborate | **Duet Request** |
| Content owner | **Creator** |
| People credited on a Wave | **Collaborators** |
| Recorded in-app | **Recorded** |
| Uploaded file | **Uploaded** |

## MVP scope (spec §41)

Auth · Profiles (public/private, theme, avatar) · Audio (record, upload,
preview, waveform, processing) · Waves (create/publish/edit/delete,
visibility, playback) · Social (follow, Play, Replay, Comment, Save, Share) ·
Discovery (Home, Explore, search) · Duets (request → accept → record → sync →
publish → attribution) · Messaging + Notifications · Safety (block, report,
moderation queue).

## Explicitly deferred (spec §42)

Live streaming, video, Stories, a full DAW/editing suite, a licensing
marketplace, crypto/NFTs, AI music generation, livestream gifting, heavy
gamification, ML recommendations, a creator marketplace, unbounded profile
customization ("MySpace mode"). None of these belong in this codebase yet.

## Information architecture (spec §7)

Primary nav: **Home, Explore, Create, Notifications, Profile** (mobile bottom
bar, 5 slots — Create gets visual priority, not a plain icon). **Messages**
stays reachable via a persistent header entry with an unread badge. Desktop
uses a sidebar with Messages as its own item.

## Content object shape (spec §11)

A Wave carries: audio asset, waveform peaks, title, description, creator,
creation type (`recorded | uploaded | duet`), visibility
(`everyone | followers | only_me`), comment/duet permission overrides,
collaborators, and counters (plays, replays, comments, saves, shares, duets).
See `DATABASE.md` for the exact schema and `docs/DUET_SPEC.md` for the Duet
tree shape.

## Notifications (spec §23, §38, §44)

Fourteen types, driven entirely by `public.push_notification` (migration 08)
— there is no client insert path:

| Type                   | Copy                                             | Links to             |
| ---------------------- | ------------------------------------------------- | --------------------- |
| `follow`                | "X started following you"                        | X's profile           |
| `follow_request`        | "X asked to follow you" (Accept/Decline inline)   | X's profile           |
| `comment`                | "X commented on your Wave"                       | the Wave              |
| `comment_reply`          | "X replied to your comment"                       | the Wave              |
| `save`                   | "X saved your Wave"                               | the Wave              |
| `share`                  | "X shared your Wave"                              | the Wave              |
| `duet_request`           | "X requested a Duet with your Wave" (Accept/Decline link to the Wave for now) | the Wave |
| `duet_accepted`          | "X accepted your Duet Request"                    | the Wave              |
| `duet_declined`          | "X declined your Duet Request"                    | the Wave              |
| `duet_published`         | "X published a Duet using your Wave"              | the new Duet Wave     |
| `collaborator_invite`    | "X invited you to collaborate on a Wave" (Accept/Decline inline) | the Wave |
| `collaborator_accepted`  | "X accepted your collaborator invite"             | the Wave              |
| `message`                | "X sent you a message"                            | the conversation      |
| `system`                 | generic AKINTI update, no actor                   | `/notifications`      |

**No Like notifications** — the type enum has no `like` value and never will.

**Grouping:** while a group stays unread, a new matching event bumps `count`
and refreshes the actor in place (`group_key`, e.g. `save:<waveId>`) instead
of creating a new row — "Ada and 2 others saved your Wave". Once the group is
read, the next matching event resets it to a fresh unread row with `count =
1`. This collapse happens entirely in Postgres; the app only ever reads
already-grouped rows.

**Unread badge:** server-rendered initial count, kept live client-side via a
single shared Supabase Realtime subscription per user (`postgres_changes` on
`notifications`), falling back to polling if Realtime doesn't confirm.
Requires `notifications` to be added to the `supabase_realtime` publication
(not yet migrated — see the Stage 11 report for the exact SQL).

## Success metrics (spec §28) — product health, not creator analytics

- **Activation:** % of new users publishing a first Wave within 7 days.
- **Retention:** week-1 / week-4 returning listener and returning creator rate.
- **Collaboration depth:** Duet requests sent per active user, acceptance
  rate, Duets published per week.
- **Discovery health:** % of Plays on Waves from creators the listener didn't
  already follow.
- **Content velocity:** Waves published per active creator per week.

These measure whether the product behaves like a collaboration network, not
a passive feed (spec §48) — the core differentiation goal.

**Implemented in Stage 13** (`20260903140500_creator_analytics.sql`,
`product_health(p_days)`, moderator-only — `/analytics/health`, a 404 for
everyone else). Exact cohort definitions (v1 judgment, not a spec-mandated
formula):

- **Activation rate** — of new users who signed up in the window *and* are
  at least 7 days old (so the 7-day window has actually elapsed — a
  brand-new account isn't counted as "not activated" just because it hasn't
  had time to), the % that published a first Wave within 7 days of signing
  up.
- **Week-1 / week-4 returning listener rate** — a listener's "first" is
  their earliest qualifying (`counted_play`/`counted_replay`) raw
  `play_events` row, anomaly-flagged rows excluded. Cohort: first play in
  the window *and* old enough that the return window has fully elapsed. The
  rate is the % with another qualifying play in `[+7d, +14d)` (week-1) or
  `[+28d, +35d)` (week-4) after that first one.
- **Week-1 / week-4 returning creator rate** — same shape, keyed off a
  creator's earliest published (non-deleted) Wave instead of a listener's
  earliest play.
- **Duet Requests per active user** — Duet Requests created in the window,
  divided by "active users" (anyone who published a Wave, commented, sent a
  Duet Request or had a qualifying play in the window).
- **Duet acceptance rate** — accepted ÷ (accepted + declined) Duet Requests
  created in the window (pending/cancelled/expired excluded from both sides).
- **Duets per week** — Duet Waves published in the window ÷ (window days /
  7).
- **Discovery share** — of qualifying Plays in the window, the % where the
  listener wasn't already following the creator at query time (a *current*
  follow check, not a historical snapshot — a listener who has since
  followed the creator no longer counts as a "discovery" play, which is a
  known approximation, not a bug). An anonymous listener always counts as a
  discovery, since they cannot be a follower.
- **Content velocity** — Waves published in the window ÷ distinct creators
  who published at least one, ÷ (window days / 7).

## Creator analytics (spec §27, §43 Stage 13)

`/analytics` — every signed-in creator sees their own numbers; anonymous
visitors are redirected to `/login`. Three RPCs
(`20260903140500_creator_analytics.sql`), each resolving `auth.uid()`
internally rather than taking a creator-id argument, so there is nothing to
forge: `creator_overview(p_days)`, `creator_timeseries(p_days)`,
`creator_wave_performance(p_days, p_limit)`. `p_days` is one of `7 | 30 |
90` everywhere (`src/lib/analytics/range.ts`'s `analyticsRangeSchema`,
mirroring each RPC's own `p_days not in (7, 30, 90)` guard).

**Meaningful vs. raw (spec §27 "distinguish raw events from
meaningful/deduplicated metrics")** — shown on every stat tile, not just
documented here:

- **Meaningful (deduplicated):** Plays, unique listeners, Replays, Saves,
  Shares, Comments, Duets. These read `wave_listens` (Plays/Replays/unique
  listeners — the same deduplicated table `waves.play_count`/`replay_count`
  derive from) or count rows directly (Saves/Shares/Comments/Duets), never
  the raw event log.
- **Raw (per-event):** Avg. listen time and completion rate read raw
  `play_events` instead, restricted to qualifying
  (`counted_play`/`counted_replay`) listens — `wave_listens.total_listened_ms`
  accumulates across every listen of a (Wave, listener) pair, which would
  blend multiple sessions into one number; a raw per-event average needed
  the unaggregated log.
- **Follower change** is new followers gained in the window (accepted
  `follows` rows created in it) — **not a true net.** No unfollow ledger
  exists to subtract against (`follows` rows are deleted on unfollow, not
  soft-deleted), so an unusually high unfollow rate in the window would not
  show up as a lower/negative number here. Documented, not hidden.

**Anomaly flag (spec §27 "prevent... bot plays, self-replay farming...
basic anomaly flags, not a full fraud ML system")** —
`play_events.suspicious boolean default false`, set by
`flag_suspicious_play_events()`: more than 20 qualifying listens of one Wave
from one `listener_key` (session or account) on one calendar day. Every
analytics/health RPC excludes flagged rows via `wave_listen_is_suspicious()`.
The function is **not** called automatically by anything in the migration —
see "Worker maintenance" in `DATABASE.md` for the call that still needs
adding to `scripts/worker.ts`'s maintenance loop (out of scope for this
agent's owned files). A TypeScript mirror of the exact rule lives in
`src/lib/analytics/suspiciousPlay.ts` (tested, never imported by code that
computes real numbers) — Postgres is always the authority.

**Self-plays never inflate a creator's own numbers** — already guaranteed
upstream by `record_play_event` (migration 11: a creator's own listens never
set `play_counted`/`counted_play`), so no extra creator-id exclusion was
needed in these RPCs for that rule specifically.

**UI** (`src/app/(app)/analytics/`, `src/components/analytics/`): a 7/30/90
range switcher (`RangeSwitcher`, a plain server component — each option is
its own `<form>` bound to the `setAnalyticsRange` Server Action, so it works
without client JS), ten stat tiles each labelled meaningful/raw, a
single-metric daily bar chart with a `<select>` to change series and a
keyboard-accessible "Show table" toggle that renders the same data as a real
`<table>` (`AnalyticsTimeseriesChart` — inline SVG only, no charting
library), and a Wave performance table linking every row to `/w/[id]`. A
creator with zero Waves sees an empty state instead of ten empty tiles. Data
fetching is wrapped in `<Suspense>` (a real loading skeleton, not a
spinner-over-blank-page) and a try/catch around the RPC calls (a real error
state, not an unhandled crash).

## Product differentiation checklist (spec §48)

For every feature decision, ask: does this make the experience more
**audio-native** and more **socially collaborative**? Concretely:

- Wave replaces the post; the waveform replaces the image preview.
- Plays replace views; Replays represent repeated listening.
- Saves replace passive appreciation; Shares distribute audio.
- Duets create collaboration — social relationships become creative ones.

If a proposed feature doesn't serve one of the above, it probably doesn't
belong in v1.

## Messaging (spec §14, §15, §22, §26 — Stage 10)

Conversations, text messages, audio messages, Wave shares and Duet Request
communication — all built on the `conversations` / `conversation_members` /
`messages` schema from migration 07, gated end-to-end by the predicates in
migration 10 (`can_message`, `is_conversation_member`, `can_view_wave`,
`is_blocked_between`).

- **`/messages`** — the inbox: other member, last-message preview by kind
  (plain text / "🎙 Audio message" / "Wave shared" / "Duet Request"),
  relative timestamp, unread badge, name search over what's loaded, cursor
  pagination.
- **`/messages/new?to=<username>`** — resolves or creates the 1:1 thread,
  respecting the target's `message_permission` (everyone / followers /
  people I follow / nobody) via `can_message`; an unreachable account (blocked
  either direction, or permission denied) renders a clear "can't start this
  conversation" state rather than a broken thread — spec §21/§26 deliberately
  make a block indistinguishable from a permission denial here, so neither
  party learns which one it was.
- **`/messages/[id]`** — the thread: day separators, grouped bubbles (same
  sender, ≤5 minutes apart), a "Read" line under the viewer's last message
  once the other member's `last_read_at` catches up, and a composer for text
  or an audio message (record in a Sheet, preview, send).
- **Audio messages are never Waves** (spec §22): no title, no visibility, no
  feed/Explore appearance, and no enhancement/waveform processing job —
  `createMessageAudioTicket`/`finalizeMessageAudio`
  (`src/app/(app)/messages/actions.ts`) register the `audio_assets` row and
  verify the uploaded bytes' magic numbers server-side exactly like a Wave
  upload does, then mark the asset `ready` directly instead of enqueueing the
  Wave pipeline. Playback is the same signed-URL path as any private audio
  (`GET /api/audio/[assetId]/url`).
- **Sharing a Wave into a conversation** (spec §14) inserts a `wave_share`
  message plus a best-effort `shares` row (`channel: "message"`). The card
  shown in the thread only ever renders a Wave the recipient is independently
  allowed to see — sharing never widens a Wave's visibility, the same rule
  that governs a copied link.
- **Duet Request messages** are render-only here: `duet_request` kind
  messages show a pending/accepted/declined/cancelled/expired status pill and
  link to the Wave. Creating a request is the Duet stage's job.
- **Realtime:** one shared `postgres_changes` channel per open thread
  (`messages`, filtered by `conversation_id`) plus a `conversation_members`
  listener for the other member's read receipt, both with a polling
  fallback. A separate, per-user shared channel drives the unread-messages
  badge in `TopBar`/`SideNav`, mirroring the notifications badge.
- **Blocking** (spec §26): a blocked-either-way conversation still opens (it
  isn't deleted), but shows "You can't reply to this conversation" and
  disables the composer; `messages_guard_insert` (migration 12) enforces the
  same rule against a direct API call, not just the UI.

## Interactions — Comments, Saves, Shares (spec §14, §25, §26, §38, §39, §43 — Stage 8)

No Likes anywhere (spec §3.4) — Plays/Replays already cover the "this
resonated" signal (§13); Comments/Saves/Shares are the only other social
counters.

- **Comments** are flat with one optional reply level
  (`comments.parent_comment_id`, enforced again by
  `comments_enforce_shallow_threading` even if a caller got the shape wrong).
  `src/app/(app)/w/[id]/interactions.ts` holds every comment/save/share
  Server Action (`loadComments`, `loadReplies`, `createComment`,
  `deleteComment`, `reportComment`, `saveWave`, `unsaveWave`, `recordShare`)
  — kept separate from the Stage 5 `actions.ts` (owner Edit/Delete) rather
  than merged into it. `src/components/comments/CommentsSection.tsx` is the
  `/w/[id]#comments` section: server-rendered first page, client "Load more"
  cursor pagination, replies expanded on demand per root comment.
- **Comment permission** (everyone / followers / nobody, resolved
  Wave-override-then-profile-default exactly like `can_comment_on_wave`,
  migration 10) disables the composer with an honest, specific reason —
  "@creator has turned off comments", "Only followers of @creator can
  comment", "Sign in to comment" — computed by
  `getCommentPermissionState`. The RPC is the actual gate; the reason text is
  just an explanation of what it will say no to.
- **Voice comments were considered and dropped for v1**: the `comments`
  table (migration 05) has no audio-asset column, so comments are text-only,
  capped at `COMMENT_MAX_LENGTH` (1000, mirroring the `comments_body_len`
  CHECK constraint) — see "Open issues" below for the schema change that
  would add it.
- **Saves** toggle optimistically (`src/lib/interactions/saveReducer.ts`): a
  tap flips `isSaved`/the visible count immediately, then rolls back on a
  server rejection — `WaveCardContainer` is the only place this fires, never
  from render.
- **Shares** (`ShareSheet`, `src/components/share/`) never leak a private
  Wave: every channel points at `routes.wave(waveId)`, never the audio's
  signed URL, so opening a shared link still runs through `can_view_wave()`/
  RLS like any other read. Copy link and the platform-native share sheet
  (`navigator.share`, where available) record a `shares` row via
  `recordShare`; "Send in a message" reuses the messaging stage's
  `shareWaveToConversation`/`loadMoreConversations`
  (`src/app/(app)/messages/actions.ts`), which records its own `shares` row
  as part of sending the `wave_share` message — never double-recorded.
- **Profile → Settings → Content** (spec §25) ships all four tabs — Saved,
  Commented, Waves, Duets — as separate routes
  (`/settings/content/{saved,commented,waves,duets}`) sharing one paginated
  list component (`ContentWaveList`) over `src/lib/interactions/contentLists.ts`,
  which hydrates a bare `Wave` page into full `WaveCardContainer` cards
  (signed playback URL resolved lazily on first play, not pre-signed) so
  Save/Share/Comment/Request-a-Duet all work directly from Settings.
- **Analytics** (spec §40): `wave_saved`/`wave_unsaved`/`wave_shared`/
  `comment_created`/`comment_deleted` fire only from the click/submit handler
  that already knows the server action succeeded — mirroring how
  `playTracker.ts` fires Play/Replay events — never from a render path.
- **Resolved in Stage 12** — comments (and follows/messages/Duet
  Requests/shares/reports/uploads) now have exactly the database-level
  throttle this note called for: `20260903140200_rate_limits.sql` (migration
  21). See "Moderation & preferences" below and `SECURITY.md`'s Abuse
  prevention section for the thresholds.

## Moderation & preferences (spec §23, §25, §26, §39 — Stage 12)

**Rate limits** close spec §39's remaining gap: comments, follows, messages,
Duet Requests, shares, reports and audio uploads are all guarded by a
database-level `BEFORE INSERT` check (never application-layer throttling —
see `SECURITY.md` for exact thresholds), so a direct API call cannot exceed
them any more than the UI can. Hitting one shows the same honest copy
everywhere: *"You're doing that too often. Try again in a few minutes."*

**Notification preferences** turn spec §25's "message, Duet, comment,
follower notifications" list into real toggles at `/settings/notifications`
— previously an honest "not available yet" empty state, now a working form.
Four of Notification's fourteen types stay ungated by design: `save`/`share`
have no preference category (spec §25 doesn't list one for them) and always
deliver.

**Moderation foundation** (spec §26) ships the review side of reporting that
was previously only a queue with no way to act on it: `/moderation`
(moderators only — a 404 for everyone else, not a "no access" page) lists
reports with filters (state, target type, reason), a detail Sheet shows the
reporter and the reported Wave/comment/profile/message with a link to it,
and Resolve (`none` / hide the Wave / hide the comment / warn the account /
suspend the account for 7 days) or Dismiss closes it with an audit-trail
entry. **A single report never auto-triggers any of these** — every action
requires a moderator's explicit call, matching the founding rule in spec §26.
A suspended account is redirected to `/suspended` on its next request to any
protected page (`requireUser`, `src/lib/auth/server.ts`) rather than being
signed out outright — it can still view `/suspended` itself and public
routes, just not act on the product until the suspension lapses or a
moderator reverses it.

**Settings → Audio** (spec §25) ships autoplay-next and preferred-quality
toggles, but honestly: both live in this device's `localStorage`
(`src/lib/audio/preferences.ts`), not on the account, because there is no
per-device sync requirement for them and adding a `profiles` column/migration
for a browser preference would be more machinery than the feature is worth.
"Preferred quality" doesn't change what gets fetched yet either — `audio_assets`
stores exactly one processed file per Wave, there is no adaptive-bitrate
pipeline to switch between — the settings page says so rather than pretending
otherwise (spec §44 rule 9, no fake functionality). Autoplay-next is stored
for the same honesty reason it isn't wired into `src/lib/audio/playbackStore.ts`:
that store manages exactly one Wave and has no concept of "what's next" —
that concept belongs to whichever feed/queue is playing it, which is a
future feed-level change, not a Stage 12 one.

**"Download my data"** (spec §25/§26, Settings → Safety) is a real export —
the account's own profile, Wave metadata and comments as one downloadable
JSON file (`src/lib/privacy/dataExport.ts` shapes it; the Server Action
gathers it through the caller's own RLS-scoped client, so it can never
return more than the account can already see of itself) — not a placeholder
button.
