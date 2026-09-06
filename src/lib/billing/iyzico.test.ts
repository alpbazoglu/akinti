import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { iyzicoProvider } from "./iyzico";

/**
 * Recorded sample shapes from docs.iyzico.com "Webhook > Signature
 * Verification — Subscription format" (see `iyzico.ts`'s header comment):
 * payload fields (`orderReferenceCode`/`customerReferenceCode`/
 * `subscriptionReferenceCode`/`iyziReferenceCode`/`iyziEventType`/
 * `iyziEventTime`) and the `X-IYZ-SIGNATURE-V3` formula (HMAC-SHA256 of
 * `merchantId + secretKey + eventType + subscriptionReferenceCode +
 * orderReferenceCode + customerReferenceCode`, hex-encoded).
 */

const MERCHANT_ID = "654321";
const SECRET_KEY = "sandbox-secret-key-akinti";

const SUCCESS_PAYLOAD = {
  orderReferenceCode: "ae5fcbf8-4fd2-46e5-b199-8f690ae9fae5",
  customerReferenceCode: "ff4052ca-0588-40eb-81a9-848c0c409472",
  subscriptionReferenceCode: "ea0362e2-a1c4-4fda-89f0-3758a5c20a28",
  iyziReferenceCode: "18d7cc48-a64b-4cd3-ae68-71aff1c76ed9",
  iyziEventType: "subscription.order.success",
  iyziEventTime: 1758704403161,
};

const FAILURE_PAYLOAD = {
  orderReferenceCode: "9ed2d128-b106-464b-8170-84325e75703b",
  customerReferenceCode: "042f0b61-079a-4a38-9454-6564a3c11a5a",
  subscriptionReferenceCode: "b0f6d38f-b2d1-4a72-9bf2-bc9375665f3a",
  iyziReferenceCode: "aac139a9-43db-4f40-82dd-d4e5a77a3d2e",
  iyziEventType: "subscription.order.failure",
  iyziEventTime: 1579612261619,
};

function sign(payload: typeof SUCCESS_PAYLOAD): string {
  const message =
    MERCHANT_ID +
    SECRET_KEY +
    payload.iyziEventType +
    payload.subscriptionReferenceCode +
    payload.orderReferenceCode +
    payload.customerReferenceCode;
  return createHmac("sha256", SECRET_KEY).update(message).digest("hex");
}

function headersWith(signature: string | null): Headers {
  const headers = new Headers();
  if (signature) headers.set("x-iyz-signature-v3", signature);
  return headers;
}

beforeEach(() => {
  vi.stubEnv("IYZICO_MERCHANT_ID", MERCHANT_ID);
  vi.stubEnv("IYZICO_SECRET_KEY", SECRET_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("iyzicoProvider.verifyWebhook", () => {
  it("accepts a correctly signed payload", async () => {
    const body = JSON.stringify(SUCCESS_PAYLOAD);
    const valid = await iyzicoProvider.verifyWebhook(body, headersWith(sign(SUCCESS_PAYLOAD)));
    expect(valid).toBe(true);
  });

  it("rejects a missing signature header", async () => {
    const body = JSON.stringify(SUCCESS_PAYLOAD);
    const valid = await iyzicoProvider.verifyWebhook(body, headersWith(null));
    expect(valid).toBe(false);
  });

  it("rejects a tampered body (signature no longer matches)", async () => {
    const signature = sign(SUCCESS_PAYLOAD);
    const tampered = JSON.stringify({ ...SUCCESS_PAYLOAD, subscriptionReferenceCode: "attacker-controlled" });
    const valid = await iyzicoProvider.verifyWebhook(tampered, headersWith(signature));
    expect(valid).toBe(false);
  });

  it("rejects an unparsable body", async () => {
    const valid = await iyzicoProvider.verifyWebhook("not json", headersWith("anything"));
    expect(valid).toBe(false);
  });

  it("rejects when IYZICO_MERCHANT_ID is not configured", async () => {
    vi.stubEnv("IYZICO_MERCHANT_ID", "");
    const body = JSON.stringify(SUCCESS_PAYLOAD);
    const valid = await iyzicoProvider.verifyWebhook(body, headersWith(sign(SUCCESS_PAYLOAD)));
    expect(valid).toBe(false);
  });
});

describe("iyzicoProvider.parseEvent", () => {
  it("maps a subscription.order.success payload to an 'active' state transition", async () => {
    const event = await iyzicoProvider.parseEvent(JSON.stringify(SUCCESS_PAYLOAD), headersWith(null));
    expect(event).toMatchObject({
      eventId: SUCCESS_PAYLOAD.iyziReferenceCode,
      type: "subscription.order.success",
      providerSubscriptionId: SUCCESS_PAYLOAD.subscriptionReferenceCode,
      status: "active",
      metadata: null,
    });
  });

  it("maps a subscription.order.failure payload to a non-entitling state", async () => {
    const event = await iyzicoProvider.parseEvent(JSON.stringify(FAILURE_PAYLOAD), headersWith(null));
    expect(event).toMatchObject({
      eventId: FAILURE_PAYLOAD.iyziReferenceCode,
      type: "subscription.order.failure",
      providerSubscriptionId: FAILURE_PAYLOAD.subscriptionReferenceCode,
      status: "past_due",
    });
  });
});

describe("iyzicoProvider.resume", () => {
  it("always rejects — there is no confirmed iyzico endpoint that undoes a recorded cancellation", async () => {
    await expect(iyzicoProvider.resume(SUCCESS_PAYLOAD.subscriptionReferenceCode)).rejects.toMatchObject({
      name: "BillingProviderError",
      provider: "iyzico",
    });
    await expect(iyzicoProvider.resume(SUCCESS_PAYLOAD.subscriptionReferenceCode)).rejects.toThrow(
      /new AKINTI Pro subscription/i,
    );
  });
});
