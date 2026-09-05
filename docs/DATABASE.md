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
| 15 | `audio_asset_column_security` | Security fix: revokes table-level `SELECT` on `audio_assets` from `anon`/`authenticated` and re-grants it scoped to every column except `original_path`/`processed_path` (spec §33) — see "Storage security" in `AUDIO_ARCHITECTURE.md` |
| 16 | `realtime_publication` | Adds `notifications`, `messages`, `audio_assets` to the `supabase_realtime` publication (guarded, idempotent) |
| 17 | `profile_visibility_blocker_exception` | Fix: `can_view_profile()` was symmetric on blocks, which also hid a blocked account's identity from the person who blocked them; now directional — the blocker keeps visibility, the blocked party still does not |
| 18 | `explore_discovery` | `rising_creators()`, the Original-content partial index |
| 19 | `realtime_audio_assets_security_fix` | Security fix: removes `audio_assets` from the `supabase_realtime` publication (`postgres_changes` broadcasts full rows, leaking the column-locked storage paths — see `SECURITY.md`) |
| 20 | `rising_creators_security_definer` | Security fix: `rising_creators()` made `SECURITY DEFINER` so its `follows` aggregate isn't RLS-narrowed per viewer; output still filtered through `can_view_profile` |
| 21 | `rate_limits` | `rate_limit_events`, `check_rate_limit()`/`record_rate_limit_event()`/`prune_rate_limit_events()`, `BEFORE INSERT` rate-limit guards on `comments`/`follows`/`messages`/`duet_requests`/`shares`/`reports`/`audio_assets` (spec §39) |
| 22 | `notification_preferences` | `profiles.notification_preferences` jsonb + CHECK constraint, `notification_category()`, `push_notification()` updated to respect preferences (spec §23, §25) |
| 23 | `moderation_foundation` | `moderation_action_type` enum, `profiles.is_moderator`/`suspended_until`, `waves.hidden_at`, `can_view_wave()` updated, `is_moderator()`, `moderation_actions` (audit trail), `claim_report()`/`resolve_report()`/`dismiss_report()` (spec §26) |
| 24 | `creator_analytics` | `play_events.suspicious`, `flag_suspicious_play_events()`, `wave_listen_is_suspicious()`, `creator_overview()`/`creator_timeseries()`/`creator_wave_performance()`, `product_health()` (moderator-only) — spec §13, §27, §28, §40, §43 Stage 13 |
| 25 | `composite_pagination_indexes` | Drop-and-recreate of the ordering index behind every keyset-paginated list helper (Waves' `published_at`, comments'/messages'/saves' `created_at`, notifications' `updated_at`, conversations' `last_message_at`), each now trailing an id (or, for `saves`, `wave_id`) tiebreaker column — see "Composite keyset cursors" below |
| 26 | `composite_pagination_indexes_2` | Same treatment for the five helpers migration 25 left out of scope: `duet_requests`' recipient/requester indexes, `shares`' wave index, `follows`' followee/follower indexes (tiebreaker: the other side of the edge, `follows` having no surrogate id), and `reports`' reporter and moderation-queue indexes — see "Composite keyset cursors" below |

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
`parent_comment_id`), `saves`, `shares`, `play_events` (raw, append-only,
plus `suspicious` — migration 24's anomaly flag, see below),
`wave_listens` (deduplicated per `(wave, listener)`, the only table
`play_count`/`replay_count` actually derive from).

**Duets:** `duet_requests` (`pending → accepted | declined | cancelled |
expired`, `expires_at`). Full schema and lifecycle: `DUET_SPEC.md`.

**Messaging:** `conversations` (`direct` deduped via `direct_key`, or
`group`), `conversation_members`, `messages` (`text | audio | wave_share |
duet_request`, payload shape enforced by a CHECK constraint per `kind`).

**Notifications/moderation:** `notifications` (grouped by `group_key`; see
below), `reports` (`open → reviewing → actioned | dismissed`, never
auto-actioned on a single report), `moderation_actions` (append-only audit
trail — one row per `resolve_report`/`dismiss_report` call), `rate_limit_events`
(append-only ledger backing the per-account rate limits, spec §39 — no
client access, only through `check_rate_limit()`/`record_rate_limit_event()`).

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

**Composite keyset cursors (migration 25).** Every cursor-paginated list
helper in `src/lib/db` (the home feed, Explore's lanes, a profile's
Waves/Duets tabs, Saved, Wave comments and their replies, "Commented Waves",
messages, the conversation inbox, notifications) orders on a timestamp column
that is not unique on its own — two rows can share the same `published_at`/
`created_at`/`updated_at`/`last_message_at`. `src/lib/db/types.ts` encodes the
page cursor as that timestamp plus a tiebreaker (`encodeCursor`/
`decodeCursor`) and filters the next page with `keysetFilter`'s
`column < cursor.ts OR (column = cursor.ts AND idColumn < cursor.id)` — a
total order, so a tied pair can never be skipped or repeated across a page
boundary. The tiebreaker is each table's `id` primary key, except `saves`
(no surrogate id; `wave_id` is unique once a query is already scoped to one
`profile_id`). `decodeCursor` also accepts a bare timestamp — the format
every cursor was before this migration — so an old bookmarked/cached cursor
still works, just without the tie-safety for that one page. Migration 25
replaced each backing index with a `(..., ts desc, id desc)` (or `asc` for
`listCommentReplies`, which pages oldest-first) composite so the new filter
still hits an index.

Migration 26 (`composite_pagination_indexes_2`) closed the same gap in the
five helpers migration 25 left out: `duetRequests.ts`'s
`listIncomingDuetRequests`/`listOutgoingDuetRequests` (tiebreaker: `id`),
`shares.ts`'s `listWaveShares` (`id`), `follows.ts`'s
`listFollowers`/`listFollowing`/`listPendingFollowRequests`, `reports.ts`'s
`listMyReports` (`id`), and `moderation.ts`'s `listModerationQueue` (`id`).
`follows` has no surrogate id (its primary key is `(follower_id,
followee_id)`); each of its three list helpers scopes the query to one side
of the edge, so the other side — unique per row once scoped — is the
tiebreaker, the same reasoning as `saves.wave_id` above. Every backing index
(`duet_requests_recipient_idx`/`_requester_idx`, `shares_wave_idx`,
`follows_followee_idx`/`_follower_idx`, `reports_reporter_idx`,
`reports_queue_idx`) was likewise upgraded to a `(..., ts desc, id desc)`
composite (`reports_queue_idx` also gained a matching `desc` direction on
`created_at`, which the pre-migration index left ascending).

**Notifications are grouped by construction**, not deduplicated after the
fact. `push_notification()` upserts on `(recipient_id, group_key)`: while a
group is unread, new events bump `count` and refresh `actor_id`; once read,
the next event resets the group to a fresh unread notification with
`count = 1`. This is what "Maria and 2 others saved your Wave" is built from.

**Search is deterministic today, swappable later.** `pg_trgm` indexes +
`search_profiles`/`search_waves`. Callers use the RPCs, never raw `ILIKE`
queries, so the implementation can change without touching call sites.

**Rate limits are a generic counter, not a table per action** (migration 21,
spec §39). `rate_limit_events(profile_id, action, created_at)` plus
`check_rate_limit(profile_id, action, max_count, window)` (raises SQLSTATE
`AKRTL`) and `record_rate_limit_event(profile_id, action)`, called from a
`BEFORE INSERT` guard on each of `comments`/`follows`/`messages`/
`duet_requests`/`shares`/`reports`/`audio_assets`. Exact thresholds and the
app-layer error mapping: `SECURITY.md`.

**Notification preferences gate at the single write path, not at read time**
(migration 22, spec §23/§25). `profiles.notification_preferences` (jsonb,
keys `message | duet | comment | follower | system`) is checked inside
`push_notification()` itself via `notification_category(type)` — a
disabled category means the row is never inserted, not inserted-then-filtered.
`save`/`share` notifications have no gating key and always deliver.

**Wave hiding is a moderation state, not a delete** (migration 23, spec
§26). `waves.hidden_at` is orthogonal to `waves.deleted_at`: a hidden Wave
still exists and still counts toward `wave_count`, it is just invisible to
everyone but the creator and moderators (`can_view_wave`, updated in
migration 23) — reversible, and never set except by
`resolve_report(..., 'hide_wave')`. Hiding a *comment* deliberately reuses
`comments.deleted_at` instead of adding a parallel column, since the
visibility effect a moderator wants there is identical to the author's own
delete path.

**`audio_assets.original_path`/`processed_path` are column-locked, not just
RLS-gated.** Table-level `SELECT` on `audio_assets` implicitly covers every
column, so RLS alone (migration 12) was not enough to keep the two raw
storage keys out of a direct PostgREST query — migration 15 revokes
table-level `SELECT` from `anon`/`authenticated` and re-grants it scoped to
every column except those two. Full write-up: "Storage security" in
`AUDIO_ARCHITECTURE.md`.

**Creator analytics + product health RPCs never take a target id** (migration
24, spec §27/§28). `creator_overview(p_days)`, `creator_timeseries(p_days)`
and `creator_wave_performance(p_days, p_limit)` all resolve `auth.uid()`
internally — there is no `p_creator_id` argument to forge, so "only callable
for `auth.uid() = creator`" is true by construction rather than by an
argument check. `product_health(p_days)` takes no target at all; it
re-checks `is_moderator()` itself, exactly like `resolve_report`/
`dismiss_report` do, never trusting the caller's own `/analytics/health`
`notFound()` gate. Every `p_days` argument across all four is restricted to
`7 | 30 | 90` (`check ... using errcode = 'check_violation'`), mirrored by
`src/lib/analytics/range.ts`'s `analyticsRangeSchema` so a bad value never
reaches the network. Full metric definitions and the meaningful-vs-raw
split: `PRODUCT.md`.

**The anomaly flag is a column plus a manually-invoked function, not a
trigger** (migration 24, spec §27). `play_events.suspicious boolean default
false` is set by `flag_suspicious_play_events()`: more than 20 qualifying
(`counted_play`/`counted_replay`) listens of one Wave from one
`listener_key` on one calendar day. It is deliberately **not** a trigger —
the rule needs to see a whole day's worth of a session's history at once,
which a per-row `AFTER INSERT` trigger cannot cheaply evaluate — so it is
meant to run periodically instead. **Open item: nothing in this codebase
calls it yet.** `scripts/worker.ts`'s `runMaintenance()` (it already calls
`requeue_stalled_audio_jobs`/`expire_duet_requests` roughly once a minute)
is the right place — add
`admin.rpc("flag_suspicious_play_events")` there alongside those two calls.
This migration does not touch `scripts/worker.ts` itself (out of this
agent's owned files for Stage 13); every analytics/health RPC excludes
flagged rows regardless via `wave_listen_is_suspicious()`, so the feature is
correct today, just not self-maintaining until that one call is added.

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

`is_moderator(profile_id default auth.uid())` (migration 23) joins this set:
`can_view_wave()` calls it to admit moderators to a hidden Wave,
`reports_select_moderator`/`moderation_actions_select_moderator` RLS
(migration 23) key off it directly, and `claim_report`/`resolve_report`/
`dismiss_report` independently re-check it server-side rather than trusting
any app-layer gate.

**Migration 17 exception:** `can_view_profile()` is the one predicate that is
*not* symmetric on blocks. It originally denied identity-card visibility
whenever `is_blocked_between()` was true in either direction — which also
hid a blocked account's own username/avatar from the person who blocked
them, breaking anything rendering a "Blocked accounts" list.
`src/lib/db/profiles.ts`'s blocking neighbor, `src/lib/db/blocks.ts`
(profiles agent-owned), worked around this with an admin-client lookup
(`listBlockedProfilesWithIdentity`) before the fix shipped; that workaround
can be simplified back to a normal RLS-scoped read now that
`can_view_profile()` itself lets the blocker see who they blocked. Every
other blocked-pair predicate (`is_blocked_between`, `can_view_wave`,
`can_message`, `can_comment_on_wave`, `can_request_duet`,
`can_view_profile_content`, ...) is untouched and stays fully symmetric.

## Realtime

Three tables are in the `supabase_realtime` publication as of migration 16
(`notifications`, `messages`, `audio_assets`) — everything else is outside
it by default, since Supabase Realtime only streams `postgres_changes` for
tables explicitly added. `audio_assets` is provisioned for a future
Realtime-driven "Processing" banner but is not actually subscribed to today:
the current Wave-detail implementation polls `processing_status` instead
(simpler for a state that only changes a few times over a couple of
minutes) — see "Processing state" in `AUDIO_ARCHITECTURE.md`.

## Applying migrations

See `supabase/README.md`. Short version: Supabase CLI
(`supabase db reset` locally, `supabase db push` against a hosted project)
or paste each file into the SQL editor in order. **Docker is not available in
this environment** — migrations here have been validated by careful manual
review, not by running `supabase start`. Run them against a real (even free
tier) Supabase project before shipping.
