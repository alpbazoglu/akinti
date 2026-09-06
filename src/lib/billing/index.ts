import "server-only";

import { DatabaseError } from "@/lib/db/types";
import type { SupabaseAdminClient } from "@/lib/supabase/admin";
import type { BillingProvider, PlanCode } from "@/types/database";

import { iyzicoProvider } from "./iyzico";
import { paddleProvider } from "./paddle";
import * as repository from "./repository";
import { BillingProviderError } from "./types";
import type { BillingProviderClient, CreateCheckoutResult, IyzicoBuyerDetails } from "./types";

export * from "./types";
export { iyzicoProvider } from "./iyzico";
export { paddleProvider } from "./paddle";
export { isPro, requirePro } from "./entitlements";
export * as billingRepository from "./repository";

/**
 * AKINTI Pro billing orchestration (Wave F, PRODUCT_V2 §4/§5). This is the
 * one interface `src/app/(app)/settings/pro/actions.ts` and the two webhook
 * routes actually call — `iyzico.ts`/`paddle.ts` never touch the database,
 * and `repository.ts` never talks to a provider, so this module is where
 * the two meet.
 *
 * Provider choice: whichever `plans.provider` the caller's chosen
 * `planCode` names. There is no separate geo/currency-detection step here —
 * TRY plan codes are provider `iyzico`, USD plan codes are provider
 * `paddle` by construction (docs/BILLING.md "Seeding plans"), so a pricing
 * page defaulting a Turkish visitor to a `_try` code already IS the "TR →
 * iyzico" rule from PRODUCT_V2 §4.
 */

export function providerFor(provider: BillingProvider): BillingProviderClient {
  return provider === "iyzico" ? iyzicoProvider : paddleProvider;
}

const BILLING_CHECKOUT_ACTION = "billing_checkout";
const BILLING_CHECKOUT_MAX = 5;
const BILLING_CHECKOUT_WINDOW = "1 hour";

/** Throws (via `DatabaseError`, code `AKRTL` — see `src/lib/moderation/errors.ts`) when `userId` has already started 5 checkouts in the last hour. */
async function checkBillingCheckoutRateLimit(admin: SupabaseAdminClient, userId: string): Promise<void> {
  const result = await admin.rpc("check_rate_limit", {
    p_profile_id: userId,
    p_action: BILLING_CHECKOUT_ACTION,
    p_max_count: BILLING_CHECKOUT_MAX,
    p_window: BILLING_CHECKOUT_WINDOW,
  });
  if (result.error) {
    throw new DatabaseError("check_rate_limit", result.error);
  }
}

async function recordBillingCheckoutEvent(admin: SupabaseAdminClient, userId: string): Promise<void> {
  const result = await admin.rpc("record_rate_limit_event", { p_profile_id: userId, p_action: BILLING_CHECKOUT_ACTION });
  if (result.error) {
    throw new DatabaseError("record_rate_limit_event", result.error);
  }
}

export interface StartCheckoutArgs {
  userId: string;
  userEmail: string;
  userName: string;
  planCode: PlanCode;
  returnUrl: string;
  buyer?: IyzicoBuyerDetails;
}

/**
 * Start a Pro checkout: rate-limit, resolve the plan, hand off to whichever
 * provider owns it, then record a `subscriptions` row keyed by whatever
 * correlation id that provider produced (see `CreateCheckoutResult.providerRef`'s
 * doc comment for what that id actually means per provider).
 */
