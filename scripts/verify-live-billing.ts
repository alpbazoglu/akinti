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
 *     callable, EVERY rate-limited action used anywhere in this codebase
 *     (review3 finding 1 — `rate_limit_actions`,
 *     `20260906140000_rate_limit_actions_union.sql`) is accepted by
 *     `check_rate_limit`/`record_rate_limit_event`, and the two AKINTI Pro
 *     bypasses named in review3 findings 3/4 (`enqueue_audio_job` payload,
 *     `audio_assets.enhancement_preset` PATCH) are rejected for a real
 *     non-Pro session.
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

/**
 * The full union of `rate_limit_events.action` values used anywhere in this
 * codebase, as of review3 finding 1's fix
 * (`supabase/migrations/20260906140000_rate_limit_actions_union.sql`). Kept
 * as an explicit list (not read from `rate_limit_actions` itself) so this
 * check fails loudly if a future migration adds a code-side action without
 * inserting it into the lookup table, rather than silently agreeing with
 * whatever the table currently contains.
 */
const ALL_RATE_LIMIT_ACTIONS = [
  "comment",
  "follow",
  "message",
  "duet_request",
  "share",
  "report",
  "audio_upload",
  "challenge_entry",
  "billing_checkout",
  "flow_event",
] as const;

/**
 * Regression guard for review3 finding 1: two same-day migrations each
 * rewrote `rate_limit_events_action_known` from scratch and silently
 * dropped the other's action. Calling `check_rate_limit` for every action
 * used anywhere in the codebase catches a future regression of the same
 * shape immediately, not just for `billing_checkout`.
 */
async function checkAllRateLimitActionsWhitelisted(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<CheckResult> {
  const rejected: string[] = [];
  for (const action of ALL_RATE_LIMIT_ACTIONS) {
    try {
      const res = await fetch(`${baseUrl}/rest/v1/rpc/check_rate_limit`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          p_profile_id: PROBE_USER_ID,
          p_action: action,
          p_max_count: 999999,
          p_window: "1 hour",
        }),
      });
      if (!res.ok) {
        rejected.push(action);
      }
    } catch {
      rejected.push(action);
    }
  }
  if (rejected.length > 0) {
    return {
      name: "rpc:check_rate_limit(all actions)",
      status: "FAIL",
      detail: `rejected by rate_limit_actions/rate_limit_events_action_known: ${rejected.join(", ")}`,
    };
  }
  return {
    name: "rpc:check_rate_limit(all actions)",
    status: "PASS",
    detail: `all ${ALL_RATE_LIMIT_ACTIONS.length} actions accepted (${ALL_RATE_LIMIT_ACTIONS.join(", ")})`,
  };
}

/* ------------------------------------------------------------------------ */
/* Negative tests for review3 findings 3 and 4 — AKINTI Pro must not be     */
/* reachable from the browser via either the enqueue_audio_job payload or a */
/* direct PATCH of audio_assets.enhancement_preset, for a real non-Pro      */
/* session (not just a service-role probe).                                */
/* ------------------------------------------------------------------------ */

