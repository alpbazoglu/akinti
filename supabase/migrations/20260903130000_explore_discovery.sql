-- AKINTI — 18. Explore discovery: Rising creators + an Original-content index (spec s10, s21).
--
-- `wave_trending_score` / `trending_waves` (migration 14) already cover
-- Trending. New, Original, Voices, Compositions and Open for Duet are plain
-- `waves` reads the application issues directly (RLS already restricts the
-- candidate set to what the caller may see) — see `src/lib/db/waves.ts`. The
-- one category that genuinely needs a standalone SQL routine is Rising:
-- identifying creators with recent follower growth or a recent first Wave
-- requires an aggregate the application should not compute by pulling every
-- `follows`/`waves` row client-side.
--
-- Kept as its own function, mirroring `wave_trending_score`, so a future
-- recommender can replace the growth heuristic later without any call site
-- changing (`src/lib/db/discovery.ts#getRisingCreators` is the only caller).

create or replace function public.rising_creators(
  p_limit        integer default 12,
  p_offset       integer default 0,
  p_window_hours integer default 168
)
returns setof public.profiles
language sql
stable
set search_path = public, extensions, pg_temp
as $fn$
  with window_bound as (
    select now() - (greatest(1, coalesce(p_window_hours, 168)) * interval '1 hour') as since
  ),
  growth as (
    select f.followee_id as profile_id, count(*)::int as recent_followers
    from public.follows f, window_bound wb
    where f.status = 'accepted'
      and f.created_at >= wb.since
    group by f.followee_id
  ),
  first_wave as (
    select w.creator_id as profile_id, min(w.published_at) as first_published_at
    from public.waves w
    where w.deleted_at is null
    group by w.creator_id
  )
  select p.*
  from public.profiles p
  join window_bound wb on true
  left join growth g on g.profile_id = p.id
  left join first_wave fw on fw.profile_id = p.id
  where p.privacy = 'public'
    and (
      coalesce(g.recent_followers, 0) > 0
      or (fw.first_published_at is not null and fw.first_published_at >= wb.since)
    )
  order by coalesce(g.recent_followers, 0) desc, p.follower_count desc, p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50))
  offset greatest(0, coalesce(p_offset, 0));
$fn$;

comment on function public.rising_creators(integer, integer, integer) is
  'Explore -> Rising (spec s10): public creators with recent accepted-follow growth, or whose first Wave published inside the window. Deterministic, no ML (spec s10).';

grant execute on function public.rising_creators(integer, integer, integer)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Explore -> Original (spec s10): waves.content_origin = 'original'. The
-- existing `waves_public_published_idx` (migration 04) already narrows to
-- `visibility = 'everyone' and deleted_at is null`, ordered by
-- `published_at desc` — this partial index goes one step further and matches
-- `listOriginalWaves`'s exact predicate so that lane never falls back to a
-- filtered scan of every public Wave as the table grows.
-- ---------------------------------------------------------------------------
create index waves_original_content_published_idx
  on public.waves (published_at desc)
  where deleted_at is null and visibility = 'everyone' and content_origin = 'original';
