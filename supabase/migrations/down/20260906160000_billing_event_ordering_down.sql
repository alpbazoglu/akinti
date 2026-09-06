-- Down: 20260906160000_billing_event_ordering.sql

alter table public.subscriptions
  drop column last_event_at;
