import { expect, test } from "@playwright/test";

import {
  createConfirmedUser,
  deleteTestUser,
  getWaveAudioAssetId,
  type ConfirmedTestUser,
} from "./helpers/supabaseAdmin";
import {
  logIn,
  logOut,
  onboardWithLogin,
  publishOriginalWave,
  runWorkerOnce,
  signUpAndOnboard,
} from "./helpers/flows";

/**
 * The spec §46 critical end-to-end scenario, run against a real Supabase
 * project (`E2E_SUPABASE=1` — see `playwright.config.ts`, `docs/TESTING.md`).
 * `e2e/duet.spec.ts` covers the Duet request/accept/record/publish lifecycle
 * and its two permission-denial cases in isolation, but never waits for
 * `scripts/worker.ts` to actually run. This file adds what §46 additionally
 * asks for: Explore discovery, a real signed-playback-URL round trip,
 * comments/saves/shares, an actual worker pass (`npm run worker:once`)
 * between publish and discovery *and* between the Duet publish and the
 * lineage check, plus the private-content and block scenarios.
 *
 * Recording needs a real microphone stream Playwright can't provide by
 * default — like `duet.spec.ts`, Chromium is launched with
 * `--use-fake-device-for-media-stream` / `--use-fake-ui-for-media-stream`
 * (synthetic input, no hardware or OS permission prompt needed) for the one
 * test in this file that records a Duet contribution; the original Wave
 * itself is published via Upload (`e2e/fixtures/tone.wav`), matching the
 * stage brief.
 */

