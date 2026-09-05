import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchSignedAudioUrl,
  isSignedAudioUrlStale,
  SIGNED_AUDIO_URL_REFRESH_MARGIN_MS,
  SIGNED_AUDIO_URL_TTL_MS,
} from "./signedAudioUrl";

describe("isSignedAudioUrlStale", () => {
  it("is not stale immediately after minting", () => {
    const mintedAt = 1_000_000;
    expect(isSignedAudioUrlStale(mintedAt, mintedAt)).toBe(false);
  });

  it("is not stale just before the refresh margin kicks in", () => {
    const mintedAt = 1_000_000;
    const now = mintedAt + SIGNED_AUDIO_URL_TTL_MS - SIGNED_AUDIO_URL_REFRESH_MARGIN_MS - 1;
    expect(isSignedAudioUrlStale(mintedAt, now)).toBe(false);
  });

  it("is stale once inside the refresh margin, before the URL actually expires", () => {
    const mintedAt = 1_000_000;
    const now = mintedAt + SIGNED_AUDIO_URL_TTL_MS - SIGNED_AUDIO_URL_REFRESH_MARGIN_MS;
    expect(isSignedAudioUrlStale(mintedAt, now)).toBe(true);
  });

  it("is stale well past the TTL", () => {
    const mintedAt = 1_000_000;
    expect(isSignedAudioUrlStale(mintedAt, mintedAt + SIGNED_AUDIO_URL_TTL_MS * 2)).toBe(true);
  });

  it("defaults `now` to Date.now() when omitted", () => {
    const spy = vi.spyOn(Date, "now").mockReturnValue(5_000_000);
    expect(isSignedAudioUrlStale(5_000_000)).toBe(false);
    expect(isSignedAudioUrlStale(0)).toBe(true);
    spy.mockRestore();
  });
});

describe("fetchSignedAudioUrl", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("requests the endpoint with no-store and returns the url", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://example.test/signed" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const url = await fetchSignedAudioUrl("asset-1");

    expect(url).toBe("https://example.test/signed");
    expect(fetchMock).toHaveBeenCalledWith("/api/audio/asset-1/url", { cache: "no-store" });
  });

  it("returns null on the endpoint's constant 404, never throwing", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;
    await expect(fetchSignedAudioUrl("asset-1")).resolves.toBeNull();
  });

  it("returns null when the response body has no url", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
    await expect(fetchSignedAudioUrl("asset-1")).resolves.toBeNull();
  });

  it("returns null instead of throwing on a network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    await expect(fetchSignedAudioUrl("asset-1")).resolves.toBeNull();
  });
});
