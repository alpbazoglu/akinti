-- AKINTI — 19. Security fix: remove audio_assets from supabase_realtime.
--
-- Migration 16 added `public.audio_assets` to the `supabase_realtime`
-- publication for a future Realtime-driven "Processing" banner. Supabase
-- Realtime's `postgres_changes` protocol broadcasts the ENTIRE row on every
-- change to any client subscribed to the table (gated only by the
-- subscribing role's RLS SELECT policy — it does not respect column-level
-- GRANTs). Once `audio_assets` sits in the publication, `original_path`/
-- `processed_path` — deliberately locked out of ordinary PostgREST reads by
-- migration 15's column-scoped GRANT (spec s33) — leak in full to any
-- listener/creator who can see the row via `audio_assets_select`
-- (`can_view_audio_asset`), defeating that fix through a different door.
--
-- Nothing depends on this today: `src/app/(app)/w/[id]/ProcessingBanner.tsx`
-- polls `processing_status` on an interval instead of subscribing (see its
-- own header comment). Grepping `src/` for `postgres_changes` shows exactly
-- two live subscriptions in this codebase — `notifications`
-- (`src/lib/notifications/unreadStore.ts`) and `messages`
-- (`src/lib/messages/useThreadMessages.ts`, `src/lib/messages/unreadStore.ts`)
-- — neither touches `audio_assets`. Removing it from the publication is a
-- pure fix with no behavior change.
--
-- Guarded the same way migration 16 added it, so this is a safe no-op to
-- re-run, and does nothing on a bare Postgres instance with no
-- `supabase_realtime` publication at all (e.g. before Realtime is enabled).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'audio_assets'
    ) then
      alter publication supabase_realtime drop table public.audio_assets;
    end if;
  end if;
end $$;
