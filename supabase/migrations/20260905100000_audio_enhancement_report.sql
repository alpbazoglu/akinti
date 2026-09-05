-- AKINTI — audio_assets.enhancement_report (Wave B server-side polish pipeline).
--
-- Records which pipeline stages actually ran for a processed audio asset
-- (sidecar clean/master/peaks vs their ffmpeg fallbacks), measured before/
-- after LUFS, and per-stage durations — see docs/AUDIO_ARCHITECTURE.md
-- "Enhancement report". Server-owned like every other processing column
-- (audio_assets_guard_update, migration 12): scripts/worker.ts only ever
-- writes real measured values here through complete_audio_job below, never
-- a placeholder for a stage that did not run.

alter table public.audio_assets
  add column enhancement_report jsonb;

-- Migration 15 locked audio_assets down to an explicit granted column list
-- (SELECT on the whole table was revoked from anon/authenticated because
-- table-level grants cannot be narrowed by a later column-level REVOKE — see
-- that migration's header comment). A brand-new column is invisible to
-- anon/authenticated until it is added to that list explicitly; this is not
-- a path column, so it is safe to expose the same way peaks/duration/etc.
-- already are.
grant select (enhancement_report) on public.audio_assets to anon, authenticated;

comment on column public.audio_assets.enhancement_report is
  'Which pipeline stages ran and what they measured, e.g. '
  '{"clean":{"method":"arnndn","lufs_before":-28.1,"lufs_after":-27.9,"duration_ms":812}, '
  '"master":{"method":"loudnorm_two_pass","lufs_before":-27.9,"lufs_after":-14.0,"duration_ms":410}, '
  '"peaks":{"method":"ffmpeg","duration_ms":120}}. '
  'A stage that did not run (sidecar unavailable and no fallback applicable) '
  'is simply absent, never filled with a fake value — see '
  'docs/AUDIO_ARCHITECTURE.md "Enhancement report".';

-- Extend the existing write guard (migration 12) to cover the new column —
-- otherwise a client could set enhancement_report directly through the
-- ordinary `audio_assets_update_own` RLS policy, exactly the hole this
-- trigger already closes for peaks/processing_status/etc.
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

-- Adding a 6th parameter changes complete_audio_job's signature/identity in
-- Postgres (it is not the same function as the 5-arg version, so `create or
-- replace` alone would create an overload rather than replace it) — drop the
-- old signature explicitly first. See down/<this>_down.sql for the exact
-- rollback to the 5-arg version.
drop function if exists public.complete_audio_job(bigint, text, jsonb, integer, jsonb);

create or replace function public.complete_audio_job(
  p_job_id              bigint,
  p_processed_path      text,
  p_peaks               jsonb,
  p_duration_ms         integer,
  p_result              jsonb default '{}'::jsonb,
  p_enhancement_report  jsonb default null
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
  -- Flag this transaction as a trusted system operation so the audio_assets
  -- write guard lets the processing columns through.
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
  set processed_path     = p_processed_path,
      peaks              = coalesce(p_peaks, peaks),
      duration_ms        = coalesce(p_duration_ms, duration_ms),
      processing_status  = 'ready',
      processing_error   = null,
      processed_at       = now(),
      enhancement_report = coalesce(p_enhancement_report, enhancement_report)
  where id = v_asset_id;
end;
$fn$;

comment on function public.complete_audio_job(bigint, text, jsonb, integer, jsonb, jsonb) is
  'Worker-only (service_role). Marks an audio_processing_jobs row done and '
  'publishes its output — including the enhancement_report added in this '
  'migration — onto the audio_assets row in one call.';

revoke all on function public.complete_audio_job(bigint, text, jsonb, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.complete_audio_job(bigint, text, jsonb, integer, jsonb, jsonb) to service_role;
