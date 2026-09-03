-- Rollback for 20260903121400_search.sql
drop function if exists public.trending_waves(integer, integer, integer);
drop function if exists public.wave_trending_score(integer, integer, integer, integer, integer, integer, timestamptz);
drop function if exists public.search_waves(text, integer, integer);
drop function if exists public.search_profiles(text, integer, integer);
drop index if exists public.waves_description_trgm_idx;
drop index if exists public.waves_title_trgm_idx;
drop index if exists public.profiles_display_name_trgm_idx;
drop index if exists public.profiles_username_trgm_idx;
