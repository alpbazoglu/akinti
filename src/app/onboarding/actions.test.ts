import { afterEach, describe, expect, it, vi } from "vitest";

import { __setMockLocale } from "@/test/next-intl-mock";

/**
 * `docs/I18N.md`: server-side translation for Server Action messages.
 * `completeOnboarding`'s signed-out branch (`Common.sessionExpired`) is a
 * good minimal case for asserting the Turkish copy actually renders under a
 * `tr` request locale, not just that a key resolves to *some* string.
 */

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

vi.mock("@/lib/db/profiles", () => ({
  completeOnboarding: vi.fn(),
  isUsernameAvailable: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({}),
}));

const { completeOnboarding } = await import("./actions");

afterEach(() => {
  __setMockLocale("en");
  getCurrentUserMock.mockReset();
});

describe("completeOnboarding — locale", () => {
  it("returns the English session-expired message under an en request", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await completeOnboarding({ username: "singer", displayName: null });

    expect(result).toEqual({
      ok: false,
      formError: "Your session has expired. Sign in again to continue.",
    });
  });

  it("returns the Turkish session-expired message under a tr request", async () => {
    __setMockLocale("tr");
    getCurrentUserMock.mockResolvedValue(null);

    const result = await completeOnboarding({ username: "singer", displayName: null });

    expect(result).toEqual({
      ok: false,
      formError: "Oturumunuzun süresi doldu. Devam etmek için tekrar giriş yapın.",
    });
  });
});
