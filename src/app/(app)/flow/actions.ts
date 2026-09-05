"use server";

/**
 * Server Actions backing the client side of Flow (`FlowScreen`):
 * continuing pagination and firing `record_flow_event`. Kept beside the
 * route rather than in `src/lib/db/flow.ts` because both need the
 * request-scoped Supabase client and, for `loadMoreFlow`, the batched
 * hydration this route owns (`hydrateFlow.ts`) — `src/lib/db/flow.ts` stays
 * a plain `Db`-taking helper usable from a worker or a test, like every
 * other file in `src/lib/db`.
 */

import { z } from "zod";

import { countFlowNew, getFlowPage, recordFlowEvent, type FlowEventKind } from "@/lib/db/flow";
import { getCurrentUser, requireUser } from "@/lib/auth/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { routes } from "@/config/routes";
import type { FlowWave } from "@/components/flow";

import { hydrateFlowWaves } from "./hydrateFlow";

export interface FlowLoadResult {
  readonly items: FlowWave[];
  readonly nextCursor: string | null;
}

const FLOW_PAGE_LIMIT = 10;

/** The Flow nav item's "new for you" badge count (`count_flow_new`). `0` when signed out or not configured — the caller never renders a literal zero. */
export async function getFlowNewCount(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const user = await getCurrentUser();
  if (!user) return 0;

  try {
    const db = await createServerSupabaseClient();
    return await countFlowNew(db);
  } catch {
    return 0;
  }
}

/** Continue Flow's ranking past the server-rendered first page. */
export async function loadMoreFlow(cursor: string | null, seed: number): Promise<FlowLoadResult> {
  if (!isSupabaseConfigured()) {
    return { items: [], nextCursor: null };
  }
  const user = await requireUser(routes.flow());
  const db = await createServerSupabaseClient();

  const page = await getFlowPage(db, { cursor, seed, limit: FLOW_PAGE_LIMIT });
  const items = await hydrateFlowWaves(db, page.items, user.id);
  return { items, nextCursor: page.nextCursor };
}

const flowEventSchema = z.object({
  waveId: z.string().uuid(),
  kind: z.enum(["impression", "complete", "skip", "replay"]),
  positionMs: z.number().int().min(0).max(6 * 60 * 60 * 1000).nullable().optional(),
});

/**
 * Fire a Flow event. Fire-and-forget from the client — swallows every
 * failure (a bad wave id, an exhausted rate limit, Supabase being
 * unreachable) rather than throwing, since a metrics call must never
 * interrupt playback (mirrors `reportPlayback`'s own contract).
 */
export async function sendFlowEvent(
  waveId: string,
  kind: FlowEventKind,
  positionMs?: number | null,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const parsed = flowEventSchema.safeParse({ waveId, kind, positionMs: positionMs ?? null });
  if (!parsed.success) return;

  try {
    const db = await createServerSupabaseClient();
    await recordFlowEvent(db, parsed.data.waveId, parsed.data.kind as FlowEventKind, parsed.data.positionMs);
  } catch (err) {
    console.error("[flow] sendFlowEvent failed:", err instanceof Error ? err.message : err);
  }
}
