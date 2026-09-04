import { defineConfig, devices } from "@playwright/test";

/**
 * Specs that need a real, signed-up-against Supabase project. There is no
 * `.env.local` in most development environments (see `docs/TESTING.md`), so
 * these are excluded from the run entirely rather than executed and left to
 * fail on every assertion — and never via `test.skip`, which would look like
 * a passing, exercised test in CI output.
 */
const BACKEND_SPECS = ["auth.spec.ts", "duet.spec.ts", "critical-journey.spec.ts"];

export default defineConfig({
  testDir: "./e2e",
  testIgnore: process.env.E2E_SUPABASE ? undefined : BACKEND_SPECS,
  // Sweeps leftover `e2e+*@akinti.test` accounts from the live project after
  // the run — see `e2e/helpers/globalTeardown.ts`. Only meaningful (and only
  // wired up) when the backend specs actually ran.
  globalTeardown: process.env.E2E_SUPABASE ? "./e2e/helpers/globalTeardown.ts" : undefined,
  fullyParallel: true,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3333",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Next 16 refuses to start a second `next dev` server for the same
    // project directory at all ("Another next dev server is already
    // running"), regardless of port — there is exactly one dev server per
    // checkout, not per port. So rather than spawning our own, this always
    // reuses whatever is already up on 3333 (see docs/TESTING.md — do not
    // kill or restart that server; a person may be browsing it).
    command: "npm run dev -- -p 3333",
    url: "http://localhost:3333",
    reuseExistingServer: true,
  },
});
