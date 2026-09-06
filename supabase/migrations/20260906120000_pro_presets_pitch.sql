-- AKINTI Pro sounds + pitch score (Wave F follow-up, PRODUCT_V2 §4/§5).
--
-- Two independent additions, bundled in one migration because both are
-- small and both belong to "make the two Pro sounds and the pitch score
-- real" (docs/AUDIO_ARCHITECTURE.md, docs/BILLING.md "Never paywall a
-- previously free feature"):
--
-- 1. Widens `audio_enhancement_preset` with the two Pro-only sound ids
--    already named everywhere else in the codebase (`ProEnhancementPresetId`
--    in `src/lib/audio/enhancement.ts`, `PRESET_FILTERS` in
--    `scripts/worker.ts`) but never yet valid at the database layer — until
--    this migration, a `process_audio` job could never actually reach either
--    key (see that file's own doc comment, "outside this wave's file
--    ownership").
--
--    `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction that
--    later references the new value (see migration 29's header comment for
--    the same rule) — this migration only ADDs the values and touches no
--    row that would need to cast one, so it is safe inside the single
--    transaction `scripts/apply-migrations.ts` wraps each file in.
--
-- 2. Adds `audio_assets.pitch_score jsonb` — NOT `waves.pitch_score`.
--    Decision, documented per the brief's "pick one and document": a vocal
--    Wave's audio is processed (and, going forward, pitch-scored) by
--    `scripts/worker.ts` the moment `finalizeUpload` enqueues a
--    `process_audio`/`mix_duet` job, which happens BEFORE `publishWave`
--    ever creates the corresponding `waves` row (see
--    docs/AUDIO_ARCHITECTURE.md "Upload sequence" — publishing is allowed
--    while an asset is still `pending`/`processing`, i.e. there may be no
--    Wave row yet at all when the score is computed). `audio_assets` is
--    already where every other worker-computed, server-owned processing
--    result lives (`peaks`, `enhancement_report`) for exactly this reason —
--    `pitch_score` follows the same precedent rather than the newer,
--    Wave-scoped column the brief offered as the naive default. See
--    "Enhancement report" in docs/AUDIO_ARCHITECTURE.md and the "Pitch
--    score" section added alongside it.
--
--    Written through a dedicated `set_audio_asset_pitch_score()` RPC rather
--    than folded into `complete_audio_job`'s existing
--    `p_enhancement_report` param: the pitch score is a best-effort side
--    call the worker makes AFTER a job has already completed successfully
--    (docs/AUDIO_ARCHITECTURE.md "Pipeline" — the sidecar being down must
--    never fail the job, so it cannot block or extend the same RPC call
--    that marks the job done). A separate, narrowly-scoped RPC keeps that
--    "never fails the job" property structural rather than relying on
--    call-site discipline.

alter type public.audio_enhancement_preset add value 'pitch_snap';
alter type public.audio_enhancement_preset add value 'self_harmony';

alter table public.audio_assets
  add column pitch_score jsonb;

-- Same treatment as `enhancement_report` (migration 27): expose the new
-- column to the same column-scoped grant migration 15 already carved out,
-- and lock it behind the existing service-role-only write guard.
grant select (pitch_score) on public.audio_assets to anon, authenticated;

comment on column public.audio_assets.pitch_score is
  'Best-effort pYIN pitch score for a vocal Wave''s processed audio, written '
  'by scripts/worker.ts via set_audio_asset_pitch_score() after the sidecar''s '
  'POST /pitch-score succeeds (docs/AUDIO_ARCHITECTURE.md "Pitch score"). '
  'null when the sidecar was unreachable or the asset is a backing-track '
  'instrumental — never a fake/placeholder score. Shape: '
  '{"score_0_100":number,"in_tune_ratio":number,"median_cents_off":number,'
  '"key_guess":string,"notes_detected":number}.';

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

-- Worker-only setter (service_role). Deliberately does not touch
-- processing_status/peaks/etc — it only ever runs after complete_audio_job
-- has already marked the job/asset done, as a best-effort follow-up call
-- that must never be able to fail or re-open that job.
create or replace function public.set_audio_asset_pitch_score(
  p_asset_id     uuid,
  p_pitch_score  jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform set_config('akinti.system', 'on', true);

  update public.audio_assets
  set pitch_score = p_pitch_score
  where id = p_asset_id;

  if not found then
    raise exception 'audio asset % not found', p_asset_id using errcode = 'no_data_found';
  end if;
end;
$fn$;

comment on function public.set_audio_asset_pitch_score(uuid, jsonb) is
  'Worker-only (service_role). Best-effort write of audio_assets.pitch_score '
  'after a process_audio/mix_duet job has already completed — see '
  'docs/AUDIO_ARCHITECTURE.md "Pitch score".';

revoke all on function public.set_audio_asset_pitch_score(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_audio_asset_pitch_score(uuid, jsonb) to service_role;
