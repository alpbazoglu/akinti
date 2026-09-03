import { defineConfig, devices } from "@playwright/test";

/**
 * Specs that need a real, signed-up-against Supabase project. There is no
 * `.env.local` in most development environments (see `docs/TESTING.md`), so
 * these are excluded from the run entirely rather than executed and left to
 * fail on every assertion — and never via `test.skip`, which would look like
 * a passing, exercised test in CI output.
 */
const BACKEND_SPECS = ["auth.spec.ts"];

export default defineConfig({
  testDir: "./e2e",
  testIgnore: process.env.E2E_SUPABASE ? undefined : BACKEND_SPECS,
  fullyParallel: true,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
