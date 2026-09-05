-- AKINTI — Duets v2 (Wave D), part 4 of 5: the duet_tree RPC.
--
-- Returns the whole chain rooted at a Wave in one call — every existing tree
-- read (`listDuetsOfWave`, `listDirectDuets`, both src/lib/db/waves.ts) is
-- either "every descendant, flat" or "one level"; nothing renders the actual
-- branching shape. `src/lib/duet/chain.ts` turns this flat, depth-ordered
-- rowset into a nested tree plus chain-length/branch stats, pure and unit
-- tested there.
create or replace function public.duet_tree(p_root_wave_id uuid)
returns table (
  id             uuid,
  parent_wave_id uuid,
  creator_id     uuid,
  depth          smallint,
  creation_type  public.wave_creation_type,
  duet_mode      public.duet_mode,
  cypher_order   smallint,
  published_at   timestamptz,
  play_count     integer,
  duet_count     integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.can_view_wave(p_root_wave_id) then
    return;
  end if;

  return query
  with recursive tree as (
    select
      w.id, w.parent_wave_id, w.creator_id, w.duet_depth as depth,
      w.creation_type, w.duet_mode, w.cypher_order, w.published_at,
      w.play_count, w.duet_count
    from public.waves w
    where w.id = p_root_wave_id and w.deleted_at is null

    union all

    select
      w.id, w.parent_wave_id, w.creator_id, w.duet_depth,
      w.creation_type, w.duet_mode, w.cypher_order, w.published_at,
      w.play_count, w.duet_count
    from public.waves w
    join tree t on w.parent_wave_id = t.id
    where w.deleted_at is null
  )
  select t.id, t.parent_wave_id, t.creator_id, t.depth, t.creation_type,
         t.duet_mode, t.cypher_order, t.published_at, t.play_count, t.duet_count
  from tree t
  -- Re-checked per node, not just at the root: a private/blocked branch of an
  -- otherwise-public tree must not leak through (e.g. the root is public but
  -- one contributor later blocked the viewer, or set a Duet's own visibility
  -- to only_me).
  where public.can_view_wave(t.id)
  order by t.depth asc, t.published_at asc;
end;
$fn$;

comment on function public.duet_tree(uuid) is
  'Full Duet chain rooted at p_root_wave_id, can_view_wave-filtered per node (Wave D). Bounded by waves_depth_valid (<=6) so the recursion is never unbounded.';

grant execute on function public.duet_tree(uuid) to anon, authenticated;
