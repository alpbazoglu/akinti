"use server";

/**
 * Server Actions for `/` (Home, spec s9). Same `{ ok, data?, error? }`
 * contract as every other Server Action in the app (mirrors
 * `src/app/(app)/notifications/actions.ts`) — never throws to the client, a
 * rejected Supabase call becomes a message, not a stack trace (spec s38).
 */

import { routes } from "@/config/routes";
import { requireUser } from "@/lib/auth/server";
import { listHomeFeed } from "@/lib/db/waves";
import { hydrateWaveCards } from "@/lib/feed";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { WaveCardContainerWave } from "@/components/wave";
import type { Page } from "@/types/domain";

export interface FeedActionResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

/**
 * A page of the following feed: Waves from creators `viewerId` follows,
 * newest first, visibility already enforced by RLS + `can_view_wave`
 * (`listHomeFeed`, `src/lib/db/waves.ts`). The first page renders directly in
 * the Server Component (`page.tsx`); this action serves every page after
 * that, called from `FollowingFeed`'s scroll/`Load more` handler.
 */
export async function loadFollowingFeed(
  cursor: string | null,
): Promise<FeedActionResult<Page<WaveCardContainerWave>>> {
  const user = await requireUser(routes.home());

  try {
    const supabase = await createServerSupabaseClient();
    const page = await listHomeFeed(supabase, user.id, { cursor });
    const items = await hydrateWaveCards(supabase, page.items, user.id);
    return { ok: true, data: { items, nextCursor: page.nextCursor } };
  } catch (error) {
    return { ok: false, error: messageOf(error) };
  }
}
