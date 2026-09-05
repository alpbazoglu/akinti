import { expect, test } from "@playwright/test";

import { createConfirmedUser, deleteTestUser, type ConfirmedTestUser } from "./helpers/supabaseAdmin";
import {
  logIn,
  logOut,
  onboardWithLogin,
  publishOriginalWave,
  signUpAndOnboard,
} from "./helpers/flows";

/**
 * End-to-end coverage of the Duet lifecycle (spec §15, §46): request ->
 * accept -> record against the original -> publish -> the new Duet Wave
 * exists, plus the two denial scenarios spec §46 calls out by name ("User A
 * disables Duets", "User A blocks User B").
 *
 * Like `e2e/auth.spec.ts`, this needs a real Supabase project it can create
 * accounts, Waves and Duet Requests against — there is no `.env.local` in
 * most development environments here, so this spec is excluded from the
 * Playwright run entirely via `testIgnore` in `playwright.config.ts` unless
 * `E2E_SUPABASE=1` is set, never via `test.skip` (which would report as a
 * passing, exercised test — see `docs/TESTING.md`). Recording needs a real
 * microphone stream Playwright can't provide by default, so this file's
 * `test.use()` below launches Chromium with `--use-fake-device-for-media-stream`
 * (a synthetic sine-wave input) and `--use-fake-ui-for-media-stream` (skips
 * the native permission prompt) — no physical hardware required. Run with:
 *
 *   E2E_SUPABASE=1 npm run e2e -- duet.spec.ts
 *
 * These tests do not wait for `scripts/worker.ts` to actually mix the
 * Duet's audio — ffmpeg may not be installed wherever this runs, and the
 * architecture (`docs/AUDIO_ARCHITECTURE.md`) deliberately allows publishing
 * while an asset is still `pending`/`processing`. What's verified is the
 * real, server-authoritative lifecycle: the request, the accept, the
 * recording UI actually producing a take, and the publish action succeeding
 * (or being correctly denied) — never a faked "it worked."
 *
 * The live project requires email confirmation (`mailer_autoconfirm:
 * false`), so accounts here are created through the Supabase admin API
 * (`e2e/helpers/supabaseAdmin.ts`, `email_confirm: true`) and signed in
 * through the real `/login` form, rather than through `/signup` — see
 * `docs/TESTING.md`.
 */

test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

