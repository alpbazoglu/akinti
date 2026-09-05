-- AKINTI — Flow (founder decision, 6 Sept 2026, docs/FLOW.md): the
-- full-screen, one-Wave-per-screen continuous listening feed that becomes
-- the default screen after login.
--
-- Two new pieces:
--   1. `flow_impressions` — owner-only ledger of what a viewer has already
--      been shown in Flow, so the ranking never repeats a Wave within 7
--      days. Written exclusively through `record_flow_event` below (no
--      direct client insert/update path), mirroring `rate_limit_events`'
--      "no client access at all" shape.
--   2. `get_flow_page` — the ranking RPC (docs/FLOW.md "Ranking"), plus
--      `record_flow_event` (impression/complete/skip/replay) and
--      `count_flow_new` (the nav badge count).
--
-- `get_flow_page` is SECURITY INVOKER on purpose: every table it reads
-- (`waves`, `follows`, `wave_listens`, `challenge_entries`, `challenges`,
-- `challenge_picks`, `open_calls`, `backing_tracks`, `flow_impressions`)
-- already has RLS that resolves correctly for the calling viewer (in
-- particular `waves_select` already calls `can_view_wave`), so running as
-- the invoker means this function can never show more than the caller's own
-- direct queries against those tables already would — no SECURITY DEFINER
-- escape hatch to keep in sync with those policies.

-- ---------------------------------------------------------------------------
-- flow_impressions
-- ---------------------------------------------------------------------------
create table public.flow_impressions (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  wave_id       uuid not null references public.waves (id) on delete cascade,
  seen_at       timestamptz not null default now(),
  completed     boolean not null default false,
  skipped_at_ms integer,

  constraint flow_impressions_pk primary key (user_id, wave_id),
  constraint flow_impressions_skipped_at_ms_valid check (skipped_at_ms is null or skipped_at_ms >= 0)
);

