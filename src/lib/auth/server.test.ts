import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `assertNotSuspended` (spec §26, §32, Stage 14 audit) — the Server Action
 * suspension guard added alongside `requireUser`'s existing redirect-based
 * check. This only tests the pure decision logic (given what
 * `profiles.suspended_until` holds, may the caller proceed?), mirroring the
 * same client-mocking approach as `src/app/api/audio/[assetId]/url/route.test.ts`.
 */

const isSupabaseConfiguredMock = vi.fn(() => true);
vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
}));

let suspendedUntil: string | null = null;
let maybeSingleError: { message: string } | null = null;

const maybeSingleMock = vi.fn(async () => ({
  data: maybeSingleError ? null : { suspended_until: suspendedUntil },
  error: maybeSingleError,
}));
const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ from: fromMock }),
}));

const { assertNotSuspended } = await import("./server");

const USER_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  isSupabaseConfiguredMock.mockReset();
  isSupabaseConfiguredMock.mockReturnValue(true);
  suspendedUntil = null;
  maybeSingleError = null;
  fromMock.mockClear();
  selectMock.mockClear();
  eqMock.mockClear();
  maybeSingleMock.mockClear();
});

describe("assertNotSuspended", () => {
  it("allows a non-suspended account (suspended_until is null)", async () => {
    suspendedUntil = null;
    await expect(assertNotSuspended(USER_ID)).resolves.toBe(true);
  });

  it("allows an account whose suspension has already expired", async () => {
    suspendedUntil = new Date(Date.now() - 60_000).toISOString();
    await expect(assertNotSuspended(USER_ID)).resolves.toBe(true);
  });

  it("denies an account with an active future suspension", async () => {
    suspendedUntil = new Date(Date.now() + 60_000).toISOString();
    await expect(assertNotSuspended(USER_ID)).resolves.toBe(false);
  });

  it("queries by the exact user id given", async () => {
    await assertNotSuspended(USER_ID);
    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(selectMock).toHaveBeenCalledWith("suspended_until");
    expect(eqMock).toHaveBeenCalledWith("id", USER_ID);
  });

  it("allows the caller through (fails open) when Supabase isn't configured, matching every other auth helper's degrade-to-signed-out behavior", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    suspendedUntil = new Date(Date.now() + 60_000).toISOString();

    await expect(assertNotSuspended(USER_ID)).resolves.toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("treats a missing profile row (no data) as not suspended", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    await expect(assertNotSuspended(USER_ID)).resolves.toBe(true);
  });
});
