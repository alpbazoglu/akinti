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
  // "Rendering ..." pill — `node_modules/next/dist/next-devtools`) defaults to
  // `bottom-left`, which is exactly where this app docks its mobile bottom
  // nav and sheet actions (Share, Save). It never ships to production, but
  // during local QA it visibly sat on top of navigation and the Share sheet
  // (ux-audit screenshots 19–24). Nothing else in this layout puts chrome in
  // the top-right, so that's where the indicator moves instead of covering it.
  devIndicators: {
    position: "top-right",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
