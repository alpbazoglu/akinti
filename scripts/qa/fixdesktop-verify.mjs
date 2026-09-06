/**
 * fixDesktop verification (docs/qa/desktop/REPORT.md items 1, 2, 5).
 *
 * Live, end-to-end proof that the P1 Duet permission dead-end is fixed at
 * the root, plus isolated screenshots of the sidebar hover fix and the Pro
 * empty-state copy. Own Chromium (`chromium.launch()`, never the shared MCP
 * browser, per CLAUDE.md), against a `next build && next start` on port
 * 3832 (the founder's dev server on 3333 stays untouched).
 *
 * Flow:
 *   1. Provision two throwaway accounts (creator, viewer), both marked
 *      onboarded (same trick as `scripts/qa/route-progress-probe.mjs`).
 *   2. Sign in as creator, go through the real Upload -> Enhance -> Details
 *      publish flow with a real fixture file (`e2e/fixtures/tone.wav`) and
 *      DEFAULT settings — screenshots the Details step (proves the "Who can
 *      request a Duet" select now shows a concrete "Everyone" default and
 *      the "Open for Duet" switch is now visible, CreateWaveForm.tsx/
 *      CreateFlow.tsx's fix for P1).
 *   3. Publish, then sign in as viewer and load the published Wave —
 *      screenshots the "Request a Duet" button rendered for a second
 *      account on a freshly published, untouched-settings Wave (the actual
 *      dead end QA hit).
 *   4. Screenshots the sidebar "New Wave" key's hover state (P2-2).
 *   5. Screenshots the unconfigured-payments `/settings/pro` state (item 5).
 *   6. Deletes both throwaway accounts (cascades the published Wave) in a
 *      `finally` block regardless of pass/fail.
 *
 * Usage:
 *   npm run build
 *   npx next start -p 3832
 *   node scripts/qa/fixdesktop-verify.mjs [--base http://localhost:3832]
 */

import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const baseArg = args.indexOf("--base");
const BASE = baseArg >= 0 ? args[baseArg + 1] : "http://localhost:3832";
const OUT = path.join(process.cwd(), "docs", "qa", "fixDesktop");
const FIXTURE = path.join(process.cwd(), "e2e", "fixtures", "tone.wav");

function loadEnvFile() {
  for (const name of [".env.local", ".env"]) {
    const filePath = path.resolve(process.cwd(), name);
    if (!existsSync(filePath)) continue;
    const contents = readFileSync(filePath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

async function provisionAccount(baseUrl, adminHeaders, tag) {
  const probeId = crypto.randomUUID();
  const password = `Vv${probeId.replace(/-/g, "")}!`;
  const email = `fixdesktop-verify-${tag}-${probeId.slice(0, 8)}@akinti.test`;
  const res = await fetch(`${baseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) {
    throw new Error(`create ${tag} account failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  const user = await res.json();

  const patchRes = await fetch(`${baseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
    method: "PATCH",
    headers: { ...adminHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ onboarded_at: new Date().toISOString() }),
  });
  if (!patchRes.ok) {
    throw new Error(`mark ${tag} onboarded failed: HTTP ${patchRes.status} ${(await patchRes.text()).slice(0, 300)}`);
  }

  return { id: user.id, email, password };
}

async function deleteAccount(baseUrl, adminHeaders, userId) {
  await fetch(`${baseUrl}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: adminHeaders }).catch(() => {});
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").first().fill(email);
  await page.locator("#password").first().fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 }).catch(() => {}),
    page.getByRole("button", { name: /^log in$/i }).first().click(),
  ]);
  await page.waitForTimeout(1500);
  if (page.url().includes("/login")) {
    const alert = await page.locator("[role='alert']").first().textContent().catch(() => null);
    throw new Error(`sign-in failed for ${email}${alert ? `: ${alert.trim()}` : ""}`);
  }
}

const consoleErrors = [];
function watchConsole(page, label) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    consoleErrors.push({ label, text: message.text() });
  });
  page.on("pageerror", (error) => {
    consoleErrors.push({ label, text: `pageerror: ${error.message}` });
  });
}

