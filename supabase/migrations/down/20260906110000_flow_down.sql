-- Down: 20260906110000_flow.sql

drop function if exists public.count_flow_new();
drop function if exists public.record_flow_event(uuid, text, integer);
drop function if exists public.get_flow_page(jsonb, integer, integer);

alter table public.rate_limit_events
  drop constraint rate_limit_events_action_known;

alter table public.rate_limit_events
  add constraint rate_limit_events_action_known check (
    action in (
      'comment', 'follow', 'message', 'duet_request', 'share', 'report',
      'audio_upload', 'challenge_entry'
    )
  );

drop table if exists public.flow_impressions;
