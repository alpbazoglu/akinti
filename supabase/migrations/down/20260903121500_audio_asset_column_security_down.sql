-- Down: 20260903121500_audio_asset_column_security.
--
-- Restores the pre-migration-15 table-level SELECT grant on audio_assets to
-- anon/authenticated. NOTE: this deliberately re-opens the column-level
-- security hole the migration fixed (original_path/processed_path become
-- directly queryable again) — only run this if you are rolling back the
-- whole migration and understand that consequence.

revoke select (
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
) on public.audio_assets from anon, authenticated;

grant select on public.audio_assets to anon, authenticated;

comment on column public.audio_assets.original_path is null;
comment on column public.audio_assets.processed_path is null;
