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

function getEnv(): { url: string; serviceRoleKey: string } {
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

async function main(): Promise<void> {
  loadEnvFile();
  const { url, serviceRoleKey } = getEnv();

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
