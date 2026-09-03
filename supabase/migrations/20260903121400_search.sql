-- AKINTI — 14. Search support (spec s24).
--
-- v1 is deliberately deterministic trigram matching over a small number of
-- columns. `search_profiles` / `search_waves` are the only entry points the
-- application calls, so the implementation behind them (trigram today, Postgres
-- FTS or an external index later) can be swapped without touching call sites.


create index profiles_username_trgm_idx
  on public.profiles using gin (username extensions.gin_trgm_ops);

create index profiles_display_name_trgm_idx
  on public.profiles using gin (display_name extensions.gin_trgm_ops)
  where display_name is not null;

create index waves_title_trgm_idx
  on public.waves using gin (title extensions.gin_trgm_ops)
  where deleted_at is null;

create index waves_description_trgm_idx
  on public.waves using gin (description extensions.gin_trgm_ops)
  where description is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Profile search. Ranked by exact-prefix first, then trigram similarity, then
-- follower count. Runs as the invoker so RLS still applies.
-- ---------------------------------------------------------------------------
create or replace function public.search_profiles(
  p_query  text,
  p_limit  integer default 20,
  p_offset integer default 0
)
returns setof public.profiles
language sql
stable
set search_path = public, extensions, pg_temp
as $fn$
  select p.*
  from public.profiles p
  where p_query is not null
    and char_length(btrim(p_query)) >= 1
    and (
      p.username ilike btrim(p_query) || '%'
      or p.username % btrim(p_query)
      or (p.display_name is not null and p.display_name % btrim(p_query))
    )
  order by
    (p.username ilike btrim(p_query) || '%') desc,
    greatest(
      similarity(p.username, btrim(p_query)),
      coalesce(similarity(p.display_name, btrim(p_query)), 0)
    ) desc,
    p.follower_count desc,
    p.username asc
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$fn$;

-- ---------------------------------------------------------------------------
-- Wave search. RLS on `waves` already restricts the candidate set to what the
-- caller may see, so a private Wave can never surface here (spec s46).
-- ---------------------------------------------------------------------------
create or replace function public.search_waves(
  p_query  text,
  p_limit  integer default 20,
  p_offset integer default 0
)
returns setof public.waves
language sql
stable
set search_path = public, extensions, pg_temp
as $fn$
  select w.*
  from public.waves w
  where w.deleted_at is null
    and p_query is not null
    and char_length(btrim(p_query)) >= 1
    and (
      w.title ilike '%' || btrim(p_query) || '%'
      or w.title % btrim(p_query)
      or (w.description is not null and w.description % btrim(p_query))
      or btrim(lower(p_query)) = any (w.tags)
    )
  order by
    greatest(
      similarity(w.title, btrim(p_query)),
      coalesce(similarity(w.description, btrim(p_query)), 0)
    ) desc,
    w.published_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$fn$;

grant execute on function public.search_profiles(text, integer, integer) to anon, authenticated, service_role;
grant execute on function public.search_waves(text, integer, integer) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Explore ranking: a deterministic, explainable, time-decayed score (spec s10).
-- Kept as a standalone function so a real recommender can replace it later
-- without any call site changing.
-- ---------------------------------------------------------------------------
create or replace function public.wave_trending_score(
  p_play_count    integer,
  p_replay_count  integer,
  p_save_count    integer,
  p_comment_count integer,
  p_share_count   integer,
  p_duet_count    integer,
  p_published_at  timestamptz
)
returns double precision
language sql
stable
as $fn$
  select (
      coalesce(p_play_count, 0) * 1.0
    + coalesce(p_replay_count, 0) * 3.0
    + coalesce(p_save_count, 0) * 4.0
    + coalesce(p_comment_count, 0) * 5.0
    + coalesce(p_share_count, 0) * 6.0
    + coalesce(p_duet_count, 0) * 12.0
  ) / power(
      2.0,
      greatest(0, extract(epoch from (now() - p_published_at)) / 86400.0) / 2.0
    );
$fn$;

comment on function public.wave_trending_score(integer, integer, integer, integer, integer, integer, timestamptz) is
  'Weighted engagement with a 48-hour half-life. Duets are worth the most because collaboration is the product goal (spec s48).';

grant execute on function public.wave_trending_score(integer, integer, integer, integer, integer, integer, timestamptz)
  to anon, authenticated, service_role;

-- Explore feed. Ordered by the score above; RLS keeps it to viewable Waves.
create or replace function public.trending_waves(
  p_limit         integer default 20,
  p_offset        integer default 0,
  p_max_age_hours integer default 336
)
returns setof public.waves
language sql
stable
set search_path = public, extensions, pg_temp
as $fn$
  select w.*
  from public.waves w
  where w.deleted_at is null
    and w.published_at >= now() - (greatest(1, coalesce(p_max_age_hours, 336)) * interval '1 hour')
  order by public.wave_trending_score(
      w.play_count, w.replay_count, w.save_count,
      w.comment_count, w.share_count, w.duet_count, w.published_at
    ) desc,
    w.published_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$fn$;

grant execute on function public.trending_waves(integer, integer, integer) to anon, authenticated, service_role;
