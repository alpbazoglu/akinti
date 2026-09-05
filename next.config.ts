import type { NextConfig } from "next";

/**
 * Security headers (spec §30 deployment hardening). Applied to every route
 * via `headers()` below, not per-page — see
 * `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md`.
 *
 * CSP is shaped around two real needs, not a generic template:
 *  - Supabase: REST/RPC calls and the Realtime websocket (messaging,
 *    notifications — `docs/ARCHITECTURE.md`) both need `connect-src`; a
 *    signed audio URL and a public avatar both resolve to a Supabase Storage
 *    URL, needing `media-src`/`img-src`. `NEXT_PUBLIC_SUPABASE_URL` is read
 *    here (available at build time, same as in any Server Component) so a
 *    self-hosted/non-`supabase.co` project is covered exactly, not just by
 *    the `*.supabase.co` wildcard kept as a fallback for hosted projects.
 *  - Local audio: the create/recording flow previews through `blob:` URLs
 *    (`src/lib/audio/decode.ts`, `AudioPreview`) before anything is
 *    uploaded — `media-src`/`img-src` allow `blob:` for exactly that reason.
 *
 * `'unsafe-inline'` on `script-src`/`style-src` is a deliberate, documented
 * trade-off: Next inlines its own hydration bootstrap script and Tailwind/
 * React inline a handful of style attributes, and wiring a nonce-based CSP
 * through `src/proxy.ts` (owned by the auth/proxy layer, not this stage) is
 * out of scope here. `'unsafe-eval'` is added in development only, where
 * Fast Refresh needs it.
 */
function contentSecurityPolicy(): string {
  const isDev = process.env.NODE_ENV !== "production";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseOrigins = Array.from(
    new Set(["https://*.supabase.co", supabaseUrl].filter(Boolean)),
  ).join(" ");
  const supabaseWsOrigins = Array.from(
    new Set(["wss://*.supabase.co", supabaseUrl.replace(/^http/, "ws")].filter(Boolean)),
  ).join(" ");

  const directives: Record<string, string> = {
    "default-src": "'self'",
    "script-src": `'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src": "'self' 'unsafe-inline'",
    "img-src": `'self' data: blob: ${supabaseOrigins}`,
    "media-src": `'self' blob: ${supabaseOrigins}`,
    "connect-src": `'self' ${supabaseOrigins} ${supabaseWsOrigins}`,
    "font-src": "'self' data:",
    "worker-src": "'self' blob:",
    "frame-src": "'none'",
    "frame-ancestors": "'none'",
    "object-src": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
  };

  return Object.entries(directives)
    .map(([key, value]) => `${key} ${value}`)
    .join("; ");
}

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  // Defense in depth alongside `frame-ancestors 'none'` above, for browsers
  // that only understand the older header.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Audio recording (spec §17) is the only sensitive device permission this
  // product ever needs; everything else stays denied.
  {
    key: "Permissions-Policy",
    value:
      "microphone=(self), camera=(), geolocation=(), gyroscope=(), magnetometer=(), payment=(), usb=()",
  },
  // Inert over plain HTTP (local dev) — browsers only act on this header
  // when the response was already delivered over HTTPS.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework in an `X-Powered-By` response header.
  poweredByHeader: false,
  // Dev-only: Next's own devtools overlay (route info, the pending-transition
  // "Rendering ..." pill — `node_modules/next/dist/next-devtools`) has no
  // corner that is actually free on this layout. `bottom-left` sits on the
  // mobile bottom nav and the Share sheet (ux-audit screenshots 19–24);
  // moving it to `top-right` (a prior attempt) just traded that collision for
  // the `/kit` theme toggle and the Explore top bar's Sign up button
  // (`docs/qa/reviewA/REVIEW.md` b.1) — every corner is occupied by a real
  // control at 390px (wordmark top-left, icons top-right, five keys along
  // the whole bottom edge). It never ships to production, so disabling it
  // is the only zero-collision option rather than picking a new corner to
  // regress later.
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
      // Truly static, non-personalized files served straight from `public/`
      // (`docs/research/mobile-guidelines.md` rule 41's total-weight budget,
      // waveE-perf step 5). Next.js already sends a one-year `immutable`
      // `Cache-Control` for hashed `_next/static/*` output (fonts included,
      // since `next/font` serves through the same path) with no config
      // needed; these two are the ones that bypass that path entirely.
      // `public/sw.js` is deliberately excluded — a cached service worker
      // can never learn about its own updates (waveE-pwa owns its caching).
      {
        source: "/icons/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // The RNNoise WASM/worklet the singing-capture noise-suppression
        // pipeline loads (`docs/research/libraries.md`); large, binary, and
        // otherwise re-fetched on every visit to `/create` with no cache
        // header at all.
        source: "/noise-suppressor/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

/**
 * Serwist (`docs/research/libraries.md` §6: adopt Serwist directly, never
 * `next-pwa` or its forks) is intentionally NOT wired in here via
 * `withSerwistInit`/`@serwist/next`'s webpack plugin: Next 16 defaults to
 * Turbopack for both `next dev` and `next build`, and a webpack config
 * injected by that plugin makes Turbopack's own build refuse to run at all
 * ("This build is using Turbopack, with a webpack config and no turbopack
 * config" — Next 16 requires an explicit `turbopack` key once any `webpack`
 * key exists). Instead, `public/sw.js` is generated by the bundler-agnostic
 * `serwist build` CLI (`serwist.config.mjs` at the repo root, `esbuild`-
 * powered, package.json's `build` script) — see `src/app/sw.ts` for the
 * actual precache/runtime-caching/push logic and
 * `src/app/layout.tsx`'s `SerwistProvider` for client-side registration.
 */
export default nextConfig;
