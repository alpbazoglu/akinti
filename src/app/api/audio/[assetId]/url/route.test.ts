import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { NotFoundError } from "@/lib/db/types";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/audio/x/url");
}

const mintPlaybackUrlMock = vi.fn();
vi.mock("@/lib/db/audioAssets", () => ({
  mintPlaybackUrl: (...args: unknown[]) => mintPlaybackUrlMock(...args),
}));

const isSupabaseConfiguredMock = vi.fn(() => true);
vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ __kind: "admin" }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ __kind: "server" }),
}));

const { GET } = await import("./route");

const VALID_ASSET_ID = "11111111-1111-4111-8111-111111111111";

function makeContext(assetId: string) {
  return { params: Promise.resolve({ assetId }) };
}

beforeEach(() => {
  mintPlaybackUrlMock.mockReset();
  isSupabaseConfiguredMock.mockReset();
  isSupabaseConfiguredMock.mockReturnValue(true);
});

describe("GET /api/audio/[assetId]/url", () => {
  it("returns 503 when Supabase isn't configured", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);

    const response = await GET(makeRequest(), makeContext(VALID_ASSET_ID));

    expect(response.status).toBe(503);
    expect(mintPlaybackUrlMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a malformed asset id, without ever querying the database", async () => {
    const response = await GET(makeRequest(), makeContext("not-a-uuid"));

    expect(response.status).toBe(404);
    expect(mintPlaybackUrlMock).not.toHaveBeenCalled();
  });

  it("returns 404 (never 403) when the asset does not exist or the caller cannot view it", async () => {
    mintPlaybackUrlMock.mockRejectedValue(new NotFoundError("audio asset"));

    const response = await GET(makeRequest(), makeContext(VALID_ASSET_ID));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("not_found");
  });

  it("returns 500 on an unexpected error, without leaking internals", async () => {
    mintPlaybackUrlMock.mockRejectedValue(new Error("connection reset"));

    const response = await GET(makeRequest(), makeContext(VALID_ASSET_ID));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("connection reset");
  });

  it("returns the signed URL with a private, no-store cache header on success", async () => {
    mintPlaybackUrlMock.mockResolvedValue({
      url: "https://example.supabase.co/storage/v1/object/sign/audio/x?token=abc",
      expiresAt: "2026-01-01T00:00:00.000Z",
      variant: "processed",
    });

    const response = await GET(makeRequest(), makeContext(VALID_ASSET_ID));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    expect(body).toEqual({
      url: "https://example.supabase.co/storage/v1/object/sign/audio/x?token=abc",
      expiresAt: "2026-01-01T00:00:00.000Z",
      variant: "processed",
    });
  });

  it("falls back to the original file's URL while a Wave is still processing (variant: original)", async () => {
    mintPlaybackUrlMock.mockResolvedValue({
      url: "https://example.supabase.co/storage/v1/object/sign/audio/x?token=def",
      expiresAt: "2026-01-01T00:00:00.000Z",
      variant: "original",
    });

    const response = await GET(makeRequest(), makeContext(VALID_ASSET_ID));
    const body = await response.json();

    expect(body.variant).toBe("original");
  });
});
