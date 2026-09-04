-- AKINTI — 20. Security fix: rising_creators() must be SECURITY DEFINER.
--
-- `rising_creators()` (migration 18) ran with INVOKER rights while reading
-- `public.follows` directly to compute `recent_followers`. `follows_select`
-- RLS (migration 12) hides a `follows` row from anyone who is not a party to
-- it and cannot view both profiles' content — so under invoker rights the
-- `growth` CTE's counts (and therefore the entire Rising ranking) silently
-- varied by viewer instead of being one deterministic ranking (spec s10), and
-- an anonymous or otherwise-restricted viewer undercounted everyone's recent
-- follower growth.
--
-- Fixed the same way `can_view_wave`/`can_view_profile*` (migration 10) are:
-- SECURITY DEFINER with a pinned `search_path`, so the internal aggregate
-- reads every `follows`/`waves` row regardless of caller. The *output* still
-- respects visibility — the final `select` is additionally filtered through
-- `can_view_profile(p.id)`, so a blocked-either-way or otherwise-hidden
-- creator never appears in Rising; only the internal growth count stops
-- being viewer-dependent. Same signature, so `src/types/database.ts` and
-- every call site (`src/lib/db/discovery.ts#getRisingCreators`) are
-- unaffected.
create or replace function public.rising_creators(
  p_limit        integer default 12,
  p_offset       integer default 0,
  p_window_hours integer default 168
)
returns setof public.profiles
language sql
stable
security definer
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
    and public.can_view_profile(p.id)
    and (
      coalesce(g.recent_followers, 0) > 0
      or (fw.first_published_at is not null and fw.first_published_at >= wb.since)
    )
  order by coalesce(g.recent_followers, 0) desc, p.follower_count desc, p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50))
  offset greatest(0, coalesce(p_offset, 0));
$fn$;

comment on function public.rising_creators(integer, integer, integer) is
  'Explore -> Rising (spec s10): public creators with recent accepted-follow growth, or whose first Wave published inside the window. SECURITY DEFINER as of migration 20 so the growth aggregate is not RLS-narrowed per viewer; output is still filtered through can_view_profile so blocking/visibility rules hold on what is returned. Deterministic, no ML (spec s10).';

grant execute on function public.rising_creators(integer, integer, integer)
  to anon, authenticated, service_role;
