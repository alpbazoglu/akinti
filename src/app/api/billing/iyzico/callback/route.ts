import { NextResponse, type NextRequest } from "next/server";

import { billingRepository, iyzicoProvider } from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { routes } from "@/config/routes";

/**
 * `POST /api/billing/iyzico/callback` — the `callbackUrl` passed to
 * `subscriptionCheckoutForm.initialize` (`src/lib/billing/iyzico.ts`).
 * Not part of iyzico's webhook system (no signature to verify here — the
 * value that matters, `token`, is retrieved back from iyzico's own API in
 * this same request, never trusted from the POST body alone) — this is the
 * synchronous side of the flow docs.iyzico.com describes as "a `token`
 * value will be posted by iyzico" once the buyer finishes paying on the
 * hosted form.
 *
 * `POST /api/billing/iyzico/webhook`'s `subscription.order.success`/
 * `failure` events are the durable, retried confirmation of the same
 * state — this route only exists because iyzico's Checkout Form never
 * hands back a real `subscriptionReferenceCode` any other way (see
 * `docs/BILLING.md` "Checkout flow — iyzico" for the full sequence and the
 * known race between this route and the webhook).
 */

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

async function readToken(request: NextRequest): Promise<string | null> {
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { token?: unknown };
      return typeof body.token === "string" ? body.token : null;
    }
    const form = await request.formData();
    const token = form.get("token");
    return typeof token === "string" ? token : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const failureRedirect = NextResponse.redirect(new URL(`${routes.settingsPro()}?checkout=failed`, request.url), {
    status: 303,
    headers: NO_STORE_HEADERS,
  });

  if (!isSupabaseConfigured()) {
    return failureRedirect;
  }

  const token = await readToken(request);
  if (!token) {
    return failureRedirect;
  }

  try {
    const admin = createAdminClient();
    const pending = await billingRepository.findSubscriptionByProviderRef(admin, "iyzico", token);
    if (!pending) {
      return failureRedirect;
    }

    const completed = await iyzicoProvider.retrieveCheckoutForm(token);
    await billingRepository.updateSubscriptionProviderRef(admin, pending.id, {
      providerSubscriptionId: completed.subscriptionReferenceCode,
      status: completed.status,
      currentPeriodEnd: completed.currentPeriodEnd,
    });

    return NextResponse.redirect(new URL(`${routes.settingsPro()}?checkout=success`, request.url), {
      status: 303,
      headers: NO_STORE_HEADERS,
    });
  } catch (err) {
    console.error("[api/billing/iyzico/callback]", err);
    return failureRedirect;
  }
}
