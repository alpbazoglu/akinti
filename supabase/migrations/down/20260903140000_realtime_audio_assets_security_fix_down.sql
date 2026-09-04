-- Rollback for 20260903140000_realtime_audio_assets_security_fix.sql
--
-- Re-adds `public.audio_assets` to `supabase_realtime`, restoring migration
-- 16's original (insecure — see the forward migration's comment) state.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'audio_assets'
    ) then
      alter publication supabase_realtime add table public.audio_assets;
    end if;
  end if;
end $$;
