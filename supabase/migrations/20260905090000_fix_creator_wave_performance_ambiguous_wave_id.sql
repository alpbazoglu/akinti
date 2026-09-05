-- AKINTI — Fix: `/analytics` fails to load for every creator on the live
-- project (UX audit, 2026-09-05).
--
-- Bug, reproduced directly against the live database: calling
-- `creator_wave_performance(p_days, p_limit)` (migration
-- `20260903140500_creator_analytics.sql`) as an authenticated creator always
-- fails with Postgres error 42702:
--   "column reference \"wave_id\" is ambiguous"
--   "It could refer to either a PL/pgSQL variable or a table column."
-- confirmed via `POST /rest/v1/rpc/creator_wave_performance` with the test
-- account's access token (`creator_overview`/`creator_timeseries` on the
-- same connection returned fine — only this RPC is broken).
--
-- Root cause: the function's `returns table (wave_id uuid, ...)` makes
-- `wave_id` a PL/pgSQL variable in scope for the whole function body. The
-- `play_stats` CTE selects and groups by a *bare* `wave_id` from the
-- `listens` CTE:
--
--   play_stats as (
--     select wave_id, count(*) filter (...) as plays, ...
--     from listens
--     group by wave_id
--   ),
--
-- Postgres cannot tell whether that bare `wave_id` means `listens.wave_id`
-- or the function's own `wave_id` OUT variable, so every call raises
-- 42702 — this is not data-dependent (it fails even with zero Waves), it
-- fails on every single invocation. `src/app/(app)/analytics/page.tsx`
-- calls `getCreatorWavePerformance` in the same `Promise.all` as the other
-- two working RPCs and catches any rejection to render the generic
-- `ErrorState`, which is why the whole page appeared to "fail to load"
-- rather than surfacing this one broken query. Every other bare-column CTE
-- in this function (`completion_stats`, `save_stats`, `comment_stats`,
-- `share_stats`) already qualifies its `wave_id` reference with its source
-- alias (`pe.wave_id`, `s.wave_id`, ...) — only `play_stats` did not.
--
-- Fix: qualify both references to the CTE's own source, `listens.wave_id`,
-- removing the ambiguity. No behavior change beyond making the function
-- actually run — output rows/order/columns are identical to what the
-- original migration intended.
create or replace function public.creator_wave_performance(p_days integer default 30, p_limit integer default 20)
returns table (
  wave_id         uuid,
  title           text,
  creation_type   public.wave_creation_type,
  published_at    timestamptz,
  plays           integer,
  replays         integer,
  saves           integer,
  comments        integer,
  shares          integer,
  completion_rate numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_creator uuid := auth.uid();
  v_since   timestamptz;
  v_limit   integer;
begin
  if v_creator is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_days not in (7, 30, 90) then
    raise exception 'p_days must be 7, 30 or 90' using errcode = 'check_violation';
  end if;
  v_since := now() - (p_days || ' days')::interval;
  v_limit := least(greatest(coalesce(p_limit, 20), 1), 100);

  return query
  with own_waves as (
    select id from public.waves where creator_id = v_creator and deleted_at is null
  ),
  listens as (
    select wl.wave_id, wl.play_counted_at, wl.replay_counted_at, wl.listener_key
    from public.wave_listens wl
    where wl.wave_id in (select id from own_waves)
      and not public.wave_listen_is_suspicious(wl.wave_id, wl.listener_key)
  ),
  play_stats as (
    select listens.wave_id,
      count(*) filter (where play_counted_at >= v_since)::integer as plays,
      count(*) filter (where replay_counted_at >= v_since)::integer as replays
    from listens
    group by listens.wave_id
  ),
  completion_stats as (
    select pe.wave_id,
      case when count(*) = 0 then 0
        else round(count(*) filter (where pe.completed)::numeric / count(*), 4) end as completion_rate
    from public.play_events pe
    where pe.wave_id in (select id from own_waves)
      and pe.created_at >= v_since
      and not pe.suspicious
      and (pe.counted_play or pe.counted_replay)
    group by pe.wave_id
  ),
  save_stats as (
    select s.wave_id, count(*)::integer as saves
    from public.saves s
    where s.wave_id in (select id from own_waves) and s.created_at >= v_since
    group by s.wave_id
  ),
  comment_stats as (
    select c.wave_id, count(*)::integer as comments
    from public.comments c
    where c.wave_id in (select id from own_waves) and c.created_at >= v_since and c.deleted_at is null
    group by c.wave_id
  ),
  share_stats as (
    select sh.wave_id, count(*)::integer as shares
    from public.shares sh
    where sh.wave_id in (select id from own_waves) and sh.created_at >= v_since
    group by sh.wave_id
  )
  select
    w.id,
    w.title,
    w.creation_type,
    w.published_at,
    coalesce(ps.plays, 0),
    coalesce(ps.replays, 0),
    coalesce(sv.saves, 0),
    coalesce(cm.comments, 0),
    coalesce(sh.shares, 0),
    coalesce(cs.completion_rate, 0)
  from public.waves w
  left join play_stats ps on ps.wave_id = w.id
  left join completion_stats cs on cs.wave_id = w.id
  left join save_stats sv on sv.wave_id = w.id
  left join comment_stats cm on cm.wave_id = w.id
  left join share_stats sh on sh.wave_id = w.id
  where w.creator_id = v_creator and w.deleted_at is null
  order by coalesce(ps.plays, 0) desc, w.published_at desc
  limit v_limit;
end;
$fn$;

comment on function public.creator_wave_performance(integer, integer) is
  'Creator analytics (spec s27) per-Wave breakdown for auth.uid(), ranked by plays in the trailing p_days. Every owned Wave is included (even with zero plays in the window) so the table reflects the whole catalog, not just what moved. Fixed 2026-09-05: play_stats CTE now qualifies wave_id as listens.wave_id — the bare reference was ambiguous against this function''s own wave_id OUT parameter (42702), breaking every call.';

grant execute on function public.creator_wave_performance(integer, integer) to authenticated, service_role;
