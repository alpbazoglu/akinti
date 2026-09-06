-- Down: 20260906140000_rate_limit_actions_union.sql
--
-- Restores the closed check constraint with the same full union this
-- migration shipped with (not either of the two colliding partial lists it
-- replaced), so rolling back does not reintroduce review3 finding 1.

alter table public.rate_limit_events
  drop constraint rate_limit_events_action_fkey;

alter table public.rate_limit_events
  add constraint rate_limit_events_action_known check (
    action in (
      'comment', 'follow', 'message', 'duet_request', 'share', 'report',
      'audio_upload', 'challenge_entry', 'billing_checkout', 'flow_event'
    )
  );

drop table public.rate_limit_actions;
