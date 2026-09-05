import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// `iyzipay` ships no types of its own — see `./iyzipay.d.ts`.
import Iyzipay from "iyzipay";

import type { SubscriptionStatus } from "@/types/database";

import { BillingProviderError } from "./types";
import type {
  BillingProviderClient,
  CreateCheckoutArgs,
  CreateCheckoutResult,
  ParsedBillingEvent,
} from "./types";

/**
 * iyzico integration (docs/research/libraries.md §7 — primary rail, TR
 * cards/TRY pricing). Every endpoint and payload shape here was confirmed
 * against docs.iyzico.com and the installed `iyzipay` package's own source
 * (`node_modules/iyzipay/lib/resources/SubscriptionCheckoutForm.js`,
 * `Subscription.js`) before writing this file — see docs/BILLING.md
 * "iyzico integration notes" for the exact endpoints and a callout on the
 * one shape (`subscription.retrieve`'s nesting) that could not be confirmed
 * from documentation alone and is parsed defensively below.
 *
 * Flow (docs/BILLING.md "Checkout flow — iyzico" has the full write-up):
 *  1. `createCheckout` calls `subscriptionCheckoutForm.initialize`
 *     (`POST /v2/subscription/checkoutform/initialize`) — a HOSTED form,
 *     not a raw-card API call, so this server never touches a PAN. It
 *     returns a `token` + `checkoutFormContent` (HTML+script to embed), not
 *     a redirect URL — unlike the ecommerce Checkout Form product, the
 *     Subscription Checkout Form has no direct payment-page URL.
 *  2. The token is not yet a subscription — `POST /api/billing/iyzico/callback`
 *     (this codebase's own route, not part of iyzico's SDK) retrieves the
 *     completed form via `subscriptionCheckoutForm.retrieve` once the buyer
 *     finishes paying and learns the real `subscriptionReferenceCode`.
 *  3. `subscription.order.success`/`subscription.order.failure` webhooks
 *     (`X-IYZ-SIGNATURE-V3`) confirm/update state afterward, idempotently.
 */

let cachedClient: Iyzipay | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new BillingProviderError("iyzico", `Missing required environment variable ${name}.`);
  }
  return value;
}

function client(): Iyzipay {
  if (cachedClient) return cachedClient;
  cachedClient = new Iyzipay({
    apiKey: requireEnv("IYZICO_API_KEY"),
    secretKey: requireEnv("IYZICO_SECRET_KEY"),
    uri: process.env.IYZICO_BASE_URL || "https://sandbox-api.iyzipay.com",
  });
  return cachedClient;
}

/** Every iyzico callback hands back `(err, result)`: `err` is a transport failure; a business failure is `result.status === 'failure'` with no `err` at all. */
function call<T extends { status?: string; errorMessage?: string }>(
  invoke: (cb: (err: unknown, result: T) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    invoke((err, result) => {
      if (err) {
        reject(new BillingProviderError("iyzico", err instanceof Error ? err.message : "iyzico request failed."));
        return;
      }
      if (!result || result.status === "failure") {
        reject(
          new BillingProviderError(
            "iyzico",
            result?.errorMessage || "iyzico rejected this request.",
          ),
        );
        return;
      }
      resolve(result);
    });
  });
}

function mapStatus(status: string | null | undefined): SubscriptionStatus {
  switch (status) {
    case "ACTIVE":
      return "active";
    case "PENDING":
      return "trialing";
    case "UNPAID":
      return "past_due";
    case "CANCELED":
      return "canceled";
    case "EXPIRED":
      return "expired";
    case "UPGRADED":
      // Still a live subscription, now on a different pricing plan — never
      // treated as ended.
      return "active";
    default:
      // Unknown to this codebase: never silently grant Pro for a status we
      // don't recognise (spec §44 rule 9, "no fake success").
      console.error(`[billing/iyzico] unrecognized subscriptionStatus: ${String(status)}`);
      return "past_due";
  }
}

function epochMsToIso(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value).toISOString() : null;
}

export class IyzicoProvider implements BillingProviderClient {
  readonly provider = "iyzico" as const;

