-- Rollback for 20260903130000_explore_discovery.sql
drop index if exists public.waves_original_content_published_idx;
drop function if exists public.rising_creators(integer, integer, integer);
