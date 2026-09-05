/**
 * Live verification for Prompts & challenges (PRODUCT_V2 §4), migration
 * `20260905130000_challenges.sql`.
 *
 * Own file, not an edit to `scripts/verify-live.ts` (owned by another stage)
 * — same approach: REST/PostgREST HTTP calls with the service-role key, no
 * direct Postgres connection, pass/fail table, non-zero exit on failure.
 *
 * Run with: `npx tsx scripts/verify-live-challenges.ts`
 * (documented in docs/CHALLENGES.md; no `npm run` entry — `package.json` is
 * owned by another concurrent agent for this stage).
 *
 * Env (see .env.example): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/* ------------------------------------------------------------------------ */
/* Minimal .env loader (same approach as scripts/verify-live.ts)            */
/* ------------------------------------------------------------------------ */

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

const CHALLENGE_TABLES = ["challenges", "challenge_entries", "challenge_picks"] as const;

/** A wave id / challenge id that certainly does not exist — enough to confirm the RPC is callable. */
const PROBE_ID = "00000000-0000-0000-0000-000000000000";

function getEnv(): { url: string; serviceRoleKey: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }
  return { url: url!.replace(/\/+$/, ""), serviceRoleKey: serviceRoleKey!, anonKey: anonKey! };
}

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

function printTable(results: CheckResult[]): void {
  const nameWidth = Math.max(4, ...results.map((r) => r.name.length));
  console.log(`${"CHECK".padEnd(nameWidth)}  STATUS  DETAIL`);
  for (const r of results) {
    const status = r.ok ? "PASS" : "FAIL";
    console.log(`${r.name.padEnd(nameWidth)}  ${status.padEnd(6)}  ${r.detail}`);
  }
}

