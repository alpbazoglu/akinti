/**
 * Shared UI flow helpers for the live-backend e2e specs
 * (`e2e/critical-journey.spec.ts`, and usable by the other `E2E_SUPABASE`
 * specs). Kept separate from `supabaseAdmin.ts` (pure API helpers, no
 * `Page`) so a spec that only needs account creation doesn't have to import
 * Playwright's `Page` type indirectly.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { createConfirmedUser, type ConfirmedTestUser } from "./supabaseAdmin";

/** Signs in through the real `/login` form and walks the onboarding flow, for an already-created (admin API) account. */
export async function onboardWithLogin(page: Page, user: ConfirmedTestUser): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByRole("button", { name: "Continue" }).click(); // step 1 -> 2 (interests)
  await page.getByRole("button", { name: "Singing" }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // step 2 -> 3 (creators)
  await page.getByRole("button", { name: "Continue" }).click(); // step 3 -> 4 (first Wave)
  await page.getByRole("button", { name: /Skip, take me to Home/i }).click();

  await expect(page).toHaveURL("/");
}

/** Creates the account through the admin API (the live project requires email confirmation), then signs in and onboards through the real UI. */
export async function signUpAndOnboard(page: Page, tag: string): Promise<ConfirmedTestUser> {
  const user = await createConfirmedUser({ tag });
  await onboardWithLogin(page, user);
  return user;
}

export async function logOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: /account menu/i }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
}

export async function logIn(page: Page, user: ConfirmedTestUser): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  // `signIn` returns `redirectTo` instead of calling `redirect()` itself
  // (see `useAuthRedirect`); the actual navigation is an async
  // `window.location.assign` that hasn't necessarily happened yet the
  // instant `.click()` resolves. Without waiting here, a caller that
  // immediately does `page.goto(...)` next can race that hard navigation —
  // whichever one the browser processes first wins, and losing the race
  // means landing back on `/login` unauthenticated.
  await expect(page).not.toHaveURL("/login");
}

export interface PublishWaveOptions {
  visibility?: "everyone" | "followers" | "only_me";
  commentPermission?: "everyone" | "followers" | "following" | "nobody";
  duetPermission?: "everyone" | "followers" | "following" | "nobody";
}

/** Absolute path to the real, ffmpeg-generated fixture (`docs/TESTING.md`) — 3s of a 440Hz tone, mono 44.1kHz WAV. */
export const TONE_WAV_PATH = path.join(__dirname, "..", "fixtures", "tone.wav");

/** Publishes an original Wave via Upload (not Record) using the real `tone.wav` fixture — no mic needed for the creator. */
export async function publishOriginalWave(
  page: Page,
  title: string,
  options: PublishWaveOptions = {},
): Promise<string> {
  await page.goto("/create");
  // The Record/Upload switch is no longer a tab bar (Wave B rebuilt `/create`
  // on `RecordStage`/`UploadDropzone` per `docs/design/SCREENS.md` §4) — the
  // record screen's own "Upload a file instead" row is how you get there.
  await page.getByRole("button", { name: "Upload a file instead" }).click();

  await page.locator('input[type="file"]').setInputFiles(TONE_WAV_PATH);

  await page.getByRole("button", { name: "Continue" }).click(); // enhance -> details

  await page.getByLabel("Title").fill(title);
  if (options.visibility) {
    await page.getByLabel("Who can hear it").selectOption(options.visibility);
  }
  if (options.commentPermission) {
    await page.getByLabel("Who can comment").selectOption(options.commentPermission);
  }
  if (options.duetPermission) {
    await page.getByLabel("Who can request a duet").selectOption(options.duetPermission);
  }
  await page.getByRole("button", { name: "Publish", exact: true }).click();

  await expect(page).toHaveURL(/\/w\/[^/]+$/, { timeout: 20_000 });
  const match = /\/w\/([^/]+)$/.exec(new URL(page.url()).pathname);
  if (!match) throw new Error(`unexpected post-publish URL: ${page.url()}`);
  return match[1];
}

/**
 * Runs `scripts/worker.ts --once` synchronously (drains the queue once,
 * exits) against the same live Supabase project the specs use, so a
 * just-enqueued `process_audio`/`mix_duet` job actually completes before the
 * test asserts on its result (spec §46's critical scenario explicitly calls
 * for a real worker pass between publish and discovery). Blocks this test
 * worker process only — other Playwright workers run in separate processes
 * and are unaffected. Logs the worker's own stdout/stderr for the final
 * report; throws if the worker process itself exits non-zero (a crash, not
 * an individual job failure — the worker always exits 0 after logging a
 * per-job failure via `fail_audio_job`).
 */
export function runWorkerOnce(label: string): void {
  const projectRoot = path.join(__dirname, "..", "..");
  // Invoke tsx's actual CLI entry point via `node` directly, rather than the
  // `npx`/`tsx` shim — on Windows, `execFileSync("npx.cmd" | "tsx.cmd", ...)`
  // fails with `EINVAL` (`.cmd` files aren't directly executable via
  // `CreateProcess` without `shell: true`, which `execFileSync` doesn't set).
  // `node <tsx's cli.mjs> ...` is the same thing `npx tsx` ultimately runs,
  // cross-platform, no shell involved.
  const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
  console.log(`[e2e] running worker --once (${label})`);
  try {
    const output = execFileSync(
      process.execPath,
      // `--env-file-if-exists` must come before the script path to be
      // recognized by `node` itself (see package.json's own worker/worker:once
      // scripts) — after it, it would just be forwarded as a plain argv entry.
      ["--env-file-if-exists=.env.local", tsxCli, "scripts/worker.ts", "--once"],
      { cwd: projectRoot, encoding: "utf8", stdio: "pipe" },
    );
    console.log(output);
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    console.error(`[e2e] worker --once (${label}) failed`);
    if (e.stdout) console.error(e.stdout);
    if (e.stderr) console.error(e.stderr);
    throw new Error(`worker --once (${label}) exited non-zero: ${e.message ?? String(err)}`);
  }
}
