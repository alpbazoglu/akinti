-- Rollback for 20260903121100_counters_and_events.sql
drop trigger if exists wave_listens_after_change on public.wave_listens;
drop trigger if exists messages_after_insert on public.messages;
drop trigger if exists duet_requests_after_change on public.duet_requests;
drop trigger if exists wave_collaborators_after_change on public.wave_collaborators;
drop trigger if exists shares_after_insert on public.shares;
drop trigger if exists saves_after_change on public.saves;
drop trigger if exists comments_after_change on public.comments;
drop trigger if exists waves_after_change on public.waves;
drop trigger if exists follows_after_change on public.follows;

drop function if exists public.wave_listens_after_change();
drop function if exists public.record_play_event(uuid, text, integer, integer, boolean);
drop function if exists public.play_qualifying_ms(integer);
drop function if exists public.messages_after_insert();
drop function if exists public.duet_requests_after_change();
drop function if exists public.wave_collaborators_after_change();
drop function if exists public.shares_after_insert();
drop function if exists public.saves_after_change();
drop function if exists public.comments_after_change();
drop function if exists public.waves_after_change();
drop function if exists public.follows_after_change();
