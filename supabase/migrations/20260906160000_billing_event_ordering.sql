-- AKINTI — fix: applyBillingEvent loses transitions on retry, out-of-order
-- delivery not guarded (docs/qa/review3/REVIEW.md finding 7).
--
-- `subscriptions` had no record of which webhook event last updated it, so
-- `applyBillingEvent` (src/lib/billing/repository.ts) could not tell "this
-- event is older than the state I already applied" from "this event is the
-- next one to apply" — a provider's retry policy does not guarantee later
-- events are delivered after earlier ones. `last_event_at` records the
-- `occurred_at`/`iyziEventTime` of the most recent event actually applied,
-- so a strictly-older event is still recorded in `billing_events` (the audit
-- trail) but never overwrites a newer state.

alter table public.subscriptions
  add column last_event_at timestamptz;

comment on column public.subscriptions.last_event_at is
  'occurredAt of the most recent webhook event actually applied to this row '
  '(applyBillingEvent, review3 finding 7) — null until the first webhook '
  'event lands. A newly-arrived event whose occurredAt is not strictly '
  'newer than this is recorded in billing_events but not applied, so an '
  'out-of-order retry cannot overwrite a newer state with a stale one.';
