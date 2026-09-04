import { deleteAllE2ETestUsers } from "./supabaseAdmin";

/**
 * Playwright `globalTeardown` (wired in `playwright.config.ts`, only when
 * `E2E_SUPABASE=1`): sweeps any `e2e+*@akinti.test` accounts left behind by
 * this run's specs, so a failed assertion mid-test never leaks a throwaway
 * account into the live project indefinitely. Individual specs already
 * delete their own users as they finish; this is the safety net.
 */
export default async function globalTeardown(): Promise<void> {
  try {
    const deleted = await deleteAllE2ETestUsers();
    if (deleted > 0) {
      console.log(`[e2e teardown] swept ${deleted} leftover e2e test user(s)`);
    }
  } catch (err) {
    console.warn("[e2e teardown] failed to sweep test users:", err instanceof Error ? err.message : err);
  }
}
