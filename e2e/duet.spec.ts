import { expect, test } from "@playwright/test";

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
 */

test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

function uniqueUser(tag: string) {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return {
    email: `e2e_duet_${tag}_${stamp}@example.com`,
    username: `e2eduet${tag}${stamp}`.slice(0, 24),
    password: "correct-horse-battery-staple",
  };
}

/** A minimal, real, decodable WAV file — silence, but valid PCM (RIFF/WAVE header the worker/browser both accept). */
function makeWavFile(name: string, durationSeconds = 1, sampleRate = 8000): { name: string; mimeType: string; buffer: Buffer } {
  const numSamples = Math.floor(durationSeconds * sampleRate);
  const dataSize = numSamples * 2; // 16-bit mono PCM
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // PCM sub-chunk size
  buffer.writeUInt16LE(1, 20); // PCM format tag
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  // Remaining bytes stay zeroed — silent PCM data, which is all a real
  // decoder needs to accept the file; loudness is irrelevant to this test.
  return { name, mimeType: "audio/wav", buffer };
}

async function signUpAndOnboard(page: import("@playwright/test").Page, user: ReturnType<typeof uniqueUser>) {
  await page.goto("/signup");
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign up" }).click();

  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByRole("button", { name: "Continue" }).click(); // step 1 -> 2 (interests)
  await page.getByRole("button", { name: "Singing" }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // step 2 -> 3 (creators)
  await page.getByRole("button", { name: "Continue" }).click(); // step 3 -> 4 (first Wave)
  await page.getByRole("button", { name: /Skip, take me to Home/i }).click();

  await expect(page).toHaveURL("/");
}

async function logOut(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /account menu/i }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
}

async function logIn(page: import("@playwright/test").Page, user: ReturnType<typeof uniqueUser>) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");
}

/** Publishes an original Wave via Upload (not Record) — no mic needed for the original creator. */
async function publishOriginalWave(
  page: import("@playwright/test").Page,
  title: string,
  options: { duetPermission?: "everyone" | "followers" | "following" | "nobody" } = {},
): Promise<string> {
  await page.goto("/create");
  await page.getByRole("tab", { name: "Upload" }).click();

  const file = makeWavFile(`${title.replace(/\s+/g, "-").toLowerCase()}.wav`);
  await page.locator('input[type="file"]').setInputFiles(file);

  await page.getByRole("button", { name: "Continue" }).click(); // enhance -> details

  await page.getByLabel("Title").fill(title);
  if (options.duetPermission) {
    await page.getByLabel("Who can request a duet").selectOption(options.duetPermission);
  }
  await page.getByRole("button", { name: "Publish", exact: true }).click();

  await expect(page).toHaveURL(/\/w\/[^/]+$/, { timeout: 20_000 });
  const match = /\/w\/([^/]+)$/.exec(new URL(page.url()).pathname);
  if (!match) throw new Error(`unexpected post-publish URL: ${page.url()}`);
  return match[1];
}

test.describe("duet", () => {
  test("request -> accept -> record -> publish produces a linked Duet Wave", async ({ page }) => {
    const userA = uniqueUser("a1");
    const userB = uniqueUser("b1");

    // --- User A publishes the original Wave -----------------------------
    await signUpAndOnboard(page, userA);
    const originalWaveId = await publishOriginalWave(page, `Original by ${userA.username}`);
    await logOut(page);

    // --- User B requests a Duet on it ------------------------------------
    await signUpAndOnboard(page, userB);
    await page.goto(`/w/${originalWaveId}/duet`);
    await page.getByLabel("Add a message (optional)").fill("Would love to duet on this!");
    await page.getByRole("button", { name: "Request a Duet" }).click();
    await expect(page).toHaveURL(/\/duets/);
    await logOut(page);

    // --- User A accepts it -------------------------------------------------
    await logIn(page, userA);
    await page.goto("/duets");
    // "Received" is the default tab.
    await expect(page.getByText(`@${userB.username}`)).toBeVisible();
    await page.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByRole("button", { name: "Accept" })).not.toBeVisible();
    await logOut(page);

    // --- User B records their contribution and publishes -------------------
    await logIn(page, userB);
    await page.goto("/duets");
    await page.getByRole("tab", { name: "Sent" }).click();
    await page.getByRole("link", { name: "Record your Duet" }).click();
    await expect(page).toHaveURL(/\/w\/[^/]+\/duet\/record\?request=/);

    // The original must actually load before "Record" is enabled (spec §38
    // "original unavailable" — DuetRecorder.tsx gates on this).
    const recordButton = page.getByRole("button", { name: "Record your contribution" });
    await expect(recordButton).toBeEnabled({ timeout: 15_000 });
    await recordButton.click();

    // Let the fake mic device actually capture something before stopping.
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Stop" }).click();

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
  });

  test("duets disabled on a Wave -> request denied", async ({ page }) => {
    const userA = uniqueUser("a2");
    const userB = uniqueUser("b2");

    await signUpAndOnboard(page, userA);
    const waveId = await publishOriginalWave(page, `No duets ${userA.username}`, { duetPermission: "nobody" });
    await logOut(page);

    await signUpAndOnboard(page, userB);
    await page.goto(`/w/${waveId}/duet`);

    // `canRequestDuet()` (server-side, `src/lib/db/duetRequests.ts`) denies
    // before the request form ever renders — the page itself is the
    // enforcement surface here, not just a hidden button (spec §15).
    await expect(page.getByText("You can't request a Duet on this Wave")).toBeVisible();
    await expect(page.getByLabel("Add a message (optional)")).not.toBeVisible();
  });

  test("blocked user -> request denied", async ({ page }) => {
    const userA = uniqueUser("a3");
    const userB = uniqueUser("b3");

    await signUpAndOnboard(page, userA);
    const waveId = await publishOriginalWave(page, `Blockable ${userA.username}`);
    // User A blocks User B from A's own profile page.
    await page.goto(`/u/${userB.username}`);
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Block" }).click();
    await expect(page.getByRole("menuitem", { name: "Block" })).not.toBeVisible();
    await logOut(page);

    await signUpAndOnboard(page, userB);
    await page.goto(`/w/${waveId}/duet`);

    await expect(page.getByText("You can't request a Duet on this Wave")).toBeVisible();
    await expect(page.getByLabel("Add a message (optional)")).not.toBeVisible();
  });
});
