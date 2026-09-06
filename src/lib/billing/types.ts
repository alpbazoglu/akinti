/**
 * Shared provider-agnostic types for AKINTI Pro billing (Wave F).
 *
 * `src/lib/billing/iyzico.ts` and `src/lib/billing/paddle.ts` both implement
 * `BillingProviderClient` so callers (`src/lib/billing/index.ts`'s
 * `chooseProvider`, the webhook routes, `settings/pro/actions.ts`) never
 * branch on which rail is active except to pick which client to construct.
 */

import type { BillingProvider, PlanCode, SubscriptionStatus } from "@/types/database";

export type { BillingProvider, PlanCode, SubscriptionStatus };

/**
 * Buyer fields iyzico's Subscription Checkout Form
 * (`POST /v2/subscription/checkoutform/initialize`, the `iyzipay` package's
 * `subscriptionCheckoutForm.initialize` resource) requires beyond what a
 * Supabase profile stores. Collecting these is a later frontend wave's job;
 * this module only forwards them to iyzico.
 */
export interface IyzicoBuyerDetails {
  identityNumber: string;
  gsmNumber: string;
  address: string;
  city: string;
  country: string;
  zipCode?: string;
}

export interface CreateCheckoutArgs {
  userId: string;
  userEmail: string;
  userName: string;
  /** Our own `plans.id` — the provider client never queries the database itself. */
  planId: string;
  /** The plan's `provider_price_id` (iyzico `pricingPlanReferenceCode`, Paddle `priceId`). */
  providerPriceId: string;
  /** Where the provider should send the buyer back once checkout finishes. iyzico's hosted form POSTs its `token` here; Paddle's hosted checkout redirects here. */
  returnUrl: string;
  /** iyzico only — ignored by the Paddle provider. */
  buyer?: IyzicoBuyerDetails;
}

export interface CreateCheckoutResult {
  /** Set for Paddle (a hosted checkout URL); `null` for iyzico, whose Checkout Form is embedded rather than redirected to (see `checkoutFormContent`). */
  redirectUrl: string | null;
  /**
   * A correlation id known immediately, before the buyer finishes paying:
   * iyzico's `checkoutFormToken` (the real `subscriptionReferenceCode` isn't
   * known until `POST /api/billing/iyzico/callback` retrieves the completed
   * form), or Paddle's transaction id (the real subscription id similarly
   * arrives later, via the `subscription.created` webhook — correlated by
   * `customData`, not this id).
   */
  providerRef: string;
  status: SubscriptionStatus;
  /** Only present when the provider already reports a period end at creation time. */
  currentPeriodEnd: string | null;
  /** iyzico only — HTML+script to mount into a `<div id="iyzipay-checkout-form">` (see docs/BILLING.md). */
  checkoutFormContent?: string;
}

/** A webhook event, normalized across providers. `null` fields mean "this event doesn't carry that piece of state" (e.g. a non-subscription Paddle event). */
export interface ParsedBillingEvent {
  eventId: string;
  type: string;
  providerSubscriptionId: string | null;
  status: SubscriptionStatus | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
  /**
   * Present only for Paddle, only on a `subscription.*` event: the
   * `customData` stamped on the checkout transaction (`paddle.ts#createCheckout`),
   * which Paddle copies onto the subscription it creates. This is how a
   * Paddle subscription is FIRST correlated to a user/plan — its real
   * `subscriptionId` isn't known until this event, so `startCheckout`
   * (`index.ts`) never pre-creates a `subscriptions` row for Paddle the way
   * it does for iyzico (see `repository.ts#applyBillingEvent`).
   */
  metadata: { userId: string; planId: string } | null;
  /**
   * When the provider says this event actually happened (Paddle's
   * `occurred_at`; iyzico's `iyziEventTime`, epoch milliseconds, converted
   * to an ISO string) — NOT when this webhook request arrived. Used by
   * `repository.ts#applyBillingEvent` to apply state transitions in event
   * order rather than delivery order: a provider's retry policy does not
   * guarantee a later event is delivered after an earlier one (review3
   * finding 7), so `subscriptions.last_event_at` records the most recent
   * `occurredAt` actually applied and a strictly older event is recorded in
   * the ledger but never applied over a newer state.
   */
  occurredAt: string;
  raw: unknown;
}

export interface BillingProviderClient {
  readonly provider: BillingProvider;
  createCheckout(args: CreateCheckoutArgs): Promise<CreateCheckoutResult>;
  cancel(providerSubscriptionId: string): Promise<void>;
  /**
   * Undo a pending cancel-at-period-end (the buyer changed their mind before
   * the current period actually ended — `status` is still `active`/`trialing`
   * at this point, only `cancel_at_period_end` is true). NOT a
   * reactivation of an already-`canceled`/`expired` subscription — that
   * always requires a brand new checkout (`docs/BILLING.md` "Resume").
   * Paddle supports this natively (removing the subscription's own
   * `scheduledChange`); iyzico's Subscription API has no equivalent for a
   * cancellation already recorded at the provider, so `IyzicoProvider.resume`
   * always rejects with a clear, honest `BillingProviderError` rather than
   * guessing at an endpoint that was not confirmed to do this.
   */
  resume(providerSubscriptionId: string): Promise<void>;
  /** Verify the raw request body against the provider's webhook signature header(s). Never trust `parseEvent`'s output before this passes. */
  verifyWebhook(rawBody: string, headers: Headers): Promise<boolean>;
  /** `headers` is unused by iyzico (its signature is fully derivable from the body) but Paddle's own `unmarshal` needs the `paddle-signature` header again here. */
  parseEvent(rawBody: string, headers: Headers): Promise<ParsedBillingEvent>;
}

/** Thrown by a provider client for a condition the caller should show as a normal, non-crashing failure. */
export class BillingProviderError extends Error {
  constructor(
    readonly provider: BillingProvider,
    message: string,
  ) {
    super(message);
    this.name = "BillingProviderError";
  }
}
