/**
 * AKINTI live backend verification.
 *
 * Smoke-checks a real Supabase project over its REST/Storage HTTP APIs
 * (never a direct Postgres connection) using the service-role key, so this
 * can run against any deployed project without a DB password:
 *
 *  - Core tables exist and are queryable: profiles, waves, audio_assets,
 *    notifications, messages.
 *  - Storage buckets `audio` (private) and `avatars` (public) exist, with
 *    `--create-buckets` to create them if missing (mirrors migration 13 —
 *    see supabase/migrations/20260903121300_storage.sql — so this is a
 *    fallback, not a replacement for that migration).
 *  - The RPCs `can_view_wave` and `rising_creators` are callable.
 *
 * Prints a pass/fail table and exits non-zero if anything fails. This is a
 * post-deploy check, not a substitute for the automated test suite or the
 * smoke checklist in docs/DEPLOYMENT.md.
 *
 * Run with:
 *   npm run verify:live
 *   npx tsx scripts/verify-live.ts
 *   npx tsx scripts/verify-live.ts --create-buckets   (also create audio/avatars if missing)
 *
 * Env (see .env.example): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/* ------------------------------------------------------------------------ */
/* Minimal .env loader (same approach as scripts/worker.ts)                 */
/* ------------------------------------------------------------------------ */

function loadEnvFile(): void {
  for (const name of [".env.local", ".env"]) {
    const filePath = path.resolve(process.cwd(), name);
    if (!existsSync(filePath)) {
      continue;
    }
    const contents = readFileSync(filePath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const eq = trimmed.indexOf("=");
      if (eq === -1) {
        continue;
      }
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

/* ------------------------------------------------------------------------ */
/* Config — mirrors src/lib/supabase/config.ts                              */
/* ------------------------------------------------------------------------ */

const CORE_TABLES = ["profiles", "waves", "audio_assets", "notifications", "messages"] as const;

const AUDIO_BUCKET = "audio";
const AVATAR_BUCKET = "avatars";
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
];
const ALLOWED_AVATAR_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif"];

/** A wave id that certainly does not exist — enough to confirm the RPC is callable. */
const PROBE_WAVE_ID = "00000000-0000-0000-0000-000000000000";

/* ------------------------------------------------------------------------ */
/* Env                                                                       */
/* ------------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------------ */
/* Result reporting                                                         */
/* ------------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------------ */
/* Checks                                                                    */
/* ------------------------------------------------------------------------ */

async function checkTable(
  baseUrl: string,
  headers: Record<string, string>,
  table: string,
): Promise<CheckResult> {
  try {
    const res = await fetch(`${baseUrl}/rest/v1/${table}?select=*&limit=1`, {
      method: "GET",
      headers,
    });
    if (!res.ok) {
      const body = await res.text();
      return { name: `table:${table}`, ok: false, detail: `HTTP ${res.status} ${body.slice(0, 200)}` };
    }
    return { name: `table:${table}`, ok: true, detail: "reachable" };
  } catch (err) {
    return { name: `table:${table}`, ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

interface BucketInfo {
  id: string;
  name: string;
  public: boolean;
}

async function listBuckets(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<BucketInfo[]> {
  const res = await fetch(`${baseUrl}/storage/v1/bucket`, { method: "GET", headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  return (await res.json()) as BucketInfo[];
}

async function createBucket(
  baseUrl: string,
  headers: Record<string, string>,
  bucket: {
    id: string;
    public: boolean;
    file_size_limit: number;
    allowed_mime_types: string[];
  },
): Promise<void> {
  const res = await fetch(`${baseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: bucket.id,
      name: bucket.id,
      public: bucket.public,
      file_size_limit: bucket.file_size_limit,
      allowed_mime_types: bucket.allowed_mime_types,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} ${body.slice(0, 200)}`);
  }
}

async function checkBucket(
  baseUrl: string,
  headers: Record<string, string>,
  buckets: BucketInfo[],
  spec: { id: string; expectPublic: boolean; fileSizeLimit: number; mimeTypes: string[] },
  createIfMissing: boolean,
): Promise<CheckResult> {
  const name = `bucket:${spec.id}`;
  const bucket = buckets.find((b) => b.id === spec.id);

  if (!bucket && createIfMissing) {
    try {
      await createBucket(baseUrl, headers, {
        id: spec.id,
        public: spec.expectPublic,
        file_size_limit: spec.fileSizeLimit,
        allowed_mime_types: spec.mimeTypes,
      });
      return { name, ok: true, detail: "created" };
    } catch (err) {
      return { name, ok: false, detail: `create failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  if (!bucket) {
    return {
      name,
      ok: false,
      detail: "missing (pass --create-buckets to create it, or re-run migration 13)",
    };
  }

  if (bucket.public !== spec.expectPublic) {
    return {
      name,
      ok: false,
      detail: `exists but public=${bucket.public}, expected public=${spec.expectPublic}`,
    };
  }

  return { name, ok: true, detail: `exists, public=${bucket.public}` };
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

/* ------------------------------------------------------------------------ */
/* Main                                                                      */
/* ------------------------------------------------------------------------ */

async function main(): Promise<void> {
  loadEnvFile();
  const createBuckets = process.argv.includes("--create-buckets");
  const { url, serviceRoleKey } = getEnv();

  const headers: Record<string, string> = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  const results: CheckResult[] = [];

  for (const table of CORE_TABLES) {
    results.push(await checkTable(url, headers, table));
  }

  try {
    const buckets = await listBuckets(url, headers);
    results.push(
      await checkBucket(
        url,
        headers,
        buckets,
        {
          id: AUDIO_BUCKET,
          expectPublic: false,
          fileSizeLimit: MAX_AUDIO_BYTES,
          mimeTypes: ALLOWED_AUDIO_MIME_TYPES,
        },
        createBuckets,
      ),
    );
    results.push(
      await checkBucket(
        url,
        headers,
        buckets,
        {
          id: AVATAR_BUCKET,
          expectPublic: true,
          fileSizeLimit: MAX_AVATAR_BYTES,
          mimeTypes: ALLOWED_AVATAR_MIME_TYPES,
        },
        createBuckets,
      ),
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ name: `bucket:${AUDIO_BUCKET}`, ok: false, detail });
    results.push({ name: `bucket:${AVATAR_BUCKET}`, ok: false, detail });
  }

  results.push(await checkRpc(url, headers, "can_view_wave", { p_wave_id: PROBE_WAVE_ID }));
  results.push(await checkRpc(url, headers, "rising_creators", {}));

  console.log(`Verifying live Supabase project: ${url}\n`);
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
