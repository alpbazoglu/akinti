-- Rollback for 20260903120300_audio_assets_and_jobs.sql
drop function if exists public.enqueue_audio_job(uuid, public.audio_job_type, jsonb);
drop function if exists public.requeue_stalled_audio_jobs(interval);
drop function if exists public.fail_audio_job(bigint, text);
drop function if exists public.complete_audio_job(bigint, text, jsonb, integer, jsonb);
drop function if exists public.claim_audio_jobs(text, integer);
drop table if exists public.audio_processing_jobs;
drop table if exists public.audio_assets;
