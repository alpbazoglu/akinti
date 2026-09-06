-- review3 finding 18: the `invitations` CTE in `get_flow_page` (migration
-- 20260906110000_flow.sql) excludes rows already shown (`flow_impressions`,
-- via `excluded`) but was never anti-joined against `ranked` (the
-- followed/duet/challenge/rising candidates computed earlier in the same
-- query) — so a Wave that is BOTH rising (bucket 4) and an open Open Call
-- could be selected by both the ranked stream and the invitation slot in
-- the same page. `FlowScreen` keys its windowed items on `wave.id`, so a
-- duplicate is a React duplicate-key collision, and the reader sees the
-- same Wave twice in a feed whose whole promise is that it never repeats.
--
-- Fix: exclude anything already present in `ranked` from `invitations`,
-- the same way `excluded` (already-seen Waves) is excluded. Full function
-- body re-created (`create or replace`, no signature change) since a
-- `plpgsql`/SQL function has no partial-alter form.

create or replace function public.get_flow_page(
  p_cursor jsonb default null,
  p_seed   integer default 0,
  p_limit  integer default 10
)
returns table (
  wave_id       uuid,
  bucket        smallint,
  score         double precision,
  cursor_bucket smallint,
  cursor_score  double precision,
  cursor_id     uuid,
  cursor_slot   integer
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_viewer            uuid := auth.uid();
  v_limit             integer := least(greatest(coalesce(p_limit, 10), 1), 30);
  v_seed              integer := coalesce(p_seed, 0);
  v_cursor_bucket     smallint;
  v_cursor_score      double precision;
  v_cursor_id         uuid;
  v_slot              integer := 0;
  v_invitation_needed integer;
begin
  if v_viewer is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_cursor is not null then
    begin
      v_cursor_bucket := (p_cursor ->> 'bucket')::smallint;
      v_cursor_score  := (p_cursor ->> 'score')::double precision;
      v_cursor_id     := (p_cursor ->> 'id')::uuid;
      v_slot          := coalesce((p_cursor ->> 'slot')::integer, 0);
    exception when others then
      -- A malformed/foreign cursor is treated as "start from the top",
      -- matching every other forgiving-cursor RPC in this schema.
      v_cursor_bucket := null;
      v_cursor_score := null;
      v_cursor_id := null;
      v_slot := 0;
    end;
  end if;

  -- How many of this page's absolute positions (v_slot+1 .. v_slot+v_limit)
  -- land on a multiple of 8.
  v_invitation_needed := (floor((v_slot + v_limit) / 8.0) - floor(v_slot / 8.0))::integer;

  return query
  with excluded as (
    select fi.wave_id
    from public.flow_impressions fi
    where fi.user_id = v_viewer
      and fi.seen_at > now() - interval '7 days'
  ),
  bucket1 as (
    select w.id, 1::smallint as bucket,
      (-extract(epoch from w.published_at))::double precision as score
    from public.waves w
    join public.follows f
      on f.followee_id = w.creator_id and f.follower_id = v_viewer and f.status = 'accepted'
    where w.deleted_at is null
      and w.creator_id <> v_viewer
      and not exists (
        select 1 from public.wave_listens wl
        where wl.wave_id = w.id and wl.listener_key = 'u:' || v_viewer::text
      )
  ),
  bucket2 as (
    select w.id, 2::smallint as bucket,
      (-extract(epoch from w.published_at))::double precision as score
    from public.waves w
    join public.waves p on p.id = w.parent_wave_id
    where w.deleted_at is null
      and w.creation_type = 'duet'
      and p.creator_id = v_viewer
      and w.creator_id <> v_viewer
  ),
  bucket3 as (
    select w.id, 3::smallint as bucket,
      (case
        when cp.rank is not null then cp.rank::double precision
        else 1000.0 + (-extract(epoch from ce.created_at) / 1e10)
      end)::double precision as score
    from public.waves w
    join public.challenge_entries ce on ce.wave_id = w.id
    join public.challenges c on c.id = ce.challenge_id and c.status = 'live'
    left join public.challenge_picks cp on cp.challenge_id = c.id and cp.wave_id = w.id
    where w.deleted_at is null
  ),
  bucket4_raw as (
    select w.id, w.creator_id, coalesce(w.tags[1], '') as genre,
      public.wave_trending_score(
        w.play_count, w.replay_count, w.save_count,
        w.comment_count, w.share_count, w.duet_count, w.published_at
      ) as raw_score
    from public.waves w
    where w.deleted_at is null
      and w.visibility = 'everyone'
      and w.creator_id <> v_viewer
      and w.published_at >= now() - interval '48 hours'
  ),
  bucket4_ranked as (
    select b.id, b.raw_score,
      row_number() over (partition by b.creator_id order by b.raw_score desc, b.id) as creator_rank,
      row_number() over (partition by b.genre order by b.raw_score desc, b.id) as genre_rank
    from bucket4_raw b
  ),
  bucket4 as (
    select br.id, 4::smallint as bucket,
      (
        greatest(br.creator_rank, br.genre_rank)::double precision
        + (abs(hashtext(br.id::text || ':' || v_seed::text)) % 1000) / 1000000.0
      )::double precision as score
    from bucket4_ranked br
  ),
  candidates as (
    select * from bucket1
    union all select * from bucket2
    union all select * from bucket3
    union all select * from bucket4
  ),
  deduped as (
    -- The same Wave can qualify for more than one bucket (e.g. a followed
    -- creator's challenge entry); keep only its highest-priority (lowest
    -- bucket number) occurrence.
    select distinct on (c.id) c.id, c.bucket, c.score
    from candidates c
    where not exists (select 1 from excluded e where e.wave_id = c.id)
    order by c.id, c.bucket asc
  ),
  ranked as (
    select d.id, d.bucket, d.score
    from deduped d
  ),
  paged_raw as (
    select r.id, r.bucket, r.score,
      row_number() over (order by r.bucket asc, r.score asc, r.id asc) as rn
    from ranked r
    where v_cursor_bucket is null
       or (r.bucket, r.score, r.id) > (v_cursor_bucket, v_cursor_score, v_cursor_id)
    order by r.bucket asc, r.score asc, r.id asc
    limit greatest(v_limit - v_invitation_needed, 0)
  ),
  ranked_seq as (
    select pr.id, pr.bucket, pr.score, row_number() over (order by pr.rn) as seq
    from paged_raw pr
  ),
  last_raw as (
    -- Preserve the incoming cursor when this call consumed zero new
    -- bucket 1-4 rows (the ranked stream is exhausted) rather than
    -- resetting to "start from the top", which would replay already-shown
    -- Waves on the next call.
    select
      coalesce((select pr.bucket from paged_raw pr order by pr.rn desc limit 1), v_cursor_bucket) as cursor_bucket,
      coalesce((select pr.score from paged_raw pr order by pr.rn desc limit 1), v_cursor_score) as cursor_score,
      coalesce((select pr.id from paged_raw pr order by pr.rn desc limit 1), v_cursor_id) as cursor_id
  ),
  invitations as (
    select w.id
    from public.waves w
    left join public.open_calls oc on oc.wave_id = w.id
    left join public.backing_tracks bt on bt.id = w.backing_track_id
    where w.deleted_at is null
      and w.creator_id <> v_viewer
      and (
        (oc.id is not null and oc.is_open and (oc.deadline_at is null or oc.deadline_at > now()))
        or (bt.id is not null and bt.open_for_vocals)
      )
      and not exists (select 1 from excluded e where e.wave_id = w.id)
      and not exists (select 1 from ranked r where r.id = w.id)
    order by w.published_at desc, w.id desc
    offset floor(v_slot / 8.0)::integer
    limit v_invitation_needed
  ),
  invitation_seq as (
    select i.id, 5::smallint as bucket, null::double precision as score,
      row_number() over (order by i.id) as seq
    from invitations i
  ),
  slots as (
    select gs as abs_pos, case when gs % 8 = 0 then 1 else 0 end as is_invitation
    from generate_series(v_slot + 1, v_slot + v_limit) as gs
  ),
  merged as (
    select
      abs_pos,
      is_invitation,
      row_number() over (partition by is_invitation order by abs_pos) as pick_rn
    from slots
  )
  select
    coalesce(inv.id, rk.id) as wave_id,
    coalesce(inv.bucket, rk.bucket) as bucket,
    coalesce(inv.score, rk.score) as score,
    lr.cursor_bucket,
    lr.cursor_score,
    lr.cursor_id,
    (v_slot + v_limit) as cursor_slot
  from merged m
  cross join last_raw lr
  left join ranked_seq rk on m.is_invitation = 0 and rk.seq = m.pick_rn
  left join invitation_seq inv on m.is_invitation = 1 and inv.seq = m.pick_rn
  where coalesce(inv.id, rk.id) is not null
  order by m.abs_pos;
end;
$fn$;

comment on function public.get_flow_page(jsonb, integer, integer) is
  'Flow ranking (docs/FLOW.md). SECURITY INVOKER: every table it reads '
  'already has RLS that resolves correctly for the calling viewer. '
  '`invitations` is anti-joined against `ranked` so a Wave already picked '
  'by the ranked stream never also fills an invitation slot (review3 finding 18).';
