import { expect, test } from "@playwright/test";

/**
 * Signup → onboarding → logout → login, end to end, against a real Supabase
 * project (spec §46's critical scenario starts with exactly this). This spec
 * only runs when `E2E_SUPABASE=1` — see `playwright.config.ts`'s
 * `testIgnore` and `docs/TESTING.md`. There is no live backend in most
 * development environments (no `.env.local` keys), so skipping outright
 * (never `test.skip`, per the "no fake completion" rule) rather than letting
 * every assertion fail against an unconfigured app is the honest behavior.
 */

function uniqueUser() {
  const stamp = Date.now().toString(36);
  return {
    email: `e2e_${stamp}@example.com`,
    username: `e2e_${stamp}`,
    password: "correct-horse-battery-staple",
  };
}

test.describe("auth", () => {
  test("sign up, complete onboarding, sign out, sign back in", async ({ page }) => {
    const user = uniqueUser();

    // --- Sign up -----------------------------------------------------------
    await page.goto("/signup");
    await page.getByLabel("Username").fill(user.username);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Sign up" }).click();

    // Local Supabase config disables email confirmation, so signup lands a
    // session immediately and the route protection matrix sends a
    // not-yet-onboarded user straight to onboarding.
    await expect(page).toHaveURL(/\/onboarding/);

    // --- Onboarding: walk every step, exercising Continue on each ----------
    await expect(page.getByLabel("Username")).toHaveValue(user.username);
    await page.getByRole("button", { name: "Continue" }).click(); // step 1 -> 2 (interests)

    await page.getByRole("button", { name: "Singing" }).click();
    await page.getByRole("button", { name: "Continue" }).click(); // step 2 -> 3 (creators)

    await page.getByRole("button", { name: "Continue" }).click(); // step 3 -> 4 (first Wave)

    await page.getByRole("button", { name: /Skip, take me to Home/i }).click();

    // Onboarding is genuinely skippable (spec §8) but always finishes, so the
    // very next protected-route visit never bounces back to /onboarding.
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("button", { name: /account menu/i })).toBeVisible();

    // --- Sign out ------------------------------------------------------------
    await page.getByRole("button", { name: /account menu/i }).click();
    await page.getByRole("menuitem", { name: "Log out" }).click();

    // Home requires a session; signing out immediately makes it protected again.
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();

    // --- Sign back in ---------------------------------------------------------
    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("button", { name: /account menu/i })).toBeVisible();
  });

  test("an anonymous visitor can browse Explore but Home redirects to login", async ({ page }) => {
    await page.goto("/explore");
    await expect(page).toHaveURL("/explore");

    await page.goto("/");
    await expect(page).toHaveURL(/\/login\?next=%2F/);
  });

  test("a signed-in user visiting /login is redirected home", async ({ page }) => {
    const user = uniqueUser();

    await page.goto("/signup");
    await page.getByLabel("Username").fill(user.username);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/onboarding/);

    await page.goto("/login");
    await expect(page).toHaveURL("/");
  });
});
