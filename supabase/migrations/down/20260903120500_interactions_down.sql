-- Rollback for 20260903120500_interactions.sql
drop table if exists public.wave_listens;
drop table if exists public.play_events;
drop table if exists public.shares;
drop table if exists public.saves;
drop trigger if exists comments_enforce_shallow_threading on public.comments;
drop function if exists public.comments_enforce_shallow_threading();
drop table if exists public.comments;
