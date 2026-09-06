import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { requireServiceRoleKey, requireSupabaseConfig } from "./config";

export type SupabaseAdminClient = SupabaseClient<Database>;

let cached: SupabaseAdminClient | null = null;

/**
 * Service-role Supabase client. **Bypasses Row Level Security entirely.**
 *
 * Legitimate uses, and only these:
 *   1. `scripts/worker.ts` claiming and completing audio jobs.
 *   2. Server-side minting of signed URLs for private audio, AFTER the request
 *      has already been authorised with `can_view_wave` / `can_view_audio_asset`.
 *   3. Moderation tooling.
 *   4. Reading a value that is itself meant to be publicly visible but whose
 *      RPC's `execute` grant deliberately excludes `anon` (e.g. `has_pro` —
 *      review3 finding 36) — needed so a signed-out visitor still sees the
 *      same public rendering (a profile's Pro badge) a signed-in one does.
 *
 * Every other write path also already uses this client after its own
 * authorization check (billing, account deletion) — the list above is the
 * read-only reasoning; it is not exhaustive over the whole codebase.
 *
 * Never import this from a Client Component, and never use it to "make a query
 * work" that RLS rejected — if RLS said no, the answer is no.
 */
export function createAdminClient(): SupabaseAdminClient {
  if (typeof window !== "undefined") {
    throw new Error("The Supabase admin client must never be created in the browser.");
  }

  if (cached) {
    return cached;
  }

  const { url } = requireSupabaseConfig();
  cached = createSupabaseClient<Database>(url, requireServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return cached;
}
