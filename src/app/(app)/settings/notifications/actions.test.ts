import { afterEach, describe, expect, it, vi } from "vitest";

import { __setMockLocale } from "@/test/next-intl-mock";

/**
 * `docs/I18N.md`: `subscribePush`/`unsubscribePush`'s signed-out branch
 * (`requireSignedInUser`, `Common.sessionExpired`) asserted in both locales —
 * the same shared message key every other Settings action uses.
 */

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

vi.mock("@/lib/push/subscriptions", () => ({
  upsertPushSubscription: vi.fn(),
  deletePushSubscription: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({}),
}));

const { subscribePush, unsubscribePush } = await import("./actions");

afterEach(() => {
  __setMockLocale("en");
  getCurrentUserMock.mockReset();
});

describe("subscribePush / unsubscribePush — locale", () => {
  it("returns the English session-expired message under an en request", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await subscribePush({ endpoint: "https://push.example.com/1", keys: { p256dh: "a", auth: "b" } });

    expect(result).toEqual({
      ok: false,
      formError: "Your session has expired. Sign in again to continue.",
    });
  });

  it("returns the Turkish session-expired message under a tr request", async () => {
    __setMockLocale("tr");
    getCurrentUserMock.mockResolvedValue(null);

    const result = await unsubscribePush({ endpoint: "https://push.example.com/1" });

    expect(result).toEqual({
      ok: false,
      formError: "Oturumunuzun süresi doldu. Devam etmek için tekrar giriş yapın.",
    });
  });
});
