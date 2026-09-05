-- Rollback for 20260905110000_backing_tracks.sql

drop function if exists public.list_backing_tracks(text, text, integer, integer, text, integer);

alter table public.waves drop constraint if exists waves_not_duet_and_backing_track;
drop index if exists public.waves_backing_track_idx;
alter table public.waves drop column if exists backing_track_id;

drop table if exists public.backing_tracks;
drop type if exists public.backing_track_license;
