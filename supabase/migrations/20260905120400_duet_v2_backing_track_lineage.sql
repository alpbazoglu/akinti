-- AKINTI — Duets v2 (Wave D), part 5 of 5: backing-track Duet lineage.
--
-- docs/PRODUCT_V2.md §4: publishing a Wave over a backing track must credit
-- the track's uploader as a collaborator and let the track page list "Waves
-- on this track". `publishWave` (src/app/(app)/create/actions.ts) already
-- sets `waves.backing_track_id` (migration 20260905110000) but belongs to a
-- different agent's file ownership for this stage — doing the credit as a
-- database trigger here means it happens unconditionally, server-side, for
-- EVERY backing-track publish (including any future caller), without
-- touching that file at all.
--
-- Curated tracks (`is_curated`, `uploader_id is null`) get no collaborator
-- credit — there is no person to credit; `backing_tracks_curated_shape`
-- (migration 20260905110000) guarantees `is_curated = (uploader_id is null)`.
create or replace function public.waves_after_insert_backing_track_credit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uploader uuid;
begin
  if new.backing_track_id is null then
    return new;
  end if;

  select uploader_id into v_uploader
  from public.backing_tracks
  where id = new.backing_track_id;

  if v_uploader is null or v_uploader = new.creator_id then
    -- No uploader to credit (curated track), or the creator sang over their
    -- own uploaded track — crediting yourself as your own collaborator would
    -- be noise, and wave_collaborators_unique would reject it as a
    -- duplicate-of-self anyway in the self-Duet case this mirrors.
    return new;
  end if;

  insert into public.wave_collaborators (wave_id, profile_id, invited_by, status, role, responded_at)
  values (new.id, v_uploader, new.creator_id, 'accepted', 'backing track', now())
  on conflict (wave_id, profile_id) do nothing;

  -- Told once, directly — this is inserted already-accepted (like publishDuetWave's
  -- credit to the original creator), so the ordinary pending-invite/accepted
  -- notifications (wave_collaborators_after_change, migration 11) never fire
  -- for it; the uploader still deserves to know their track was used.
  perform public.push_notification(
    v_uploader, 'collaborator_accepted', 'collaborator_accepted:' || new.id::text,
    new.creator_id, new.id
  );

  return new;
end;
$fn$;

create trigger waves_after_insert_backing_track_credit
  after insert on public.waves
  for each row execute function public.waves_after_insert_backing_track_credit();

-- ---------------------------------------------------------------------------
-- list_waves_on_track — the track page's "Waves on this track" list.
-- SECURITY DEFINER, can_view_wave-filtered per row (a track can be public
-- while some Waves recorded over it are followers-only or since deleted).
-- Cursor shape matches every other keyset RPC in this project.
-- ---------------------------------------------------------------------------
create or replace function public.list_waves_on_track(
  p_track_id uuid,
  p_cursor   text default null,
  p_limit    integer default 20
)
returns setof public.waves
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_limit       integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_cursor_time timestamptz;
  v_cursor_id   uuid;
  v_sep_pos     integer;
begin
  if p_cursor is not null then
    v_sep_pos := position('|' in p_cursor);
    if v_sep_pos > 0 then
      begin
        v_cursor_time := substr(p_cursor, 1, v_sep_pos - 1)::timestamptz;
        v_cursor_id   := substr(p_cursor, v_sep_pos + 1)::uuid;
      exception when others then
        v_cursor_time := null;
        v_cursor_id := null;
      end;
    end if;
  end if;

  return query
  select w.*
  from public.waves w
  where w.backing_track_id = p_track_id
    and w.deleted_at is null
    and public.can_view_wave(w.id)
    and (
      v_cursor_time is null
      or (w.published_at, w.id) < (v_cursor_time, v_cursor_id)
    )
  order by w.published_at desc, w.id desc
  limit v_limit;
end;
$fn$;

comment on function public.list_waves_on_track(uuid, text, integer) is
  'Track page -> "Waves on this track" (Wave D / spec §4). SECURITY DEFINER, can_view_wave-filtered per row.';

grant execute on function public.list_waves_on_track(uuid, text, integer) to anon, authenticated;
