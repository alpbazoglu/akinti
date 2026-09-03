-- AKINTI — 03. audio_assets + the Postgres-backed audio job queue.

-- ---------------------------------------------------------------------------
-- audio_assets: one row per uploaded/recorded/mixed audio file.
-- Both `original_path` and `processed_path` are keys inside the PRIVATE
-- `audio` storage bucket. They are never handed to a browser directly; the
-- server mints short-lived signed URLs (see docs/SECURITY.md).
-- ---------------------------------------------------------------------------
create table public.audio_assets (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles (id) on delete cascade,
  storage_bucket      text not null default 'audio',
  original_path       text not null,
  processed_path      text,

  duration_ms         integer,
  mime_type           text not null,
  byte_size           bigint not null,
  sample_rate         integer,
  channels            smallint,

  -- Compact normalised peaks:
  -- {"version":1,"bits":8,"samples_per_pixel":N,"data":[0..255]}
  peaks               jsonb,

  processing_status   public.audio_processing_status not null default 'pending',
  processing_error    text,
  enhancement_preset  public.audio_enhancement_preset not null default 'natural',
  checksum_sha256     text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  processed_at        timestamptz,

  constraint audio_assets_bucket_known check (storage_bucket = 'audio'),
  constraint audio_assets_duration_valid
    check (duration_ms is null or (duration_ms > 0 and duration_ms <= 30 * 60 * 1000)),
  constraint audio_assets_size_valid
    check (byte_size > 0 and byte_size <= 100 * 1024 * 1024),
  constraint audio_assets_mime_allowed check (
    mime_type in (
      'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4',
      'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/flac'
    )
  ),
  constraint audio_assets_channels_valid check (channels is null or channels between 1 and 2),
  constraint audio_assets_ready_has_output
    check (processing_status <> 'ready' or processed_path is not null),
  constraint audio_assets_failed_has_reason
    check (processing_status <> 'failed' or processing_error is not null)
);

create index audio_assets_owner_idx on public.audio_assets (owner_id, created_at desc);
create index audio_assets_status_idx on public.audio_assets (processing_status)
  where processing_status in ('pending', 'processing');

create trigger audio_assets_set_updated_at
  before update on public.audio_assets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- audio_processing_jobs: the queue. Claimed with FOR UPDATE SKIP LOCKED by
-- `scripts/worker.ts`. See docs/AUDIO_ARCHITECTURE.md for the rationale.
-- ---------------------------------------------------------------------------
create table public.audio_processing_jobs (
  id              bigint generated always as identity primary key,
  audio_asset_id  uuid not null references public.audio_assets (id) on delete cascade,
  job_type        public.audio_job_type not null,
  status          public.audio_job_status not null default 'pending',
  priority        smallint not null default 100,

  -- job_type = 'process_audio': {"preset":"studio"}
  -- job_type = 'mix_duet':      {"preset":"studio","reference_asset_id":uuid,"offset_ms":int}
  payload         jsonb not null default '{}'::jsonb,
  result          jsonb,

  attempts        smallint not null default 0,
  max_attempts    smallint not null default 3,
  last_error      text,

  run_after       timestamptz not null default now(),
  locked_at       timestamptz,
  locked_by       text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz,

  constraint audio_jobs_attempts_valid check (attempts >= 0 and max_attempts between 1 and 10),
  constraint audio_jobs_priority_valid check (priority between 0 and 1000)
);

-- The queue scan index: runnable jobs, highest priority and oldest first.
create index audio_processing_jobs_claim_idx
  on public.audio_processing_jobs (priority, run_after, id)
  where status = 'pending';

create index audio_processing_jobs_asset_idx
  on public.audio_processing_jobs (audio_asset_id, created_at desc);

-- One live job per (asset, type); retries reuse the row.
create unique index audio_processing_jobs_active_uniq
  on public.audio_processing_jobs (audio_asset_id, job_type)
  where status in ('pending', 'processing');

create trigger audio_processing_jobs_set_updated_at
  before update on public.audio_processing_jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Queue RPCs. Grants are locked down in migration 12.
-- ---------------------------------------------------------------------------

-- Atomically claim up to `p_limit` runnable jobs for `p_worker_id`.
create or replace function public.claim_audio_jobs(p_worker_id text, p_limit integer default 1)
returns setof public.audio_processing_jobs
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
begin
  return query
  with claimed as (
    select j.id
    from public.audio_processing_jobs j
    where j.status = 'pending'
      and j.run_after <= now()
    order by j.priority, j.run_after, j.id
    limit greatest(1, least(coalesce(p_limit, 1), 20))
    for update skip locked
  )
  update public.audio_processing_jobs j
  set status     = 'processing',
      attempts   = j.attempts + 1,
      locked_at  = now(),
      locked_by  = p_worker_id,
      started_at = coalesce(j.started_at, now())
  from claimed
  where j.id = claimed.id
  returning j.*;
end;
$fn$;

-- Mark a job done and publish its output onto the audio asset.
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
  set processed_path    = p_processed_path,
      peaks             = coalesce(p_peaks, peaks),
      duration_ms       = coalesce(p_duration_ms, duration_ms),
      processing_status = 'ready',
      processing_error  = null,
      processed_at      = now()
  where id = v_asset_id;
end;
$fn$;

-- Fail a job. Re-queues with exponential backoff while attempts remain.
create or replace function public.fail_audio_job(p_job_id bigint, p_error text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_job public.audio_processing_jobs;
begin
  perform set_config('akinti.system', 'on', true);

  select * into v_job from public.audio_processing_jobs where id = p_job_id for update;

  if v_job.id is null then
    raise exception 'audio job % not found', p_job_id using errcode = 'no_data_found';
  end if;

  if v_job.attempts < v_job.max_attempts then
    update public.audio_processing_jobs
    set status     = 'pending',
        last_error = p_error,
        locked_at  = null,
        locked_by  = null,
        run_after  = now() + (power(4, v_job.attempts) * interval '15 seconds')
    where id = p_job_id;
  else
    update public.audio_processing_jobs
    set status      = 'failed',
        last_error  = p_error,
        locked_at   = null,
        locked_by   = null,
        finished_at = now()
    where id = p_job_id;

    update public.audio_assets
    set processing_status = 'failed',
        processing_error  = p_error
    where id = v_job.audio_asset_id;
  end if;
end;
$fn$;

-- Recover jobs whose worker died mid-flight.
create or replace function public.requeue_stalled_audio_jobs(
  p_stall_after interval default interval '10 minutes'
)
returns integer
language sql
volatile
security definer
set search_path = public, pg_temp
as $fn$
  with reset as (
    update public.audio_processing_jobs
    set status    = 'pending',
        locked_at = null,
        locked_by = null,
        run_after = now()
    where status = 'processing'
      and locked_at < now() - p_stall_after
    returning 1
  )
  select count(*)::integer from reset;
$fn$;

-- Enqueue processing for an asset. Called from application code.
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
