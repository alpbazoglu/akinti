"use server";

/**
 * Backs `DuetChainTree`'s second call site: the `/duets` inbox detail pane
 * (this pass's brief, item 2). That page (`src/app/(app)/duets/page.tsx`) is
 * owned by a concurrent agent and only ever fetches `DuetRequestListItem`s —
 * no chain data — so rather than asking it to thread a tree through, the
 * desktop detail pane (`DuetRequestsView.tsx`, this pass's own file) fetches
 * its own on selection, the same "self-contained, does its own fetch" shape
 * `OwnerInsights.tsx` already uses on the Wave page for the same reason.
 *
 * Mirrors `w/[id]/page.tsx`'s own `chainRoot` derivation exactly
 * (`wave.duet.originalWaveId ?? wave.id`) so both call sites of
 * `DuetChainTree` show the same tree for the same Wave — this does not
 * reimplement `getDuetTree` (`src/lib/db/duets.ts`), it only resolves the
 * root and calls it.
 */

import { getDuetTree } from "@/lib/db/duets";
import { getWaveById } from "@/lib/db/waves";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { DuetTreeNode } from "@/types/domain";

/** Empty on any failure — a chain tree is a nice-to-have in this pane, never worth failing the whole detail view for. */
export async function getDuetChainForWave(waveId: string): Promise<DuetTreeNode[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const db = await createServerSupabaseClient();
    const wave = await getWaveById(db, waveId);
    if (!wave) return [];

    const chainRoot = wave.duet.originalWaveId ?? wave.id;
    const { tree } = await getDuetTree(db, chainRoot);
    return tree;
  } catch {
    return [];
  }
}
