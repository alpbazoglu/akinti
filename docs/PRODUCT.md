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

## Product differentiation checklist (spec §48)

For every feature decision, ask: does this make the experience more
**audio-native** and more **socially collaborative**? Concretely:

- Wave replaces the post; the waveform replaces the image preview.
- Plays replace views; Replays represent repeated listening.
- Saves replace passive appreciation; Shares distribute audio.
- Duets create collaboration — social relationships become creative ones.

If a proposed feature doesn't serve one of the above, it probably doesn't
belong in v1.
