-- Rollback for 20260904120000_composite_pagination_indexes_2.sql
-- Restores the original single-column-tiebreaker-free ordering indexes (same
-- predicates, same leading columns).

drop index if exists public.reports_queue_idx;
create index reports_queue_idx on public.reports (status, created_at);

drop index if exists public.reports_reporter_idx;
create index reports_reporter_idx on public.reports (reporter_id, created_at desc);

drop index if exists public.follows_follower_idx;
create index follows_follower_idx
  on public.follows (follower_id, status, created_at desc);

drop index if exists public.follows_followee_idx;
create index follows_followee_idx
  on public.follows (followee_id, status, created_at desc);

drop index if exists public.shares_wave_idx;
create index shares_wave_idx on public.shares (wave_id, created_at desc);

drop index if exists public.duet_requests_requester_idx;
create index duet_requests_requester_idx
  on public.duet_requests (requester_id, status, created_at desc);

drop index if exists public.duet_requests_recipient_idx;
create index duet_requests_recipient_idx
  on public.duet_requests (recipient_id, status, created_at desc);
