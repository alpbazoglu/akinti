-- Rollback for 20260905120400_duet_v2_backing_track_lineage.sql
drop function if exists public.list_waves_on_track(uuid, text, integer);
drop trigger if exists waves_after_insert_backing_track_credit on public.waves;
drop function if exists public.waves_after_insert_backing_track_credit();
