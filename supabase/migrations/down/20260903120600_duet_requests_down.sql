-- Rollback for 20260903120600_duet_requests.sql
drop function if exists public.expire_duet_requests();
alter table public.waves drop constraint if exists waves_duet_request_fk;
drop table if exists public.duet_requests;
