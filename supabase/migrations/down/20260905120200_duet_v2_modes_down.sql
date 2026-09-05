-- Rollback for 20260905120200_duet_v2_modes.sql

create or replace function public.waves_guard_update()
returns trigger
language plpgsql
as $fn$
begin
  if public.is_service_request() or pg_trigger_depth() > 1 then
    return new;
  end if;

  new.play_count    := old.play_count;
  new.replay_count  := old.replay_count;
  new.comment_count := old.comment_count;
  new.save_count    := old.save_count;
  new.share_count   := old.share_count;
  new.duet_count    := old.duet_count;

  new.creator_id      := old.creator_id;
  new.audio_asset_id  := old.audio_asset_id;
  new.creation_type   := old.creation_type;
  new.parent_wave_id  := old.parent_wave_id;
  new.original_wave_id := old.original_wave_id;
  new.duet_request_id := old.duet_request_id;
  new.duet_depth      := old.duet_depth;
  new.published_at    := old.published_at;

  return new;
end;
$fn$;

create or replace function public.waves_derive_duet_lineage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_parent public.waves;
begin
  if new.parent_wave_id is null then
    new.original_wave_id := null;
    new.duet_depth := 0;
    return new;
  end if;

  select * into v_parent from public.waves where id = new.parent_wave_id;
  if v_parent.id is null then
    raise exception 'parent wave % not found', new.parent_wave_id using errcode = 'foreign_key_violation';
  end if;

  new.original_wave_id := coalesce(v_parent.original_wave_id, v_parent.id);
  new.duet_depth := v_parent.duet_depth + 1;

  if new.duet_depth > 32 then
    raise exception 'duet chain too deep' using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

drop function if exists public.validate_duet_segments(jsonb);

alter table public.waves drop constraint if exists waves_depth_valid;
alter table public.waves add constraint waves_depth_valid check (duet_depth between 0 and 32);

alter table public.waves drop constraint if exists waves_cypher_order_range;
alter table public.waves drop constraint if exists waves_cypher_order_shape;
alter table public.waves drop constraint if exists waves_non_atisma_no_segments;
alter table public.waves drop constraint if exists waves_atisma_segments_shape;
alter table public.waves drop constraint if exists waves_duet_mode_shape;

alter table public.waves
  drop column if exists cypher_order,
  drop column if exists segments,
  drop column if exists duet_mode;

drop type if exists public.duet_mode;
