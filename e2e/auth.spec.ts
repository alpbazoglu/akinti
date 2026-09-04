import { expect, test } from "@playwright/test";

import { createConfirmedUser, deleteTestUser, type ConfirmedTestUser } from "./helpers/supabaseAdmin";

/**
 * Signup → onboarding → logout → login, end to end, against a real Supabase
 * project (spec §46's critical scenario starts with exactly this). This spec
 * only runs when `E2E_SUPABASE=1` — see `playwright.config.ts`'s
 * `testIgnore` and `docs/TESTING.md`. There is no live backend in most
 * development environments (no `.env.local` keys), so skipping outright
 * (never `test.skip`, per the "no fake completion" rule) rather than letting
 * every assertion fail against an unconfigured app is the honest behavior.
 *
 * The live project has "Confirm email" ON (`mailer_autoconfirm: false`),
 * unlike the local `supabase/config.toml` default this file's comments used
 * to assume — a fresh `/signup` submission does NOT get a session, it gets
 * "check your email" (see the dedicated test below for that path). Every
 * other test here that needs a signed-in account creates it directly through
 * the Supabase admin API (`e2e/helpers/supabaseAdmin.ts`, `email_confirm:
 * true`) and signs in through the real `/login` form — see `docs/TESTING.md`.
 */

async function logIn(page: import("@playwright/test").Page, user: ConfirmedTestUser) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
}

async function completeOnboarding(page: import("@playwright/test").Page, user: ConfirmedTestUser) {
  await expect(page).toHaveURL(/\/onboarding/);
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
}

test.describe("auth", () => {
  test("submitting the real signup form asks an unconfirmed address to check its email", async ({ page }) => {
    // Exercises the actual `/signup` UI form (Server Action `signUp` in
    // `src/app/(auth)/actions.ts`) against the live, confirmation-required
    // project, distinct from the admin-created accounts every other test in
    // this file uses. No `data.session` comes back, so the honest UI
    // response is "check your email" — never a silent fake login.
    const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    // Not `@akinti.test`: Supabase's own signup endpoint (unlike the admin
    // API `createConfirmedUser` uses) validates the address itself and
    // rejects the `.test` TLD outright (`error_code: "email_address_invalid"`,
    // confirmed directly against this project) — `.example` is also an
    // RFC 2606 reserved, non-routable TLD and passes. `deleteAllE2ETestUsers`
    // sweeps this domain too (see `e2e/helpers/supabaseAdmin.ts`).
    const email = `e2e+signupform-${stamp}@akinti.example`;
    const username = `e2esf${stamp}`.slice(0, 24);

    await page.goto("/signup");
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Email").fill(email);
    // Not `{ exact: true }`: the required-field marker is a visually-hidden
    // `*` inside the `<label>`, but Playwright's accessible-name computation
    // for `getByLabel` still folds that `aria-hidden` text node into the
    // name ("Password*"), so an exact match against "Password" never
    // resolves — an unambiguous substring match is correct here regardless
    // (there is exactly one "Password"-labeled control on this form).
    await page.getByLabel("Password").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page.getByText("Check your email")).toBeVisible();
    await expect(page).toHaveURL("/signup");
  });

  test("sign in (after an admin-confirmed signup), complete onboarding, sign out, sign back in", async ({
    page,
  }) => {
    const user = await createConfirmedUser({ tag: "loop" });
    try {
      await logIn(page, user);
      await completeOnboarding(page, user);

      // --- Sign out ------------------------------------------------------------
      await page.getByRole("button", { name: /account menu/i }).click();
      await page.getByRole("menuitem", { name: "Log out" }).click();

      // Home requires a session; signing out immediately makes it protected again.
      await expect(page).toHaveURL(/\/login/);
      // The login page's link to /signup reads "Create an account", not "Sign up".
      await expect(page.getByRole("link", { name: "Create an account" })).toBeVisible();

      // --- Sign back in ---------------------------------------------------------
      await logIn(page, user);
      await expect(page).toHaveURL("/");
      await expect(page.getByRole("button", { name: /account menu/i })).toBeVisible();
    } finally {
      await deleteTestUser(user.id);
    }
  });

  test("an anonymous visitor can browse Explore but Home redirects to login", async ({ page }) => {
    await page.goto("/explore");
    await expect(page).toHaveURL("/explore");

    await page.goto("/");
    await expect(page).toHaveURL(/\/login\?next=%2F/);
  });

  test("a signed-in user visiting /login is redirected home (onboarding first, if incomplete)", async ({
    page,
  }) => {
    const user = await createConfirmedUser({ tag: "loginredirect" });
    try {
      await logIn(page, user);
      // Onboarding is not complete yet, so the post-login redirect chain lands
      // on /onboarding rather than "/" directly (see `updateSession` in
      // `src/lib/supabase/middleware.ts`) — this IS the signed-in redirect
      // behavior under test, just composed with the onboarding gate.
      await expect(page).toHaveURL(/\/onboarding/);

      await page.goto("/login");
      await expect(page).toHaveURL(/\/onboarding/);
    } finally {
      await deleteTestUser(user.id);
    }
  });
});
