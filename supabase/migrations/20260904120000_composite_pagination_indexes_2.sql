-- AKINTI — 26. composite keyset-pagination indexes, round 2.
--
-- Migration 25 (`composite_pagination_indexes`) upgraded every keyset-paginated
-- list helper's ordering index to a `(..., ts, id)` composite, but explicitly
-- left five helpers out of scope: `duet_requests.ts`'s
-- `listIncomingDuetRequests`/`listOutgoingDuetRequests`, `shares.ts`'s
-- `listWaveShares`, `follows.ts`'s `listFollowers`/`listFollowing`/
-- `listPendingFollowRequests`, `reports.ts`'s `listMyReports`, and
-- `moderation.ts`'s `listModerationQueue` — all still paginating on a bare
-- `created_at` with a plain `< cursor` filter. Same gap: two rows created in
-- the same millisecond can straddle a page boundary and be skipped or
-- repeated.
--
-- Those five files now use `src/lib/db/types.ts`'s `encodeCursor`/
-- `decodeCursor`/`keysetFilter` exactly like migration 25's helpers did. This
-- migration replaces each backing ordering index with a `(..., ts desc, id
-- desc)` composite so the new filter still hits an index. Every index below
-- is a drop-and-recreate of an index from an earlier migration (same
-- predicate, same leading columns), not a new access path.
--
-- `follows` has no surrogate id (its primary key is `(follower_id,
-- followee_id)`); scoped to one side of the edge, the other side is unique
-- per row, so it is the tiebreaker — the same reasoning migration 25 used for
-- `saves.wave_id`.

-- ---------------------------------------------------------------------------
-- duet_requests (created_at) — migration 06.
-- ---------------------------------------------------------------------------
drop index if exists public.duet_requests_recipient_idx;
create index duet_requests_recipient_idx
  on public.duet_requests (recipient_id, status, created_at desc, id desc);

drop index if exists public.duet_requests_requester_idx;
create index duet_requests_requester_idx
  on public.duet_requests (requester_id, status, created_at desc, id desc);

-- ---------------------------------------------------------------------------
-- shares (created_at) — migration 05.
-- ---------------------------------------------------------------------------
drop index if exists public.shares_wave_idx;
create index shares_wave_idx
  on public.shares (wave_id, created_at desc, id desc);

-- ---------------------------------------------------------------------------
-- follows (created_at) — migration 02. No surrogate id; the other side of
-- the edge is the tiebreaker (unique once scoped to one `followee_id`/
-- `follower_id`), matching `listFollowers`/`listFollowing`/
-- `listPendingFollowRequests` in `follows.ts`.
-- ---------------------------------------------------------------------------
drop index if exists public.follows_followee_idx;
create index follows_followee_idx
  on public.follows (followee_id, status, created_at desc, follower_id desc);

drop index if exists public.follows_follower_idx;
create index follows_follower_idx
  on public.follows (follower_id, status, created_at desc, followee_id desc);

-- ---------------------------------------------------------------------------
-- reports (created_at) — migration 09.
-- ---------------------------------------------------------------------------
drop index if exists public.reports_reporter_idx;
create index reports_reporter_idx
  on public.reports (reporter_id, created_at desc, id desc);

-- Backs `listModerationQueue` (`moderation.ts`), which orders every report
-- (status filter optional) newest first. Previously ascending and mismatched
-- with the query's `created_at desc` order; now matches it, with the id
-- tiebreaker trailing.
drop index if exists public.reports_queue_idx;
create index reports_queue_idx
  on public.reports (status, created_at desc, id desc);
