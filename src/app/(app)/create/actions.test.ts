import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/lib/db/types";
import { __setMockLocale } from "@/test/next-intl-mock";

/**
 * The AKINTI Pro gate on `createUploadTicket` (`./actions.ts`,
 * `docs/BILLING.md` "Never paywall a previously free feature"): submitting
 * one of the two Pro-only sound ids (`pitch_snap`/`self_harmony`, see
 * `src/lib/audio/enhancement.ts`) must fail for a signed-out or non-Pro
 * caller with an honest "needs Pro" message, and must never reach that
 * message for a Pro caller or for any of the six free presets.
 */

const getCurrentUserMock = vi.fn();
const assertNotSuspendedMock = vi.fn();
vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: () => getCurrentUserMock(),
  assertNotSuspended: (...args: unknown[]) => assertNotSuspendedMock(...args),
  SUSPENDED_ACTION_MESSAGE: "Your account is suspended.",
}));

const requireProMock = vi.fn();
vi.mock("@/lib/billing/entitlements", () => ({
  requirePro: (...args: unknown[]) => requireProMock(...args),
}));

const createAudioAssetMock = vi.fn();
vi.mock("@/lib/db/audioAssets", () => ({
  createAudioAsset: (...args: unknown[]) => createAudioAssetMock(...args),
  enqueueAudioProcessing: vi.fn(),
  getAudioAssetById: vi.fn(),
  markAudioAssetFailed: vi.fn(),
}));

vi.mock("@/lib/db/backingTracks", () => ({
  enqueueBackingTrackMixJob: vi.fn(),
  requireBackingTrack: vi.fn(),
}));
vi.mock("@/lib/db/waves", () => ({
  createWave: vi.fn(),
  inviteCollaborator: vi.fn(),
}));
vi.mock("@/lib/db/profiles", () => ({
  getProfileByUsername: vi.fn(),
}));

const createSignedUploadUrlMock = vi.fn(() =>
  Promise.resolve({ data: { signedUrl: "https://example.supabase.co/upload", token: "tok" }, error: null }),
);
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    storage: { from: () => ({ createSignedUploadUrl: createSignedUploadUrlMock }) },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ __kind: "admin" }),
}));

const isSupabaseConfiguredMock = vi.fn(() => true);
vi.mock("@/lib/supabase/config", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase/config")>("@/lib/supabase/config");
  return { ...actual, isSupabaseConfigured: () => isSupabaseConfiguredMock() };
});

const { createUploadTicket } = await import("./actions");

const SIGNED_IN_USER = { id: "11111111-1111-4111-8111-111111111111", email: "singer@example.com" };

function baseArgs(enhancementPreset?: string) {
  return {
    mimeType: "audio/webm",
    sizeBytes: 1024,
    creationType: "recorded" as const,
    enhancementPreset,
  };
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  assertNotSuspendedMock.mockReset().mockResolvedValue(true);
  requireProMock.mockReset();
  createAudioAssetMock.mockReset().mockResolvedValue(undefined);
  isSupabaseConfiguredMock.mockReset().mockReturnValue(true);
  createSignedUploadUrlMock.mockClear();
});

describe("createUploadTicket — AKINTI Pro gate", () => {
  it("asks a signed-out caller to sign in before ever checking Pro status", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await createUploadTicket(baseArgs("pitch_snap"));

    expect(result).toEqual({ ok: false, error: "Sign in to do that." });
    expect(requireProMock).not.toHaveBeenCalled();
  });

  it("rejects a signed-in, non-Pro caller submitting pitch_snap with an honest message", async () => {
    getCurrentUserMock.mockResolvedValue(SIGNED_IN_USER);
    requireProMock.mockRejectedValue(new ForbiddenError("This option needs AKINTI Pro."));

    const result = await createUploadTicket(baseArgs("pitch_snap"));

    expect(result).toEqual({ ok: false, error: "This sound needs AKINTI Pro." });
    expect(requireProMock).toHaveBeenCalledWith(expect.anything(), SIGNED_IN_USER.id);
    expect(createAudioAssetMock).not.toHaveBeenCalled();
  });

  it("rejects a signed-in, non-Pro caller submitting self_harmony the same way", async () => {
    getCurrentUserMock.mockResolvedValue(SIGNED_IN_USER);
    requireProMock.mockRejectedValue(new ForbiddenError("This option needs AKINTI Pro."));

    const result = await createUploadTicket(baseArgs("self_harmony"));

    expect(result).toEqual({ ok: false, error: "This sound needs AKINTI Pro." });
  });

  it("clears a Pro caller past the gate and all the way through to a real upload ticket", async () => {
    // `pitch_snap`/`self_harmony` are now valid `audio_enhancement_preset`
    // enum values (migration `20260906120000_pro_presets_pitch.sql`) and
    // `createUploadTicketSchema` accepts them (`src/lib/validation/audio.ts`)
    // — a Pro caller submitting one is no longer rejected below the gate.
    getCurrentUserMock.mockResolvedValue(SIGNED_IN_USER);
    requireProMock.mockResolvedValue(undefined);

    const result = await createUploadTicket(baseArgs("pitch_snap"));

    expect(requireProMock).toHaveBeenCalledWith(expect.anything(), SIGNED_IN_USER.id);
    if (!result.ok) throw new Error(`expected a real upload ticket, got error: ${result.error}`);
    expect(createAudioAssetMock).toHaveBeenCalled();
  });

  it("never calls requirePro for one of the six free presets", async () => {
    getCurrentUserMock.mockResolvedValue(SIGNED_IN_USER);

    const result = await createUploadTicket(baseArgs("studio"));

    expect(result.ok).toBe(true);
    expect(requireProMock).not.toHaveBeenCalled();
  });

  it("never calls requirePro when no preset is submitted at all (defaults to natural)", async () => {
    getCurrentUserMock.mockResolvedValue(SIGNED_IN_USER);

    const result = await createUploadTicket(baseArgs(undefined));

    expect(result.ok).toBe(true);
    expect(requireProMock).not.toHaveBeenCalled();
  });
});

describe("createUploadTicket — locale (docs/I18N.md)", () => {
  afterEach(() => {
    __setMockLocale("en");
  });

  it("rejects a Pro-only sound for a signed-in, non-Pro caller in Turkish under a tr request", async () => {
    __setMockLocale("tr");
    getCurrentUserMock.mockResolvedValue(SIGNED_IN_USER);
    requireProMock.mockRejectedValue(new ForbiddenError("This option needs AKINTI Pro."));

    const result = await createUploadTicket(baseArgs("pitch_snap"));

    expect(result).toEqual({ ok: false, error: "Bu ses için AKINTI Pro gerekir." });
  });

  it("asks a signed-out caller to sign in, in Turkish, under a tr request", async () => {
    __setMockLocale("tr");
    getCurrentUserMock.mockResolvedValue(null);

    const result = await createUploadTicket(baseArgs("pitch_snap"));

    expect(result).toEqual({ ok: false, error: "Bunu yapmak için giriş yapın." });
  });
});
