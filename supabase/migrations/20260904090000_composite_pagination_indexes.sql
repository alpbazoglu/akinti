-- AKINTI — 25. composite keyset-pagination indexes.
--
-- Every cursor-paginated list helper in `src/lib/db` ordered on a timestamp
-- column that is NOT unique (`published_at`, `created_at`, `updated_at`,
-- `last_message_at`) with a plain `< cursor` filter and no tiebreaker. Two
-- rows sharing the same timestamp (a burst of Waves published in the same
-- migration seed, two comments landing in the same millisecond, ...) could
-- straddle a page boundary and either be skipped or repeated across pages.
--
-- `src/lib/db/types.ts` (`encodeCursor`/`decodeCursor`/`keysetFilter`) now
-- encodes a `(timestamp, id)` composite cursor and filters with
-- `column < cursor.ts OR (column = cursor.ts AND idColumn < cursor.id)` —
-- this migration replaces the single-column ordering index backing each of
-- those queries with a `(..., ts, id)` composite so the new filter still
-- hits an index instead of falling back to a sort. Every index below is a
-- drop-and-recreate of an index from an earlier migration (same predicate,
-- same leading columns), not a new access path.
--
-- `notifications_inbox_idx` orders on `updated_at`, not `created_at` — that
-- is genuinely the column `listNotifications` sorts and paginates on
-- (migration 08), `created_at` is never part of its predicate.

-- ---------------------------------------------------------------------------
-- waves (published_at) — migration 04 + 18.
-- ---------------------------------------------------------------------------
drop index if exists public.waves_creator_published_idx;
create index waves_creator_published_idx
  on public.waves (creator_id, published_at desc, id desc)
  where deleted_at is null;

drop index if exists public.waves_public_published_idx;
create index waves_public_published_idx
  on public.waves (published_at desc, id desc)
  where deleted_at is null and visibility = 'everyone';

drop index if exists public.waves_original_idx;
create index waves_original_idx
  on public.waves (original_wave_id, published_at desc, id desc)
  where original_wave_id is not null and deleted_at is null;

drop index if exists public.waves_parent_idx;
create index waves_parent_idx
  on public.waves (parent_wave_id, published_at desc, id desc)
  where parent_wave_id is not null and deleted_at is null;

drop index if exists public.waves_original_content_published_idx;
create index waves_original_content_published_idx
  on public.waves (published_at desc, id desc)
  where deleted_at is null and visibility = 'everyone' and content_origin = 'original';

-- ---------------------------------------------------------------------------
-- comments (created_at) — migration 05.
-- ---------------------------------------------------------------------------
drop index if exists public.comments_wave_root_idx;
create index comments_wave_root_idx
  on public.comments (wave_id, created_at desc, id desc)
  where parent_comment_id is null and deleted_at is null;

-- Replies list ascending (oldest first); the tiebreaker matches that order.
drop index if exists public.comments_replies_idx;
create index comments_replies_idx
  on public.comments (parent_comment_id, created_at, id)
  where parent_comment_id is not null and deleted_at is null;

-- Backs `listCommentedWaves` (`comments.ts`), which paginates the caller's
-- own comments by `author_id` ordered `created_at desc`.
drop index if exists public.comments_author_idx;
create index comments_author_idx
  on public.comments (author_id, created_at desc, id desc);

-- ---------------------------------------------------------------------------
-- messages (created_at) — migration 07.
-- ---------------------------------------------------------------------------
drop index if exists public.messages_conversation_idx;
create index messages_conversation_idx
  on public.messages (conversation_id, created_at desc, id desc);

-- ---------------------------------------------------------------------------
-- conversations (last_message_at) — migration 07. `listConversations` (the
-- inbox) has the same tie-break gap as `listMessages`, so it moved to the
-- same composite cursor; this index follows it.
-- ---------------------------------------------------------------------------
drop index if exists public.conversations_recent_idx;
create index conversations_recent_idx
  on public.conversations (last_message_at desc, id desc);

-- ---------------------------------------------------------------------------
-- notifications (updated_at) — migration 08. `notifications_unread_idx` is
-- untouched: it backs `countUnreadNotifications`, which is a count, not a
-- keyset page, so it never needed a tiebreaker.
-- ---------------------------------------------------------------------------
drop index if exists public.notifications_inbox_idx;
create index notifications_inbox_idx
  on public.notifications (recipient_id, updated_at desc, id desc);

-- ---------------------------------------------------------------------------
-- saves (created_at) — migration 05. `saves` has no surrogate id; its
-- primary key is `(profile_id, wave_id)`, so `wave_id` — unique once scoped
-- to one `profile_id` — is the tiebreaker `listSavedWaves` uses.
-- ---------------------------------------------------------------------------
drop index if exists public.saves_profile_idx;
create index saves_profile_idx
  on public.saves (profile_id, created_at desc, wave_id desc);
