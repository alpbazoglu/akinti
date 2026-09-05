-- AKINTI Pro subscriptions (Wave F, P1 — docs/PRODUCT_V2.md §4/§5).
--
-- Two payment rails, one schema (docs/research/libraries.md §7): iyzico is
-- primary for Turkish cards/TRY pricing, Paddle is secondary — merchant of
-- record for international cards/USD pricing. Stripe is not usable from a TR
-- entity and is never added (see AGENTS.md "Never add").
--
-- Three tables, mirroring the shape `rate_limit_events`/`billing_events` and
-- every other append-only ledger in this schema already uses:
--   - `plans`             — the four sellable SKUs (TRY/USD x monthly/yearly).
--     A public read-only catalog; only a human with real iyzico/Paddle price
--     ids seeds rows here (docs/BILLING.md) — this migration creates the
--     table empty, never fake pricing data (spec §44 rule 9).
--   - `subscriptions`     — one row per subscription a user has ever held
--     with a provider (history, not just "current state" — a lapsed and
--     re-subscribed user gets a second row rather than overwriting the
--     first).
--   - `billing_events`    — append-only webhook ledger, `(provider,
--     event_id)` unique for idempotent replay (both iyzico's 15-minute
--     retry-until-2xx and Paddle's own retry policy resend the same event).
--
-- `has_pro()` is the single predicate every other part of this codebase
-- should call to decide Pro entitlement (`src/lib/billing/entitlements.ts`)
-- — SECURITY DEFINER because `subscriptions` RLS restricts SELECT to the
-- owner, but a Pro badge (spec §5) has to be checkable on someone else's
-- profile too.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.billing_provider as enum ('iyzico', 'paddle');

-- `trialing`/`active` both count toward `has_pro()`; `past_due` does not
-- (spec: a failed renewal charge should not keep Pro-only processing options
-- available indefinitely) but is kept distinct from `canceled`/`expired` so
-- dunning UI can tell "still trying to charge you" from "this is over".
create type public.subscription_status as enum (
  'trialing', 'active', 'past_due', 'canceled', 'expired'
);

create type public.plan_interval as enum ('month', 'year');

-- ---------------------------------------------------------------------------
-- plans — the catalog. Never written by client code; a human seeds real
-- rows once real iyzico pricing-plan / Paddle price ids exist (docs/BILLING.md
-- "Seeding plans"). `amount` is minor units (kuruş/cents) to avoid float
-- rounding on money, matching how every other price-bearing system does it.
-- ---------------------------------------------------------------------------
create table public.plans (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  provider           public.billing_provider not null,
  provider_price_id  text not null,
  amount             integer not null,
  currency           text not null,
  "interval"         public.plan_interval not null,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),

  constraint plans_code_known check (
    code in ('pro_monthly_try', 'pro_yearly_try', 'pro_monthly_usd', 'pro_yearly_usd')
  ),
  constraint plans_currency_known check (currency in ('TRY', 'USD')),
  constraint plans_amount_positive check (amount > 0),
  constraint plans_provider_price_id_len check (char_length(provider_price_id) between 1 and 200)
);

-- Public pricing catalog: readable by anyone (a signed-out visitor needs to
-- see Pro pricing on a marketing/paywall screen), written only by the
-- service role — RLS with zero write policies denies every direct
-- insert/update/delete the same way `rate_limit_events` denies all direct
-- access (migration 21).
alter table public.plans enable row level security;

create policy plans_select on public.plans
  for select
  using (is_active);

grant select on public.plans to anon, authenticated;
grant all on public.plans to service_role;

-- ---------------------------------------------------------------------------
-- subscriptions — one row per subscription ever held. `provider_subscription_id`
-- is iyzico's `subscriptionReferenceCode` or Paddle's `subscription.id`.
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.profiles (id) on delete cascade,
  plan_id                   uuid not null references public.plans (id),
  provider                  public.billing_provider not null,
  provider_subscription_id  text not null,
  status                    public.subscription_status not null default 'trialing',
  current_period_end        timestamptz,
  cancel_at_period_end      boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint subscriptions_provider_subscription_id_len
    check (char_length(provider_subscription_id) between 1 and 200)
);

-- One provider never reuses a subscription id across two of our users.
create unique index subscriptions_provider_subscription_id_key
  on public.subscriptions (provider, provider_subscription_id);

-- `has_pro()`'s access pattern: "does this user have any row currently
-- entitling them". `status` first narrows to the two rows worth counting
-- before scanning by `user_id`.
create index subscriptions_user_status_idx on public.subscriptions (user_id, status);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

-- Owner-only read, matching `push_subscriptions` (migration 38) — a
-- subscription is private billing state, never shown to another viewer
-- directly (a Pro badge goes through `has_pro()` instead, never a raw row).
create policy subscriptions_select_own on public.subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

-- No insert/update/delete policy for any client role: every write comes from
-- a webhook handler or a Server Action, both running on the service role,
-- which bypasses RLS entirely (see `src/lib/supabase/admin.ts`'s doc
-- comment) — mirrors `rate_limit_events`.
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;

-- ---------------------------------------------------------------------------
-- billing_events — append-only webhook ledger. `(provider, event_id)` unique
-- makes replay idempotent: both providers resend a webhook until they see a
-- 2xx, and a handler that has already processed `event_id` once should
-- accept the retry with a 200 and do nothing, never process it twice.
-- ---------------------------------------------------------------------------
create table public.billing_events (
  id            uuid primary key default gen_random_uuid(),
  provider      public.billing_provider not null,
  event_id      text not null,
  type          text not null,
  payload       jsonb not null,
  processed_at  timestamptz,
  created_at    timestamptz not null default now(),

  constraint billing_events_event_id_len check (char_length(event_id) between 1 and 200),
  constraint billing_events_type_len check (char_length(type) between 1 and 200)
);

create unique index billing_events_provider_event_id_key
  on public.billing_events (provider, event_id);

-- No client access at all, exactly like `rate_limit_events` (migration 21) —
-- every read/write goes through the service-role webhook route handlers.
alter table public.billing_events enable row level security;
grant all on public.billing_events to service_role;

-- ---------------------------------------------------------------------------
-- has_pro: true when `p_user_id` currently holds an entitling subscription
-- (`trialing`/`active`, and not past its `current_period_end` if one is
-- set). SECURITY DEFINER so a Pro badge is checkable cross-profile despite
-- `subscriptions` RLS restricting direct SELECT to the owner.
-- ---------------------------------------------------------------------------
create or replace function public.has_pro(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = p_user_id
      and s.status in ('trialing', 'active')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$fn$;

revoke all on function public.has_pro(uuid) from public;
grant execute on function public.has_pro(uuid) to anon, authenticated, service_role;

-- ===========================================================================
-- Rate limit: `startProCheckout` (src/app/(app)/settings/pro/actions.ts)
-- calls `check_rate_limit`/`record_rate_limit_event` directly (there is no
-- natural insert to hang a BEFORE INSERT guard off — a checkout attempt
-- does not write a row until the provider redirects back), so `'billing_checkout'`
-- needs to join the whitelist the same way `'challenge_entry'` did in
-- migration 35. 5/hour is generous for a genuine retry (a declined card,
-- switching plans) while still stopping a scripted hammer of the checkout
-- endpoint.
-- ===========================================================================
alter table public.rate_limit_events
  drop constraint rate_limit_events_action_known;

alter table public.rate_limit_events
  add constraint rate_limit_events_action_known check (
    action in (
      'comment', 'follow', 'message', 'duet_request', 'share', 'report',
      'audio_upload', 'challenge_entry', 'billing_checkout'
    )
  );
