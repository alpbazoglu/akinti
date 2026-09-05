import type { NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 request middleware.
 *
 * The file convention was renamed from `middleware.ts` to `proxy.ts` in
 * Next 16 (see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).
 * The exported function must be named `proxy` or be the default export.
 *
 * Scope is deliberately narrow: refresh the Supabase session and apply the
 * route protection matrix (spec §8/§32 — see `updateSession` in
 * `src/lib/supabase/middleware.ts`). That redirect is a UX convenience, never
 * the authorization boundary — proxy code can be deployed to a CDN edge and
 * every protected page independently re-checks via `requireUser`/
 * `requireOnboarded`. The actual authority is the database (RLS).
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and files with an extension. Without
     * this, the session refresh would run for every CSS, JS and image request.
     * `webmanifest` matters beyond "one fewer wasted session-refresh": without
     * it, `src/app/manifest.ts`'s route fell through to the route-protection
     * redirect and served the `/login` HTML page instead of JSON to any
     * unauthenticated request — which is exactly how a browser's own
     * installability check (and any PWA tooling) fetches it, breaking
     * `beforeinstallprompt`/Add to Home Screen for every signed-out visitor.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|woff2?|mp3|m4a|ogg|wav|webm|webmanifest)$).*)",
  ],
};
