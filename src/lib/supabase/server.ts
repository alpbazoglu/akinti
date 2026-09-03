import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import type { Database } from "@/types/database";

import { requireSupabaseConfig } from "./config";

export type SupabaseServerClient = SupabaseClient<Database>;

/**
 * Supabase client for Server Components, Server Functions and Route Handlers.
 *
 * `cookies()` is async in Next 16, so this function is async and a NEW client
 * must be created per request — never cache or share one across requests.
 *
 * Cookie writes only succeed inside a Server Function or Route Handler. In a
 * Server Component render the write is swallowed, which is correct: `proxy.ts`
 * has already refreshed the session for this request.
 */
export async function createServerSupabaseClient(): Promise<SupabaseServerClient> {
  const { url, anonKey } = requireSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render, where response headers are
          // already committed. Session refresh is handled by src/proxy.ts.
        }
      },
    },
  });
}

/**
 * The signed-in user for this request, verified against the auth server.
 *
 * Always prefer this over `getSession()` on the server: `getUser()` validates
 * the JWT rather than trusting whatever the cookie claims.
 */
export async function getCurrentUser(): Promise<{ id: string; email: string | null } | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return { id: data.user.id, email: data.user.email ?? null };
}

/** Same as `getCurrentUser`, but throws when there is no session. */
export async function requireCurrentUser(): Promise<{ id: string; email: string | null }> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Not authenticated");
  }
  return user;
}