  async createCheckout(args: CreateCheckoutArgs): Promise<CreateCheckoutResult> {
    const buyer = args.buyer;
    if (!buyer) {
      throw new BillingProviderError("iyzico", "Buyer details are required to start a Turkish checkout.");
    }
    const [name, ...rest] = args.userName.trim().split(/\s+/);
    const surname = rest.length > 0 ? rest.join(" ") : name;

    const result = await call<{
      status?: string;
      errorMessage?: string;
      token: string;
      checkoutFormContent: string;
      tokenExpireTime?: number;
    }>((cb) =>
      client().subscriptionCheckoutForm.initialize(
        {
          locale: Iyzipay.LOCALE.TR,
          conversationId: args.userId,
          callbackUrl: args.returnUrl,
          pricingPlanReferenceCode: args.providerPriceId,
          subscriptionInitialStatus: Iyzipay.SUBSCRIPTION_INITIAL_STATUS.ACTIVE,
          customer: {
            name: name || args.userName,
            surname: surname || args.userName,
            email: args.userEmail,
            identityNumber: buyer.identityNumber,
            gsmNumber: buyer.gsmNumber,
            billingAddress: {
              address: buyer.address,
              contactName: args.userName,
              city: buyer.city,
              country: buyer.country,
              zipCode: buyer.zipCode,
            },
          },
        },
        cb,
      ),
    );

    return {
      redirectUrl: null,
      providerRef: result.token,
      status: "trialing",
      currentPeriodEnd: null,
      checkoutFormContent: result.checkoutFormContent,
    };
  }

  /**
   * Called from `POST /api/billing/iyzico/callback` once the hosted form's
   * `callbackUrl` fires with the completed `token` — not part of
   * `BillingProviderClient` (Paddle has no equivalent step), so the callback
   * route imports this directly rather than through the provider interface.
   */
  async retrieveCheckoutForm(token: string): Promise<{
    subscriptionReferenceCode: string;
    status: SubscriptionStatus;
    currentPeriodEnd: string | null;
    pricingPlanReferenceCode: string | null;
  }> {
    const result = await call<{
      status?: string;
      errorMessage?: string;
      data?: {
        referenceCode?: string;
        subscriptionStatus?: string;
        endDate?: number;
        pricingPlanReferenceCode?: string;
      };
    }>((cb) => client().subscriptionCheckoutForm.retrieve({ checkoutFormToken: token }, cb));

    const data = result.data;
    if (!data?.referenceCode) {
      throw new BillingProviderError("iyzico", "iyzico did not return a subscription for this checkout.");
    }

    return {
      subscriptionReferenceCode: data.referenceCode,
      status: mapStatus(data.subscriptionStatus),
      currentPeriodEnd: epochMsToIso(data.endDate),
      pricingPlanReferenceCode: data.pricingPlanReferenceCode ?? null,
    };
  }

  async cancel(providerSubscriptionId: string): Promise<void> {
    await call((cb) =>
      client().subscription.cancel({ subscriptionReferenceCode: providerSubscriptionId }, cb),
    );
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<boolean> {
    const signature = headers.get("x-iyz-signature-v3");
    if (!signature) return false;

    let parsed: {
      subscriptionReferenceCode?: string;
      orderReferenceCode?: string;
      customerReferenceCode?: string;
      iyziEventType?: string;
    };
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return false;
    }

    const merchantId = process.env.IYZICO_MERCHANT_ID;
    const secretKey = process.env.IYZICO_SECRET_KEY;
    if (!merchantId || !secretKey) return false;

    // Per docs.iyzico.com "Webhook > Signature Verification — Subscription
    // format": HMAC-SHA256(secretKey, merchantId + secretKey + eventType +
    // subscriptionReferenceCode + orderReferenceCode + customerReferenceCode),
    // hex-encoded, compared against the `X-IYZ-SIGNATURE-V3` header.
    const message =
      merchantId +
      secretKey +
      (parsed.iyziEventType ?? "") +
      (parsed.subscriptionReferenceCode ?? "") +
      (parsed.orderReferenceCode ?? "") +
      (parsed.customerReferenceCode ?? "");
    const expected = createHmac("sha256", secretKey).update(message).digest("hex");

    const expectedBuf = Buffer.from(expected, "utf8");
    const signatureBuf = Buffer.from(signature, "utf8");
    if (expectedBuf.length !== signatureBuf.length) return false;
    return timingSafeEqual(expectedBuf, signatureBuf);
  }

  async parseEvent(rawBody: string, _headers: Headers): Promise<ParsedBillingEvent> {
    void _headers; // iyzico's signature is fully derivable from the body alone.
    const parsed = JSON.parse(rawBody) as {
      iyziReferenceCode: string;
      iyziEventType: string;
      subscriptionReferenceCode?: string;
    };
    return {
      eventId: parsed.iyziReferenceCode,
      type: parsed.iyziEventType,
      providerSubscriptionId: parsed.subscriptionReferenceCode ?? null,
      status: parsed.iyziEventType === "subscription.order.success" ? "active" : "past_due",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: null,
      metadata: null,
      raw: parsed,
    };
  }
}

export const iyzicoProvider = new IyzicoProvider();