test.use({
  permissions: ["microphone", "clipboard-read", "clipboard-write"],
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

test.describe("critical journey (spec §46)", () => {
  test("A publishes a Wave, worker processes it, B discovers/plays/comments/saves/shares/duets it, worker mixes the Duet, original shows it in lineage", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    let userA: ConfirmedTestUser | undefined;
    let userB: ConfirmedTestUser | undefined;
    try {
      // --- User A signs up, onboards, uploads and publishes a Wave --------
      userA = await signUpAndOnboard(page, "journey-a");
      const waveTitle = `Journey Wave ${Date.now().toString(36)}`;
      const originalWaveId = await publishOriginalWave(page, waveTitle);

      // --- Worker processes the upload (spec §19/§46: a real ffmpeg pass) -
      runWorkerOnce("after original publish");

      await logOut(page);

      // --- User B discovers it on Explore -> New (most-recent-first, so a
      // freshly published Wave is guaranteed to show up, unlike Trending) --
      userB = await signUpAndOnboard(page, "journey-b");
      await page.goto("/explore");
      await page.getByRole("tab", { name: "New" }).click();

      const waveCard = page.locator("article", { hasText: waveTitle });
      await expect(waveCard).toBeVisible({ timeout: 20_000 });

      // --- Plays it: the transport click resolves a signed URL through
      // GET /api/audio/[assetId]/url — assert that round trip directly.
      // Generous timeout: this is the first hit of this route in the dev
      // server's Turbopack session, which compiles routes lazily on first
      // request (confirmed: this specific step timed out at 15s once, then
      // passed comfortably once the route was warm) ----------------------
      const playResponsePromise = page.waitForResponse(
        (response) => /\/api\/audio\/[^/]+\/url$/.test(new URL(response.url()).pathname),
        { timeout: 45_000 },
      );
      await waveCard.getByRole("button", { name: /^Play/ }).click();
      const playResponse = await playResponsePromise;
      expect(playResponse.status()).toBe(200);
      const playBody = (await playResponse.json()) as { url?: string };
      expect(playBody.url).toBeTruthy();

      // --- Comments, saves, shares (from the Wave detail page) ------------
      await page.goto(`/w/${originalWaveId}`);

      await page.getByLabel("Write a comment").fill("Great Wave!");
      await page.getByRole("button", { name: "Post" }).click();
      await expect(page.getByText("Great Wave!")).toBeVisible({ timeout: 10_000 });

      await page.getByRole("button", { name: /^Save$/ }).click();
      await expect(page.getByRole("button", { name: /^Saved$/ })).toBeVisible({ timeout: 10_000 });

      await page.getByRole("button", { name: /^Share$/ }).click();
      await page.getByText("Copy link").click();
      // "Link copied" appears twice once copied: the Share Sheet's own
      // option label flips to it, AND a toast announces it separately.
      await expect(page.getByText("Link copied").first()).toBeVisible({ timeout: 10_000 });
      await page.keyboard.press("Escape");

      // --- Requests a Duet -------------------------------------------------
      await page.goto(`/w/${originalWaveId}/duet`);
      await page.getByLabel("Add a message (optional)").fill("Let's duet!");
      // Two "Request a Duet" buttons exist on this page: the (disabled)
      // preview card's own duet button, and the form's real submit button.
      await page.locator("form").getByRole("button", { name: "Request a Duet" }).click();
      await expect(page).toHaveURL(/\/duets/);
      await logOut(page);

      // --- A accepts it ------------------------------------------------------
      await logIn(page, userA);
      await page.goto("/duets");
      // DuetRequestsView renders the requester's bare username, no "@" prefix.
      await expect(page.getByText(userB.username).first()).toBeVisible();
      await page.getByRole("button", { name: "Accept" }).click();
      await expect(page.getByRole("button", { name: "Accept" })).not.toBeVisible();
      await logOut(page);

      // --- B records their contribution and publishes the Duet ------------
      await logIn(page, userB);
      await page.goto("/duets");
      await page.getByRole("tab", { name: "Sent" }).click();
      await page.getByRole("link", { name: "Record your Duet" }).click();
      await expect(page).toHaveURL(/\/w\/[^/]+\/duet\/record\?request=/);

      const recordButton = page.getByRole("button", { name: "Record your contribution" });
      await expect(recordButton).toBeEnabled({ timeout: 15_000 });
      await recordButton.click();

      // Let the fake mic device actually capture something before stopping.
      await page.waitForTimeout(1500);
      await page.getByRole("button", { name: "Stop" }).click();

      const duetTitle = `Journey Duet ${Date.now().toString(36)}`;
      await expect(page.getByLabel("Title")).toBeVisible({ timeout: 10_000 });
      await page.getByLabel("Title").fill(duetTitle);
      await page.getByRole("button", { name: "Publish Duet" }).click();

      await expect(page).toHaveURL(/\/w\/[^/]+$/, { timeout: 20_000 });
      const duetWaveId = /\/w\/([^/]+)$/.exec(new URL(page.url()).pathname)?.[1];
      expect(duetWaveId).toBeTruthy();
      expect(duetWaveId).not.toBe(originalWaveId);

      // --- Worker mixes the Duet (mix_duet job: reference + contribution) -
      runWorkerOnce("after duet publish");

      // --- The original Wave shows the new Duet in its lineage ------------
      await page.goto(`/w/${originalWaveId}`);
      await expect(page.getByText(duetTitle)).toBeVisible();
    } finally {
      if (userA) await deleteTestUser(userA.id);
      if (userB) await deleteTestUser(userB.id);
    }
  });

  test("private (only_me) Wave is unavailable and its audio URL 404s for another user", async ({ page }) => {
    let userA: ConfirmedTestUser | undefined;
    let userB: ConfirmedTestUser | undefined;
    try {
      userA = await signUpAndOnboard(page, "private-a");
      const waveId = await publishOriginalWave(page, `Private Wave ${Date.now().toString(36)}`, {
        visibility: "only_me",
      });
      const assetId = await getWaveAudioAssetId(waveId);
      await logOut(page);

      userB = await signUpAndOnboard(page, "private-b");

      await page.goto(`/w/${waveId}`);
      await expect(page.getByText(/isn't available/i)).toBeVisible();

      const response = await page.request.get(`/api/audio/${assetId}/url`);
      expect(response.status()).toBe(404);
    } finally {
      if (userA) await deleteTestUser(userA.id);
      if (userB) await deleteTestUser(userB.id);
    }
  });

  test("a blocked user cannot message the account that blocked them", async ({ page }) => {
    let userA: ConfirmedTestUser | undefined;
    let userB: ConfirmedTestUser | undefined;
    try {
      // User B's profile must exist before User A can navigate to /u/<username>
      // to block them — create the account, don't onboard/log in yet.
      userB = await createConfirmedUser({ tag: "block-b" });

      userA = await signUpAndOnboard(page, "block-a");
      await page.goto(`/u/${userB.username}`);
      await page.getByRole("button", { name: "More actions" }).click();
      await page.getByRole("menuitem", { name: "Block" }).click();
      await expect(page.getByRole("menuitem", { name: "Block" })).not.toBeVisible();
      await logOut(page);

      await onboardWithLogin(page, userB);
      await page.goto(`/messages/new?to=${userA.username}`);
      await expect(page.getByText("Can't start this conversation")).toBeVisible();
    } finally {
      if (userA) await deleteTestUser(userA.id);
      if (userB) await deleteTestUser(userB.id);
    }
  });
});
