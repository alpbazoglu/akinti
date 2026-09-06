-- Down: 20260906170000_count_flow_new_bound.sql
-- Restores count_flow_new's original unbounded body (20260906110000_flow.sql)
-- and drops the supporting index. Reintroduces review3 finding 13.

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

drop index public.waves_published_recent_idx;
