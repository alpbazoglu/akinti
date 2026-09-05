import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isPublicRoute, routes } from "@/config/routes";
import type { Database } from "@/types/database";

import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

/**
 * Refresh the Supabase session for an incoming request, then apply the route
 * protection matrix (spec §8/§32): unauthenticated → `/login?next=`,
 * authenticated-but-not-onboarded → `/onboarding`, authenticated visiting
 * `/login`/`/signup` → Flow (`docs/FLOW.md`). Public routes (`isPublicRoute`,
 * `src/config/routes.ts`) are never redirected — browsing them is not gated.
 *
 * This is a UX convenience, not the authorization boundary: it can run on a
 * CDN edge and a misconfigured matcher could skip it, so every protected
 * Server Component ALSO calls `requireUser`/`requireOnboarded`
 * (`src/lib/auth/server.ts`), and the real authority is Postgres RLS
 * (`docs/SECURITY.md`). Never trust the client (spec §32).
 *
 * Two rules that are easy to get wrong and expensive to debug:
 *  1. Every response this function returns — pass-through or redirect — must
 *     carry the cookies the Supabase client wrote during `getUser()`.
 *     Building a bare `NextResponse.redirect()` without copying them drops a
 *     just-refreshed session cookie, and the browser silently re-logs-out.
 *  2. Call `getUser()` (not `getSession()`) — it is what actually triggers the
 *     refresh and it validates the token against the auth server.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) {
    // Nothing to refresh or protect; let the app render its "not configured" state.
    return response;
  }

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
        // Responses that set auth cookies must never be cached by a CDN.
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id ?? null;

  const { pathname, search } = request.nextUrl;

  if (userId && (pathname === routes.login() || pathname === routes.signup())) {
    // Flow (`docs/FLOW.md`, founder decision 6 Sept 2026) is the default
    // screen after login; the follow-only list stays reachable as Home.
    return redirectWithCookies(new URL(routes.flow(), request.url), response);
  }

  if (!isPublicRoute(pathname)) {
    if (!userId) {
      return redirectWithCookies(
        new URL(routes.login(`${pathname}${search}`), request.url),
        response,
      );
    }

    if (pathname !== routes.onboarding()) {
      // Cheap, indexed PK lookup — only run for authenticated requests to a
      // protected, non-onboarding route, never for public/anonymous traffic.
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarded_at")
        .eq("id", userId)
        .maybeSingle();

      if (!profile?.onboarded_at) {
        return redirectWithCookies(new URL(routes.onboarding(), request.url), response);
      }
    }
  }

  return response;
}

/** Copy the cookies a Supabase client wrote onto `response` over to a redirect response. */
function redirectWithCookies(url: URL, response: NextResponse): NextResponse {
  const redirectResponse = NextResponse.redirect(url);
  for (const cookie of response.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }
  return redirectResponse;
}
