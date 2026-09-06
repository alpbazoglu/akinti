-- AKINTI — fix: AKINTI Pro can be bypassed from the browser in two
-- independent ways (docs/qa/review3/REVIEW.md findings 3 and 4).
--
-- Finding 3: `enqueue_audio_job(uuid, audio_job_type, jsonb)`
-- (20260903120300_audio_assets_and_jobs.sql) is granted to `authenticated`
-- (20260903121200_row_level_security.sql:658), checks only that the caller
-- owns the asset, and inserts `p_payload` verbatim. The AKINTI Pro gate
-- lives only in the Server Action (`src/app/(app)/create/actions.ts`), so a
-- free account can call `supabase.rpc('enqueue_audio_job', { p_payload:
-- { preset: 'pitch_snap' } })` directly and the worker will process it
-- (`scripts/worker.ts`) without ever re-checking `has_pro`. CLAUDE.md's rule
-- is that the database is the authority for every other authorization check
-- in this schema; this one was the exception.
--
-- Finding 4: a second, independent route to the same bypass.
-- `audio_assets_guard_update` (recreated by 20260906120000_pro_presets_pitch
-- to also lock `enhancement_report`/`pitch_score`) still omits
-- `enhancement_preset` from its guarded-column list. `authenticated` holds
-- table-level UPDATE on `audio_assets`, `audio_assets_update_own` permits
-- the owner, so a direct PostgREST PATCH can set
-- `enhancement_preset = 'pitch_snap'` on an asset created as `'natural'`
-- (which passed the Server Action's gate), and `finalizeUpload` then reads
-- the preset back from the row and enqueues it. Fixing finding 3 alone does
-- not close this one, and vice versa — both routes reach the same worker
-- job, so both must be closed independently.
--
-- Both fixes check `public.has_pro(uuid)` (20260906100000_subscriptions.sql)
-- against the two Pro-only preset ids named in
-- 20260906120000_pro_presets_pitch.sql ('pitch_snap', 'self_harmony').

-- ---------------------------------------------------------------------------
-- Finding 3: enqueue_audio_job — reject a Pro-only preset from a non-Pro
-- caller. `is_service_request()` (the worker's own re-enqueue path, e.g.
-- retry logic) and `auth.uid()` being null (never reachable here since the
-- function already requires ownership match, kept for defence in depth) are
-- exempt, mirroring every other guard trigger in this schema.
-- ---------------------------------------------------------------------------
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
  v_owner  uuid;
  v_id     bigint;
  v_preset text;
begin
  select owner_id into v_owner from public.audio_assets where id = p_audio_asset_id;
  if v_owner is null then
    raise exception 'audio asset % not found', p_audio_asset_id using errcode = 'no_data_found';
  end if;
  if auth.uid() is distinct from v_owner and not public.is_service_request() then
    raise exception 'not authorised to queue processing for this asset' using errcode = '42501';
  end if;

  v_preset := p_payload ->> 'preset';
  if v_preset in ('pitch_snap', 'self_harmony')
     and not public.is_service_request()
     and not public.has_pro(v_owner)
  then
    raise exception 'AKINTI Pro is required for this sound' using errcode = '42501';
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

-- ---------------------------------------------------------------------------
-- Finding 4: audio_assets_guard_update — also guard `enhancement_preset`.
-- Two rules: it may never change once the asset is `ready` (processing
-- already happened against the prior preset; changing it afterwards would
-- silently desync the processed audio from the recorded preset), and while
-- still `pending`/`processing`/`failed` it may only be changed to a Pro-only
-- id when the owner currently has Pro.
-- ---------------------------------------------------------------------------
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

  if new.enhancement_preset is distinct from old.enhancement_preset then
    if old.processing_status = 'ready' then
      raise exception 'enhancement preset cannot change once processing is complete'
        using errcode = '42501';
    end if;
    if new.enhancement_preset::text in ('pitch_snap', 'self_harmony')
       and not public.has_pro(old.owner_id)
    then
      raise exception 'AKINTI Pro is required for this sound' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$fn$;

-- Trigger definition is unchanged (still `before update ... for each row`),
-- so no `drop trigger`/`create trigger` needed — `create or replace
-- function` above is enough since the trigger already points at this name.

-- `audio_assets_guard_update` now calls `has_pro`, which is already granted
-- to `authenticated` (20260906100000_subscriptions.sql:183) and to
-- `service_role`, so no additional grant is required for either caller of
-- an UPDATE on `audio_assets`.