-- The only read pattern: "which waves has <user> seen in the last <window>"
-- (the 7-day exclusion in get_flow_page) and "has <user> seen <wave>" (the
-- badge count's NOT EXISTS). `seen_at desc` lets both stop early.
create index flow_impressions_recent_idx on public.flow_impressions (user_id, seen_at desc);

alter table public.flow_impressions enable row level security;

create policy flow_impressions_select on public.flow_impressions
  for select using (user_id = auth.uid());

-- No insert/update/delete policy for `authenticated`: every write goes
-- through `record_flow_event` (SECURITY DEFINER) below, which validates the
-- event kind, checks the Wave is still viewable, and rate-limits the caller
-- before touching this table — exactly like `rate_limit_events` itself.
grant select on public.flow_impressions to authenticated;
grant all on public.flow_impressions to service_role;

-- ---------------------------------------------------------------------------
-- record_flow_event whitelist: `check_rate_limit`/`record_rate_limit_event`
-- (migration 20260903140200) are generic, but `rate_limit_events.action` is
-- a closed check-constraint enum — add 'flow_event' the same way migration
-- 20260905140000 added 'challenge_entry'.
-- ---------------------------------------------------------------------------
alter table public.rate_limit_events
  drop constraint rate_limit_events_action_known;

alter table public.rate_limit_events
  add constraint rate_limit_events_action_known check (
    action in (
      'comment', 'follow', 'message', 'duet_request', 'share', 'report',
      'audio_upload', 'challenge_entry', 'flow_event'
    )
  );

-- ---------------------------------------------------------------------------
-- get_flow_page — the ranking RPC (docs/FLOW.md "Ranking").
--
-- Buckets, in priority order (1 = highest priority):
--   1. Waves from followed creators the viewer has not heard yet (newest
--      first). "Heard" reuses `wave_listens` (the same table
--      `listHeardWaveIds`, src/app/(app)/listened.ts, reads for Home's
--      unheard mark) rather than inventing a second definition of it.
--   2. Duets of the viewer's own Waves — which is also every accepted
--      answer to one of the viewer's Open Calls, because answering an Open
--      Call (`answer_open_call`, migration 20260905120100) always produces
--      a Duet whose `parent_wave_id` is the Open Call's Wave. A Duet of the
--      viewer's Wave is therefore a strict superset check that needs no
--      separate `open_calls`/`duet_requests` join.
--   3. Waves entered in a LIVE challenge, curated picks (rank 1-5) ranked
--      ahead of plain entries (newest first within each).
--   4. Rising Waves in the last 48h, `wave_trending_score` (migration
--      20260903121400, the same half-life curve Explore's Trending lane
--      uses) — diversified by creator and genre (`waves.tags[1]`) via a
--      round-robin re-rank: each candidate's position is
--      `greatest(rank among its own creator, rank among its own genre)`,
--      so a creator or genre that dominates the raw trending order gets
--      spread across the page rather than clustering at the top. This is a
--      best-effort spread, not a hard guarantee for a pathological
--      distribution (e.g. one creator with every rising Wave) — documented
--      here and in docs/FLOW.md rather than silently claiming more than it
--      delivers.
--   5. "Invitation" Waves (an open, undeadlined Open Call, or a Wave built
--      on a backing track marked `open_for_vocals`) spliced in at every 8th
--      absolute position across the whole session (`docs/FLOW.md` "every
--      ~8th slot"). If the invitation pool is exhausted, that slot is
--      simply omitted rather than repeating or fabricating one — the page
--      returns fewer than `p_limit` rows for that call.
--
-- Every Wave already in `flow_impressions` for this viewer in the last 7
-- days is excluded up front, from every bucket.
--
-- Keyset cursor: `p_cursor` is `{"bucket", "score", "id", "slot"}` (or
-- `null` for page one). `(bucket, score, id)` is the exact position in the
-- deterministic bucket 1-4 ranking (the invitation stream is paginated
-- separately, by `slot`, since it is not part of that ranking); `slot` is
-- the absolute count of items this session has already emitted, which is
-- what decides which absolute positions are "every 8th" and how many
-- invitations have already been consumed. `p_seed` seeds bucket 4's
-- tie-break jitter and is otherwise stable for the life of a session
-- (docs/FLOW.md "session-seeded mix, never repeats within a session").
--
-- Each returned row repeats `cursor_bucket`/`cursor_score`/`cursor_id`/
-- `cursor_slot` — the values the NEXT call's `p_cursor` should carry,
-- computed once per call from the last bucket 1-4 row actually consumed
-- (regardless of where an invitation was spliced in) — so the caller
-- (`src/lib/db/flow.ts`) only ever needs to look at the last row of the
-- array it got back, exactly like every other cursor in this codebase.
-- ---------------------------------------------------------------------------
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
  'already has RLS that resolves correctly for the calling viewer.';

grant execute on function public.get_flow_page(jsonb, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- record_flow_event — impression/complete/skip/replay (docs/FLOW.md
-- "Analytics"). Fire-and-forget from the client
-- (src/lib/db/flow.ts:recordFlowEvent); rate-limited so a runaway client
-- cannot flood the ledger.
-- ---------------------------------------------------------------------------
create or replace function public.record_flow_event(
  p_wave_id      uuid,
  p_kind         text,
  p_position_ms  integer default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_viewer uuid := auth.uid();
begin
  if v_viewer is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_kind not in ('impression', 'complete', 'skip', 'replay') then
    raise exception 'unknown flow event kind: %', p_kind using errcode = '22023';
  end if;
  if not public.can_view_wave(p_wave_id) then
    raise exception 'wave not found' using errcode = '42501';
  end if;

  perform public.check_rate_limit(v_viewer, 'flow_event', 600, interval '1 hour');
  perform public.record_rate_limit_event(v_viewer, 'flow_event');

  insert into public.flow_impressions (user_id, wave_id, seen_at, completed, skipped_at_ms)
  values (
    v_viewer,
    p_wave_id,
    now(),
    p_kind = 'complete',
    case when p_kind = 'skip' then p_position_ms else null end
  )
  on conflict (user_id, wave_id) do update set
    seen_at = now(),
    completed = public.flow_impressions.completed or excluded.completed,
    skipped_at_ms = coalesce(excluded.skipped_at_ms, public.flow_impressions.skipped_at_ms);
end;
$fn$;

comment on function public.record_flow_event(uuid, text, integer) is
  'Records a Flow impression/complete/skip/replay (docs/FLOW.md "Analytics"). '
  'Plays themselves are still counted only by the existing record_play_event '
  'path — this never touches waves.play_count.';

revoke all on function public.record_flow_event(uuid, text, integer) from public, anon;
grant execute on function public.record_flow_event(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- count_flow_new — the Flow nav item's "new for you" badge (docs/FLOW.md
-- "Retention hooks": "new for you number on the Flow tab icon (never zero
-- shown)" — the "never show zero" rule is enforced client-side, in the nav
-- component, not here). SECURITY INVOKER for the same reason as
-- get_flow_page.
-- ---------------------------------------------------------------------------
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

  select count(distinct w.id) into v_count
  from public.waves w
  where w.deleted_at is null
    and w.creator_id <> v_viewer
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
    );

  return coalesce(v_count, 0);
end;
$fn$;

comment on function public.count_flow_new() is
  'Flow nav badge count (docs/FLOW.md). Counts unheard bucket 1-3 candidates only -- rising (bucket 4) is not "new for you", it is discovery.';

grant execute on function public.count_flow_new() to authenticated;
