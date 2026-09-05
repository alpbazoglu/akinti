/**
 * Pure helpers that turn the flat rowset from the `duet_tree` RPC (migration
 * 20260905120300, called via `getDuetTree` in `src/lib/db/duets.ts`) into the
 * nested `DuetTreeNode` shape `src/types/domain.ts` already defines, plus the
 * summary stats a chain/branch view wants (spec: "chain length" and "branch"
 * stats).
 *
 * `duet_tree` returns id/parent/creator/depth/mode/counts — not a full
 * `Wave`/`Profile`. The caller (a Server Component or Server Action) is
 * expected to already have hydrated `Wave[]`/`Profile[]` for every id in the
 * tree (e.g. via `getWavesByIds`/`getProfilesByIds`, the same two-step
 * pattern `listHomeFeed` and friends already use in `src/lib/db/waves.ts`) —
 * this module only assembles them into a tree and computes stats, it does no
 * I/O and trusts nothing about visibility (that's `can_view_wave`'s job,
 * already applied per-row by the RPC).
 */

import type { DuetTreeNode, Profile, Wave } from "@/types/domain";

/** One flat row of a chain, as returned by `duet_tree` / `getDuetTree`. */
export interface DuetChainRow {
  waveId: string;
  parentWaveId: string | null;
  creatorId: string;
  depth: number;
}

/**
 * Assemble the nested `DuetTreeNode[]` forest for a chain. In practice there
 * is exactly one root (the Wave `duet_tree` was called with) — this returns
 * an array rather than a single node because a row whose `parentWaveId`
 * isn't present in `waves` (visible to `duet_tree` but its parent was not —
 * e.g. the parent is a different account's blocked-from-the-viewer Wave)
 * is itself treated as a root rather than silently dropped.
 *
 * Rows without a matching entry in `waves`/`creatorsById` are skipped: this
 * can only happen if the caller passed an incomplete hydration set, not
 * because of anything `duet_tree` itself would produce.
 */
export function buildDuetTree(
  rows: readonly DuetChainRow[],
  wavesById: ReadonlyMap<string, Wave>,
  creatorsById: ReadonlyMap<string, Profile>,
): DuetTreeNode[] {
  const nodesById = new Map<string, DuetTreeNode>();

  for (const row of rows) {
    const wave = wavesById.get(row.waveId);
    const creator = creatorsById.get(row.creatorId);
    if (!wave || !creator) {
      continue;
    }
    nodesById.set(row.waveId, { wave, creator, children: [] });
  }

  const roots: DuetTreeNode[] = [];
  // Sort by depth first so a child is only ever attached after its own
  // ancestry has had a chance to exist — matters only for pathological
  // input (out-of-order rows); `duet_tree` already orders by depth.
  const orderedRows = [...rows].sort((a, b) => a.depth - b.depth);

  for (const row of orderedRows) {
    const node = nodesById.get(row.waveId);
    if (!node) continue;

    const parentNode = row.parentWaveId ? nodesById.get(row.parentWaveId) : undefined;
    if (parentNode) {
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export interface DuetTreeStats {
  /** Total Waves in the tree, including the root. */
  totalWaves: number;
  /** Total Duets — every node except the root(s). */
  totalDuets: number;
  /** The root's own direct children (one tree level). */
  directDuets: number;
  /** Longest root-to-leaf path, counted in Waves (a lone root has a chain length of 1). */
  chainLength: number;
  /** Waves with no children of their own. */
  leafWaveIds: string[];
  /** Direct-child count keyed by wave id — "how many people duetted THIS specific wave". */
  branchCounts: Record<string, number>;
}

/** Depth-first walk collecting the stats above, over one root (or a synthetic multi-root forest — see `buildDuetTree`). */
export function computeDuetTreeStats(roots: readonly DuetTreeNode[]): DuetTreeStats {
  let totalWaves = 0;
  const leafWaveIds: string[] = [];
  const branchCounts: Record<string, number> = {};
  let maxDepth = 0;

  const visit = (node: DuetTreeNode, depth: number): void => {
    totalWaves += 1;
    branchCounts[node.wave.id] = node.children.length;
    maxDepth = Math.max(maxDepth, depth);
    if (node.children.length === 0) {
      leafWaveIds.push(node.wave.id);
    }
    for (const child of node.children) {
      visit(child, depth + 1);
    }
  };

  for (const root of roots) {
    visit(root, 1);
  }

  return {
    totalWaves,
    totalDuets: Math.max(0, totalWaves - roots.length),
    directDuets: roots.reduce((sum, root) => sum + root.children.length, 0),
    chainLength: maxDepth,
    leafWaveIds,
    branchCounts,
  };
}

/**
 * Mirrors the `cypher_order` derivation in `waves_derive_duet_lineage`
 * (migration 20260905120200) as a pure function: participant 1 is always
 * the root Wave, so the first cypher Duet directly off the root (or off any
 * non-cypher parent) is participant 2; a cypher Duet of a cypher Duet is
 * `parent.cypherOrder + 1`. Throws once the cap of 4 participants would be
 * exceeded — the database enforces the same cap independently
 * (`waves_cypher_order_range` + the trigger's own raise), this is the
 * client-testable mirror, not the authority.
 */
export function computeCypherOrder(parent: {
  creationType: Wave["creationType"];
  duetMode: DuetTreeNode["wave"]["duet"]["mode"];
  cypherOrder: number | null;
} | null): number {
  const nextOrder =
    parent && parent.creationType === "duet" && parent.duetMode === "cypher" && parent.cypherOrder !== null
      ? parent.cypherOrder + 1
      : 2;

  if (nextOrder > 4) {
    throw new Error("Cypher chains are limited to 4 participants.");
  }
  return nextOrder;
}
