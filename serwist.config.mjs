// @ts-check
/**
 * Serwist build config (`docs/research/libraries.md` §6: adopt Serwist
 * directly, never `next-pwa`). `.mjs` rather than the docs' default
 * `serwist.config.js` because this package has no `"type": "module"` — the
 * `@serwist/cli` loader is a plain dynamic `import()`
 * (`node_modules/@serwist/cli/dist/bin.mjs`), which resolves module format
 * from the file extension/`package.json#type` like any other Node import; a
 * `.js` file here would be parsed as CommonJS and fail on `import` syntax.
 * `npm run build`/`build:sw` pass this path explicitly since it isn't the
 * CLI's bare default name.
 *
 * This is the bundler-agnostic integration path (`serwist build`, powered by
 * `esbuild`, not a webpack/Turbopack plugin) — deliberately chosen over
 * `withSerwistInit` (webpack-only; broke `next build` once Next 16's default
 * Turbopack bundler saw a webpack config with no matching `turbopack` config)
 * and over `@serwist/turbopack`'s Route Handler mode (an experimental,
 * thinly-documented catch-all route shape not worth the risk here). Running
 * `serwist build` as its own step after `next build` means the generated
 * `public/sw.js` never depends on which bundler Next itself used.
 */
import { spawnSync } from "node:child_process";

import { serwist } from "@serwist/next/config";

const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() || crypto.randomUUID();

export default serwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // The offline fallback (`src/app/~offline/page.tsx`) isn't linked from
  // anywhere, so Serwist's own crawl of the build output would never find
  // it on its own — it has to be listed explicitly to end up precached.
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
});
