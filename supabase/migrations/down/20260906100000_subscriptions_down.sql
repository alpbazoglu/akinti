-- Rollback for 20260906100000_subscriptions.sql

alter table public.rate_limit_events
  drop constraint rate_limit_events_action_known;

alter table public.rate_limit_events
  add constraint rate_limit_events_action_known check (
    action in (
      'comment', 'follow', 'message', 'duet_request', 'share', 'report',
      'audio_upload', 'challenge_entry'
    )
  );

revoke all on function public.has_pro(uuid) from anon, authenticated, service_role;
drop function if exists public.has_pro(uuid);

drop table if exists public.billing_events;

drop table if exists public.subscriptions;

drop table if exists public.plans;

drop type if exists public.plan_interval;
drop type if exists public.subscription_status;
drop type if exists public.billing_provider;
