import type { NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 request middleware.
 *
 * The file convention was renamed from `middleware.ts` to `proxy.ts` in
 * Next 16 (see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).
 * The exported function must be named `proxy` or be the default export.
 *
 * Scope is deliberately narrow: refresh the Supabase session and nothing else.
 * Authorization decisions belong in the database (RLS) and in server code, not
 * here — proxy code can be deployed to a CDN edge and must not be treated as a
 * security boundary.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and files with an extension. Without
     * this, the session refresh would run for every CSS, JS and image request.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|woff2?|mp3|m4a|ogg|wav|webm)$).*)",
  ],
};