test.describe("duet", () => {
  test("request -> accept -> record -> publish produces a linked Duet Wave", async ({ page }) => {
    // Two full sign-up-and-onboard passes, a login/logout cycle per user, and
    // the mode -> capture (with a real 3-beat count-in) -> review -> enhance
    // -> details -> publish chain add up past the 30s default comfortably —
    // `e2e/critical-journey.spec.ts`'s equivalent (bigger) flow sets its own
    // budget the same way.
    test.setTimeout(90_000);

    let userA: ConfirmedTestUser | undefined;
    let userB: ConfirmedTestUser | undefined;
    try {
      // --- User A publishes the original Wave -----------------------------
      userA = await signUpAndOnboard(page, "a1");
      const originalWaveId = await publishOriginalWave(page, `Original by ${userA.username}`);
      await logOut(page);

      // --- User B requests a Duet on it ------------------------------------
      userB = await signUpAndOnboard(page, "b1");
      await page.goto(`/w/${originalWaveId}/duet`);
      await page.getByLabel("Add a message (optional)").fill("Would love to duet on this!");
      // Two "Request a Duet" buttons exist on this page: the (disabled,
      // `canRequestDuet: false`) preview card's own duet button, and the
      // form's real submit button — scope to the form to disambiguate.
      await page.locator("form").getByRole("button", { name: "Request a Duet" }).click();
      await expect(page).toHaveURL(/\/duets/);
      await logOut(page);

      // --- User A accepts it -------------------------------------------------
      await logIn(page, userA);
      await page.goto("/duets");
      // "Received" is the default tab.
      // DuetRequestsView renders the requester's bare username, no "@" prefix.
      await expect(page.getByText(userB.username).first()).toBeVisible();
      await page.getByRole("button", { name: "Accept" }).click();
      await expect(page.getByRole("button", { name: "Accept" })).not.toBeVisible();
      await logOut(page);

      // --- User B records their contribution and publishes -------------------
      await logIn(page, userB);
      await page.goto("/duets");
      await page.getByRole("tab", { name: "Sent" }).click();
      await page.getByRole("link", { name: "Record your Duet" }).click();
      await expect(page).toHaveURL(/\/w\/[^/]+\/duet\/record\?request=/);

      // The original must actually load before the mode picker's "Continue"
      // is enabled (spec §38 "original unavailable" — DuetRecorder.tsx gates
      // on this). "Layer" is the pre-selected Duet mode (DuetModePicker's
      // default) and is the right one for this test.
      const modeContinue = page.getByRole("button", { name: "Continue" });
      await expect(modeContinue).toBeEnabled({ timeout: 15_000 });
      await modeContinue.click();

      // RecordStage (`src/components/create/RecordStage.tsx`, shared with
      // `/create`) is a single hold-or-tap key: a tap arms the mic, a second
      // tap starts a 3-beat count-in (`countdown` record preference defaults
      // to true) before capture actually begins.
      await page.getByRole("button", { name: "Arm the microphone" }).click();
      await page.getByRole("button", { name: "Start recording" }).click();

      // Let the count-in finish and the fake mic device actually capture
      // something before stopping.
      const stopButton = page.getByRole("button", { name: "Stop recording" });
      await expect(stopButton).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(1500);
      await stopButton.click();

      // Layer mode goes capture -> review (trim) -> enhance -> details
      // (DuetRecorder.tsx's stage comment) — two more "Continue"s, the same
      // shared `ReviewStage`/`EnhanceStage` components `/create` uses, before
      // the Title field appears.
      await page.getByRole("button", { name: "Continue" }).click(); // review -> enhance
      await page.getByRole("button", { name: "Continue" }).click(); // enhance -> details

      await expect(page.getByLabel("Title")).toBeVisible({ timeout: 10_000 });
      await page.getByLabel("Title").fill(`Duet by ${userB.username}`);
      await page.getByRole("button", { name: "Publish Duet" }).click();

      await expect(page).toHaveURL(/\/w\/[^/]+$/, { timeout: 20_000 });
      const duetWaveId = /\/w\/([^/]+)$/.exec(new URL(page.url()).pathname)?.[1];
      expect(duetWaveId).toBeTruthy();
      expect(duetWaveId).not.toBe(originalWaveId);

      // --- The original links to the new Duet -----------------------------
      await page.goto(`/w/${originalWaveId}`);
      await expect(page.getByText(`Duet by ${userB.username}`)).toBeVisible();
    } finally {
      if (userA) await deleteTestUser(userA.id);
      if (userB) await deleteTestUser(userB.id);
    }
  });

  test("duets disabled on a Wave -> request denied", async ({ page }) => {
    let userA: ConfirmedTestUser | undefined;
    let userB: ConfirmedTestUser | undefined;
    try {
      userA = await signUpAndOnboard(page, "a2");
      const waveId = await publishOriginalWave(page, `No duets ${userA.username}`, { duetPermission: "nobody" });
      await logOut(page);

      userB = await signUpAndOnboard(page, "b2");
      await page.goto(`/w/${waveId}/duet`);

      // `canRequestDuet()` (server-side, `src/lib/db/duetRequests.ts`) denies
      // before the request form ever renders — the page itself is the
      // enforcement surface here, not just a hidden button (spec §15).
      await expect(page.getByText("You can't request a Duet on this Wave")).toBeVisible();
      await expect(page.getByLabel("Add a message (optional)")).not.toBeVisible();
    } finally {
      if (userA) await deleteTestUser(userA.id);
      if (userB) await deleteTestUser(userB.id);
    }
  });

  test("blocked user -> request denied", async ({ page }) => {
    let userA: ConfirmedTestUser | undefined;
    let userB: ConfirmedTestUser | undefined;
    try {
      // User B's account (and profile row, via `handle_new_user`) must exist
      // before User A can navigate to `/u/<username>` to block them — create
      // it now but don't log User B in yet, so User A's session isn't disturbed.
      userB = await createConfirmedUser({ tag: "duet-b3" });

      userA = await signUpAndOnboard(page, "a3");
      const waveId = await publishOriginalWave(page, `Blockable ${userA.username}`);
      // User A blocks User B from A's own profile page.
      await page.goto(`/u/${userB.username}`);
      await page.getByRole("button", { name: "More actions" }).click();
      await page.getByRole("menuitem", { name: "Block" }).click();
      await expect(page.getByRole("menuitem", { name: "Block" })).not.toBeVisible();
      await logOut(page);

      await onboardWithLogin(page, userB);
      await page.goto(`/w/${waveId}/duet`);

      // A blocked pair can't see EACH OTHER'S content at all (`can_view_wave`
      // returns false whenever `is_blocked_between()` is true, regardless of
      // the Wave's own visibility setting — see migration
      // `20260903121000_authorization_functions.sql`) — not just "duets
      // disabled." `getWaveById` comes back null for User B here the exact
      // same way it would for a genuinely deleted Wave (spec's "existence
      // itself is not information visible to an unauthorized caller" rule,
      // `docs/TESTING.md`), so `/w/[id]/duet` renders its generic
      // unavailable state rather than the duet-specific denial message.
      await expect(page.getByText("This wave isn't available")).toBeVisible();
      await expect(page.getByLabel("Add a message (optional)")).not.toBeVisible();
    } finally {
      if (userA) await deleteTestUser(userA.id);
      if (userB) await deleteTestUser(userB.id);
    }
  });
});
