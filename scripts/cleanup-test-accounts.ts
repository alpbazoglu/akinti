/**
 * fixDesktop P2-4 (docs/qa/desktop/REPORT.md #5, "live test-data hygiene" —
 * already flagged in HANDOFF.md): sweeps leftover throwaway QA/e2e accounts
 * off the live Supabase project. Every prior QA pass's own `finally` block
 * only ever cleaned up the accounts *it* created; passes that crashed, or
 * deliberately left an account behind for the next pass to inspect (like
 * `docs/qa/desktop/REPORT.md`'s own `e2e+qadeskA-*`/`e2e+qadeskB-*`), leak
 * indefinitely otherwise.
 *
 * Matches ONLY the documented test-account patterns (`docs/TESTING.md`
 * "Every account these specs create uses an email of the form..."):
 *   - `e2e+<tag>@akinti.test` / `e2e+<tag>@akinti.example`
 *   - `qa<anything>@akinti.test`
 * Case-insensitive (Supabase itself lowercases stored emails). Every other
 * account — the founder's own, a curated seed account like
 * `curated@akinti.internal`, anything on a different domain — is never
 * touched, matched or not: this script does not even list them.
 *
 * Deletion mirrors `scripts/verify-live-delete.ts`'s cascade-safe path
 * exactly: clear both storage buckets under the account's id first (the
 * `on delete cascade`/`on delete set null` chain on every `waves`/
 * `audio_assets`/etc. row is DB-side already, per migration
 * `20260905180000_delete_user_cascade.sql`; only Storage objects need an
 * explicit sweep), then `DELETE /auth/v1/admin/users/:id`.
 *
 * Every matching email is printed BEFORE anything is deleted, in both modes.
 *
 * Usage:
 *   npx tsx --env-file-if-exists=.env.local scripts/cleanup-test-accounts.ts --dry-run
 *   npx tsx --env-file-if-exists=.env.local scripts/cleanup-test-accounts.ts
 *   npm run cleanup:test-accounts -- --dry-run
 *
 * Env (see .env.example): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/* ------------------------------------------------------------------------ */
/* Minimal .env loader (same approach as scripts/verify-live-delete.ts)     */
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

/** `docs/TESTING.md`'s documented test-account shapes, and the brief's `qa*@akinti.test`. */
const TEST_ACCOUNT_PATTERNS: readonly RegExp[] = [
  /^e2e\+[^@]+@akinti\.(test|example)$/i,
  /^qa[^@]*@akinti\.test$/i,
];

function isTestAccount(email: string | null | undefined): boolean {
  if (!email) return false;
  return TEST_ACCOUNT_PATTERNS.some((pattern) => pattern.test(email));
}

interface AuthUser {
  id: string;
  email?: string;
  created_at?: string;
}

async function listAllUsers(baseUrl: string, headers: Record<string, string>): Promise<AuthUser[]> {
  const all: AuthUser[] = [];
  let page = 1;
  for (;;) {
    const res = await fetch(`${baseUrl}/auth/v1/admin/users?page=${page}&per_page=1000`, { headers });
    if (!res.ok) {
      throw new Error(`list users failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    }
    const body = (await res.json()) as { users?: AuthUser[] };
    const users = body.users ?? [];
    all.push(...users);
    if (users.length < 1000) break;
    page += 1;
  }
  return all;
}

interface StorageEntry {
  name: string;
  id: string | null;
}

/** Same algorithm as `deleteUserStorageObjects`/`scripts/verify-live-delete.ts`. */
async function listObjectPathsRecursive(
  baseUrl: string,
  headers: Record<string, string>,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = [];
  const limit = 100;
  let offset = 0;

  for (;;) {
    const res = await fetch(`${baseUrl}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit, offset }),
    });
    if (!res.ok) {
      throw new Error(`list ${bucket}/${prefix} failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    }
    const data = (await res.json()) as StorageEntry[];
    if (data.length === 0) break;

    for (const entry of data) {
      const entryPath = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        paths.push(...(await listObjectPathsRecursive(baseUrl, headers, bucket, entryPath)));
      } else {
        paths.push(entryPath);
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return paths;
}

async function deleteUserStorageObjects(
  baseUrl: string,
  headers: Record<string, string>,
  bucket: string,
  userId: string,
): Promise<void> {
  const paths = await listObjectPathsRecursive(baseUrl, headers, bucket, userId);
  const batchSize = 100;
  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize);
    const res = await fetch(`${baseUrl}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: batch }),
    });
    if (!res.ok) {
      throw new Error(`remove ${bucket} objects failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    }
  }
}

async function deleteAccount(
  baseUrl: string,
  headers: Record<string, string>,
  userId: string,
): Promise<void> {
  await deleteUserStorageObjects(baseUrl, headers, "audio", userId);
  await deleteUserStorageObjects(baseUrl, headers, "avatars", userId);
  const res = await fetch(`${baseUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) {
    throw new Error(`deleteUser ${userId} failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const { url, serviceRoleKey } = getEnv();
  const dryRun = process.argv.includes("--dry-run");

  const adminHeaders: Record<string, string> = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  const users = await listAllUsers(url, adminHeaders);
  const matches = users.filter((u) => isTestAccount(u.email));

  console.log(`Scanned ${users.length} account(s) on ${url}.`);
  console.log(`${matches.length} match the test-account patterns (e2e+*@akinti.test|example, qa*@akinti.test):\n`);
  for (const match of matches) {
    console.log(`  ${match.email}  (${match.id}, created ${match.created_at ?? "unknown"})`);
  }

  if (matches.length === 0) {
    console.log("\nNothing to delete.");
    return;
  }

  if (dryRun) {
    console.log(`\n--dry-run: would delete ${matches.length} account(s) above. Nothing was changed.`);
    return;
  }

  console.log("");
  let deleted = 0;
  const failures: { email: string; error: string }[] = [];
  for (const match of matches) {
    try {
      await deleteAccount(url, adminHeaders, match.id);
      deleted += 1;
      console.log(`  deleted ${match.email}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ email: match.email ?? match.id, error: message });
      console.error(`  FAILED  ${match.email}: ${message}`);
    }
  }

  console.log(`\nDeleted ${deleted}/${matches.length} test account(s).`);
  if (failures.length > 0) {
    console.error(`${failures.length} failure(s):`);
    for (const failure of failures) console.error(`  ${failure.email}: ${failure.error}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exitCode = 1;
});