export async function startCheckout(
  admin: SupabaseAdminClient,
  args: StartCheckoutArgs,
): Promise<CreateCheckoutResult> {
  await checkBillingCheckoutRateLimit(admin, args.userId);

  const plan = await repository.getPlanByCode(admin, args.planCode);
  if (!plan) {
    throw new BillingProviderError("iyzico", "This plan is not available right now.");
  }

  const provider = providerFor(plan.provider);
  const result = await provider.createCheckout({
    userId: args.userId,
    userEmail: args.userEmail,
    userName: args.userName,
    planId: plan.id,
    providerPriceId: plan.provider_price_id,
    returnUrl: args.returnUrl,
    buyer: args.buyer,
  });

  if (plan.provider === "iyzico") {
    // iyzico's webhook carries no correlation data (see `ParsedBillingEvent.metadata`'s
    // doc comment) — this placeholder row, keyed by the short-lived
    // `checkoutFormToken`, is what `POST /api/billing/iyzico/callback` finds
    // and updates once the real `subscriptionReferenceCode` is known. Paddle
    // needs no such placeholder: its webhook's `customData` both correlates
    // and creates the row on first arrival (`repository.ts#applyBillingEvent`).
    await repository.createPendingSubscription(admin, {
      userId: args.userId,
      planId: plan.id,
      provider: plan.provider,
      providerSubscriptionId: result.providerRef,
      status: result.status,
      currentPeriodEnd: result.currentPeriodEnd,
    });
  }

  await recordBillingCheckoutEvent(admin, args.userId);

  return result;
}

/** Cancel the caller's current subscription at the provider, then mark it locally — the actual status flip to `canceled` still comes from the provider's webhook, never faked here (spec §44 rule 9). */
export async function cancelSubscriptionForUser(admin: SupabaseAdminClient, userId: string): Promise<void> {
  const subscription = await repository.getLatestSubscriptionForUser(admin, userId);
  if (!subscription || subscription.status === "canceled" || subscription.status === "expired") {
    throw new BillingProviderError("iyzico", "You don't have an active AKINTI Pro subscription.");
  }

  const provider = providerFor(subscription.provider);
  await provider.cancel(subscription.provider_subscription_id);
  await repository.markCancelAtPeriodEnd(admin, subscription.provider, subscription.provider_subscription_id);
}

/**
 * Undo a pending cancel-at-period-end (docs/BILLING.md "Resume") — only
 * valid while the subscription is still `active`/`trialing` with
 * `cancel_at_period_end = true`. Never called for an already-`canceled`/
 * `expired` subscription: that requires a brand new checkout, not a resume
 * (`BillingProviderClient.resume`'s doc comment). `IyzicoProvider.resume`
 * always throws (no confirmed iyzico endpoint for this) — this function
 * lets that propagate as an honest error rather than catching it here.
 */
export async function resumeSubscriptionForUser(admin: SupabaseAdminClient, userId: string): Promise<void> {
  const subscription = await repository.getLatestSubscriptionForUser(admin, userId);
  const resumable =
    subscription &&
    subscription.cancel_at_period_end &&
    (subscription.status === "active" || subscription.status === "trialing");
  if (!subscription || !resumable) {
    throw new BillingProviderError("iyzico", "You don't have a subscription to resume.");
  }

  const provider = providerFor(subscription.provider);
  await provider.resume(subscription.provider_subscription_id);
  await repository.clearCancelAtPeriodEnd(admin, subscription.provider, subscription.provider_subscription_id);
}

/** Shared webhook handling for both `/api/billing/iyzico/webhook` and `/api/billing/paddle/webhook`: verify, parse, apply idempotently. */
export async function handleWebhook(
  admin: SupabaseAdminClient,
  provider: BillingProviderClient,
  rawBody: string,
  headers: Headers,
): Promise<{ ok: true } | { ok: false; reason: "invalid_signature" }> {
  if (!provider.verifiesDuringParse) {
    const valid = await provider.verifyWebhook(rawBody, headers);
    if (!valid) {
      return { ok: false, reason: "invalid_signature" };
    }
    const event = await provider.parseEvent(rawBody, headers);
    await repository.applyBillingEvent(admin, provider.provider, event);
    return { ok: true };
  }

  // Provider verifies the signature inside `parseEvent` itself (Paddle's
  // `unmarshal`) — call it once rather than re-running the same HMAC check
  // via `verifyWebhook` first (review3 finding 16: doubling the signature
  // check doubles the window in which a slow cold start can pass the first
  // check and fail the second, turning a legitimate webhook into a 500).
  let event: Awaited<ReturnType<BillingProviderClient["parseEvent"]>>;
  try {
    event = await provider.parseEvent(rawBody, headers);
  } catch (err) {
    if (err instanceof BillingProviderError) {
      return { ok: false, reason: "invalid_signature" };
    }
    throw err;
  }
  await repository.applyBillingEvent(admin, provider.provider, event);
  return { ok: true };
}
