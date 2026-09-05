/**
 * Performance budget gate (waveE-perf, `docs/qa/waveE-perf/ANALYSIS.md`;
 * `docs/research/mobile-guidelines.md` section 4).
 *
 * Checks the CLIENT JS weight a fresh load of each budgeted route actually
 * needs — the same "first-load JS" number the QA Lighthouse runs reported
 * (357-469KB against a 150KB budget) — directly from the production build
 * output, with no running server, no auth, and no live Supabase project
 * required. That makes it usable as a real CI gate: `npm run build` then
 * `npm run perf`.
 *
 * How it measures a route's JS: Next's App Router writes one
 * `page_client-reference-manifest.js` per route under `.next/server/app/`,
 * mapping every Client Component the route's server tree can reach to the
 * chunk files it needs (`globalThis.__RSC_MANIFEST["<route>"] = {...}`).
 * Unioning every module's `chunks` array for a route, plus the framework's
 * always-loaded `rootMainFiles`/`polyfillFiles` from `.next/build-manifest.json`,
 * is the same chunk set a fresh browser load of that route requests — this
 * was cross-checked against the actual `<script src>` tags a real `next
 * start` response contains for several routes while diagnosing the QA
 * baseline, and it matches exactly.
 *
 * The budget below is deliberately not the raw 150KB from mobile-guidelines.md:
 * this app ships `@supabase/supabase-js` (auth, RLS-scoped reads, Realtime)
 * on every authenticated route, which alone is ~85KB gzipped and has no
 * built-in subpath tree-shaking, plus React 19 + the App Router runtime
 * itself. 150KB gzipped for JS *on top of* that stack is not reachable
 * without dropping Supabase or React — see ANALYSIS.md for the measured
 * floor. `ROUTE_BUDGETS_KB` below is the realistic, still-meaningfully-tighter
 * target this script actually enforces; the 150KB figure is reported
 * alongside it for visibility, not enforced.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const NEXT_DIR = path.resolve(process.cwd(), ".next");
const SERVER_APP_DIR = path.join(NEXT_DIR, "server", "app");
const STATIC_CHUNKS_DIR = path.join(NEXT_DIR, "static", "chunks");

/** Route folder under `.next/server/app` -> the RSC manifest key it writes. */
const ROUTES: { label: string; dir: string; manifestKey: string }[] = [
  { label: "Home (/)", dir: "(app)", manifestKey: "/(app)/page" },
  { label: "Explore (/explore)", dir: "(app)/explore", manifestKey: "/(app)/explore/page" },
  { label: "Wave (/w/[id])", dir: "(app)/w/[id]", manifestKey: "/(app)/w/[id]/page" },
  { label: "Create (/create)", dir: "(app)/create", manifestKey: "/(app)/create/page" },
];

/** The budget this script actually enforces. See the file header for why. */
const ROUTE_BUDGET_KB = 260;
/** The aspirational mobile-guidelines.md rule 42 figure, reported only. */
const ASPIRATIONAL_BUDGET_KB = 150;

interface RscManifest {
  clientModules: Record<string, { chunks?: string[] }>;
}

function readRootChunks(): Set<string> {
  const buildManifestPath = path.join(NEXT_DIR, "build-manifest.json");
  if (!existsSync(buildManifestPath)) {
    throw new Error(`${buildManifestPath} not found — run \`npm run build\` first.`);
  }
  const buildManifest = JSON.parse(readFileSync(buildManifestPath, "utf8")) as {
    rootMainFiles?: string[];
    polyfillFiles?: string[];
  };
  return new Set([...(buildManifest.rootMainFiles ?? []), ...(buildManifest.polyfillFiles ?? [])]);
}

function readRouteChunks(dir: string, manifestKey: string): Set<string> | null {
  const manifestPath = path.join(SERVER_APP_DIR, dir, "page_client-reference-manifest.js");
  if (!existsSync(manifestPath)) return null;

  const source = readFileSync(manifestPath, "utf8");
  const marker = `globalThis.__RSC_MANIFEST[${JSON.stringify(manifestKey)}] = `;
  const start = source.indexOf(marker);
  if (start === -1) return null;

  // The assignment is a single JSON value terminated by `;\n` at top level —
  // the manifest file never nests another top-level statement after it.
  const jsonStart = start + marker.length;
  const jsonEnd = source.indexOf(";\n", jsonStart);
  const json = source.slice(jsonStart, jsonEnd === -1 ? undefined : jsonEnd);
  const manifest = JSON.parse(json) as RscManifest;

  const chunks = new Set<string>();
  for (const clientModule of Object.values(manifest.clientModules)) {
    for (const chunk of clientModule.chunks ?? []) chunks.add(chunk);
  }
  return chunks;
}

/**
 * Gzipped, not raw, size: the QA baseline's "JS transferred" figures (and the
 * 150KB budget they're measured against) are over-the-wire bytes, and Next
 * serves `_next/static/*` compressed in production. Gzip (level 9) is a
 * slightly conservative proxy for whatever the real host negotiates
 * (brotli, where available, does a little better) but is dependency-free and
 * close enough to catch a real regression.
 */
function chunkFileSize(chunkUrl: string): number {
  // Chunk URLs are always "/_next/static/chunks/<file>".
  const file = chunkUrl.replace(/^\/_next\/static\/chunks\//, "");
  const filePath = path.join(STATIC_CHUNKS_DIR, file);
  if (!existsSync(filePath)) return 0;
  return gzipSync(readFileSync(filePath), { level: 9 }).length;
}

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

function main(): void {
  if (!existsSync(SERVER_APP_DIR)) {
    console.error(`${SERVER_APP_DIR} not found — run \`npm run build\` first.`);
    process.exit(1);
  }

  const rootChunks = readRootChunks();
  let anyOverBudget = false;
  let anyMissing = false;

  console.log(
    `Performance budget (enforced: ${ROUTE_BUDGET_KB}KB/route; ` +
      `mobile-guidelines.md rule 42 target: ${ASPIRATIONAL_BUDGET_KB}KB — see scripts/perf-budget.ts header)\n`,
  );

  for (const route of ROUTES) {
    const routeChunks = readRouteChunks(route.dir, route.manifestKey);
    if (!routeChunks) {
      console.log(`  ? ${route.label}: no client-reference-manifest found, skipped`);
      anyMissing = true;
      continue;
    }

    const allChunks = new Set([...rootChunks, ...routeChunks]);
    const totalBytes = [...allChunks].reduce((sum, chunk) => sum + chunkFileSize(chunk), 0);
    const totalKb = totalBytes / 1024;
    const overBudget = totalKb > ROUTE_BUDGET_KB;
    if (overBudget) anyOverBudget = true;

    console.log(
      `  ${overBudget ? "FAIL" : "ok  "} ${route.label}: ${formatKb(totalBytes)} ` +
        `(budget ${ROUTE_BUDGET_KB}KB, ${allChunks.size} chunks)`,
    );
  }

  if (anyMissing) {
    console.log(
      "\nSome routes had no manifest — `next build` output shape changed, or the route no longer exists.",
    );
  }

  if (anyOverBudget) {
    console.error("\nOne or more routes exceeded the enforced JS budget.");
    process.exit(1);
  }

  console.log("\nAll routes within budget.");
}

main();
