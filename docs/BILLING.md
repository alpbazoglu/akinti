# AKINTI — Billing (AKINTI Pro, Wave F)

AKINTI Pro (`docs/PRODUCT_V2.md` §4/§5): pitch snap, self-harmony, stems,
unlimited saves, ad-free forever, one featured Duet slot/month, a Pro badge.
₺79.99/month in Turkey (annual discount), $4.99/month international. Two
payment rails, chosen per plan code — never Stripe (`docs/research/libraries.md`
§7; unavailable to a Turkish-incorporated company):

| Plan code | Provider | Currency | Interval |
|---|---|---|---|
| `pro_monthly_try` | iyzico | TRY | month |
| `pro_yearly_try` | iyzico | TRY | year |
| `pro_monthly_usd` | Paddle | USD | month |
| `pro_yearly_usd` | Paddle | USD | year |

There is no separate "detect the visitor's country" step anywhere in this
backend — a plan code's `provider` column (seeded once, see "Seeding plans"
below) IS the routing rule. A pricing page that defaults a Turkish visitor to
a `_try` code and everyone else to a `_usd` code already implements
PRODUCT_V2 §4's "TR → iyzico" rule.

## Never paywall a previously free feature

`requirePro()` (`src/lib/billing/entitlements.ts`) only gates NEW Pro-only
processing flags. As of this wave, pitch snap/self-harmony/stems do not exist
in `finalizeUpload`/`publishWave` yet (`src/app/(app)/create/actions.ts`,
owned by a different wave) — there is nothing to gate today. When that
audio-DSP work ships, its owner calls `requirePro(db, userId)` around
whichever NEW option flag it adds, and nothing else: every option that works
today keeps working for every user, Pro or not.

## Schema

`supabase/migrations/20260906100000_subscriptions.sql` — `plans` /
`subscriptions` / `billing_events`, `has_pro(user_id)`. Full column-level
description: `docs/DATABASE.md` (migration 40 and its "Entities" blurb). RLS
summary: a user reads their own `subscriptions` row and nothing else; `plans`
is a public catalog; `billing_events` has no client access at all; every
write goes through the service-role admin client from a webhook route or a
Server Action.

### Seeding plans

This migration creates `plans` empty on purpose — inserting a fabricated
`provider_price_id` would let a checkout silently reference a price that
doesn't exist at the provider, which is exactly the "fake success" spec §44
rule 9 forbids. Once real iyzico pricing-plan reference codes and Paddle
price ids exist (create them in each provider's dashboard first: iyzico
Merchant Panel → Subscription → Products & Pricing Plans; Paddle → Catalog →
Prices), run `scripts/seed-plans.ts`:

```sh
npx tsx --env-file-if-exists=.env.local scripts/seed-plans.ts
```

It reads the four price/pricing-plan reference ids from
`IYZICO_PLAN_MONTHLY_TRY` / `IYZICO_PLAN_YEARLY_TRY` /
`PADDLE_PRICE_MONTHLY_USD` / `PADDLE_PRICE_YEARLY_USD` (`.env.example`) and
inserts one `plans` row per id that is actually set — a plan whose id is
unset is skipped with a console message, never inserted with a placeholder.
`amount` (minor units — kuruş/cents) for the two monthly plans is the
founder's already-decided price (PRODUCT_V2 §5/§6: ₺79.99/month,
$4.99/month), filled in by the script itself. The annual discount is **not**
decided yet — "12 months minus a discount" is not a fixed number — so each
yearly plan additionally requires its own real amount via
`IYZICO_PLAN_YEARLY_TRY_AMOUNT` / `PADDLE_PRICE_YEARLY_USD_AMOUNT`; without
it, that yearly row is skipped rather than seeded with a guessed discount.
Idempotent — re-running skips any code that already has a `plans` row.

## Providers (`src/lib/billing/`)

- `types.ts` — the `BillingProviderClient` interface both providers
  implement, plus `ParsedBillingEvent`/`CreateCheckoutResult`.
- `iyzico.ts` / `paddle.ts` — one provider each, built directly against the
  installed `iyzipay`/`@paddle/paddle-node-sdk` package sources (not
  guessed — see each file's header comment for exactly which endpoints/SDK
  methods were confirmed and how).
- `repository.ts` — every `plans`/`subscriptions`/`billing_events` read and
  write, always through the admin client.
- `entitlements.ts` — `isPro`/`requirePro`, the one predicate every other
  part of the codebase should call.
- `index.ts` — orchestration: `startCheckout`, `cancelSubscriptionForUser`,
  `handleWebhook`. This is what `settings/pro/actions.ts` and the two
  webhook routes actually call.

`iyzipay` has no `fs`-safe static import graph (`Iyzipay.js` does a runtime
`fs.readdirSync` over its own `lib/resources/` directory), so it's listed in
`next.config.ts`'s `serverExternalPackages` — Turbopack requires it at
runtime on the server instead of trying to statically bundle it.

## Checkout flow — iyzico (TRY plans)

iyzico's Node SDK exposes no raw-card-free hosted checkout for the
Subscription product directly as a documented method — but the underlying
REST endpoint (`POST /v2/subscription/checkoutform/initialize`, confirmed
against docs.iyzico.com and wrapped by the SDK's own
`subscriptionCheckoutForm` resource, `node_modules/iyzipay/lib/resources/SubscriptionCheckoutForm.js`)
IS a real hosted Checkout Form — the buyer's card never touches this server.

1. `startProCheckout({ planCode: 'pro_monthly_try', buyer, returnUrl })` →
   `startCheckout()` (`index.ts`) → `IyzicoProvider.createCheckout()` calls
   `subscriptionCheckoutForm.initialize`. The response is a `token` +
   `checkoutFormContent` (HTML+`<script>`, not a redirect URL — unlike the
   generic e-commerce Checkout Form product). The frontend wave that builds
   the Pro settings screen mounts `checkoutFormContent` into a
   `<div id="iyzipay-checkout-form">` per iyzico's own embed contract.