async function createThrowawayUser(
  baseUrl: string,
  adminHeaders: Record<string, string>,
  email: string,
  password: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) {
    throw new Error(`create user failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const user = (await res.json()) as { id: string };
  return user.id;
}

async function signIn(baseUrl: string, anonKey: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`sign-in failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const session = (await res.json()) as { access_token: string };
  return session.access_token;
}

/**
 * Finding 3: `enqueue_audio_job` granted to `authenticated` must reject a
 * Pro-only preset (`pitch_snap`/`self_harmony`) for a caller `has_pro()`
 * says is not Pro — provisions one throwaway non-Pro user, one asset they
 * own, and calls the RPC directly with their own real JWT (not the
 * service-role key), the exact shape of the bypass the finding describes.
 */
async function checkEnqueueAudioJobRejectsNonProPreset(
  baseUrl: string,
  adminHeaders: Record<string, string>,
  anonKey: string,
): Promise<CheckResult> {
  const name = "rpc:enqueue_audio_job(non-Pro, pitch_snap)";
  const probeId = crypto.randomUUID();
  const email = `verify-billing-${probeId}@akinti.internal`;
  const password = `Vv${probeId.replace(/-/g, "")}!`;
  let userId: string | null = null;

  try {
    userId = await createThrowawayUser(baseUrl, adminHeaders, email, password);

    const assetRes = await fetch(`${baseUrl}/rest/v1/audio_assets`, {
      method: "POST",
      headers: { ...adminHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        owner_id: userId,
        original_path: `verify/${probeId}.wav`,
        mime_type: "audio/wav",
        byte_size: 1,
      }),
    });
    if (!assetRes.ok) {
      return { name, status: "FAIL", detail: `create audio asset failed: HTTP ${assetRes.status} ${(await assetRes.text()).slice(0, 200)}` };
    }
    const [asset] = (await assetRes.json()) as { id: string }[];

    const token = await signIn(baseUrl, anonKey, email, password);

    const rpcRes = await fetch(`${baseUrl}/rest/v1/rpc/enqueue_audio_job`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_audio_asset_id: asset.id,
        p_job_type: "process_audio",
        p_payload: { preset: "pitch_snap", advanced_eq: null },
      }),
    });

    if (rpcRes.ok) {
      return { name, status: "FAIL", detail: "non-Pro caller was allowed to enqueue a pitch_snap job — AKINTI Pro gate bypassed" };
    }
    const body = await rpcRes.text();
    return { name, status: "PASS", detail: `correctly rejected: HTTP ${rpcRes.status} ${body.slice(0, 150)}` };
  } catch (err) {
    return { name, status: "FAIL", detail: err instanceof Error ? err.message : String(err) };
  } finally {
    if (userId) {
      await fetch(`${baseUrl}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: adminHeaders }).catch(() => {});
    }
  }
}

/**
 * Finding 4: a direct PostgREST PATCH of `audio_assets.enhancement_preset`
 * to a Pro-only id must be rejected by `audio_assets_guard_update` for a
 * non-Pro owner, independent of finding 3's RPC-level fix.
 */
async function checkPatchEnhancementPresetRejectsNonPro(
  baseUrl: string,
  adminHeaders: Record<string, string>,
  anonKey: string,
): Promise<CheckResult> {
  const name = "patch:audio_assets.enhancement_preset(non-Pro, pitch_snap)";
  const probeId = crypto.randomUUID();
  const email = `verify-billing-${probeId}@akinti.internal`;
  const password = `Vv${probeId.replace(/-/g, "")}!`;
  let userId: string | null = null;

  try {
    userId = await createThrowawayUser(baseUrl, adminHeaders, email, password);

    const assetRes = await fetch(`${baseUrl}/rest/v1/audio_assets`, {
      method: "POST",
      headers: { ...adminHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        owner_id: userId,
        original_path: `verify/${probeId}.wav`,
        mime_type: "audio/wav",
        byte_size: 1,
        enhancement_preset: "natural",
      }),
    });
    if (!assetRes.ok) {
      return { name, status: "FAIL", detail: `create audio asset failed: HTTP ${assetRes.status} ${(await assetRes.text()).slice(0, 200)}` };
    }
    const [asset] = (await assetRes.json()) as { id: string }[];

    const token = await signIn(baseUrl, anonKey, email, password);

    // `Prefer: return=minimal`, not `return=representation`: the latter
    // makes PostgREST re-select the full row afterward, which 403s on ANY
    // update to this table (even a legitimate own-preset change) because
    // `original_path`/`processed_path` are deliberately not in the
    // column-scoped SELECT grant (migration 15) — a pre-existing, unrelated
    // wrinkle that would mask this check's actual signal. What this check
    // needs to know is only "did the row change", read back separately with
    // the admin client below.
    const patchRes = await fetch(`${baseUrl}/rest/v1/audio_assets?id=eq.${asset.id}`, {
      method: "PATCH",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ enhancement_preset: "pitch_snap" }),
    });

    const afterRes = await fetch(
      `${baseUrl}/rest/v1/audio_assets?id=eq.${asset.id}&select=enhancement_preset`,
      { headers: adminHeaders },
    );
    const [afterRow] = afterRes.ok ? ((await afterRes.json()) as { enhancement_preset: string }[]) : [];

    if (afterRow?.enhancement_preset === "pitch_snap") {
      return { name, status: "FAIL", detail: "non-Pro owner PATCHed enhancement_preset to pitch_snap — AKINTI Pro gate bypassed" };
    }
    if (patchRes.ok) {
      return { name, status: "FAIL", detail: `PATCH returned HTTP ${patchRes.status} with no error, but row is unexpectedly "${afterRow?.enhancement_preset}" — investigate` };
    }
    const body = await patchRes.text();
    return { name, status: "PASS", detail: `correctly rejected: HTTP ${patchRes.status} ${body.slice(0, 150)} (row still "${afterRow?.enhancement_preset}")` };
  } catch (err) {
    return { name, status: "FAIL", detail: err instanceof Error ? err.message : String(err) };
  } finally {
    if (userId) {
      await fetch(`${baseUrl}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: adminHeaders }).catch(() => {});
    }
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

function getAnonKey(): string {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return anonKey;
}

async function main(): Promise<void> {
  const { url, serviceRoleKey } = getSupabaseEnv();
  const anonKey = getAnonKey();
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
  results.push(await checkAllRateLimitActionsWhitelisted(url, headers));
  results.push(await checkEnqueueAudioJobRejectsNonProPreset(url, headers, anonKey));
  results.push(await checkPatchEnhancementPresetRejectsNonPro(url, headers, anonKey));

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
