-- AKINTI — 16. Add tables to the `supabase_realtime` publication.
--
-- Supabase's Realtime service streams `postgres_changes` only for tables
-- explicitly added to the `supabase_realtime` publication — every table
-- starts outside it. Three tables need it:
--   - `public.notifications` — the notifications client subscribes via
--     `postgres_changes` and currently falls back to polling without this.
--   - `public.messages` — added now so the upcoming messaging stage doesn't
--     need another migration just for this.
--   - `public.audio_assets` — available for a future Realtime-driven
--     "Processing" banner; the current Wave-detail implementation polls
--     instead (see docs/AUDIO_ARCHITECTURE.md "Processing state"), so this
--     is forward-provisioning, not a live dependency today.
--
-- Guarded so re-running this file (or applying it against a project where a
-- table was already added by hand) is a safe no-op, and so it does nothing
-- rather than erroring on a bare Postgres instance with no
-- `supabase_realtime` publication at all (e.g. before Realtime is enabled).

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table public.notifications;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'audio_assets'
    ) then
      alter publication supabase_realtime add table public.audio_assets;
    end if;
  end if;
end $$;
