-- Rollback for 20260903140400_moderation_foundation.sql

drop function if exists public.dismiss_report(uuid, text);
drop function if exists public.resolve_report(uuid, public.moderation_action_type, text, timestamptz);
drop function if exists public.claim_report(uuid);

drop policy if exists reports_select_moderator on public.reports;

drop table if exists public.moderation_actions;

-- Restore migration 10's original can_view_wave (no hidden-Wave check).
create or replace function public.can_view_wave(p_wave_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_viewer uuid := auth.uid();
  v_wave   public.waves;
begin
  if p_wave_id is null then
    return false;
  end if;

  select * into v_wave
  from public.waves
  where id = p_wave_id and deleted_at is null;

  if v_wave.id is null then
    return false;
  end if;
  if v_wave.creator_id = v_viewer then
    return true;
  end if;
  if public.is_blocked_between(v_viewer, v_wave.creator_id) then
    return false;
  end if;

  if v_viewer is not null and exists (
    select 1 from public.wave_collaborators wc
    where wc.wave_id = v_wave.id
      and wc.profile_id = v_viewer
      and wc.status = 'accepted'
  ) then
    return true;
  end if;

  if v_wave.visibility = 'only_me' then
    return false;
  end if;
  if not public.can_view_profile_content(v_wave.creator_id) then
    return false;
  end if;
  if v_wave.visibility = 'everyone' then
    return true;
  end if;

  return public.is_following(v_viewer, v_wave.creator_id);
end;
$fn$;

comment on function public.can_view_wave(uuid) is
  'Single authority for Wave readability: soft-delete, blocks, collaborator credit, per-Wave visibility and profile privacy. Used by RLS and by every read path.';

alter table public.waves drop column if exists hidden_at;

drop function if exists public.is_moderator(uuid);

drop trigger if exists profiles_guard_moderation_columns on public.profiles;
drop function if exists public.profiles_guard_moderation_columns();

alter table public.profiles drop column if exists suspended_until;
alter table public.profiles drop column if exists is_moderator;

drop type if exists public.moderation_action_type;
