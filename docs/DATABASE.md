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
| — | `fix_creator_wave_performance_ambiguous_wave_id` | Bug fix (42702 ambiguous column) in `creator_wave_performance()` |
| 27 | `audio_enhancement_report` | `audio_assets.enhancement_report` jsonb (Wave B server-side polish pipeline — see "Enhancement report" in `AUDIO_ARCHITECTURE.md`); extends the `audio_assets_guard_update` write guard to cover it; `complete_audio_job` gains a 6th param `p_enhancement_report` (old 5-arg signature dropped, not overloaded) |
| 28 | `backing_tracks` | `backing_tracks` (curated CC0/CC-BY + user-uploaded "open for vocals" instrumentals, spec §4), `waves.backing_track_id` (mutually exclusive with `parent_wave_id`), `list_backing_tracks()` keyset-paginated discovery RPC, RLS (public read for curated/open, owner write) |
| 29 | `duet_v2_notification_type` | Adds `open_call_answered` to `notification_type` — its own migration/transaction because `ALTER TYPE ... ADD VALUE` can't be used in the same transaction that later references it (Wave D) |
| 30 | `duet_v2_open_calls` | `open_calls` (one row per Wave, `is_open`/`prompt`/`deadline_at`), `open_calls_guard()` (server-derives `creator_id`), RLS, `list_open_calls()` keyset RPC, `answer_open_call()` (atomically creates an ALREADY-ACCEPTED `duet_requests` row), `duet_requests_after_change()` updated to fire `open_call_answered` instead of the generic `duet_request`/`duet_accepted` pair when the insert/accept came from `answer_open_call` (Wave D) |
| 31 | `duet_v2_modes` | `duet_mode` enum (`layer \| atisma \| cypher`), `waves.duet_mode`/`segments`/`cypher_order`, `validate_duet_segments()`, `waves_derive_duet_lineage()` extended to derive mode default/cypher_order/segment validation, chain-depth ceiling tightened 32 → 6, `waves_guard_update()` extended to lock the three new columns (Wave D) |
| 32 | `duet_v2_chain_rpc` | `duet_tree(root_wave_id)` — the full chain, `can_view_wave`-filtered per node (Wave D) |
| 33 | `duet_v2_backing_track_lineage` | `waves_after_insert_backing_track_credit()` trigger (credits a backing track's uploader as an already-accepted collaborator the moment a Wave publishes over their track), `list_waves_on_track()` keyset RPC (Wave D) |
| 34 | `challenges` | `challenges`/`challenge_entries`/`challenge_picks` (Prompts & challenges, spec §4 — weekly theme + backing track, curated Top 5), `can_enter_challenge()` predicate, `challenge_entries_guard` (owns/rate-limits entries via `check_rate_limit`, action `'challenge_entry'`), `list_challenges()`/`get_challenge()`/`list_challenge_entries()`/`enter_challenge()` RPCs, `list_waves_by_hashtag()` (hashtag pages — reuses `waves.tags`, no new tagging mechanism) — full write-up: `docs/CHALLENGES.md` |
| 35 | `rate_limit_challenge_entry` | Bug fix: `rate_limit_events_action_known` (migration 21) didn't list `'challenge_entry'`, so `challenge_entries_guard`'s `record_rate_limit_event(..., 'challenge_entry')` call (migration 34) failed every `enter_challenge()` in production with a check-constraint violation. Drops and re-adds the constraint including `'challenge_entry'`. Regression-guarded by `scripts/verify-live-challenges.ts`'s `e2e:enter_challenge` check, which signs in as a throwaway user and actually calls `enter_challenge()` rather than a service-role shortcut (`is_service_request()` would otherwise skip the exact code path that broke) |
| 36 | `challenge_entries_visibility` | Security fix (review2 #1, P0): `challenge_entries_select`/`challenge_picks_select` (migration 34) gated only on the challenge's `status`, so a private/hidden Wave's entry — or a blocked entrant's — was readable by anyone once its challenge went `live`, despite both tables being granted `select` to `anon`. Both policies recreated to also require `can_view_wave(wave_id)` on the general read branch, keeping the `user_id = auth.uid()`/`is_moderator()` escapes exactly as they were (matches `comments_select`'s `can_view_wave` gate). `list_challenge_entries()` and `listChallengePicks` (`src/lib/db/challenges.ts`) are both SECURITY INVOKER/plain selects with no RLS bypass of their own, so this migration alone closes the read path for both — no function body changes needed. Also fixes review2 #17 (P2): `enter_challenge()`'s idempotency lookup ran before any authorization check, so a direct RPC call could probe whether an arbitrary `wave_id` had entered a challenge whose entries RLS would otherwise hide, and could hand back another user's entry id; the `can_enter_challenge` check now runs first and the lookup is scoped to `user_id = auth.uid()`. Regression-guarded by `scripts/verify-live-challenges.ts`'s `rls:private-entry-visibility` check (a private Wave's entry: invisible to anon, invisible to another signed-in user, visible to its owner) |
| 37 | `fix_direct_conversation_upsert` | Bug fix (full QA report, P0): `get_or_create_direct_conversation()` (migration 10) always failed with Postgres 42P10 ("no unique or exclusion constraint matching the ON CONFLICT specification") on the very first DM between two accounts. `conversations_direct_key_uniq` (migration 07) is a *partial* unique index (`where direct_key is not null`); the function's `on conflict (direct_key) do update ...` didn't repeat that predicate, and Postgres requires an exact match to a partial index's own `where` clause. Re-created with `on conflict (direct_key) where direct_key is not null do update ...` — no schema change, function body only. Regression-guarded by `scripts/verify-live-messaging.ts` (two throwaway accounts open a DM twice and get back the same conversation id, then exchange a text and a voice message) |
| 38 | `push_subscriptions` | `push_subscriptions` (Web Push endpoint + keys, one row per browser/device, unique on `endpoint`), owner-only RLS (`select`/`insert`/`update`/`delete` all scoped to `user_id = auth.uid()`) — Wave E PWA, `docs/PRODUCT_V2.md` §4 "push notifications for Duet requests/answers, open-call answers". Sending itself (`src/lib/push/send.ts`) uses the admin client, since the recipient of a push is never the caller who triggered it — see that module's own header comment. |
| 39 | `delete_user_cascade` | Bug fix: deleting an account whose Waves/audio/duet requests are referenced by someone ELSE's still-existing message failed outright. `messages.audio_asset_id`/`shared_wave_id`/`duet_request_id` (migration 07) were `on delete set null`, but `messages_payload_matches_kind` (same migration) requires the matching column non-null for that message's `kind`. Deleting an account cascades away anything it owns (a Wave, an audio asset, a duet request); if another account's message pointed at that thing — someone shared your Wave into a DM, or was the other party to a duet request you sent — Postgres's `on delete set null` immediately violated the check constraint and aborted the whole account deletion. Reproduced directly against the live project: account A published a Wave, account B shared it into a DM thread with A (`kind = 'wave_share'`), and deleting A failed with `check constraint "messages_payload_matches_kind"`. Fixed by re-pointing all three FKs at `on delete cascade` instead — a message's payload disappearing means the message itself is no longer a coherent message, so the delete now cascades through to the message row rather than nulling out a column the check constraint requires (`messages.sender_id`/`conversation_id`, already `on delete cascade`, were untouched). Regression-guarded by `scripts/verify-live-delete.ts`, which provisions one throwaway account with a Wave, a comment, a text message, a voice message, a `wave_share` message sent by a SECOND account referencing the subject's Wave (the exact regression shape), a duet request, a follow, two notifications and a challenge entry, plus real objects in both storage buckets, then runs the real `deleteAccount` sequence (storage cleanup via the Storage REST API — what `deleteUserStorageObjects`, `src/lib/storage/userObjects.ts`, does — then `auth.admin.deleteUser`) and asserts zero leftover rows or storage objects anywhere. **Not just an account-deletion effect** (review3 finding 32): the same cascade fires on an ordinary `deleteWaveDetails` (`w/[id]/actions.ts`) — deleting your own Wave silently removes another person's `wave_share` message (or a Duet request's message) from their conversation too, with no notice on either side. Kept as-is rather than switched to a tombstone row, which would need `messages_payload_matches_kind` relaxed to allow a null payload — a separate, larger change. |
| 40 | `subscriptions` | AKINTI Pro (Wave F, PRODUCT_V2 §4/§5, `docs/BILLING.md`): `plans` (the four sellable SKUs, public read-only catalog), `subscriptions` (one row per subscription ever held, owner-only read, service-role-only write), `billing_events` (append-only webhook ledger, `(provider, event_id)` unique for idempotent replay — no client access at all, mirrors `rate_limit_events`), `has_pro(user_id)` (SECURITY DEFINER — the single entitlement predicate, `src/lib/billing/entitlements.ts`). Adds `'billing_checkout'` to `rate_limit_events_action_known` (5/hour, checked directly from `startProCheckout` via `check_rate_limit`/`record_rate_limit_event` RPCs rather than a `BEFORE INSERT` trigger, since a checkout attempt has no natural insert to hang one off). |
| 41 | `flow` | Flow, the full-screen continuous listening feed (founder decision, 6 Sept 2026, `docs/FLOW.md`): `flow_impressions` (owner-only, no client write path — `user_id`/`wave_id` primary key, `seen_at`/`completed`/`skipped_at_ms`, 7-day repeat exclusion), `get_flow_page(cursor, seed, limit)` (SECURITY INVOKER keyset-ranked page — followed-unheard, then duets of the viewer's Waves, then live-challenge entries/picks, then 48h-decayed rising diversified by creator/genre, with an Open-Call/backing-track "invitation" spliced in every 8th slot), `record_flow_event(wave_id, kind, position_ms)` (impression/complete/skip/replay, rate-limited via `check_rate_limit` action `'flow_event'`, 600/hour — adds `'flow_event'` to `rate_limit_events_action_known`), `count_flow_new()` (the nav badge count). Full write-up: `docs/FLOW.md` "Engineering". |
| 42 | `pro_presets_pitch` | Widens `audio_enhancement_preset` with `pitch_snap`/`self_harmony` (AKINTI Pro sounds, already named in `src/lib/audio/enhancement.ts`/`scripts/worker.ts` but not valid at the database layer until now); adds `audio_assets.pitch_score` jsonb (chosen over `waves.pitch_score` — see "Pitch score" in `AUDIO_ARCHITECTURE.md` for why), extends `audio_assets_guard_update` to cover it, and adds `set_audio_asset_pitch_score()` (service-role-only, a narrow best-effort setter separate from `complete_audio_job` so a sidecar failure after the job already succeeded can never re-open or fail it) |
| — | `profile_signature_hue` (`20260906220000`) | fixQA2, QA `full2` defect #1: replaces the inert appearance-preset system (`profiles.bg_color`/`bg_gradient`/`bg_pattern`/`accent_color`, migration 2 — a violet accent and a plum background preset, five gradient presets, no visible effect anywhere) with a single `profiles.signature_hue` text column (nullable, checked against `'current'`/`'genre-turku'`/`'genre-rap'`/`'genre-arabesk'` — `SIGNATURE_HUES`, `src/types/domain.ts`). Drops the four old columns and their enum types. `null` falls back to the existing tag-derived genre hue (`deriveGenreHue`). Theme mode (system/light/dark) is a cookie only (`akinti_theme`, `src/lib/ui/themeMode.ts`), not a DB column — no product reason for it to follow the account across devices. |
| — | `challenge_locale` (`20260906220100`) | fixQA2, QA `full2` defect #3: adds `challenges.title_tr`/`brief_tr` (nullable, same length constraints as `title`/`brief`), rendered by request locale via `localizeChallenge()` (`src/lib/db/challenges.ts`); `null` falls back to the English column. `list_challenges()`/`get_challenge()` need no change (`select *`/`c.*`). `scripts/seed-challenges.ts` now updates title/brief/title_tr/brief_tr on every run instead of skipping an already-seeded row, and both live challenge rows have been re-seeded with hand-written Turkish and a corrected (previously broken bilingual, em-dash-violating) English brief for "atisma-call". |

## Entities

**Identity/graph:** `profiles` (1:1 with `auth.users`, created by
`handle_new_user` trigger), `follows` (`pending` only for private-profile
targets), `blocks` (directional storage, symmetric effect via
`is_blocked_between`).

**Audio:** `audio_assets` (original + processed paths in the private `audio`
bucket, duration, mime, size, `peaks` jsonb, `processing_status`,
`enhancement_preset` (includes the two AKINTI Pro sounds, `pitch_snap`/
`self_harmony`, as of migration 42), `enhancement_report` jsonb — which
pipeline stages ran and what they measured, see "Enhancement report" in
`AUDIO_ARCHITECTURE.md` — and `pitch_score` jsonb, a best-effort pYIN score
written after the fact by `set_audio_asset_pitch_score()`, null when never
computed, see "Pitch score" in `AUDIO_ARCHITECTURE.md`),
`audio_processing_jobs` (the worker queue — see `AUDIO_ARCHITECTURE.md`).

**Backing tracks (spec §4):** `backing_tracks` — curated (seeded,
`uploader_id null`) or user-uploaded ("open for vocals") instrumentals:
`license` (`cc0 | cc_by | owner_upload`), `source_url` (required for
`cc_by`), `bpm`/`musical_key`/`genre_tags` for discovery, `audio_asset_id`.
Singing over one sets `waves.backing_track_id` (mutually exclusive with
`parent_wave_id` — it is not a Duet of another Wave).

**Content:** `waves` (the social object — creator, audio asset, title,
visibility, per-Wave comment/duet permission overrides, duet lineage,
`backing_track_id`, trigger-maintained counters), `wave_collaborators`
(`pending | accepted | declined`, never auto-accepted).

**Open Calls (Wave D, spec §3-4):** `open_calls` — one row per Wave
(`open_calls_one_per_wave`), a creator's own "open for anyone to Duet" flag:
`prompt` (optional), `deadline_at` (optional), `is_open`/`closed_at`.
`answer_open_call(wave_id)` skips the request/accept round trip entirely,
creating an already-`accepted` `duet_requests` row in one atomic call. Full
write-up: `DUET_SPEC.md`.

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

**Prompts & challenges (spec §4):** `challenges` (weekly theme, optional
`backing_track_id`/`duet_mode`, `status` `draft | live | closed`),
`challenge_entries` (a Wave submitted to a challenge, unique per
`(challenge, wave)`), `challenge_picks` (the curated Top 5, unique per
`(challenge, rank)` and `(challenge, wave)`). Reading either table requires
`can_view_wave(wave_id)` in addition to the challenge being `live`/`closed`
(migration 36; the entrant/moderator escapes are unaffected) — a private,
hidden, or blocked-creator Wave's entry is exactly as unreachable as it
would be anywhere else in this schema. Hashtag pages
(`list_waves_by_hashtag`) reuse `waves.tags` — no separate tagging
mechanism. Full write-up: `docs/CHALLENGES.md`.

**Notifications/moderation:** `notifications` (grouped by `group_key`; see
below), `reports` (`open → reviewing → actioned | dismissed`, never
auto-actioned on a single report), `moderation_actions` (append-only audit
trail — one row per `resolve_report`/`dismiss_report` call), `rate_limit_events`
(append-only ledger backing the per-account rate limits, spec §39 — no
client access, only through `check_rate_limit()`/`record_rate_limit_event()`),
`push_subscriptions` (Web Push endpoint + keys per browser/device, owner-only
— migration 38, `src/lib/push/subscriptions.ts`).

**Flow (founder decision, 6 Sept 2026):** `flow_impressions` — owner-only,
no client write path, `(user_id, wave_id)` primary key, `seen_at` (refreshed
on every impression), `completed`, `skipped_at_ms`. Excludes a Wave from
`get_flow_page()` for 7 days after it was last shown to that viewer. Full
write-up: `docs/FLOW.md`.

**AKINTI Pro billing (Wave F, spec §4/§5):** `plans` (public read-only
catalog of the four sellable SKUs — `pro_monthly_try`/`pro_yearly_try`/
`pro_monthly_usd`/`pro_yearly_usd`, each tied to exactly one provider),
`subscriptions` (history, owner-only read, service-role-only write —
`current_period_end`/`cancel_at_period_end`/`status`), `billing_events`
(append-only webhook ledger, no client access). Full write-up, including the
two providers' different correlation strategies: `docs/BILLING.md`.

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
through the request/mix job, not a data copy. Chain depth is capped at 6
(tightened from an arbitrary 32 in Wave D); duetting a Duet has always been
allowed at the schema level, nothing special was needed to support it. Full
detail: `DUET_SPEC.md`.

**Duet modes (Wave D).** `waves.duet_mode` (`layer | atisma | cypher`,
server-defaulted to `layer` for any duet Wave that doesn't request a mode)
plus `waves.segments` (`atisma` only — an ordered `[{source, startMs,
endMs}]` jsonb array, validated by `validate_duet_segments()`) and
`waves.cypher_order` (`cypher` only — 1-based position, capped at 4
participants). All three are derived/validated by the same
`waves_derive_duet_lineage` trigger that already owned tree shape, and locked
against post-publish edits by `waves_guard_update`, exactly like
`duet_depth`. `duet_tree(root_wave_id)` returns the whole chain
(id/parent/creator/depth/mode/cypher_order/counts), `can_view_wave`-filtered
per node — `src/lib/duet/chain.ts` turns that into a nested tree plus
chain-length/branch stats. Full detail, including the worker's ffmpeg
rendering per mode: `DUET_SPEC.md`.

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

`answer_open_call(wave_id)` (migration 30) reuses `can_request_duet` as its
base permission gate (view + not-self + blocks + resolved duet-permission
audience) rather than re-implementing any of it — the open call only removes
the request/accept round trip, not the underlying permission rules.
`duet_tree(root_wave_id)` (migration 32) and `list_waves_on_track(track_id)`
(migration 33) both re-check `can_view_wave` per row rather than once at the
top, the same "SECURITY DEFINER re-implements the RLS filter explicitly"
pattern `list_backing_tracks`/`list_open_calls` use.

`can_enter_challenge(challenge_id, wave_id)` (migration 34) joins this set
for Prompts & challenges: the challenge must be `live` and the caller must
own the Wave. Both `challenge_entries_insert` RLS and the `enter_challenge()`
RPC call it rather than each re-implementing it — full write-up:
`docs/CHALLENGES.md`.

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
