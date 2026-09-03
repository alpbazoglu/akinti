import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { requireSupabaseConfig } from "./config";

export type SupabaseBrowserClient = SupabaseClient<Database>;

/**
 * Supabase client for browser code (Client Components, event handlers).
 *
 * `createBrowserClient` is a singleton by default, so calling this on every
 * render is cheap and still yields one auth listener per tab.
 *
 * This client always runs as the signed-in user (or `anon`), so every query it
 * makes is subject to RLS. Never reach for the admin client from the browser.
 */
export function createClient(): SupabaseBrowserClient {
  const { url, anonKey } = requireSupabaseConfig();
  return createBrowserClient<Database>(url, anonKey);
}
