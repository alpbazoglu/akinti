import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function makeRequest(body: string): NextRequest {
  return new NextRequest("http://localhost/api/billing/paddle/webhook", { method: "POST", body });
}

const isSupabaseConfiguredMock = vi.fn(() => true);
vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ __kind: "admin" }),
}));

const handleWebhookMock = vi.fn();
vi.mock("@/lib/billing", () => ({
  handleWebhook: (...args: unknown[]) => handleWebhookMock(...args),
}));

vi.mock("@/lib/billing/paddle", () => ({
  paddleProvider: { provider: "paddle" },
}));

const { POST } = await import("./route");

beforeEach(() => {
  handleWebhookMock.mockReset();
  isSupabaseConfiguredMock.mockReset();
  isSupabaseConfiguredMock.mockReturnValue(true);
});

describe("POST /api/billing/paddle/webhook", () => {
  it("returns 503 when Supabase isn't configured, without ever verifying the signature", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);

    const response = await POST(makeRequest("{}"));

    expect(response.status).toBe(503);
    expect(handleWebhookMock).not.toHaveBeenCalled();
  });

  it("returns 401 for an invalid signature", async () => {
    handleWebhookMock.mockResolvedValue({ ok: false, reason: "invalid_signature" });

    const response = await POST(makeRequest("{}"));

    expect(response.status).toBe(401);
  });

  it("returns 200 once the event is durably recorded", async () => {
    handleWebhookMock.mockResolvedValue({ ok: true });

    const response = await POST(makeRequest(JSON.stringify({ event_type: "subscription.created" })));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns 500 on an unexpected error, without leaking internals", async () => {
    handleWebhookMock.mockRejectedValue(new Error("connection reset"));

    const response = await POST(makeRequest("{}"));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("connection reset");
  });
});
