import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `resume()` issues a real PATCH via the Paddle SDK's `subscriptions.update`
 * (`docs/BILLING.md` "Resume") — unlike `verifyWebhook`/`parseEvent`
 * (`paddle.test.ts`), which do local HMAC verification the real SDK already
 * performs without a network call, this one has no such pure path. Mocked
 * in its own file (rather than added to `paddle.test.ts`) so the real SDK
 * class stays untouched for every other test there.
 */
const updateMock = vi.fn().mockResolvedValue({ id: "sub_01hzxyzakinti", scheduledChange: null });

vi.mock("@paddle/paddle-node-sdk", () => ({
  Environment: { production: "production", sandbox: "sandbox" },
  EventName: {},
  Paddle: vi.fn().mockImplementation(function MockPaddle(this: { subscriptions: unknown }) {
    this.subscriptions = { update: updateMock };
  }),
}));

import { paddleProvider } from "./paddle";

beforeEach(() => {
  vi.stubEnv("PADDLE_API_KEY", "sandbox_apikey_akinti");
  vi.stubEnv("PADDLE_ENVIRONMENT", "sandbox");
  updateMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("paddleProvider.resume", () => {
  it("removes the subscription's scheduled cancellation via subscriptions.update", async () => {
    await paddleProvider.resume("sub_01hzxyzakinti");
    expect(updateMock).toHaveBeenCalledWith("sub_01hzxyzakinti", { scheduledChange: null });
  });
});
