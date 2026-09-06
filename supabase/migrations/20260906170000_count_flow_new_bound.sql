-- AKINTI — fix: count_flow_new does a full unbounded scan of `waves` on
-- every navigation (docs/qa/review3/REVIEW.md finding 13).
--
-- `count_flow_new()` (migration 20260906110000_flow.sql) counted DISTINCT
-- over every non-deleted Wave not authored by the viewer, RLS-filtered
-- per row, with three correlated `NOT EXISTS`/`EXISTS` subqueries and no
-- date bound and no LIMIT — a full pass over `waves` for a purely
-- decorative nav badge number, on the critical path of every page
-- transition (the shell's nav remounts on every route change).
--
-- Fix: bound to Waves published in the last 7 days (the badge's own "new"
-- semantic already implies recency, and it matches the 7-day exclusion
-- window `get_flow_page` already uses for `flow_impressions`) and cap the
-- work at 100 candidate rows — `CountBadge` (src/components/ui/Badge.tsx)
-- already renders `99+` for any count over its `max=99` default, so
-- returning up to 100 costs nothing on the display side. A supporting
-- partial index lets Postgres walk `waves` newest-first and stop once the
-- bounded subquery's LIMIT is satisfied, instead of touching the whole
-- table.

create index waves_published_recent_idx
  on public.waves (published_at desc)
  where deleted_at is null;

create or replace function public.count_flow_new()
returns integer
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_viewer uuid := auth.uid();
  v_count  integer;
begin
  if v_viewer is null then
    return 0;
  end if;

  select count(*) into v_count
  from (
    select w.id
    from public.waves w
    where w.deleted_at is null
      and w.creator_id <> v_viewer
      and w.published_at > now() - interval '7 days'
      and not exists (
        select 1 from public.flow_impressions fi
        where fi.user_id = v_viewer
          and fi.wave_id = w.id
          and fi.seen_at > now() - interval '7 days'
      )
      and (
        (
          exists (
            select 1 from public.follows f
            where f.followee_id = w.creator_id and f.follower_id = v_viewer and f.status = 'accepted'
          )
          and not exists (
            select 1 from public.wave_listens wl
            where wl.wave_id = w.id and wl.listener_key = 'u:' || v_viewer::text
          )
        )
        or (
          w.creation_type = 'duet'
          and exists (select 1 from public.waves p where p.id = w.parent_wave_id and p.creator_id = v_viewer)
        )
        or exists (
          select 1 from public.challenge_entries ce
          join public.challenges c on c.id = ce.challenge_id and c.status = 'live'
          where ce.wave_id = w.id
        )
      )
    order by w.published_at desc
    limit 100
  ) bounded;

  return coalesce(v_count, 0);
end;
$fn$;
