-- AKINTI — 15. Security fix: column-level lockdown of audio_assets storage paths.
--
-- Bug: migration 12 granted TABLE-level SELECT on public.audio_assets to
-- anon/authenticated (gated only by the audio_assets_select RLS policy, i.e.
-- can_view_audio_asset()). Table-level SELECT implicitly covers every
-- column — including `original_path` and `processed_path`, the raw storage
-- keys inside the PRIVATE `audio` bucket. That means any signed-in user (or
-- anon, for an `everyone`-visibility Wave) who could view a Wave could also
-- read its audio asset's raw storage paths directly through PostgREST
-- (`select=original_path,processed_path`), even though nothing in the
-- application ever intentionally requests those columns. That directly
-- contradicts spec §33: audio must reach a client exclusively as a
-- short-lived signed URL minted server-side, never as a raw path a client
-- could hand to an unrelated, unauthenticated storage request.
--
-- Fix: PostgreSQL column-level GRANTs are additive only — they extend access
-- for a role that LACKS the table-level privilege; they cannot subtract a
-- column from a role that already holds table-level SELECT (a bare column
-- REVOKE while the table-level grant survives is a silent no-op). So the fix
-- has two steps: revoke the table-level SELECT entirely, then re-grant
-- SELECT scoped to an explicit column list that excludes the two path
-- columns. Every other column (processing status, peaks, duration, mime
-- type, ...) stays directly readable, so the "Processing" banner and
-- waveform/duration rendering keep working without an extra round trip.
--
-- Storage keys are now resolved exclusively server-side, via the
-- service-role (admin) client, and only after `can_view_audio_asset()` has
-- already authorised the caller through the caller's own RLS-scoped client
-- (see src/lib/db/audioAssets.ts's mintSignedAudioUrl/mintPlaybackUrl, and
-- "Storage security" in docs/AUDIO_ARCHITECTURE.md).

revoke select on public.audio_assets from anon, authenticated;

grant select (
  id,
  owner_id,
  storage_bucket,
  duration_ms,
  mime_type,
  byte_size,
  sample_rate,
  channels,
  peaks,
  processing_status,
  processing_error,
  enhancement_preset,
  checksum_sha256,
  created_at,
  updated_at,
  processed_at
) on public.audio_assets to anon, authenticated;

comment on column public.audio_assets.original_path is
  'PRIVATE storage key. Not selectable by anon/authenticated (migration 15) — resolved only via the service-role client after can_view_audio_asset() passes. Never send to a browser directly.';
comment on column public.audio_assets.processed_path is
  'PRIVATE storage key. Not selectable by anon/authenticated (migration 15) — resolved only via the service-role client after can_view_audio_asset() passes. Never send to a browser directly.';
