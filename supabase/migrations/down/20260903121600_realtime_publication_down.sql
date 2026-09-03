-- Down: 20260903121600_realtime_publication.
--
-- Removes the three tables from `supabase_realtime` again. Guarded the same
-- way as the up migration: safe to re-run, and a no-op if the publication
-- does not exist at all.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
      alter publication supabase_realtime drop table public.notifications;
    end if;

    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
      alter publication supabase_realtime drop table public.messages;
    end if;

    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'audio_assets'
    ) then
      alter publication supabase_realtime drop table public.audio_assets;
    end if;
  end if;
end $$;
