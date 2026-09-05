-- Rollback for 20260905100000_audio_enhancement_report.sql

drop function if exists public.complete_audio_job(bigint, text, jsonb, integer, jsonb, jsonb);

-- Restore the original 5-arg complete_audio_job from
-- 20260903120300_audio_assets_and_jobs.sql.
create or replace function public.complete_audio_job(
  p_job_id         bigint,
  p_processed_path text,
  p_peaks          jsonb,
  p_duration_ms    integer,
  p_result         jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_asset_id uuid;
begin
  perform set_config('akinti.system', 'on', true);

  update public.audio_processing_jobs
  set status      = 'done',
      result      = coalesce(p_result, '{}'::jsonb),
      last_error  = null,
      locked_at   = null,
      locked_by   = null,
      finished_at = now()
  where id = p_job_id
  returning audio_asset_id into v_asset_id;

  if v_asset_id is null then
    raise exception 'audio job % not found', p_job_id using errcode = 'no_data_found';
  end if;

  update public.audio_assets
  set processed_path    = p_processed_path,
      peaks             = coalesce(p_peaks, peaks),
      duration_ms       = coalesce(p_duration_ms, duration_ms),
      processing_status = 'ready',
      processing_error  = null,
      processed_at      = now()
  where id = v_asset_id;
end;
$fn$;

revoke all on function public.complete_audio_job(bigint, text, jsonb, integer, jsonb) from public, anon, authenticated;
grant execute on function public.complete_audio_job(bigint, text, jsonb, integer, jsonb) to service_role;

create or replace function public.audio_assets_guard_update()
returns trigger
language plpgsql
as $fn$
begin
  if public.is_service_request() then
    return new;
  end if;

  if new.owner_id           is distinct from old.owner_id
     or new.original_path   is distinct from old.original_path
     or new.processed_path  is distinct from old.processed_path
     or new.storage_bucket  is distinct from old.storage_bucket
     or new.peaks           is distinct from old.peaks
     or new.byte_size       is distinct from old.byte_size
     or new.checksum_sha256 is distinct from old.checksum_sha256
     or new.processing_status is distinct from old.processing_status
     or new.processing_error  is distinct from old.processing_error
     or new.processed_at      is distinct from old.processed_at
  then
    raise exception 'audio asset processing fields are server-owned'
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;

alter table public.audio_assets drop column if exists enhancement_report;