async function run() {
  loadEnvFile();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set (see .env.local).");
  }
  if (!existsSync(FIXTURE)) {
    throw new Error(`missing fixture: ${FIXTURE} (see docs/TESTING.md "e2e/fixtures/tone.wav")`);
  }
  const adminHeaders = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };

  await mkdir(OUT, { recursive: true });

  const creator = await provisionAccount(supabaseUrl, adminHeaders, "creator");
  const viewer = await provisionAccount(supabaseUrl, adminHeaders, "viewer");
  process.stdout.write(`Provisioned creator ${creator.email} and viewer ${viewer.email}.\n`);

  const browser = await chromium.launch();
  let waveId = null;
  try {
    const creatorContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const creatorPage = await creatorContext.newPage();
    watchConsole(creatorPage, "creator");

    await signIn(creatorPage, creator.email, creator.password);

    // --- item 2: sidebar "New Wave" hover feedback (P2-2) -----------------
    const newWaveLink = creatorPage.getByRole("link", { name: /new wave/i }).first();
    await newWaveLink.waitFor({ state: "visible", timeout: 10000 });
    await creatorPage.mouse.move(0, 0);
    await creatorPage.waitForTimeout(150);
    const restBg = await newWaveLink.evaluate((el) => getComputedStyle(el).backgroundColor);
    await newWaveLink.screenshot({ path: path.join(OUT, "sidebar-new-wave-rest.png") });

    await newWaveLink.hover();
    await creatorPage.waitForTimeout(150);
    const hoverBg = await newWaveLink.evaluate((el) => getComputedStyle(el).backgroundColor);
    await newWaveLink.screenshot({ path: path.join(OUT, "sidebar-new-wave-hover.png") });
    process.stdout.write(
      `  saved sidebar-new-wave-rest.png / sidebar-new-wave-hover.png (background-color ${restBg} -> ${hoverBg}, ` +
        `${restBg !== hoverBg ? "CHANGED" : "UNCHANGED"})\n`,
    );
    if (restBg === hoverBg) {
      throw new Error("P2-2 regression: sidebar New Wave background-color did not change on hover");
    }

    // --- item 5: Pro empty state -------------------------------------------
    await creatorPage.goto(`${BASE}/settings/pro`, { waitUntil: "domcontentloaded" });
    await creatorPage.waitForTimeout(500);
    await creatorPage.screenshot({ path: path.join(OUT, "settings-pro-empty-state.png"), fullPage: true });
    process.stdout.write("  saved settings-pro-empty-state.png\n");

    // --- item 1: publish a Wave with DEFAULT settings via the real flow ---
    await creatorPage.goto(`${BASE}/create`, { waitUntil: "domcontentloaded" });
    await creatorPage.getByRole("button", { name: /upload.*instead/i }).click();
    await creatorPage.setInputFiles('input[type="file"]', FIXTURE);
    await creatorPage.waitForTimeout(1500);

    await creatorPage.getByRole("button", { name: /continue/i }).first().click();
    await creatorPage.waitForTimeout(800);

    // Details step: DO NOT touch the duet-permission select or the open-call
    // switch — exactly what QA's original repro did ("default settings").
    const titleInput = creatorPage.locator('input[id$="-title"]').first();
    await titleInput.waitFor({ state: "visible", timeout: 10000 });
    await titleInput.fill("fixDesktop verify — default settings Wave");

    await creatorPage.screenshot({
      path: path.join(OUT, "create-details-duet-permission.png"),
      fullPage: true,
    });
    process.stdout.write("  saved create-details-duet-permission.png\n");

    await Promise.all([
      creatorPage.waitForURL(/\/w\//, { timeout: 30000 }),
      creatorPage.getByRole("button", { name: /^publish$/i }).click(),
    ]);
    waveId = creatorPage.url().split("/w/")[1]?.split(/[/?#]/)[0] ?? null;
    if (!waveId) {
      throw new Error(`could not read waveId from URL after publish: ${creatorPage.url()}`);
    }
    process.stdout.write(`  published wave ${waveId} as ${creator.email}\n`);
    await creatorContext.close();

    // --- viewer: the actual dead end QA hit --------------------------------
    const viewerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const viewerPage = await viewerContext.newPage();
    watchConsole(viewerPage, "viewer");
    await signIn(viewerPage, viewer.email, viewer.password);
    await viewerPage.goto(`${BASE}/w/${waveId}`, { waitUntil: "domcontentloaded" });
    await viewerPage.waitForTimeout(800);

    const requestDuetButton = viewerPage.getByRole("link", { name: /request a duet|request duet/i }).first();
    const visible = await requestDuetButton.isVisible().catch(() => false);
    await viewerPage.screenshot({ path: path.join(OUT, "wave-request-duet-button.png"), fullPage: true });
    process.stdout.write(`  saved wave-request-duet-button.png (Request a Duet button visible: ${visible})\n`);
    await viewerContext.close();

    if (!visible) {
      throw new Error("P1 regression: 'Request a Duet' button not visible to the viewer account");
    }
  } finally {
    await browser.close().catch(() => {});
    await deleteAccount(supabaseUrl, adminHeaders, creator.id);
    await deleteAccount(supabaseUrl, adminHeaders, viewer.id);
    process.stdout.write("Deleted both throwaway accounts (cascades the published Wave).\n");
  }

  if (consoleErrors.length > 0) {
    process.stdout.write(`\n${consoleErrors.length} console error(s):\n`);
    for (const err of consoleErrors) process.stdout.write(`  [${err.label}] ${err.text}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("\nNo console errors. Screenshots saved under docs/qa/fixDesktop/.\n");
  }
}

run().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exitCode = 1;
});
