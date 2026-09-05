-- Bug fix: `challenge_entries_guard` (migration 20260905130000) records a
-- `'challenge_entry'` rate-limit event on every challenge entry, but
-- `rate_limit_events_action_known` (migration 20260903140200) only allows
-- ('comment', 'follow', 'message', 'duet_request', 'share', 'report',
-- 'audio_upload') — so `enter_challenge()` failed live with "violates check
-- constraint rate_limit_events_action_known" on every call.

alter table public.rate_limit_events
  drop constraint rate_limit_events_action_known;

alter table public.rate_limit_events
  add constraint rate_limit_events_action_known check (
    action in (
      'comment', 'follow', 'message', 'duet_request', 'share', 'report',
      'audio_upload', 'challenge_entry'
    )
  );
