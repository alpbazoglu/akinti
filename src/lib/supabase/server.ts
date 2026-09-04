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
