-- Down: 20260906150000_enqueue_audio_job_guard.sql
-- Restores both functions to their pre-guard bodies (from
-- 20260903120300_audio_assets_and_jobs.sql and
-- 20260906120000_pro_presets_pitch.sql respectively). This intentionally
-- reintroduces review3 findings 3 and 4 — only for local rollback/testing.

create or replace function public.enqueue_audio_job(
  p_audio_asset_id uuid,
  p_job_type       public.audio_job_type,
  p_payload        jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_owner uuid;
  v_id    bigint;
begin
  select owner_id into v_owner from public.audio_assets where id = p_audio_asset_id;
  if v_owner is null then
    raise exception 'audio asset % not found', p_audio_asset_id using errcode = 'no_data_found';
  end if;
  if auth.uid() is distinct from v_owner and not public.is_service_request() then
    raise exception 'not authorised to queue processing for this asset' using errcode = '42501';
  end if;

  insert into public.audio_processing_jobs (audio_asset_id, job_type, payload)
  values (p_audio_asset_id, p_job_type, coalesce(p_payload, '{}'::jsonb))
  on conflict (audio_asset_id, job_type) where status in ('pending', 'processing')
  do update set payload = excluded.payload, run_after = now()
  returning id into v_id;

  update public.audio_assets
  set processing_status = 'pending', processing_error = null
  where id = p_audio_asset_id and processing_status = 'failed';

  return v_id;
end;
$fn$;

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
     or new.pitch_score        is distinct from old.pitch_score
  then
    raise exception 'audio asset processing fields are server-owned'
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;
