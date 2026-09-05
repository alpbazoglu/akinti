-- Rollback for 20260905090000_fix_creator_wave_performance_ambiguous_wave_id.sql
-- Restores the original (broken — 42702 ambiguous "wave_id") function body
-- from 20260903140500_creator_analytics.sql. Present for symmetry with the
-- repo's down/ convention; there is no reason to ever apply this rollback.
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
    select wave_id,
      count(*) filter (where play_counted_at >= v_since)::integer as plays,
      count(*) filter (where replay_counted_at >= v_since)::integer as replays
    from listens
    group by wave_id
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
  'Creator analytics (spec s27) per-Wave breakdown for auth.uid(), ranked by plays in the trailing p_days. Every owned Wave is included (even with zero plays in the window) so the table reflects the whole catalog, not just what moved.';

grant execute on function public.creator_wave_performance(integer, integer) to authenticated, service_role;
