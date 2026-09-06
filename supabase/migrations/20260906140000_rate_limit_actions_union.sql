-- AKINTI — fix: `rate_limit_events_action_known` whitelist collision
-- (docs/qa/review3/REVIEW.md finding 1).
--
-- Two migrations landed the same day and both rewrote the same closed check
-- constraint from scratch, each appending only its own new action:
--   20260906100000_subscriptions.sql -> ... 'challenge_entry', 'billing_checkout'
--   20260906110000_flow.sql          -> ... 'challenge_entry', 'flow_event'
-- Applied in filename order, the flow migration runs last and silently drops
-- 'billing_checkout' from the constraint. `startCheckout`
-- (src/lib/billing/index.ts:116) then fails every Pro checkout with a check
-- constraint violation *after* the provider has already created a real
-- checkout and a placeholder `subscriptions` row already exists.
--
-- Root cause, not just the missing value: a `check (action in (...))` that
-- every migration touching this feature has to copy-paste in full and
-- re-apply from scratch cannot be safely extended by two concurrent agents.
-- Replace it with a lookup table + foreign key: a future migration that adds
-- a new rate-limited action only needs `insert into rate_limit_actions`,
-- never a `drop constraint` / `add constraint` pair that can race another
-- migration's copy of the same list.
--
-- Full union of every action used anywhere in migrations and application
-- code as of this fix: 'comment', 'follow', 'message', 'duet_request',
-- 'share', 'report', 'audio_upload' (20260903140200_rate_limits.sql),
-- 'challenge_entry' (20260905130000_challenges.sql /
-- 20260905140000_rate_limit_challenge_entry.sql), 'billing_checkout'
-- (src/lib/billing/index.ts, BILLING_CHECKOUT_ACTION), 'flow_event'
-- (20260906110000_flow.sql, record_flow_event).

create table public.rate_limit_actions (
  action text primary key
);

comment on table public.rate_limit_actions is
  'Closed whitelist of rate_limit_events.action values, enforced via foreign '
  'key rather than a check constraint so a new action can be added with a '
  'single insert instead of a drop/add constraint pair that can silently '
  'race a concurrent migration touching the same constraint (review3 finding 1).';

-- No RLS: this is static reference data with no per-row sensitivity (just an
-- allowed-action label), and enabling RLS here would make the foreign-key
-- check on `rate_limit_events` fragile to the calling role's grants. Reads
-- are harmless; only migrations insert into it.
grant select on public.rate_limit_actions to service_role, authenticated, anon;

insert into public.rate_limit_actions (action) values
  ('comment'),
  ('follow'),
  ('message'),
  ('duet_request'),
  ('share'),
  ('report'),
  ('audio_upload'),
  ('challenge_entry'),
  ('billing_checkout'),
  ('flow_event');

-- Swap the check constraint for a foreign key against the new table.
alter table public.rate_limit_events
  drop constraint rate_limit_events_action_known;

alter table public.rate_limit_events
  add constraint rate_limit_events_action_fkey
    foreign key (action) references public.rate_limit_actions (action)
    on update cascade;

-- Index the FK column combination already covered by the existing
-- (profile_id, action, created_at desc) index — no additional index needed
-- for the FK itself since `action` is never looked up alone.
