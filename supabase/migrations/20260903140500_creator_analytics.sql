-- AKINTI — 24. Creator analytics + product success metrics (spec s13, s27,
-- s28, s40, s43 Stage 13).
--
-- Four read-only RPCs, all STABLE + SECURITY DEFINER + a pinned search_path,
-- mirroring every predicate in migration 10:
--
--   creator_overview(p_days)          -- one row of totals for auth.uid()'s own Waves
--   creator_timeseries(p_days)        -- one row per active day
--   creator_wave_performance(p_days, p_limit) -- one row per Wave, ranked by plays
--   product_health(p_days)            -- moderator-only, platform-wide (spec s28)
--
-- None of the first three take a creator id parameter — they always resolve
-- to `auth.uid()`, so there is no argument to forge and no cross-creator
-- lookup path to gate. `product_health` takes no target at all; it is gated
-- entirely by `is_moderator()` (migration 23), re-checked inside the
-- function itself exactly like `resolve_report`/`dismiss_report` do, never
-- trusted from the caller.
--
-- Metrics are built on DEDUPLICATED `wave_listens` (spec s27: "distinguish
-- raw events from meaningful/deduplicated metrics") wherever a count is the
-- point — Plays, Replays, unique listeners. Listen-duration and completion
-- read raw `play_events` instead, because `wave_listens.total_listened_ms`
-- accumulates across every listen of a (wave, listener) pair and would blend
-- multiple sessions into one number; a per-event average needs the raw log.
-- Self-plays are already excluded upstream (`record_play_event`, migration
-- 11, never sets `play_counted`/`counted_play` for the creator's own
-- listens), so no extra creator-id filter is needed here for that rule.
--
-- Anomaly flag (spec s27 "prevent... bot plays, self-replay farming... basic
-- anomaly flags, not a full fraud ML system"): `play_events.suspicious`, set
-- by `flag_suspicious_play_events()` below using a simple rule — more than 20
-- qualifying (counted_play or counted_replay) listens of one Wave from one
-- `listener_key` (a session, keyed exactly like `wave_listens.listener_key`)
-- on one calendar day is farming, not organic replay behaviour. Every
-- analytics RPC excludes flagged events/listens via
-- `wave_listen_is_suspicious()`. This is NOT called automatically by
-- anything in this migration — it is meant to run periodically from
-- `scripts/worker.ts`'s maintenance loop (see docs/AUDIO_ARCHITECTURE.md /
-- docs/DATABASE.md for the exact call to add there; this migration does not
-- touch that file).

-- ---------------------------------------------------------------------------
-- Anomaly flag column + indexes to support it.
-- ---------------------------------------------------------------------------
alter table public.play_events add column suspicious boolean not null default false;

comment on column public.play_events.suspicious is
  'Set by flag_suspicious_play_events() (spec s27 anomaly flag: >20 qualifying listens of one Wave from one listener_key in one day). Every creator/product analytics RPC excludes flagged rows.';

create index play_events_suspicious_scan_idx
  on public.play_events (wave_id, listener_key, created_at)
  where counted_play or counted_replay;

create index play_events_counted_listener_idx
  on public.play_events (listener_key, created_at)
  where counted_play or counted_replay;

create index wave_listens_play_counted_at_idx
  on public.wave_listens (wave_id, play_counted_at)
  where play_counted_at is not null;

create index wave_listens_replay_counted_at_idx
  on public.wave_listens (wave_id, replay_counted_at)
  where replay_counted_at is not null;

create index saves_wave_created_idx on public.saves (wave_id, created_at);
create index comments_wave_created_idx on public.comments (wave_id, created_at) where deleted_at is null;
create index shares_wave_created_idx on public.shares (wave_id, created_at);

-- Cohort scans for product_health.
create index profiles_created_at_idx on public.profiles (created_at);
create index duet_requests_created_idx on public.duet_requests (created_at, status);
create index waves_creator_all_published_idx on public.waves (creator_id, published_at) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- flag_suspicious_play_events: the anomaly rule. Idempotent — re-running it
-- only ever adds flags, never removes one, and rows already flagged are
-- skipped so repeated runs stay cheap.
-- ---------------------------------------------------------------------------
create or replace function public.flag_suspicious_play_events()
returns integer
language sql
volatile
security definer
set search_path = public, pg_temp
as $fn$
  with hot as (
    select wave_id, listener_key, date_trunc('day', created_at) as day
    from public.play_events
    where (counted_play or counted_replay) and not suspicious
    group by wave_id, listener_key, date_trunc('day', created_at)
    having count(*) > 20
  ),
  flagged as (
    update public.play_events pe
    set suspicious = true
    from hot
    where pe.wave_id = hot.wave_id
      and pe.listener_key = hot.listener_key
      and date_trunc('day', pe.created_at) = hot.day
      and pe.suspicious = false
    returning 1
  )
  select count(*)::integer from flagged;
$fn$;

comment on function public.flag_suspicious_play_events() is
  'Spec s27 anomaly flag. Marks play_events.suspicious for any (wave, listener_key, day) with >20 qualifying listens. Not called automatically — call it periodically from scripts/worker.ts''s maintenance loop (see docs/DATABASE.md).';

revoke all on function public.flag_suspicious_play_events() from public, anon, authenticated;
grant execute on function public.flag_suspicious_play_events() to service_role;

-- ---------------------------------------------------------------------------
-- wave_listen_is_suspicious: internal helper shared by every RPC below.
-- ---------------------------------------------------------------------------
create or replace function public.wave_listen_is_suspicious(p_wave_id uuid, p_listener_key text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.play_events pe
    where pe.wave_id = p_wave_id and pe.listener_key = p_listener_key and pe.suspicious
  );
$fn$;

comment on function public.wave_listen_is_suspicious(uuid, text) is
  'True when any play_events row for this (wave, listener_key) pair has been anomaly-flagged (flag_suspicious_play_events). Used to exclude farmed engagement from every analytics RPC below.';

-- ===========================================================================
-- creator_overview: totals over the trailing p_days for auth.uid()'s Waves.
-- ===========================================================================
create or replace function public.creator_overview(p_days integer default 30)
returns table (
  plays              integer,
  unique_listeners   integer,
  replays            integer,
  saves              integer,
  shares             integer,
  comments           integer,
  duets              integer,
  avg_listen_seconds numeric,
  completion_rate    numeric,
  follower_delta     integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_creator uuid := auth.uid();
  v_since   timestamptz;
begin
  if v_creator is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_days not in (7, 30, 90) then
    raise exception 'p_days must be 7, 30 or 90' using errcode = 'check_violation';
  end if;
  v_since := now() - (p_days || ' days')::interval;

  return query
  with listens as (
    select wl.play_counted_at, wl.replay_counted_at, wl.listener_key
    from public.wave_listens wl
    join public.waves w on w.id = wl.wave_id
    where w.creator_id = v_creator
      and not public.wave_listen_is_suspicious(wl.wave_id, wl.listener_key)
  ),
  raw_plays as (
    -- Raw log, restricted to qualifying (counted) listens only, for
    -- per-event listen-duration/completion — never for counts (spec s27).
    select pe.listened_ms, pe.completed
    from public.play_events pe
    join public.waves w on w.id = pe.wave_id
    where w.creator_id = v_creator
      and pe.created_at >= v_since
      and not pe.suspicious
      and (pe.counted_play or pe.counted_replay)
  )
  select
    (select count(*) from listens where play_counted_at >= v_since)::integer,
    (select count(distinct listener_key) from listens where play_counted_at >= v_since)::integer,
    (select count(*) from listens where replay_counted_at >= v_since)::integer,
    (select count(*)::integer from public.saves s join public.waves w on w.id = s.wave_id
       where w.creator_id = v_creator and s.created_at >= v_since),
    (select count(*)::integer from public.shares sh join public.waves w on w.id = sh.wave_id
       where w.creator_id = v_creator and sh.created_at >= v_since),
    (select count(*)::integer from public.comments c join public.waves w on w.id = c.wave_id
       where w.creator_id = v_creator and c.created_at >= v_since and c.deleted_at is null),
    (select count(*)::integer from public.waves d
       where d.deleted_at is null and d.published_at >= v_since
         and d.parent_wave_id in (select id from public.waves where creator_id = v_creator)),
    (select round(avg(listened_ms) / 1000.0, 1) from raw_plays),
    (select case when count(*) = 0 then 0
            else round(count(*) filter (where completed)::numeric / count(*), 4) end
     from raw_plays),
    (select count(*)::integer from public.follows f
       where f.followee_id = v_creator and f.status = 'accepted' and f.created_at >= v_since);
end;
$fn$;

comment on function public.creator_overview(integer) is
  'Creator analytics (spec s27) totals over the trailing p_days for auth.uid()''s own Waves. Plays/unique_listeners/replays are deduplicated (wave_listens); avg_listen_seconds/completion_rate read raw play_events (qualifying listens only); follower_delta counts new accepted follows in the window (no unfollow ledger exists to net against — documented in docs/PRODUCT.md). Anomaly-flagged sessions excluded throughout.';

-- ===========================================================================
-- creator_timeseries: one row per day that had ANY activity in the window.
-- The client fills the remaining p_days worth of dates with zeros
-- (src/lib/analytics/timeseries.ts) rather than this function scaffolding
-- every calendar day itself.
-- ===========================================================================
create or replace function public.creator_timeseries(p_days integer default 30)
returns table (
  day              date,
  plays            integer,
  unique_listeners integer,
  replays          integer,
  saves            integer,
  comments         integer,
  shares           integer,
  new_followers    integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_creator uuid := auth.uid();
  v_since   timestamptz;
begin
  if v_creator is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_days not in (7, 30, 90) then
    raise exception 'p_days must be 7, 30 or 90' using errcode = 'check_violation';
  end if;
  v_since := now() - (p_days || ' days')::interval;

  return query
  with plays_by_day as (
    select wl.play_counted_at::date as d,
           count(*)::integer as plays,
           count(distinct wl.listener_key)::integer as unique_listeners
    from public.wave_listens wl
    join public.waves w on w.id = wl.wave_id
    where w.creator_id = v_creator
      and wl.play_counted_at >= v_since
      and not public.wave_listen_is_suspicious(wl.wave_id, wl.listener_key)
    group by 1
  ),
  replays_by_day as (
    select wl.replay_counted_at::date as d, count(*)::integer as replays
    from public.wave_listens wl
    join public.waves w on w.id = wl.wave_id
    where w.creator_id = v_creator
      and wl.replay_counted_at >= v_since
      and not public.wave_listen_is_suspicious(wl.wave_id, wl.listener_key)
    group by 1
  ),
  saves_by_day as (
    select s.created_at::date as d, count(*)::integer as saves
    from public.saves s
    join public.waves w on w.id = s.wave_id
    where w.creator_id = v_creator and s.created_at >= v_since
    group by 1
  ),
  comments_by_day as (
    select c.created_at::date as d, count(*)::integer as comments
    from public.comments c
    join public.waves w on w.id = c.wave_id
    where w.creator_id = v_creator and c.created_at >= v_since and c.deleted_at is null
    group by 1
  ),
  shares_by_day as (
    select sh.created_at::date as d, count(*)::integer as shares
    from public.shares sh
    join public.waves w on w.id = sh.wave_id
    where w.creator_id = v_creator and sh.created_at >= v_since
    group by 1
  ),
  followers_by_day as (
    select f.created_at::date as d, count(*)::integer as new_followers
    from public.follows f
    where f.followee_id = v_creator and f.status = 'accepted' and f.created_at >= v_since
    group by 1
  ),
  days as (
    select d from plays_by_day
    union select d from replays_by_day
    union select d from saves_by_day
    union select d from comments_by_day
    union select d from shares_by_day
    union select d from followers_by_day
  )
  select
    days.d,
    coalesce(p.plays, 0),
    coalesce(p.unique_listeners, 0),
    coalesce(r.replays, 0),
    coalesce(sv.saves, 0),
    coalesce(cm.comments, 0),
    coalesce(sh.shares, 0),
    coalesce(f.new_followers, 0)
  from days
  left join plays_by_day p on p.d = days.d
  left join replays_by_day r on r.d = days.d
  left join saves_by_day sv on sv.d = days.d
  left join comments_by_day cm on cm.d = days.d
  left join shares_by_day sh on sh.d = days.d
  left join followers_by_day f on f.d = days.d
  order by days.d;
end;
$fn$;

comment on function public.creator_timeseries(integer) is
  'Creator analytics (spec s27) daily breakdown for auth.uid()''s own Waves, one row per day with any activity. Missing days are NOT zero-filled here — src/lib/analytics/timeseries.ts fills the full p_days range client-side.';

-- ===========================================================================
-- creator_wave_performance: per-Wave rows, ranked by plays.
-- ===========================================================================
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

-- ===========================================================================
-- product_health: moderator-only platform health signals (spec s28).
-- Every rate below is a proportion in [0, 1] except duets_per_week and
-- content_velocity (counts per week) and duet_requests_per_active_user
-- (a ratio, not a percentage). Exact cohort definitions are documented in
-- docs/PRODUCT.md — this is v1 judgment, not a spec-mandated formula.
-- ===========================================================================
create or replace function public.product_health(p_days integer default 30)
returns table (
  activation_rate                numeric,
  week1_returning_listener_rate  numeric,
  week4_returning_listener_rate  numeric,
  week1_returning_creator_rate   numeric,
  week4_returning_creator_rate   numeric,
  duet_requests_per_active_user  numeric,
  duet_acceptance_rate           numeric,
  duets_per_week                 numeric,
  discovery_share                numeric,
  content_velocity               numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_since timestamptz;
  v_weeks numeric;
begin
  if not public.is_moderator() then
    raise exception 'moderator access required' using errcode = '42501';
  end if;
  if p_days not in (7, 30, 90) then
    raise exception 'p_days must be 7, 30 or 90' using errcode = 'check_violation';
  end if;
  v_since := now() - (p_days || ' days')::interval;
  v_weeks := greatest(p_days / 7.0, 1);

  return query
  with cohort as (
    -- New users old enough (>=7d) that "activated within 7 days" is decided,
    -- not still-pending — avoids biasing the rate down with censored data.
    select id, created_at from public.profiles
    where created_at >= v_since and created_at <= now() - interval '7 days'
  ),
  activated as (
    select c.id from cohort c
    where exists (
      select 1 from public.waves w
      where w.creator_id = c.id and w.deleted_at is null
        and w.published_at <= c.created_at + interval '7 days'
    )
  ),
  listener_first as (
    select listener_key, min(created_at) as first_at
    from public.play_events
    where counted_play and not suspicious
    group by listener_key
  ),
  listener_week1_cohort as (
    select listener_key, first_at from listener_first
    where first_at >= v_since and first_at <= now() - interval '14 days'
  ),
  listener_week1_return as (
    select lc.listener_key from listener_week1_cohort lc
    where exists (
      select 1 from public.play_events pe
      where pe.listener_key = lc.listener_key and not pe.suspicious
        and (pe.counted_play or pe.counted_replay)
        and pe.created_at >= lc.first_at + interval '7 days'
        and pe.created_at < lc.first_at + interval '14 days'
    )
  ),
  listener_week4_cohort as (
    select listener_key, first_at from listener_first
    where first_at >= v_since and first_at <= now() - interval '35 days'
  ),
  listener_week4_return as (
    select lc.listener_key from listener_week4_cohort lc
    where exists (
      select 1 from public.play_events pe
      where pe.listener_key = lc.listener_key and not pe.suspicious
        and (pe.counted_play or pe.counted_replay)
        and pe.created_at >= lc.first_at + interval '28 days'
        and pe.created_at < lc.first_at + interval '35 days'
    )
  ),
  creator_first as (
    select creator_id, min(published_at) as first_at
    from public.waves
    where deleted_at is null
    group by creator_id
  ),
  creator_week1_cohort as (
    select creator_id, first_at from creator_first
    where first_at >= v_since and first_at <= now() - interval '14 days'
  ),
  creator_week1_return as (
    select cc.creator_id from creator_week1_cohort cc
    where exists (
      select 1 from public.waves w
      where w.creator_id = cc.creator_id and w.deleted_at is null
        and w.published_at >= cc.first_at + interval '7 days'
        and w.published_at < cc.first_at + interval '14 days'
    )
  ),
  creator_week4_cohort as (
    select creator_id, first_at from creator_first
    where first_at >= v_since and first_at <= now() - interval '35 days'
  ),
  creator_week4_return as (
    select cc.creator_id from creator_week4_cohort cc
    where exists (
      select 1 from public.waves w
      where w.creator_id = cc.creator_id and w.deleted_at is null
        and w.published_at >= cc.first_at + interval '28 days'
        and w.published_at < cc.first_at + interval '35 days'
    )
  ),
  active_users as (
    select p.id from public.profiles p
    where exists (select 1 from public.waves w where w.creator_id = p.id and w.published_at >= v_since and w.deleted_at is null)
       or exists (select 1 from public.comments c where c.author_id = p.id and c.created_at >= v_since and c.deleted_at is null)
       or exists (select 1 from public.duet_requests dr where dr.requester_id = p.id and dr.created_at >= v_since)
       or exists (
            select 1 from public.play_events pe
            where pe.listener_id = p.id and pe.created_at >= v_since and not pe.suspicious
              and (pe.counted_play or pe.counted_replay)
          )
  ),
  duet_req_window as (
    select * from public.duet_requests where created_at >= v_since
  ),
  discovery_plays as (
    select wl.listener_id, w.creator_id
    from public.wave_listens wl
    join public.waves w on w.id = wl.wave_id
    where wl.play_counted_at >= v_since
      and not public.wave_listen_is_suspicious(wl.wave_id, wl.listener_key)
  ),
  velocity as (
    select w.creator_id, count(*) as wave_count
    from public.waves w
    where w.published_at >= v_since and w.deleted_at is null
    group by w.creator_id
  )
  select
    case when (select count(*) from cohort) = 0 then 0
      else round((select count(*) from activated)::numeric / (select count(*) from cohort), 4) end,
    case when (select count(*) from listener_week1_cohort) = 0 then 0
      else round((select count(*) from listener_week1_return)::numeric / (select count(*) from listener_week1_cohort), 4) end,
    case when (select count(*) from listener_week4_cohort) = 0 then 0
      else round((select count(*) from listener_week4_return)::numeric / (select count(*) from listener_week4_cohort), 4) end,
    case when (select count(*) from creator_week1_cohort) = 0 then 0
      else round((select count(*) from creator_week1_return)::numeric / (select count(*) from creator_week1_cohort), 4) end,
    case when (select count(*) from creator_week4_cohort) = 0 then 0
      else round((select count(*) from creator_week4_return)::numeric / (select count(*) from creator_week4_cohort), 4) end,
    case when (select count(*) from active_users) = 0 then 0
      else round((select count(*) from duet_req_window)::numeric / (select count(*) from active_users), 4) end,
    case when (select count(*) from duet_req_window where status in ('accepted', 'declined')) = 0 then 0
      else round(
        (select count(*) from duet_req_window where status = 'accepted')::numeric
        / (select count(*) from duet_req_window where status in ('accepted', 'declined')), 4) end,
    round(
      (select count(*) from public.waves where creation_type = 'duet' and published_at >= v_since and deleted_at is null)::numeric
      / v_weeks, 2),
    case when (select count(*) from discovery_plays) = 0 then 0
      else round(
        (select count(*) from discovery_plays dp
           where dp.listener_id is null or not public.is_following(dp.listener_id, dp.creator_id))::numeric
        / (select count(*) from discovery_plays), 4) end,
    case when (select count(*) from velocity) = 0 then 0
      else round((select coalesce(sum(wave_count), 0) from velocity)::numeric / (select count(*) from velocity) / v_weeks, 2) end;
end;
$fn$;

comment on function public.product_health(integer) is
  'Product health signals (spec s28), moderator-only (is_moderator() re-checked inside). Cohort definitions: activation = published a first Wave within 7 days of signup; week-1/week-4 returning listener/creator = a qualifying play/Wave in the [+7d,+14d) / [+28d,+35d) window after the first one, restricted to cohort members old enough that the window has fully elapsed. discovery_share treats every anonymous listen as non-followed (an anonymous listener cannot be a follower). Full write-up: docs/PRODUCT.md.';

-- ---------------------------------------------------------------------------
-- Grants. All four read-only RPCs resolve their own scope internally
-- (auth.uid() or is_moderator()), so a plain grant to `authenticated` is
-- safe — same pattern as every other SECURITY DEFINER predicate/RPC here.
-- ---------------------------------------------------------------------------
grant execute on function public.wave_listen_is_suspicious(uuid, text) to authenticated, service_role;
grant execute on function public.creator_overview(integer) to authenticated, service_role;
grant execute on function public.creator_timeseries(integer) to authenticated, service_role;
grant execute on function public.creator_wave_performance(integer, integer) to authenticated, service_role;
grant execute on function public.product_health(integer) to authenticated, service_role;
