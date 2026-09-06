import { describe, expect, it } from "vitest";

import { subscribePushSchema, unsubscribePushSchema } from "./push";

/**
 * Regression test for review3 finding 9 (push endpoint SSRF):
 * `src/lib/push/send.ts` POSTs to `endpoint` from the server, so
 * `subscribePushSchema` must reject anything but a known browser push
 * service host over https — a loopback/link-local/internal address used to
 * pass `z.string().url()` unchecked.
 */
describe("subscribePushSchema — push endpoint allowlist", () => {
  const keys = { p256dh: "p256dh-value", auth: "auth-value" };

  const allowed = [
    "https://fcm.googleapis.com/fcm/send/abc123",
    "https://updates.push.services.mozilla.com/wpush/v2/abc123",
    "https://web.push.apple.com/abc123",
    "https://wns2-par02p.notify.windows.com/w/abc123",
  ];

  for (const endpoint of allowed) {
    it(`accepts a known push service endpoint: ${endpoint}`, () => {
      const result = subscribePushSchema.safeParse({ endpoint, keys });
      expect(result.success).toBe(true);
    });
  }

  const rejected = [
    "http://fcm.googleapis.com/fcm/send/abc123", // not https
    "https://127.0.0.1/fcm/send/abc123", // loopback
    "https://169.254.169.254/latest/meta-data", // link-local / cloud metadata
    "https://internal.example.com/push", // unrecognised host
    "https://evil.com/fcm.googleapis.com", // host confusion, not a suffix match
    "https://notfcm.googleapis.com.evil.com/", // suffix-looking but wrong host
  ];

  for (const endpoint of rejected) {
    it(`rejects a non-allowlisted endpoint: ${endpoint}`, () => {
      const result = subscribePushSchema.safeParse({ endpoint, keys });
      expect(result.success).toBe(false);
    });
  }
});

describe("unsubscribePushSchema — no allowlist (delete-only, no server-side fetch)", () => {
  it("still accepts a legacy/unrecognised endpoint so it can be removed", () => {
    const result = unsubscribePushSchema.safeParse({ endpoint: "https://internal.example.com/push" });
    expect(result.success).toBe(true);
  });

  it("still rejects a non-URL value", () => {
    const result = unsubscribePushSchema.safeParse({ endpoint: "not-a-url" });
    expect(result.success).toBe(false);
  });
});
