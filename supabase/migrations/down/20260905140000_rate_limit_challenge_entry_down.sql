-- Rollback for 20260905140000_rate_limit_challenge_entry.sql

alter table public.rate_limit_events
  drop constraint rate_limit_events_action_known;

alter table public.rate_limit_events
  add constraint rate_limit_events_action_known check (
    action in ('comment', 'follow', 'message', 'duet_request', 'share', 'report', 'audio_upload')
  );
