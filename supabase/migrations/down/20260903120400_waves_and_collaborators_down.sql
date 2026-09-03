-- Rollback for 20260903120400_waves_and_collaborators.sql
drop table if exists public.wave_collaborators;
drop trigger if exists waves_derive_duet_lineage on public.waves;
drop function if exists public.waves_derive_duet_lineage();
drop table if exists public.waves;
