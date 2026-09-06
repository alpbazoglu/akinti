import "server-only";
import { EventName, Environment, Paddle } from "@paddle/paddle-node-sdk";
import type { SubscriptionStatus as PaddleSubscriptionStatus } from "@paddle/paddle-node-sdk";

import type { SubscriptionStatus } from "@/types/database";

import { BillingProviderError } from "./types";
import type {
  BillingProviderClient,
  CreateCheckoutArgs,
  CreateCheckoutResult,
  ParsedBillingEvent,
} from "./types";

/**
 * Paddle Billing integration (docs/research/libraries.md §7 — secondary
 * rail, merchant of record for international cards/USD pricing). Every
 * method/field here comes straight from `@paddle/paddle-node-sdk`'s own
 * shipped `.d.ts` (that package ships full types, unlike `iyzipay` — see
 * `./iyzipay.d.ts`'s header comment) — inspected directly under
 * `node_modules/@paddle/paddle-node-sdk/dist/types` before writing this
 * file, not guessed. See docs/BILLING.md "Checkout flow — Paddle".
 *
 * Correlation with our own `userId`/`planId` never depends on Paddle's own
 * ids: `createCheckout` stamps `customData` on the transaction, and Paddle
 * documents that "if a transaction results in the creation of a new
 * subscription, the custom data is automatically copied to that
 * subscription" — so every subscription webhook event carries it too,
 * without this codebase needing its own checkout-token bookkeeping the way
 * iyzico's hosted form requires (`./iyzico.ts`'s header comment).
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new BillingProviderError("paddle", `Missing required environment variable ${name}.`);
  }
  return value;
}

let cachedClient: Paddle | null = null;

function client(): Paddle {
  if (cachedClient) return cachedClient;
  cachedClient = new Paddle(requireEnv("PADDLE_API_KEY"), {
    environment: process.env.PADDLE_ENVIRONMENT === "production" ? Environment.production : Environment.sandbox,
  });
  return cachedClient;
}

function requireWebhookSecret(): string {
  return requireEnv("PADDLE_WEBHOOK_SECRET");
}

function mapStatus(status: PaddleSubscriptionStatus): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "paused":
      // No direct equivalent in this codebase's model — a paused Paddle
      // subscription keeps billing suspended but isn't "over" the way
      // canceled/expired are. Treated as non-entitling, never `active`.
      return "past_due";
    default:
      console.error(`[billing/paddle] unrecognized subscription status: ${String(status)}`);
      return "past_due";
  }
}

/** `customData` is `Record<string, any> | null` per the SDK's own `CustomData` type — narrowed defensively since it is, ultimately, attacker-adjacent input (whatever the buyer's checkout session carried). */
function extractMetadata(customData: Record<string, unknown> | null): { userId: string; planId: string } | null {
  const userId = customData?.akinti_user_id;
  const planId = customData?.akinti_plan_id;
  if (typeof userId === "string" && typeof planId === "string") {
    return { userId, planId };
  }
  return null;
}

async function findOrCreateCustomer(email: string, name: string): Promise<string> {
  const existing = client().customers.list({ email: [email], perPage: 1 });
  for await (const customer of existing) {
    return customer.id;
  }
  const created = await client().customers.create({ email, name });
  return created.id;
}

export class PaddleProvider implements BillingProviderClient {
  readonly provider = "paddle" as const;

  async createCheckout(args: CreateCheckoutArgs): Promise<CreateCheckoutResult> {
    const customerId = await findOrCreateCustomer(args.userEmail, args.userName);

    const transaction = await client().transactions.create({
      customerId,
      items: [{ priceId: args.providerPriceId, quantity: 1 }],
      customData: { akinti_user_id: args.userId, akinti_plan_id: args.planId },
      checkout: { url: args.returnUrl },
    });

    return {
      redirectUrl: transaction.checkout?.url ?? null,
      providerRef: transaction.id,
      status: "trialing",
      currentPeriodEnd: null,
    };
  }

  async cancel(providerSubscriptionId: string): Promise<void> {
    await client().subscriptions.cancel(providerSubscriptionId, { effectiveFrom: "next_billing_period" });
  }

  /**
   * `cancel()` above schedules the cancellation as a `scheduledChange` on
   * the subscription (Paddle never ends access immediately for
   * `effectiveFrom: "next_billing_period"`) rather than cancelling
   * outright — so undoing it is a real, documented Paddle operation: PATCH
   * the subscription with `scheduledChange: null`
   * (`UpdateSubscriptionRequestBody`, confirmed against the installed SDK's
   * own `.d.ts` under `node_modules/@paddle/paddle-node-sdk/dist/types/resources/subscriptions/operations/update-subscription-request-body.d.ts`).
   * `subscriptions.update` issues that PATCH.
   */
  async resume(providerSubscriptionId: string): Promise<void> {
    await client().subscriptions.update(providerSubscriptionId, { scheduledChange: null });
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<boolean> {
    const signature = headers.get("paddle-signature");
    if (!signature) return false;
    try {
      return await client().webhooks.isSignatureValid(rawBody, requireWebhookSecret(), signature);
    } catch {
      return false;
    }
  }

  async parseEvent(rawBody: string, headers: Headers): Promise<ParsedBillingEvent> {
    const signature = headers.get("paddle-signature");
    if (!signature) {
      throw new BillingProviderError("paddle", "Missing paddle-signature header.");
    }
    const event = await client().webhooks.unmarshal(rawBody, requireWebhookSecret(), signature);

    switch (event.eventType) {
      case EventName.SubscriptionCreated:
      case EventName.SubscriptionUpdated:
      case EventName.SubscriptionActivated:
      case EventName.SubscriptionTrialing:
      case EventName.SubscriptionResumed:
      case EventName.SubscriptionPastDue:
      case EventName.SubscriptionPaused:
      case EventName.SubscriptionCanceled:
        return {
          eventId: event.eventId,
          type: event.eventType,
          providerSubscriptionId: event.data.id,
          status: mapStatus(event.data.status),
          currentPeriodEnd: event.data.currentBillingPeriod?.endsAt ?? event.data.nextBilledAt ?? null,
          cancelAtPeriodEnd: event.data.scheduledChange?.action === "cancel",
          metadata: extractMetadata(event.data.customData),
          occurredAt: event.occurredAt,
          raw: event,
        };
      default:
        // Every other event (transaction.*, customer.*, ...) is still
        // logged to `billing_events` for the audit trail, but doesn't drive
        // a `subscriptions` state transition of its own — the
        // `subscription.*` events above are authoritative for that.
        return {
          eventId: event.eventId,
          type: event.eventType,
          providerSubscriptionId: null,
          status: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: null,
          metadata: null,
          occurredAt: event.occurredAt,
          raw: event,
        };
    }
  }
}

export const paddleProvider = new PaddleProvider();
