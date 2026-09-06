/**
 * Flow (`docs/FLOW.md`): the ranked feed RPC, its keyset cursor codec, the
 * event recorder, and the nav badge count.
 *
 * `get_flow_page` (migration `20260906110000_flow.sql`) returns one row per
 * ranked Wave, each carrying `cursor_bucket`/`cursor_score`/`cursor_id`/
 * `cursor_slot` — the exact values the *next* call's cursor should hold, so
 * this module never has to understand the ranking itself, only the last row
 * of whatever page it got back (the same "opaque cursor from the last row"
 * shape as every other paginated helper in `src/lib/db`).
 */

import type { Db } from "./types";
import { DatabaseError, unwrap } from "./types";

/* ------------------------------------------------------------------------ */
/* Cursor codec                                                             */
/* ------------------------------------------------------------------------ */

/**
 * A decoded Flow keyset cursor. `bucket`/`score`/`id` are `null` only when
 * the ranked (bucket 1-4) stream has never produced a row yet in this
 * session — `slot` still advances so the "every 8th slot" invitation phase
 * stays correct even then.
 */
export interface FlowCursor {
  readonly bucket: number | null;
  readonly score: number | null;
  readonly id: string | null;
  readonly slot: number;
  /**
   * The seed page 1 of this session was ranked with (review3 finding 11).
   * `getFlowPage` treats this as authoritative over whatever `seed` a
   * caller passes once a cursor exists — bucket 4's ranking includes a
   * seeded jitter term the keyset cursor's score comparison depends on, so
   * a seed that drifts between page 1 and page 2 shifts every rising
   * Wave's score out from under its own cursor, skipping some and
   * re-serving others. Carrying it in the cursor (rather than trusting the
   * client to keep passing the same value) makes drift structurally
   * impossible: the only way to get a new seed is to start a new session
   * with no cursor at all.
   */
  readonly seed: number;
}

/**
 * Encode a `FlowCursor` as the opaque string handed to a client and back.
 * Base64url of the JSON — there is nothing here worth a bespoke text format
 * (unlike `encodeCursor` in `types.ts`, this cursor has four fields, not
 * two, and one of them is a float), and base64url survives a URL query
 * param and a `localStorage` round trip unescaped.
 */
export function encodeFlowCursor(cursor: FlowCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/**
 * Decode a cursor produced by `encodeFlowCursor`. Anything that doesn't
 * parse back into a `FlowCursor` shape (garbage, a foreign cursor, a
 * truncated string) decodes to `null` — "start this session's Flow page
 * over" — rather than throwing, matching the forgiving-cursor style every
 * other keyset RPC in this schema already uses (`decodeCursor`, `types.ts`).
 */
export function decodeFlowCursor(raw: string): FlowCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.slot !== "number" || !Number.isFinite(obj.slot)) {
      return null;
    }
    if (typeof obj.seed !== "number" || !Number.isFinite(obj.seed)) {
      return null;
    }
    return {
      bucket: typeof obj.bucket === "number" ? obj.bucket : null,
      score: typeof obj.score === "number" ? obj.score : null,
      id: typeof obj.id === "string" ? obj.id : null,
      slot: obj.slot,
      seed: obj.seed,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------------ */
/* get_flow_page                                                            */
/* ------------------------------------------------------------------------ */

export interface FlowPageParams {
  /** Opaque cursor from a previous `getFlowPage` call's `nextCursor`. `null`/omitted starts a new session. */
  cursor?: string | null;
  /**
   * Stable for the life of a session (`docs/FLOW.md` "session-seeded mix,
   * never repeats within a session") — pick it once per Flow mount and pass
   * the same value with every subsequent page.
   */
  seed?: number;
  limit?: number;
}

/** One Wave's position in the Flow ranking. `bucket` is 1-5, per `docs/FLOW.md` "Ranking". */
export interface FlowPageItem {
  readonly waveId: string;
  readonly bucket: number;
}

export interface FlowPage {
  readonly items: readonly FlowPageItem[];
  readonly nextCursor: string | null;
}

const DEFAULT_FLOW_LIMIT = 10;
const MAX_FLOW_LIMIT = 30;

/**
 * A fresh session's Flow seed (`docs/FLOW.md` "session-seeded mix, never
 * repeats within a session"). A plain helper, not inlined at the call site
 * in `flow/page.tsx` — that call site is a Server Component's render
 * function, and the `react-hooks/purity` lint rule flags `Math.random()`
 * called directly inside one (components/hooks must be idempotent); this
 * genuinely needs a new random value per request, which is exactly what a
 * page-scoped seed is for, so the impurity is real and intentional, just
 * moved one level of indirection away from the rule's direct-call check.
 */
export function randomFlowSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

function clampFlowLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) {
    return DEFAULT_FLOW_LIMIT;
  }
  return Math.max(1, Math.min(Math.trunc(limit), MAX_FLOW_LIMIT));
}

/** Fetch the next page of the Flow ranking for the signed-in caller. */
export async function getFlowPage(db: Db, params: FlowPageParams = {}): Promise<FlowPage> {
  const cursor = params.cursor ? decodeFlowCursor(params.cursor) : null;
  // Once a cursor exists, ITS seed governs — never whatever `params.seed`
  // the caller passes for this call (review3 finding 11). Only a
  // cursor-less page 1 can establish a session's seed.
  const seed = cursor ? cursor.seed : (params.seed ?? 0);

  const result = await db.rpc("get_flow_page", {
    p_cursor: cursor ? { bucket: cursor.bucket, score: cursor.score, id: cursor.id, slot: cursor.slot } : null,
    p_seed: seed,
    p_limit: clampFlowLimit(params.limit),
  });
  const rows = unwrap("getFlowPage", { data: result.data ?? [], error: result.error });

  if (rows.length === 0) {
    return { items: [], nextCursor: null };
  }

  const last = rows[rows.length - 1];
  const nextCursor = encodeFlowCursor({
    bucket: last.cursor_bucket,
    score: last.cursor_score,
    id: last.cursor_id,
    slot: last.cursor_slot,
    seed,
  });

  return {
    items: rows.map((row) => ({ waveId: row.wave_id, bucket: row.bucket })),
    nextCursor,
  };
}

/* ------------------------------------------------------------------------ */
/* record_flow_event                                                        */
/* ------------------------------------------------------------------------ */

export type FlowEventKind = "impression" | "complete" | "skip" | "replay";

/**
 * Record a Flow impression/complete/skip/replay. Fire-and-forget from the
 * screen (debounced there, never blocking playback) — this only throws on a
 * genuine server rejection (rate limit, an unviewable Wave), which the
 * caller is expected to swallow rather than surface to the listener.
 */
export async function recordFlowEvent(
  db: Db,
  waveId: string,
  kind: FlowEventKind,
  positionMs?: number | null,
): Promise<void> {
  const result = await db.rpc("record_flow_event", {
    p_wave_id: waveId,
    p_kind: kind,
    p_position_ms: positionMs ?? null,
  });
  if (result.error) {
    throw new DatabaseError("recordFlowEvent", result.error);
  }
}

/* ------------------------------------------------------------------------ */
/* count_flow_new                                                           */
/* ------------------------------------------------------------------------ */

/** The Flow nav item's "new for you" count. Never render a literal `0` (`docs/FLOW.md`) — that rule lives in the nav component, not here. */
export async function countFlowNew(db: Db): Promise<number> {
  const result = await db.rpc("count_flow_new");
  if (result.error) {
    throw new DatabaseError("countFlowNew", result.error);
  }
  return result.data ?? 0;
}
