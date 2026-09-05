import { NextResponse, type NextRequest } from "next/server";

import { handleWebhook } from "@/lib/billing";
import { iyzicoProvider } from "@/lib/billing/iyzico";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * `POST /api/billing/iyzico/webhook` — iyzico's `subscription.order.success`/
 * `subscription.order.failure` notifications (docs.iyzico.com "Webhook" —
 * see `src/lib/billing/iyzico.ts`'s header comment for the exact endpoints
 * this integration was built against). Signature verified against the RAW
 * body (`X-IYZ-SIGNATURE-V3`) before anything is parsed or trusted.
 *
 * iyzico retries every 15 minutes, up to 3 attempts, until it sees a 2xx —
 * `handleWebhook`/`applyBillingEvent` (`src/lib/billing/repository.ts`) make
 * every retry a no-op via `(provider, event_id)` uniqueness, so this route
 * always returns 200 once the event is durably recorded, whether or not
 * this was the first delivery.
 */

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE_HEADERS });
  }

  const rawBody = await request.text();

  try {
    const admin = createAdminClient();
    const result = await handleWebhook(admin, iyzicoProvider, rawBody, request.headers);
    if (!result.ok) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 401, headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({ received: true }, { status: 200, headers: NO_STORE_HEADERS });
  } catch (err) {
    console.error("[api/billing/iyzico/webhook]", err);
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
