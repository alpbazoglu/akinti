-- AKINTI — Web Push subscriptions (`docs/PRODUCT_V2.md` §4: "push
-- notifications for Duet requests/answers, open-call answers").
--
-- One row per browser/device subscription, keyed by the Push API's own
-- `endpoint` (globally unique per push service registration — the same
-- browser+device re-subscribing after clearing storage gets a new endpoint,
-- so `on conflict (endpoint)` is how `subscribePush` re-registers cleanly
-- rather than accumulating duplicates). `user_agent` is diagnostic only
-- (letting Settings show "iPhone", "Chrome on this device", etc. later) and
-- is never treated as an identity signal.
--
-- Owner-only, same shape as every other "my own rows" table in this schema
-- (`blocks`, `audio_assets`): RLS scopes every operation to `user_id =
-- auth.uid()`, and there is no cross-user read path at all — a push
-- subscription is exactly as sensitive as a session token (`docs/SECURITY.md`
-- authorization boundary: RLS, not "is this route public").
--
-- Sending itself (`src/lib/push/send.ts`) uses the admin/service-role client
-- from the notification-creating server context, not this RLS-scoped path —
-- see that module for why (the recipient of a push is never the caller).

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),

  constraint push_subscriptions_endpoint_len check (char_length(endpoint) between 1 and 2048),
  constraint push_subscriptions_p256dh_len check (char_length(p256dh) between 1 and 512),
  constraint push_subscriptions_auth_len check (char_length(auth) between 1 and 512),
  constraint push_subscriptions_user_agent_len check (user_agent is null or char_length(user_agent) <= 512)
);

-- `subscribePush`'s per-user fan-out to every subscription row when sending
-- (`src/lib/push/send.ts`), and cascade cleanup when an account is deleted.
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());

-- `subscribePush` upserts on `endpoint` (the same browser subscribing again
-- with rotated keys) via `on conflict (endpoint) do update` — Postgres
-- evaluates that conflict path against the UPDATE policy, not INSERT's
-- `with check`, so both are needed for the same upsert to work.
create policy push_subscriptions_update_own on public.push_subscriptions
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

comment on table public.push_subscriptions is
  'Web Push API subscriptions (endpoint + keys) for Duet request/answer and open-call-answer notifications. Owner-only RLS; sent via src/lib/push/send.ts using the service-role client, never the caller''s own.';
