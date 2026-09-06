/**
 * fixDesktop P2-4 (docs/qa/desktop/REPORT.md #4): the prior QA pass's generic
 * probe never caught `RouteProgress.tsx`'s top-of-viewport line rendering in
 * its polling window, even though code review confirmed the wiring was
 * correct. This probe samples the DOM every 10ms (not a coarser interval, not
 * a MutationObserver) from the instant a sidebar nav link is clicked, so the
 * measurement itself cannot be the reason a real appearance is missed, and
 * proves — or disproves — "visible within 50ms" with real numbers across 5
 * routes.
 *
 * Own isolated Chromium (`chromium.launch()`, never the shared MCP browser,
 * per CLAUDE.md), against a `next build && next start` on port 3832 (the
 * founder's dev server on 3333 stays untouched — see fixDesktop's brief).
 * Provisions one throwaway account, signs in through the real `/login` form,
 * clicks through 5 desktop sidebar routes at 1280x800, and deletes the
 * account again in a `finally` block regardless of pass/fail.
 *
 * Usage:
 *   npm run build
 *   npx next start -p 3832
 *   node scripts/qa/route-progress-probe.mjs [--base http://localhost:3832]
 */

import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const baseArg = args.indexOf("--base");
const BASE = baseArg >= 0 ? args[baseArg + 1] : "http://localhost:3832";
const OUT_DIR = path.join(process.cwd(), "docs", "qa", "desktop");
const OUT_FILE = path.join(OUT_DIR, "route-progress.json");

const SAMPLE_INTERVAL_MS = 10;
const SAMPLE_BUDGET_MS = 2000;
const VISIBLE_WITHIN_MS = 50;

/** Five distinct desktop sidebar routes (`SIDEBAR_PRIMARY_ITEMS`, `navItems.ts`), visited in this order from `/flow`. */
const ROUTES = [
  { name: "explore", linkName: /^explore$/i },
  { name: "search", linkName: /^search$/i },
  { name: "challenges", linkName: /^challenges$/i },
  { name: "tracks", linkName: /^tracks$/i },
  { name: "messages", linkName: /^messages$/i },
];

/* ------------------------------------------------------------------------ */
/* .env.local loader (same approach as scripts/qa/loose-ends-duet-requests.mjs) */
/* ------------------------------------------------------------------------ */

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

async function provisionAccount(baseUrl, adminHeaders) {
  const probeId = crypto.randomUUID();
  const password = `Vv${probeId.replace(/-/g, "")}!`;
  const email = `route-progress-probe-${probeId.slice(0, 8)}@akinti.test`;
  const res = await fetch(`${baseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) {
    throw new Error(`create probe account failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  const user = await res.json();

  // `handle_new_user()` (migration 02) inserts the profiles row synchronously
  // but leaves `onboarded_at` null; `src/lib/supabase/middleware.ts`'s proxy
  // gate redirects anyone not onboarded to `/onboarding` (no sidebar there),
  // so this probe would never see the nav links it needs to click.
  const patchRes = await fetch(`${baseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
    method: "PATCH",
    headers: { ...adminHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ onboarded_at: new Date().toISOString() }),
  });
  if (!patchRes.ok) {
    throw new Error(`mark onboarded failed: HTTP ${patchRes.status} ${(await patchRes.text()).slice(0, 300)}`);
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

/**
 * Arms a plain `setInterval` poll (10ms) in the page for the top route-
 * progress bar (`RouteProgress.tsx`'s `role="status"` element only exists in
 * the DOM while `phase !== "idle"`) and records, relative to the click
 * itself, the first sampled tick where it is present.
 */
async function armProbe(page) {
  await page.evaluate(
    ({ intervalMs, budgetMs }) => {
      window.__routeProgressProbe = { clickAt: null, visibleAt: null, samples: 0 };
      const onClickCapture = () => {
        if (window.__routeProgressProbe.clickAt === null) {
          window.__routeProgressProbe.clickAt = performance.now();
        }
      };
      document.addEventListener("click", onClickCapture, true);

      const startedAt = performance.now();
      const timer = setInterval(() => {
        window.__routeProgressProbe.samples += 1;
        const el = document.querySelector('[role="status"][aria-live="polite"]');
        if (el && window.__routeProgressProbe.visibleAt === null) {
          window.__routeProgressProbe.visibleAt = performance.now();
        }
        if (performance.now() - startedAt > budgetMs) {
          clearInterval(timer);
          document.removeEventListener("click", onClickCapture, true);
        }
      }, intervalMs);
    },
    { intervalMs: SAMPLE_INTERVAL_MS, budgetMs: SAMPLE_BUDGET_MS },
  );
}

async function readProbe(page) {
  return page.evaluate(() => window.__routeProgressProbe ?? null);
}

async function run() {
  loadEnvFile();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set (see .env.local).");
  }
  const adminHeaders = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };

  await mkdir(OUT_DIR, { recursive: true });

  const account = await provisionAccount(supabaseUrl, adminHeaders);
  process.stdout.write(`Provisioned throwaway account ${account.email} (${account.id}).\n`);

  const browser = await chromium.launch();
  const results = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await signIn(page, account.email, account.password);
    await page.goto(`${BASE}/flow`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    for (const route of ROUTES) {
      await armProbe(page);
      const link = page.locator("nav a:visible").filter({ hasText: route.linkName }).first();
      await link.waitFor({ state: "visible", timeout: 10000 });
      await link.click();
      await page.waitForTimeout(SAMPLE_BUDGET_MS + 200);

      const probe = await readProbe(page);
      const elapsedMs =
        probe?.clickAt !== null && probe?.visibleAt !== null ? probe.visibleAt - probe.clickAt : null;
      const withinBudget = elapsedMs !== null && elapsedMs <= VISIBLE_WITHIN_MS;

      results.push({
        route: route.name,
        clickAt: probe?.clickAt ?? null,
        visibleAt: probe?.visibleAt ?? null,
        elapsedMs,
        samples: probe?.samples ?? 0,
        sampleIntervalMs: SAMPLE_INTERVAL_MS,
        visibleWithinBudget: withinBudget,
      });

      process.stdout.write(
        `  ${route.name}: ${elapsedMs !== null ? `${elapsedMs.toFixed(1)}ms` : "never appeared"} ` +
          `(${probe?.samples ?? 0} samples @ ${SAMPLE_INTERVAL_MS}ms) -> ` +
          `${withinBudget ? "PASS (<= 50ms)" : "FAIL"}\n`,
      );

      await page.waitForTimeout(300);
    }

    await context.close();
  } finally {
    await browser.close().catch(() => {});
    await deleteAccount(supabaseUrl, adminHeaders, account.id);
    process.stdout.write("Deleted throwaway account.\n");
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    sampleIntervalMs: SAMPLE_INTERVAL_MS,
    visibleWithinBudgetMs: VISIBLE_WITHIN_MS,
    routes: results,
    allPass: results.every((r) => r.visibleWithinBudget),
  };
  await writeFile(OUT_FILE, JSON.stringify(summary, null, 2), "utf8");
  process.stdout.write(`\nSaved ${OUT_FILE}\n`);

  if (!summary.allPass) {
    process.stdout.write("\nNot every route showed the bar within 50ms — see route-progress.json.\n");
    process.exitCode = 1;
  } else {
    process.stdout.write("\nAll 5 routes showed the bar within 50ms of the click.\n");
  }
}

run().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exitCode = 1;
});
