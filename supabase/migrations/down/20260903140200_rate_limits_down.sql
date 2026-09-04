-- Rollback for 20260903140200_rate_limits.sql
drop trigger if exists audio_assets_rate_limit on public.audio_assets;
drop trigger if exists reports_rate_limit on public.reports;
drop trigger if exists shares_rate_limit on public.shares;
drop trigger if exists duet_requests_rate_limit on public.duet_requests;
drop trigger if exists messages_rate_limit on public.messages;
drop trigger if exists follows_rate_limit on public.follows;
drop trigger if exists comments_rate_limit on public.comments;

drop function if exists public.audio_assets_rate_limit();
drop function if exists public.reports_rate_limit();
drop function if exists public.shares_rate_limit();
drop function if exists public.duet_requests_rate_limit();
drop function if exists public.messages_rate_limit();
drop function if exists public.follows_rate_limit();
drop function if exists public.comments_rate_limit();

drop function if exists public.prune_rate_limit_events(interval);
drop function if exists public.record_rate_limit_event(uuid, text);
drop function if exists public.check_rate_limit(uuid, text, integer, interval);
drop function if exists public.rate_limit_count(uuid, text, interval);

drop table if exists public.rate_limit_events;
