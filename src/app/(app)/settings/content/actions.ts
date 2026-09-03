"use server";

/**
 * Server Actions backing the four Profile → Settings → Content tabs (spec
 * §25): Saved, Commented, Waves (mine), Duets (mine). Same result contract
 * as `src/app/(app)/w/[id]/interactions.ts` — parse, never throw, always a
 * typed `{ ok, error?, data? }`. Each wraps an existing, already-RLS-scoped
 * list helper (`saves.ts`/`comments.ts`/`waves.ts`) and hydrates it via
 * `hydrateContentWavePage` (`src/lib/interactions/contentLists.ts`) into
 * something `WaveCardContainer` can render.
 */

import { getCurrentUser } from "@/lib/auth/server";
import { listCommentedWaves } from "@/lib/db/comments";
import { listSavedWaves } from "@/lib/db/saves";
import { listProfileDuets, listProfileWaves } from "@/lib/db/waves";
import { hydrateContentWavePage, type ContentWavePage } from "@/lib/interactions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const NOT_CONFIGURED_ERROR =
  "This isn't connected to a backend yet — Supabase environment variables are not set.";
const SIGN_IN_ERROR = "Sign in to do that.";

export interface ContentListResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly data?: ContentWavePage;
}

function ok(data: ContentWavePage): ContentListResult {
  return { ok: true, data };
}

function fail(error: string): ContentListResult {
  return { ok: false, error };
}

async function requireSignedIn(): Promise<{ id: string } | null> {
  if (!isSupabaseConfigured()) return null;
  const user = await getCurrentUser();
  return user ? { id: user.id } : null;
}

export async function loadSavedWaves(cursor: string | null): Promise<ContentListResult> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED_ERROR);
  const user = await requireSignedIn();
  if (!user) return fail(SIGN_IN_ERROR);

  const db = await createServerSupabaseClient();
  try {
    const page = await listSavedWaves(db, user.id, { cursor });
    return ok(await hydrateContentWavePage(db, user.id, page));
  } catch {
    return fail("Could not load your saved Waves. Try again.");
  }
}

export async function loadCommentedWaves(cursor: string | null): Promise<ContentListResult> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED_ERROR);
  const user = await requireSignedIn();
  if (!user) return fail(SIGN_IN_ERROR);

  const db = await createServerSupabaseClient();
  try {
    const page = await listCommentedWaves(db, user.id, { cursor });
    return ok(await hydrateContentWavePage(db, user.id, page));
  } catch {
    return fail("Could not load your commented Waves. Try again.");
  }
}

export async function loadMyWaves(cursor: string | null): Promise<ContentListResult> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED_ERROR);
  const user = await requireSignedIn();
  if (!user) return fail(SIGN_IN_ERROR);

  const db = await createServerSupabaseClient();
  try {
    const page = await listProfileWaves(db, user.id, { cursor });
    return ok(await hydrateContentWavePage(db, user.id, page));
  } catch {
    return fail("Could not load your Waves. Try again.");
  }
}

export async function loadMyDuets(cursor: string | null): Promise<ContentListResult> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED_ERROR);
  const user = await requireSignedIn();
  if (!user) return fail(SIGN_IN_ERROR);

  const db = await createServerSupabaseClient();
  try {
    const page = await listProfileDuets(db, user.id, { cursor });
    return ok(await hydrateContentWavePage(db, user.id, page));
  } catch {
    return fail("Could not load your Duets. Try again.");
  }
}
