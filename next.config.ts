import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

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
 *
 * Payment providers (docs/qa/review3/REVIEW.md finding 2, docs/BILLING.md):
 * both AKINTI Pro rails inject a third-party script into this app's own
 * document, so without these origins the CSP silently blocks every
 * checkout, with no error surfaced to the buyer beyond a console violation.
 *  - Paddle (`StartProControls.tsx`): `@paddle/paddle-js`'s `initializePaddle`
 *    loads `https://cdn.paddle.com` and opens `Paddle.Checkout.open()` in an
 *    iframe on `https://buy.paddle.com` (sandbox: `https://sandbox-buy.
 *    paddle.com`); its overlay also calls back to `*.paddle.com` for
 *    pricing/localization. See https://developer.paddle.com/build/
 *    transactions/paddlejs-overlay-checkout-guide.
 *  - iyzico (`IyzicoCheckoutEmbed.tsx`): `checkoutFormContent` returned by
 *    `startProCheckout` (`src/lib/billing/iyzico.ts`, `IYZICO_BASE_URL`)
 *    is iyzico's own HTML+`<script>` embed, re-executed in place — that
 *    script is served from `static.iyzipay.com` and draws the actual card
 *    fields via a same-page iframe hosted on `sandbox-api.iyzipay.com`
 *    (sandbox) or `api.iyzipay.com` (production); both call back to that
 *    same host over XHR. `*.iyzipay.com` covers sandbox and production
 *    without hardcoding which one `IYZICO_BASE_URL` points at.
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
  const paddleScriptOrigins = "https://cdn.paddle.com";
  const paddleFrameOrigins = "https://buy.paddle.com https://sandbox-buy.paddle.com";
  const paddleConnectOrigins = "https://*.paddle.com";
  const iyzicoOrigins = "https://*.iyzipay.com";

  const directives: Record<string, string> = {
    "default-src": "'self'",
    "script-src": `'self' 'unsafe-inline' ${paddleScriptOrigins} ${iyzicoOrigins}${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src": "'self' 'unsafe-inline'",
    "img-src": `'self' data: blob: ${supabaseOrigins}`,
    "media-src": `'self' blob: ${supabaseOrigins}`,
    "connect-src": `'self' ${supabaseOrigins} ${supabaseWsOrigins} ${paddleConnectOrigins} ${iyzicoOrigins}`,
    "font-src": "'self' data:",
    "worker-src": "'self' blob:",
    "frame-src": `${paddleFrameOrigins} ${iyzicoOrigins}`,
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
  experimental: {
    // perf3 (`docs/qa/perf3/ANALYSIS.md`): Lighthouse's own render-blocking
    // insight flagged the single global stylesheet Tailwind 4 emits
    // (~12.6KB) as render-blocking on every route, worth an estimated
    // 830-900ms of LCP under mobile-simulate throttling — the cost is the
    // extra request/RTT the `<link rel="stylesheet">` adds to the critical
    // chain before paint, not the byte count (12.6KB is trivial). Emitting
    // it as an inline `<style>` in `<head>` instead removes that request
    // entirely. This is the documented trade-off case for the flag: atomic
    // CSS (Tailwind) that stays small regardless of UI surface, and this
    // app's `public/sw.js` (Serwist) precache is the returning-visitor
    // caching layer that inlining otherwise gives up.
    inlineCss: true,
  },
  // `iyzipay` (AKINTI Pro billing, Wave F — `src/lib/billing/iyzico.ts`)
  // dynamically `require()`s every file under its own `lib/resources/`
  // directory via `fs.readdirSync` (`node_modules/iyzipay/lib/Iyzipay.js`'s
  // `_initResources`) — a pattern Turbopack cannot statically bundle
  // ("server relative imports are not implemented yet"). Listing it here
  // makes Next require it at runtime on the server instead of bundling it,
  // which is exactly what a Node-only server-side SDK like this needs
  // anyway (see `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.md`).
  serverExternalPackages: ["iyzipay"],
  // `serverExternalPackages` above stops Turbopack from bundling `iyzipay`,
  // but Next's own file tracing (what actually decides which files ship in
  // a Vercel deployment) only follows STATIC requires — it has no way to
  // see that `_initResources` reads its `lib/resources/` directory at
  // runtime via `fs.readdirSync` (review3 finding 33). Without this, a
  // deployment can ship `iyzipay` missing `lib/resources/**` and fail at
  // the first iyzico call with a runtime error rather than at build time.
  // Every route that can reach `src/lib/billing/iyzico.ts` needs the entry:
  // the two iyzico API routes, and `/settings/pro`, whose Server Action
  // (`settings/pro/actions.ts`) calls `startCheckout`/`cancelPro` for an
  // iyzico plan.
  outputFileTracingIncludes: {
    "/api/billing/iyzico/*": ["./node_modules/iyzipay/lib/resources/**/*"],
    "/settings/pro": ["./node_modules/iyzipay/lib/resources/**/*"],
  },
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
/**
 * next-intl (see `docs/research/libraries.md`/i18n decision): auto-detects
 * `src/i18n/request.ts`. This app never routes on locale (no `/tr`/`/en`
 * prefix — `src/i18n/locale.ts` resolves it per request instead), so no
 * `routing`/middleware config is needed here.
 */
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
