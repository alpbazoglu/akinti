/**
 * `open_calls` (Wave D, migration 20260905120100) — a creator's own Wave
 * marked "open for anyone to Duet". Answering one skips the request/accept
 * round trip entirely: `answerOpenCall` calls the `answer_open_call` RPC,
 * which creates an ALREADY-ACCEPTED `duet_requests` row atomically
 * (`security definer`, honoring blocks/privacy/duet permission/deadline —
 * see the migration's own comments). The caller can hand the returned
 * request id straight to the existing `/w/[id]/duet/record` flow.
 */

import type {
  AnswerOpenCallInput,
  CloseOpenCallInput,
  SetOpenCallInput,
} from "@/lib/validation/duets";
import type { OpenCall, Page } from "@/types/domain";

import { toOpenCall } from "./mappers";
import type { Db } from "./types";
import { clampLimit, unwrap, unwrapMaybe } from "./types";

export async function getOpenCallByWaveId(db: Db, waveId: string): Promise<OpenCall | null> {
  const result = await db.from("open_calls").select("*").eq("wave_id", waveId).maybeSingle();
  const row = unwrapMaybe("getOpenCallByWaveId", result);
  return row ? toOpenCall(row) : null;
}

/**
 * Open (or reopen, or edit) a call on the caller's own Wave. `open_calls_guard`
 * (migration 20260905120100) derives `creator_id` from the Wave server-side
 * and rejects anyone but its actual creator — this upserts on the table's
 * `open_calls_one_per_wave` unique constraint rather than doing a
 * read-then-branch, so a concurrent double-submit lands on one row either way.
 */
export async function setOpenCall(db: Db, input: SetOpenCallInput): Promise<OpenCall> {
  const result = await db
    .from("open_calls")
    .upsert(
      {
        wave_id: input.waveId,
        prompt: input.prompt ?? null,
        deadline_at: input.deadlineAt ?? null,
        is_open: true,
      },
      { onConflict: "wave_id" },
    )
    .select("*")
    .single();
  return toOpenCall(unwrap("setOpenCall", result));
}

export async function closeOpenCall(db: Db, input: CloseOpenCallInput): Promise<OpenCall> {
  const result = await db
    .from("open_calls")
    .update({ is_open: false })
    .eq("wave_id", input.waveId)
    .select("*")
    .single();
  return toOpenCall(unwrap("closeOpenCall", result));
}

export interface ListOpenCallsParams {
  genre?: string | null;
  cursor?: string | null;
  limit?: number;
}

/** Encodes the keyset cursor `list_open_calls` expects: `"<created_at>|<id>"` — same shape as `list_backing_tracks`. */
function cursorOf(call: OpenCall): string {
  return `${call.createdAt}|${call.id}`;
}

/** Explore -> Open Calls. */
export async function listOpenCalls(db: Db, params: ListOpenCallsParams = {}): Promise<Page<OpenCall>> {
  const limit = clampLimit(params.limit);
  const result = await db.rpc("list_open_calls", {
    p_genre: params.genre ?? null,
    p_cursor: params.cursor ?? null,
    p_limit: limit,
  });
  const rows = unwrap("listOpenCalls", { data: result.data ?? [], error: result.error });
  const items = rows.map(toOpenCall);
  const nextCursor = rows.length === limit ? cursorOf(items[items.length - 1]) : null;
  return { items, nextCursor };
}

/**
 * Answer an open call: creates an already-accepted `duet_requests` row for
 * `waveId` in one atomic call (see the migration's `answer_open_call`
 * comment for exactly what it checks and why). Returns the new
 * `duet_requests.id` — hand it straight to
 * `routes.duetRecord(waveId, requestId)`.
 */
export async function answerOpenCall(db: Db, input: AnswerOpenCallInput): Promise<string> {
  const result = await db.rpc("answer_open_call", { p_wave_id: input.waveId });
  return unwrap("answerOpenCall", result);
}
