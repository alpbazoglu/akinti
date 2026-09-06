-- Rollback for 20260906120000_pro_presets_pitch.sql
--
-- Note: Postgres cannot drop a value from an enum type. Rolling back the
-- `audio_enhancement_preset` widening is therefore a documented no-op for
-- the enum itself (harmless: nothing writes 'pitch_snap'/'self_harmony'
-- once the rest of this migration's application code is also rolled back).
-- Everything else added by the up-migration is reversible and reversed
-- below.

revoke all on function public.set_audio_asset_pitch_score(uuid, jsonb) from service_role;
drop function if exists public.set_audio_asset_pitch_score(uuid, jsonb);

create or replace function public.audio_assets_guard_update()
returns trigger
language plpgsql
as $fn$
begin
  if public.is_service_request() then
    return new;
  end if;

  if new.owner_id            is distinct from old.owner_id
     or new.original_path    is distinct from old.original_path
     or new.processed_path   is distinct from old.processed_path
     or new.storage_bucket   is distinct from old.storage_bucket
     or new.peaks            is distinct from old.peaks
     or new.byte_size        is distinct from old.byte_size
     or new.checksum_sha256  is distinct from old.checksum_sha256
     or new.processing_status  is distinct from old.processing_status
     or new.processing_error   is distinct from old.processing_error
     or new.processed_at       is distinct from old.processed_at
     or new.enhancement_report is distinct from old.enhancement_report
  then
    raise exception 'audio asset processing fields are server-owned'
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;

alter table public.audio_assets drop column if exists pitch_score;
