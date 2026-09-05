import { NextResponse, type NextRequest } from "next/server";

import { handleWebhook } from "@/lib/billing";
import { paddleProvider } from "@/lib/billing/paddle";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * `POST /api/billing/paddle/webhook` — Paddle Billing notifications
 * (`subscription.*`/`transaction.*`, see `src/lib/billing/paddle.ts`'s
 * header comment). Signature verified against the RAW body via the SDK's
 * own `webhooks.isSignatureValid`/`unmarshal` (`Paddle-Signature` header) —
 * never hand-rolled, per this wave's brief ("do not guess ... webhook
 * signatures").
 *
 * Paddle retries a failed delivery on its own schedule until it sees a 2xx;
 * `applyBillingEvent`'s `(provider, event_id)` uniqueness makes every retry
 * a no-op.
 */

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE_HEADERS });
  }

  const rawBody = await request.text();

  try {
    const admin = createAdminClient();
    const result = await handleWebhook(admin, paddleProvider, rawBody, request.headers);
    if (!result.ok) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 401, headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({ received: true }, { status: 200, headers: NO_STORE_HEADERS });
  } catch (err) {
    console.error("[api/billing/paddle/webhook]", err);
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
