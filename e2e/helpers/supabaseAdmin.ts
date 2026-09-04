/**
 * Admin-API helpers for `e2e/*.spec.ts` running against a real, live
 * Supabase project (`E2E_SUPABASE=1` — see `playwright.config.ts` and
 * `docs/TESTING.md`).
 *
 * The live project has "Confirm email" ON (`mailer_autoconfirm: false`, per
 * `GET /auth/v1/settings`), which normally blocks a fresh signup from
 * getting a session until the address is confirmed — there is no test
 * inbox to click a link from. Rather than changing the live project's auth
 * settings (out of scope for this stage) or faking a signed-in state, specs
 * create their throwaway accounts directly through the Supabase Auth admin
 * API (`POST /auth/v1/admin/users` with `email_confirm: true`), which marks
 * the address confirmed at creation time exactly the way a real "click the
 * link in your inbox" flow would — then sign in through the real UI
 * (`/login`), so everything downstream of authentication (session cookies,
 * onboarding redirect, RLS-backed queries) is still exercised end to end.
 *
 * Every test user created this way uses an address of the form
 * `e2e+<tag>-<stamp>@akinti.test` so `deleteAllE2ETestUsers` can safely sweep
 * every leftover account at the end of a run without touching real users.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/* ------------------------------------------------------------------------ */
/* Minimal .env loader (same approach as scripts/worker.ts /                */
/* scripts/verify-live.ts — Playwright's Node process doesn't load          */
/* .env.local on its own the way `next dev` does).                          */
/* ------------------------------------------------------------------------ */

let envLoaded = false;

function loadEnvFile(): void {
  if (envLoaded) return;
  envLoaded = true;
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

function requireEnv(name: string): string {
  loadEnvFile();
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required to run e2e specs against a live Supabase project ` +
        `(set it in .env.local, or set E2E_SUPABASE=0 to skip these specs).`,
    );
  }
  return value;
}

function supabaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
}

function adminHeaders(): Record<string, string> {
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

/**
 * Every e2e-created account's email matches this — the sweep in
 * `deleteAllE2ETestUsers` relies on it. `.test` is what `createConfirmedUser`
 * uses; `.example` is used by the one spec (`e2e/auth.spec.ts`'s real-signup-
 * form test) that goes through Supabase's own `/auth/v1/signup` endpoint,
 * which validates the address itself and rejects `.test` outright — both are
 * RFC 2606 reserved, non-routable TLDs.
 */
const TEST_EMAIL_PATTERN = /^e2e\+.+@akinti\.(test|example)$/i;

export interface ConfirmedTestUser {
  readonly id: string;
  readonly email: string;
  readonly username: string;
  readonly password: string;
}

/**
 * Creates an already-email-confirmed Supabase auth user via the admin API.
 * `handle_new_user` (migration `20260903120200_identity_and_social_graph.sql`)
 * fires on the resulting `auth.users` insert exactly as it does for a real
 * signup, creating the matching `profiles` row from `user_metadata.username`
 * — so everything downstream (onboarding pre-fill, RLS) sees a normal
 * account. This only creates the account server-side; call the UI's
 * `/login` form afterwards (see `logIn` in the specs) to actually establish
 * a browser session.
 */
export async function createConfirmedUser(
  overrides: { tag?: string; username?: string; password?: string } = {},
): Promise<ConfirmedTestUser> {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tag = overrides.tag ?? "user";
  const email = `e2e+${tag}-${stamp}@akinti.test`;
  const username = (overrides.username ?? `e2e${tag}${stamp}`).replace(/[^a-z0-9_]/gi, "").slice(0, 24);
  const password = overrides.password ?? "correct-horse-battery-staple";

  const res = await fetch(`${supabaseUrl()}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { username },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`failed to create confirmed test user ${email}: HTTP ${res.status} ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as { id: string };
  return { id: data.id, email, username, password };
}

/** Permanently deletes one test user by id. Best-effort — a cleanup failure never fails the test itself. */
export async function deleteTestUser(userId: string): Promise<void> {
  try {
    const res = await fetch(`${supabaseUrl()}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    if (!res.ok && res.status !== 404) {
      const body = await res.text();
      console.warn(`[e2e cleanup] failed to delete test user ${userId}: HTTP ${res.status} ${body.slice(0, 300)}`);
    }
  } catch (err) {
    console.warn(`[e2e cleanup] failed to delete test user ${userId}:`, err instanceof Error ? err.message : err);
  }
}

/**
 * Reads `waves.audio_asset_id` for `waveId` directly via the REST API with
 * the service-role key (bypasses RLS). Used only by the private-content e2e
 * test to hit `GET /api/audio/[assetId]/url` for an asset the test itself
 * created but User B's browser session can never discover through the UI
 * (the whole point of the RLS assertion) — the test needs the id out of
 * band to probe the route directly.
 */
export async function getWaveAudioAssetId(waveId: string): Promise<string> {
  const res = await fetch(`${supabaseUrl()}/rest/v1/waves?id=eq.${waveId}&select=audio_asset_id`, {
    headers: adminHeaders(),
  });
  if (!res.ok) {
    throw new Error(`failed to look up audio_asset_id for wave ${waveId}: HTTP ${res.status}`);
  }
  const rows = (await res.json()) as { audio_asset_id: string }[];
  if (rows.length === 0) {
    throw new Error(`wave ${waveId} not found`);
  }
  return rows[0].audio_asset_id;
}

/**
 * End-of-run safety net: sweeps every auth user whose email matches the e2e
 * pattern (`e2e+<tag>-<stamp>@akinti.test`), in case an individual test's
 * own cleanup didn't run (e.g. a failed assertion mid-test). Paginates
 * through `GET /auth/v1/admin/users` since the admin API caps page size.
 * Returns the number of accounts deleted.
 */
export async function deleteAllE2ETestUsers(): Promise<number> {
  const perPage = 200;
  let page = 1;
  let deleted = 0;

  for (;;) {
    const res = await fetch(`${supabaseUrl()}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      headers: adminHeaders(),
    });
    if (!res.ok) {
      console.warn(`[e2e cleanup] failed to list users (page ${page}): HTTP ${res.status}`);
      break;
    }
    const body = (await res.json()) as { users?: { id: string; email?: string }[] };
    const users = body.users ?? [];
    if (users.length === 0) {
      break;
    }
    for (const user of users) {
      if (user.email && TEST_EMAIL_PATTERN.test(user.email)) {
        await deleteTestUser(user.id);
        deleted += 1;
      }
    }
    if (users.length < perPage) {
      break;
    }
    page += 1;
  }

  return deleted;
}
