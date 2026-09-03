import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/types/database";

import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

/**
 * Refresh the Supabase session for an incoming request.
 *
 * This is the ONLY job of `src/proxy.ts`. It must run before rendering so that
 * Server Components see a valid session: cookies cannot be written during a
 * Server Component render, so if the refresh does not happen here it does not
 * happen at all, and users get randomly logged out.
 *
 * Two rules that are easy to get wrong and expensive to debug:
 *  1. Always return the SAME response object the Supabase client wrote cookies
 *     onto. Creating a fresh `NextResponse` afterwards silently drops them.
 *  2. Call `getUser()` (not `getSession()`) — it is what actually triggers the
 *     refresh and it validates the token against the auth server.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) {
    // Nothing to refresh; let the app render its "not configured" state.
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

  await supabase.auth.getUser();

  return response;
}
