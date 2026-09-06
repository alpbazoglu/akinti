-- review3 finding 30: `flow_impressions.wave_id` is
-- `references waves(id) on delete cascade` with no index of its own — the
-- only index is `(user_id, seen_at desc)` and the primary key is
-- `(user_id, wave_id)`, neither of which helps a lookup keyed on `wave_id`
-- alone. Every Wave deletion has to sequentially scan the whole table to
-- find the rows to cascade, and the table has no automatic pruning, so
-- this gets slower forever as it grows.
create index flow_impressions_wave_idx on public.flow_impressions (wave_id);

-- Periodic cleanup for a worker/pg_cron job — same shape as
-- `prune_rate_limit_events()` (migration 20260903140200_rate_limits.sql):
-- provided here, not called automatically by anything. 30 days safely
-- covers the 7-day repeat-exclusion window `get_flow_page` actually reads
-- with a lot of slack, since `flow_impressions` also backs `count_flow_new`
-- for a while after that.
create or replace function public.prune_flow_impressions(p_older_than interval default interval '30 days')
returns integer
language sql
volatile
security definer
set search_path = public, pg_temp
as $fn$
  with deleted as (
    delete from public.flow_impressions
    where seen_at < now() - p_older_than
    returning 1
  )
  select count(*)::integer from deleted;
$fn$;

revoke all on function public.prune_flow_impressions(interval) from public;
grant execute on function public.prune_flow_impressions(interval) to service_role;