async function checkTable(baseUrl: string, headers: Record<string, string>, table: string): Promise<CheckResult> {
  try {
    const res = await fetch(`${baseUrl}/rest/v1/${table}?select=*&limit=1`, { method: "GET", headers });
    if (!res.ok) {
      const body = await res.text();
      return { name: `table:${table}`, ok: false, detail: `HTTP ${res.status} ${body.slice(0, 200)}` };
    }
    return { name: `table:${table}`, ok: true, detail: "reachable" };
  } catch (err) {
    return { name: `table:${table}`, ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function checkRpc(
  baseUrl: string,
  headers: Record<string, string>,
  fnName: string,
  body: Record<string, unknown>,
): Promise<CheckResult> {
  try {
    const res = await fetch(`${baseUrl}/rest/v1/rpc/${fnName}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const respBody = await res.text();
      return { name: `rpc:${fnName}`, ok: false, detail: `HTTP ${res.status} ${respBody.slice(0, 200)}` };
    }
    return { name: `rpc:${fnName}`, ok: true, detail: "callable" };
  } catch (err) {
    return { name: `rpc:${fnName}`, ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Confirms the two `scripts/seed-challenges.ts` challenges are live and reachable via the `get_challenge` RPC. */
async function checkSeededChallenge(
  baseUrl: string,
  headers: Record<string, string>,
  slug: string,
): Promise<CheckResult> {
  try {
    const res = await fetch(`${baseUrl}/rest/v1/rpc/get_challenge`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ p_slug: slug }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { name: `seed:${slug}`, ok: false, detail: `HTTP ${res.status} ${body.slice(0, 200)}` };
    }
    const data = (await res.json()) as { status?: string } | null;
    if (!data) {
      return { name: `seed:${slug}`, ok: false, detail: "not found — run `npx tsx scripts/seed-challenges.ts`" };
    }
    return { name: `seed:${slug}`, ok: true, detail: `status=${data.status}` };
  } catch (err) {
    return { name: `seed:${slug}`, ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * End-to-end regression check for the `challenge_entry` rate-limit action
 * (migration `20260905140000_rate_limit_challenge_entry.sql` — the check
 * constraint `rate_limit_events_action_known` originally rejected it,
 * breaking `enter_challenge()` in production). Real signed-in call, not a
 * service-role shortcut: `is_service_request()` exempts service-role writes
 * from `challenge_entries_guard` entirely, which would skip the exact
 * `record_rate_limit_event(..., 'challenge_entry')` insert that broke.
 *
 * Provisions a throwaway auth user + audio asset + Wave (service role,
 * bypasses RLS), signs in as that user to get a real JWT, calls
 * `enter_challenge` as them against the seeded "opening-week" challenge, then
 * deletes the throwaway auth user — `profiles`/`waves`/`audio_assets`/
 * `challenge_entries`/`rate_limit_events` all cascade-delete from there.
 */
async function checkEnterChallengeEndToEnd(
  baseUrl: string,
  adminHeaders: Record<string, string>,
  anonKey: string,
): Promise<CheckResult> {
  const name = "e2e:enter_challenge";
  const probeId = crypto.randomUUID();
  const email = `verify-challenges-${probeId}@akinti.internal`;
  const password = `Vv${probeId.replace(/-/g, "")}!`;
  let userId: string | null = null;

  try {
    const challengeRes = await fetch(`${baseUrl}/rest/v1/rpc/get_challenge`, {
      method: "POST",
      headers: { ...adminHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ p_slug: "opening-week" }),
    });
    const challenge = challengeRes.ok ? ((await challengeRes.json()) as { id?: string } | null) : null;
    if (!challenge?.id) {
      return { name, ok: false, detail: '"opening-week" not seeded — run `npx tsx scripts/seed-challenges.ts` first' };
    }

    const userRes = await fetch(`${baseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: { ...adminHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    if (!userRes.ok) {
      return { name, ok: false, detail: `create user failed: HTTP ${userRes.status} ${(await userRes.text()).slice(0, 200)}` };
    }
    const user = (await userRes.json()) as { id: string };
    userId = user.id;

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
      return { name, ok: false, detail: `create audio asset failed: HTTP ${assetRes.status} ${(await assetRes.text()).slice(0, 200)}` };
    }
    const [asset] = (await assetRes.json()) as { id: string }[];

    const waveRes = await fetch(`${baseUrl}/rest/v1/waves`, {
      method: "POST",
      headers: { ...adminHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        creator_id: userId,
        audio_asset_id: asset.id,
        title: "verify-live-challenges probe",
        creation_type: "recorded",
        visibility: "only_me",
      }),
    });
    if (!waveRes.ok) {
      return { name, ok: false, detail: `create wave failed: HTTP ${waveRes.status} ${(await waveRes.text()).slice(0, 200)}` };
    }
    const [wave] = (await waveRes.json()) as { id: string }[];

    const signInRes = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!signInRes.ok) {
      return { name, ok: false, detail: `sign-in failed: HTTP ${signInRes.status} ${(await signInRes.text()).slice(0, 200)}` };
    }
    const session = (await signInRes.json()) as { access_token: string };

    const enterRes = await fetch(`${baseUrl}/rest/v1/rpc/enter_challenge`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_challenge_id: challenge.id, p_wave_id: wave.id }),
    });
    if (!enterRes.ok) {
      const body = await enterRes.text();
      return { name, ok: false, detail: `HTTP ${enterRes.status} ${body.slice(0, 300)}` };
    }
    const entryId = await enterRes.json();

    return { name, ok: true, detail: `entered as throwaway user, entry=${entryId}` };
  } catch (err) {
    return { name, ok: false, detail: err instanceof Error ? err.message : String(err) };
  } finally {
    if (userId) {
      // Cascades: profiles -> waves/audio_assets/challenge_entries/rate_limit_events.
      await fetch(`${baseUrl}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: adminHeaders }).catch(
        () => {},
      );
    }
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const { url, serviceRoleKey, anonKey } = getEnv();

  const headers: Record<string, string> = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  const results: CheckResult[] = [];

  for (const table of CHALLENGE_TABLES) {
    results.push(await checkTable(url, headers, table));
  }

  results.push(await checkRpc(url, headers, "list_challenges", {}));
  results.push(await checkRpc(url, headers, "get_challenge", { p_slug: "does-not-exist" }));
  results.push(await checkRpc(url, headers, "list_challenge_entries", { p_challenge_id: PROBE_ID }));
  results.push(await checkRpc(url, headers, "list_waves_by_hashtag", { p_tag: "does-not-exist" }));
  results.push(await checkRpc(url, headers, "can_enter_challenge", { p_challenge_id: PROBE_ID, p_wave_id: PROBE_ID }));

  results.push(await checkSeededChallenge(url, headers, "opening-week"));
  results.push(await checkSeededChallenge(url, headers, "atisma-call"));

  results.push(await checkEnterChallengeEndToEnd(url, headers, anonKey));

  console.log(`Verifying live Supabase project (challenges): ${url}\n`);
  printTable(results);

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${results.length} checks passed.`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
