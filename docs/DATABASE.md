# AKINTI — Database

Postgres via Supabase. Every table lives in `public`. This is the map; the
migrations under `supabase/migrations/*.sql` are the actual source of truth
— read them for exact column types, constraints and indexes. Apply/rollback
instructions: `supabase/README.md`.

## Migrations (apply in order; each has a `down/` rollback)

| # | File | Contents |
|---|---|---|
| 01 | `extensions_enums_helpers` | `pgcrypto`, `pg_trgm`, every enum type, `set_updated_at()`, `is_service_request()`, `direct_conversation_key()` |
| 02 | `identity_and_social_graph` | `profiles`, signup trigger (`handle_new_user`), `follows`, `blocks` |
| 03 | `audio_assets_and_jobs` | `audio_assets`, `audio_processing_jobs`, queue RPCs (`claim_audio_jobs`, `complete_audio_job`, `fail_audio_job`, `requeue_stalled_audio_jobs`, `enqueue_audio_job`) |
| 04 | `waves_and_collaborators` | `waves`, duet-lineage trigger, `wave_collaborators` |
| 05 | `interactions` | `comments`, `saves`, `shares`, `play_events`, `wave_listens` |
| 06 | `duet_requests` | `duet_requests`, closes the `waves.duet_request_id` FK, `expire_duet_requests()` |
| 07 | `messaging` | `conversations`, `conversation_members`, `messages` |
| 08 | `notifications` | `notifications`, `push_notification()`, `mark_notifications_read()` |
| 09 | `moderation` | `reports` |
| 10 | `authorization_functions` | Every `can_*`/`is_*` predicate (the single source of truth for visibility) |
| 11 | `counters_and_events` | All counter-maintenance + notification-fanout triggers; Play/Replay logic |
| 12 | `row_level_security` | Write guards, RLS enabled + policies on every table, grants |
| 13 | `storage` | `audio` (private) and `avatars` (public) buckets + object policies |
| 14 | `search` | trigram indexes, `search_profiles`, `search_waves`, `wave_trending_score`, `trending_waves` |

## Entities

**Identity/graph:** `profiles` (1:1 with `auth.users`, created by
`handle_new_user` trigger), `follows` (`pending` only for private-profile
targets), `blocks` (directional storage, symmetric effect via
`is_blocked_between`).

**Audio:** `audio_assets` (original + processed paths in the private `audio`
bucket, duration, mime, size, `peaks` jsonb, `processing_status`,
`enhancement_preset`), `audio_processing_jobs` (the worker queue — see
`AUDIO_ARCHITECTURE.md`).

**Content:** `waves` (the social object — creator, audio asset, title,
visibility, per-Wave comment/duet permission overrides, duet lineage,
trigger-maintained counters), `wave_collaborators` (`pending | accepted |
declined`, never auto-accepted).

**Engagement:** `comments` (flat + one optional reply level via
`parent_comment_id`), `saves`, `shares`, `play_events` (raw, append-only),
`wave_listens` (deduplicated per `(wave, listener)`, the only table
`play_count`/`replay_count` actually derive from).

**Duets:** `duet_requests` (`pending → accepted | declined | cancelled |
expired`, `expires_at`). Full schema and lifecycle: `DUET_SPEC.md`.

**Messaging:** `conversations` (`direct` deduped via `direct_key`, or
`group`), `conversation_members`, `messages` (`text | audio | wave_share |
duet_request`, payload shape enforced by a CHECK constraint per `kind`).

**Notifications/moderation:** `notifications` (grouped by `group_key`; see
below), `reports` (`open → reviewing → actioned | dismissed`, never
auto-actioned on a single report).

## Design decisions worth knowing

**Soft delete.** `waves.deleted_at` and `comments.deleted_at` — rows are
never hard-deleted from these tables. Every read path filters `deleted_at is
null`; `can_view_wave()` does the same. Counters correctly decrement on
soft-delete and re-increment on restore (`waves_after_change` trigger).

**Duet tree.** Every Wave has `original_wave_id` (root of the chain, indexed
for "all Duets of X") and `parent_wave_id` (immediate ancestor, the actual
tree edge), derived server-side by `waves_derive_duet_lineage` — a client can
propose `parent_wave_id` but never `original_wave_id` or `duet_depth`. A Duet
never copies audio: it references the parent's `audio_asset_id` chain only
through the request/mix job, not a data copy. Full detail: `DUET_SPEC.md`.

**Counters are trigger-maintained, never client-writable.** `waves_guard_insert`/
`waves_guard_update` (migration 12) force `play_count`, `replay_count`,
`comment_count`, `save_count`, `share_count`, `duet_count` back to their
database-owned values on any client insert/update. The only path that moves
them is the relevant `*_after_change` trigger in migration 11.

**Play/Replay is server-authoritative.** Clients report raw playback via
`record_play_event()`; the function alone decides what counts. Exact
thresholds: `AUDIO_ARCHITECTURE.md`.

**Notifications are grouped by construction**, not deduplicated after the
fact. `push_notification()` upserts on `(recipient_id, group_key)`: while a
group is unread, new events bump `count` and refresh `actor_id`; once read,
the next event resets the group to a fresh unread notification with
`count = 1`. This is what "Maria and 2 others saved your Wave" is built from.

**Search is deterministic today, swappable later.** `pg_trgm` indexes +
`search_profiles`/`search_waves`. Callers use the RPCs, never raw `ILIKE`
queries, so the implementation can change without touching call sites.

## Indexes worth knowing about

`waves(creator_id, published_at desc) where deleted_at is null` (profile/feed
reads), `waves(published_at desc) where visibility='everyone'` (public feed),
`waves(original_wave_id, ...)`/`waves(parent_wave_id, ...)` (duet tree),
`follows(follower_id/followee_id, status, created_at desc)`,
`audio_processing_jobs(priority, run_after, id) where status='pending'` (the
queue claim scan), trigram GIN indexes on `profiles.username`/`display_name`
and `waves.title`/`description`.

## Authorization predicates (migration 10)

`can_view_wave`, `can_comment_on_wave`, `can_request_duet`,
`can_view_audio_asset`, `can_view_profile`/`can_view_profile_content`,
`is_following`, `are_mutual_followers`, `is_blocked_between`,
`audience_allows`, `can_message`, `is_conversation_member`. RLS policies
(migration 12) and application code both call these — they are the *only*
place a visibility rule is written down. Full write-up: `SECURITY.md`.

## Applying migrations

See `supabase/README.md`. Short version: Supabase CLI
(`supabase db reset` locally, `supabase db push` against a hosted project)
or paste each file into the SQL editor in order. **Docker is not available in
this environment** — migrations here have been validated by careful manual
review, not by running `supabase start`. Run them against a real (even free
tier) Supabase project before shipping.