2. `startCheckout()` immediately inserts a `subscriptions` row with
   `provider_subscription_id = token` and `status = 'trialing'` — a
   placeholder, because the token is not yet a real subscription.
3. The buyer pays on the embedded form. iyzico POSTs the completed `token`
   to the `callbackUrl` (`returnUrl`, per the SDK request field) —
   `POST /api/billing/iyzico/callback` (this codebase's own route, not part
   of iyzico's webhook system) reads it, calls
   `subscriptionCheckoutForm.retrieve({ checkoutFormToken })` to learn the
   real `subscriptionReferenceCode`/status/`endDate`, and swaps the
   placeholder row's `provider_subscription_id` for the real one.
4. `subscription.order.success`/`subscription.order.failure` webhooks
   (`X-IYZ-SIGNATURE-V3`) confirm/update state afterward, idempotently, for
   every subsequent renewal too.

**Known race:** if the async webhook (step 4) somehow arrives before the
synchronous callback (step 3) — a webhook retry racing a slow buyer, in
practice — `applyBillingEvent` finds no matching `subscriptions` row yet
(iyzico's webhook payload carries no correlation data of its own, unlike
Paddle's `customData`) and logs an error without crashing. iyzico retries
every 15 minutes for up to 3 attempts, so the next retry recovers once the
callback has landed. This is a real, accepted gap, not a hidden one — flagged
here rather than "fixed" with an unconfirmed workaround.

## Checkout flow — Paddle (USD plans)

1. `startProCheckout({ planCode: 'pro_monthly_usd', returnUrl })` →
   `PaddleProvider.createCheckout()` finds-or-creates a Paddle customer by
   email, then creates a transaction (`items: [{ priceId, quantity: 1 }]`)
   stamped with `customData: { akinti_user_id, akinti_plan_id }` and
   `checkout: { url: returnUrl }`. Returns `transaction.checkout.url` — a
   real hosted checkout URL to redirect the buyer to.
2. `startCheckout()` does **not** pre-create a `subscriptions` row for
   Paddle — a transaction id is not a subscription id, and pre-creating one
   keyed by the wrong id would leave a permanent stray row once the real
   subscription arrives under its own id.
3. Once the buyer pays, Paddle creates the actual subscription and fires
   `subscription.created` (then `subscription.updated`/`activated`/etc. on
   every later change). Paddle documents that `customData` set on a
   checkout transaction is automatically copied to the subscription it
   creates — so this event both correlates (via `customData`) and creates
   the `subscriptions` row, with the real Paddle `subscriptionId` from the
   very first insert. No callback route, no placeholder row, no race.

## Webhooks

| Route | Provider | Signature |
|---|---|---|
| `POST /api/billing/iyzico/webhook` | iyzico | `X-IYZ-SIGNATURE-V3`: `HMAC-SHA256(secretKey, merchantId + secretKey + eventType + subscriptionReferenceCode + orderReferenceCode + customerReferenceCode)`, hex — confirmed against docs.iyzico.com, unit-tested in `src/lib/billing/iyzico.test.ts` |
| `POST /api/billing/paddle/webhook` | Paddle | `Paddle-Signature` (`ts=...;h1=...`), verified via the SDK's own `webhooks.isSignatureValid`/`unmarshal` — never hand-rolled |

Both routes: verify signature against the RAW body before parsing anything
else, respond `no-store`, and are idempotent — `billing_events` is unique on
`(provider, event_id)`, so a provider's own retry-on-non-2xx behavior can
never double-apply a state transition. See `repository.ts#applyBillingEvent`
for the exact idempotency + state-transition logic, and
`src/lib/billing/{iyzico,paddle}.test.ts` for signature-verification and
state-transition tests against recorded/reconstructed sample payloads.

## State machine

`subscription_status`: `trialing | active | past_due | canceled | expired`.
`has_pro(user_id)` (SQL, SECURITY DEFINER) is the only place this is
evaluated: true when a row exists with `status in ('trialing', 'active')`
and (`current_period_end` is null or still in the future). `past_due` and
Paddle's `paused` (mapped to `past_due` — no direct equivalent in this
model) are deliberately non-entitling: a failed renewal charge should not
keep Pro-only options open indefinitely.

## Cancel / refund policy

`cancelPro()` cancels at the provider (iyzico: `subscription.cancel`;
Paddle: `subscriptions.cancel(id, { effectiveFrom: 'next_billing_period' })`)
and immediately sets `cancel_at_period_end = true` locally — an honest
reflection of "the buyer asked to cancel", not a fake completed state. The
actual `status → 'canceled'` transition still comes from that provider's own
webhook once the current billing period actually ends; this codebase never
flips it early. Refunds are handled directly in each provider's dashboard
(iyzico Merchant Panel / Paddle) per that provider's own policy — there is no
in-app refund action in this wave.

## KVKK (Turkish data protection law) note

Card/payment data itself never reaches this application — both providers'
hosted flows keep it entirely on their own PCI-scoped infrastructure. What
this schema stores is a subscription's *state* (plan, status, period end)
and the append-only `billing_events` payloads, which are provider webhook
bodies (subscription references, event types/timestamps — no card numbers).
Treat `billing_events.payload` the same as any other user-linked record for
a KVKK data-subject request: it is reachable from a `subscriptions` row's
`user_id` only indirectly (via `provider_subscription_id`), so a full export/
delete for a given user should also query `billing_events` for that user's
known `provider_subscription_id` values before considering the export
complete.
