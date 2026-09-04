-- Rollback for 20260903140500_creator_analytics.sql

drop function if exists public.product_health(integer);
drop function if exists public.creator_wave_performance(integer, integer);
drop function if exists public.creator_timeseries(integer);
drop function if exists public.creator_overview(integer);
drop function if exists public.wave_listen_is_suspicious(uuid, text);
drop function if exists public.flag_suspicious_play_events();

drop index if exists public.waves_creator_all_published_idx;
drop index if exists public.duet_requests_created_idx;
drop index if exists public.profiles_created_at_idx;
drop index if exists public.shares_wave_created_idx;
drop index if exists public.comments_wave_created_idx;
drop index if exists public.saves_wave_created_idx;
drop index if exists public.wave_listens_replay_counted_at_idx;
drop index if exists public.wave_listens_play_counted_at_idx;
drop index if exists public.play_events_counted_listener_idx;
drop index if exists public.play_events_suspicious_scan_idx;

alter table public.play_events drop column if exists suspicious;
