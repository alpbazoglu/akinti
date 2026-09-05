import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { paddleProvider } from "./paddle";

/**
 * Recorded shapes from `@paddle/paddle-node-sdk`'s own source
 * (`dist/cjs/notifications/helpers/webhooks-validator.js`,
 * `.../entities/subscription/subscription-notification.js`) — the SDK does
 * real HMAC verification here, not a mock, so this payload/signature must
 * match its actual algorithm exactly: `ts=<epoch seconds>;h1=<hex>` where
 * hex = HMAC-SHA256(secretKey, `${ts}:${rawBody}`). The SDK's own
 * `MAX_VALID_TIME_DIFFERENCE` is 5 seconds, so `ts` is generated fresh at
 * test-run time rather than a fixed recorded value.
 */

const WEBHOOK_SECRET = "pdl_ntfset_sandbox_akinti";

function sign(rawBody: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const hash = createHmac("sha256", WEBHOOK_SECRET).update(`${ts}:${rawBody}`).digest("hex");
  return `ts=${ts};h1=${hash}`;
}

function headersWith(signature: string | null): Headers {
  const headers = new Headers();
  if (signature) headers.set("paddle-signature", signature);
  return headers;
}

/** A `subscription.created` event, in Paddle's raw (snake_case) webhook shape. */
function subscriptionCreatedPayload(overrides: { customData?: Record<string, string> | null } = {}): string {
  return JSON.stringify({
    event_id: "evt_01hzxyzakinti",
    event_type: "subscription.created",
    occurred_at: "2026-09-06T12:00:00.000Z",
    notification_id: "ntf_01hzxyzakinti",
    data: {
      id: "sub_01hzxyzakinti",
      status: "active",
      transaction_id: "txn_01hzxyzakinti",
      customer_id: "ctm_01hzxyzakinti",
      address_id: "add_01hzxyzakinti",
      business_id: null,
      currency_code: "USD",
      created_at: "2026-09-06T12:00:00.000Z",
      updated_at: "2026-09-06T12:00:00.000Z",
      started_at: "2026-09-06T12:00:00.000Z",
      first_billed_at: "2026-09-06T12:00:00.000Z",
      next_billed_at: "2026-10-06T12:00:00.000Z",
      paused_at: null,
      canceled_at: null,
      discount: null,
      collection_mode: "automatic",
      billing_details: null,
      current_billing_period: { starts_at: "2026-09-06T12:00:00.000Z", ends_at: "2026-10-06T12:00:00.000Z" },
      billing_cycle: { interval: "month", frequency: 1 },
      scheduled_change: null,
      items: [],
      custom_data: "customData" in overrides ? overrides.customData : { akinti_user_id: "user-1", akinti_plan_id: "plan-1" },
      import_meta: null,
    },
  });
}

beforeEach(() => {
  vi.stubEnv("PADDLE_API_KEY", "sandbox_apikey_akinti");
  vi.stubEnv("PADDLE_WEBHOOK_SECRET", WEBHOOK_SECRET);
  vi.stubEnv("PADDLE_ENVIRONMENT", "sandbox");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("paddleProvider.verifyWebhook", () => {
  it("accepts a correctly signed payload", async () => {
    const body = subscriptionCreatedPayload();
    const valid = await paddleProvider.verifyWebhook(body, headersWith(sign(body)));
    expect(valid).toBe(true);
  });

  it("rejects a missing signature header", async () => {
    const body = subscriptionCreatedPayload();
    const valid = await paddleProvider.verifyWebhook(body, headersWith(null));
    expect(valid).toBe(false);
  });

  it("rejects a tampered body", async () => {
    const body = subscriptionCreatedPayload();
    const signature = sign(body);
    const tampered = body.replace("sub_01hzxyzakinti", "sub_attacker_controlled");
    const valid = await paddleProvider.verifyWebhook(tampered, headersWith(signature));
    expect(valid).toBe(false);
  });
});

describe("paddleProvider.parseEvent", () => {
  it("maps subscription.created to an active state transition, correlated via customData", async () => {
    const body = subscriptionCreatedPayload();
    const event = await paddleProvider.parseEvent(body, headersWith(sign(body)));
    expect(event).toMatchObject({
      eventId: "evt_01hzxyzakinti",
      type: "subscription.created",
      providerSubscriptionId: "sub_01hzxyzakinti",
      status: "active",
      currentPeriodEnd: "2026-10-06T12:00:00.000Z",
      cancelAtPeriodEnd: false,
      metadata: { userId: "user-1", planId: "plan-1" },
    });
  });

  it("has no metadata to correlate a subscription with no customData", async () => {
    const body = subscriptionCreatedPayload({ customData: null });
    const event = await paddleProvider.parseEvent(body, headersWith(sign(body)));
    expect(event.metadata).toBeNull();
  });

  it("throws on a missing paddle-signature header", async () => {
    const body = subscriptionCreatedPayload();
    await expect(paddleProvider.parseEvent(body, headersWith(null))).rejects.toThrow();
  });
});
