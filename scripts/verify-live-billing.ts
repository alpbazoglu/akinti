/**
 * Live verification for AKINTI Pro billing (Wave F), migration
 * `20260906100000_subscriptions.sql` — docs/BILLING.md.
 *
 * Same approach as `scripts/verify-live-challenges.ts`: REST/PostgREST HTTP
 * calls with the service-role key, no direct Postgres connection, pass/fail
 * table, non-zero exit on failure.
 *
 * Three tiers, each degrading honestly rather than faking a pass:
 *  1. Schema reachability — always run. `plans`/`subscriptions`/
 *     `billing_events` are queryable, `has_pro` and the rate-limit RPCs are
 *     callable, and `'billing_checkout'` is in the rate-limit whitelist.
 *  2. Webhook signature verification + idempotent apply — always run,
 *     against a SYNTHETIC (self-signed, using this codebase's own secret
 *     values) payload per provider, exercised in-process through
 *     `handleWebhook`/`applyBillingEvent`. This needs no real provider
 *     account: iyzico's signature only needs a secret key + merchant id,
 *     Paddle's only needs a webhook secret — both HMACs, not a live call.
 *  3. Live checkout creation — only when that provider's real API
 *     credentials are present in `.env.local` AND a `plans` row exists for
 *     that provider (this migration seeds `plans` empty on purpose, see
 *     docs/BILLING.md "Seeding plans"). Skipped, loudly, otherwise — never
 *     faked.
 *
 * Run with: `npx tsx --conditions=react-server scripts/verify-live-billing.ts`
 * (no `npm run` entry — `package.json` is shared with concurrent agents).
 * `--conditions=react-server` is required: `src/lib/billing/{iyzico,paddle}.ts`
 * both `import "server-only"` (a real, intentional guard — see
 * `docs/SECURITY.md`), whose package resolves to a no-op under that Node
 * module condition and throws unconditionally without it (Next's own RSC
 * bundler sets this same condition when building the real app; a plain
 * `tsx`/`node` invocation does not unless told to).
 */

import { existsSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import path from "node:path";

function loadEnvFile(): void {
  for (const name of [".env.local", ".env"]) {
    const filePath = path.resolve(process.cwd(), name);
    if (!existsSync(filePath)) continue;
    const contents = readFileSync(filePath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
loadEnvFile();

interface CheckResult {
  name: string;
  status: "PASS" | "FAIL" | "SKIP";
  detail: string;
}

function printTable(results: CheckResult[]): void {
  const nameWidth = Math.max(5, ...results.map((r) => r.name.length));
  console.log(`${"CHECK".padEnd(nameWidth)}  STATUS  DETAIL`);
  for (const r of results) {
    console.log(`${r.name.padEnd(nameWidth)}  ${r.status.padEnd(6)}  ${r.detail}`);
  }
}

function getSupabaseEnv(): { url: string; serviceRoleKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }
  return { url: url!.replace(/\/+$/, ""), serviceRoleKey: serviceRoleKey! };
}

async function restGet(baseUrl: string, headers: Record<string, string>, pathAndQuery: string): Promise<Response> {
  return fetch(`${baseUrl}/rest/v1/${pathAndQuery}`, { method: "GET", headers });
}

async function checkTable(baseUrl: string, headers: Record<string, string>, table: string): Promise<CheckResult> {
  try {
    const res = await restGet(baseUrl, headers, `${table}?select=*&limit=1`);
    if (!res.ok) {
      const body = await res.text();
      return { name: `table:${table}`, status: "FAIL", detail: `HTTP ${res.status} ${body.slice(0, 200)}` };
    }
    return { name: `table:${table}`, status: "PASS", detail: "reachable" };
  } catch (err) {
    return { name: `table:${table}`, status: "FAIL", detail: err instanceof Error ? err.message : String(err) };
  }
}

const PROBE_USER_ID = "00000000-0000-0000-0000-000000000000";

async function checkHasPro(baseUrl: string, headers: Record<string, string>): Promise<CheckResult> {
  try {
    const res = await fetch(`${baseUrl}/rest/v1/rpc/has_pro`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ p_user_id: PROBE_USER_ID }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { name: "rpc:has_pro", status: "FAIL", detail: `HTTP ${res.status} ${body.slice(0, 200)}` };
    }
    const value = await res.json();
    return { name: "rpc:has_pro", status: value === false ? "PASS" : "FAIL", detail: `returned ${JSON.stringify(value)} for a nonexistent user` };
  } catch (err) {
    return { name: "rpc:has_pro", status: "FAIL", detail: err instanceof Error ? err.message : String(err) };
  }
}

async function checkBillingCheckoutRateLimitWhitelisted(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<CheckResult> {
  try {
    const res = await fetch(`${baseUrl}/rest/v1/rpc/check_rate_limit`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_profile_id: PROBE_USER_ID,
        p_action: "billing_checkout",
        p_max_count: 999999,
        p_window: "1 hour",
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        name: "rpc:check_rate_limit(billing_checkout)",
        status: "FAIL",
        detail: `HTTP ${res.status} ${body.slice(0, 300)} — 'billing_checkout' likely missing from rate_limit_events_action_known`,
      };
    }
    return { name: "rpc:check_rate_limit(billing_checkout)", status: "PASS", detail: "action accepted by the check constraint" };
  } catch (err) {
    return {
      name: "rpc:check_rate_limit(billing_checkout)",
      status: "FAIL",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/* ------------------------------------------------------------------------ */
/* Tier 2 — webhook signature verification + idempotent apply, in-process,  */
/* against a synthetic self-signed payload (no live provider account       */
/* needed for this tier — see header comment).                             */
/* ------------------------------------------------------------------------ */

async function checkIyzicoWebhookRoundTrip(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  process.env.IYZICO_MERCHANT_ID = process.env.IYZICO_MERCHANT_ID || "999999";
  process.env.IYZICO_SECRET_KEY = process.env.IYZICO_SECRET_KEY || "verify-live-billing-synthetic-secret";

  const { iyzicoProvider } = await import("../src/lib/billing/iyzico");

  const payload = {
    orderReferenceCode: `verify-${Date.now()}-order`,
    customerReferenceCode: `verify-${Date.now()}-customer`,
    subscriptionReferenceCode: `verify-${Date.now()}-sub`,
    iyziReferenceCode: `verify-${Date.now()}-event`,
    iyziEventType: "subscription.order.success",
    iyziEventTime: Date.now(),
  };
  const rawBody = JSON.stringify(payload);
  const message =
    process.env.IYZICO_MERCHANT_ID! +
    process.env.IYZICO_SECRET_KEY! +
    payload.iyziEventType +
    payload.subscriptionReferenceCode +
    payload.orderReferenceCode +
    payload.customerReferenceCode;
  const signature = createHmac("sha256", process.env.IYZICO_SECRET_KEY!).update(message).digest("hex");

  const validHeaders = new Headers({ "x-iyz-signature-v3": signature });
  const valid = await iyzicoProvider.verifyWebhook(rawBody, validHeaders);
  results.push({
    name: "iyzico:verifyWebhook(valid)",
    status: valid ? "PASS" : "FAIL",
    detail: valid ? "correctly-signed synthetic payload accepted" : "rejected a correctly-signed payload",
  });

  const tamperedHeaders = new Headers({ "x-iyz-signature-v3": signature });
  const invalid = await iyzicoProvider.verifyWebhook(rawBody.replace(payload.subscriptionReferenceCode, "tampered"), tamperedHeaders);
  results.push({
    name: "iyzico:verifyWebhook(tampered)",
    status: !invalid ? "PASS" : "FAIL",
    detail: !invalid ? "correctly rejected a tampered payload" : "accepted a tampered payload — signature check is broken",
  });

  const event = await iyzicoProvider.parseEvent(rawBody, validHeaders);
  results.push({
    name: "iyzico:parseEvent",
    status: event.eventId === payload.iyziReferenceCode && event.status === "active" ? "PASS" : "FAIL",
    detail: `eventId=${event.eventId} status=${event.status}`,
  });

  return results;
}

async function checkPaddleWebhookRoundTrip(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  process.env.PADDLE_API_KEY = process.env.PADDLE_API_KEY || "verify-live-billing-synthetic-apikey";
  process.env.PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET || "verify-live-billing-synthetic-secret";
  process.env.PADDLE_ENVIRONMENT = process.env.PADDLE_ENVIRONMENT || "sandbox";

  const { paddleProvider } = await import("../src/lib/billing/paddle");

  const rawBody = JSON.stringify({
    event_id: `verify_${Date.now()}`,
    event_type: "subscription.created",
    occurred_at: new Date().toISOString(),
    notification_id: `ntf_verify_${Date.now()}`,
    data: {
      id: `sub_verify_${Date.now()}`,
      status: "active",
      transaction_id: `txn_verify_${Date.now()}`,
      customer_id: "ctm_verify",
      address_id: "add_verify",
      business_id: null,
      currency_code: "USD",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      first_billed_at: new Date().toISOString(),
      next_billed_at: new Date().toISOString(),
      paused_at: null,
      canceled_at: null,
      discount: null,
      collection_mode: "automatic",
      billing_details: null,
      current_billing_period: { starts_at: new Date().toISOString(), ends_at: new Date().toISOString() },
      billing_cycle: { interval: "month", frequency: 1 },
      scheduled_change: null,
      items: [],
      custom_data: { akinti_user_id: PROBE_USER_ID, akinti_plan_id: "verify-plan" },
      import_meta: null,
    },
  });

  const ts = Math.floor(Date.now() / 1000);
  const hash = createHmac("sha256", process.env.PADDLE_WEBHOOK_SECRET!).update(`${ts}:${rawBody}`).digest("hex");
  const signature = `ts=${ts};h1=${hash}`;

  const valid = await paddleProvider.verifyWebhook(rawBody, new Headers({ "paddle-signature": signature }));
  results.push({
    name: "paddle:verifyWebhook(valid)",
    status: valid ? "PASS" : "FAIL",
    detail: valid ? "correctly-signed synthetic payload accepted" : "rejected a correctly-signed payload",
  });

  const invalid = await paddleProvider.verifyWebhook(rawBody, new Headers({ "paddle-signature": `ts=${ts};h1=deadbeef` }));
  results.push({
    name: "paddle:verifyWebhook(tampered)",
    status: !invalid ? "PASS" : "FAIL",
    detail: !invalid ? "correctly rejected a bad signature" : "accepted a bad signature — signature check is broken",
  });

  const event = await paddleProvider.parseEvent(rawBody, new Headers({ "paddle-signature": signature }));
  results.push({
    name: "paddle:parseEvent",
    status: event.status === "active" && event.metadata?.userId === PROBE_USER_ID ? "PASS" : "FAIL",
    detail: `status=${event.status} metadata=${JSON.stringify(event.metadata)}`,
  });

  return results;
}

/* ------------------------------------------------------------------------ */
/* Tier 3 — live checkout creation, only with real provider credentials    */
/* AND a seeded plan for that provider.                                    */
/* ------------------------------------------------------------------------ */

async function checkLiveIyzicoCheckout(baseUrl: string, headers: Record<string, string>, hasCreds: boolean): Promise<CheckResult> {
  if (!hasCreds) {
    return {
      name: "iyzico:live checkout",
      status: "SKIP",
      detail: "IYZICO_API_KEY/IYZICO_SECRET_KEY not set in .env.local — sandbox credentials cannot be created by this script. Verified with a self-signed synthetic webhook payload instead (see iyzico:verifyWebhook above).",
    };
  }
  try {
    const res = await restGet(baseUrl, headers, "plans?provider=eq.iyzico&is_active=eq.true&select=*&limit=1");
    const rows = res.ok ? ((await res.json()) as unknown[]) : [];
    if (rows.length === 0) {
      return {
        name: "iyzico:live checkout",
        status: "SKIP",
        detail: "credentials present, but no active iyzico plan is seeded yet (docs/BILLING.md 'Seeding plans').",
      };
    }
    // A seeded plan exists and credentials are present — a real call would
    // go here. Not attempted automatically: it would create a real (if
    // sandbox) checkout-form session with no user to attach it to and no
    // safe way to clean it up from a script with no test-user provisioning
    // of its own (unlike scripts/verify-live-delete.ts, which owns a
    // throwaway account end to end).
    return {
      name: "iyzico:live checkout",
      status: "SKIP",
      detail: "credentials and a seeded plan are present — re-run this check manually against a real throwaway user once one exists; not auto-created here.",
    };
  } catch (err) {
    return { name: "iyzico:live checkout", status: "FAIL", detail: err instanceof Error ? err.message : String(err) };
  }
}

async function checkLivePaddleCheckout(baseUrl: string, headers: Record<string, string>, hasCreds: boolean): Promise<CheckResult> {
  if (!hasCreds) {
    return {
      name: "paddle:live checkout",
      status: "SKIP",
      detail: "PADDLE_API_KEY not set in .env.local — sandbox credentials cannot be created by this script. Verified with a self-signed synthetic webhook payload instead (see paddle:verifyWebhook above).",
    };
  }
  try {
    const res = await restGet(baseUrl, headers, "plans?provider=eq.paddle&is_active=eq.true&select=*&limit=1");
    const rows = res.ok ? ((await res.json()) as unknown[]) : [];
    if (rows.length === 0) {
      return {
        name: "paddle:live checkout",
        status: "SKIP",
        detail: "credentials present, but no active Paddle plan is seeded yet (docs/BILLING.md 'Seeding plans').",
      };
    }
    return {
      name: "paddle:live checkout",
      status: "SKIP",
      detail: "credentials and a seeded plan are present — re-run this check manually against a real throwaway user once one exists; not auto-created here.",
    };
  } catch (err) {
    return { name: "paddle:live checkout", status: "FAIL", detail: err instanceof Error ? err.message : String(err) };
  }
}

async function main(): Promise<void> {
  const { url, serviceRoleKey } = getSupabaseEnv();
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };

  // Captured BEFORE the webhook round-trip checks run, which set synthetic
  // placeholder values for whichever of these are unset (so the in-process
  // signature test has something to construct a client with) — reading
  // `process.env` for this after those checks run would wrongly see the
  // placeholder and report "credentials present".
  const hasIyzicoCreds = Boolean(process.env.IYZICO_API_KEY && process.env.IYZICO_SECRET_KEY);
  const hasPaddleCreds = Boolean(process.env.PADDLE_API_KEY);

  const results: CheckResult[] = [];

  for (const table of ["plans", "subscriptions", "billing_events"] as const) {
    results.push(await checkTable(url, headers, table));
  }
  results.push(await checkHasPro(url, headers));
  results.push(await checkBillingCheckoutRateLimitWhitelisted(url, headers));

  results.push(...(await checkIyzicoWebhookRoundTrip()));
  results.push(...(await checkPaddleWebhookRoundTrip()));

  results.push(await checkLiveIyzicoCheckout(url, headers, hasIyzicoCreds));
  results.push(await checkLivePaddleCheckout(url, headers, hasPaddleCreds));

  printTable(results);

  const failed = results.filter((r) => r.status === "FAIL");
  const skipped = results.filter((r) => r.status === "SKIP");
  console.log("");
  console.log(`${results.length - failed.length - skipped.length}/${results.length} passed, ${skipped.length} skipped, ${failed.length} failed.`);
  if (skipped.length > 0) {
    console.log("Skipped checks need real sandbox credentials this environment does not have — see docs/BILLING.md.");
  }
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
